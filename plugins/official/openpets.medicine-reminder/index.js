// Medicine Reminder (openpets.medicine-reminder) — daily dose reminders at fixed local times.
// Author: KenDev
//
// Each configured time ("08:00, 20:00") gets its own daily schedule. When a dose is due the pet
// shows a sticky alert with "Taken" / "Snooze" buttons. Taken doses are recorded per local day so
// a dose is never nagged twice, and a dose missed while the app was closed is surfaced once on start.

export const MINUTE_MS = 60_000;
export const MAX_DOSES = 6;
export const MISSED_WINDOW_MS = 3 * 60 * MINUTE_MS;
export const DOSE_SCHEDULE_PREFIX = "medicine-dose-";
export const SNOOZE_SCHEDULE_ID = "medicine-snooze";
export const TAKEN_KEY = "taken";

export function localDateKey(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse "8:00, 20:30;13h" into sorted unique ["08:00", "13:00", "20:30"] (max MAX_DOSES). */
export function parseDoseTimes(value) {
  const text = typeof value === "string" ? value : "";
  const out = new Set();
  for (const raw of text.split(/[,;\s]+/)) {
    const match = /^(\d{1,2})(?:[:hH.](\d{2})?)?$/.exec(raw.trim());
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (hour > 23 || minute > 59) continue;
    out.add(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
  return [...out].sort().slice(0, MAX_DOSES);
}

export function doseTodayMs(time, now = Date.now()) {
  const [hour, minute] = time.split(":").map(Number);
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0).getTime();
}

/** Doses whose time passed within MISSED_WINDOW_MS today and that were not taken. */
export function findMissedDoses(times, takenToday, now = Date.now()) {
  return times.filter((time) => {
    const due = doseTodayMs(time, now);
    return due <= now && now - due <= MISSED_WINDOW_MS && !takenToday.includes(time);
  });
}

async function config(ctx) {
  return (await ctx.config.get()) ?? {};
}

function medicineName(ctx, cfg) {
  const raw = typeof cfg.medicineName === "string" ? cfg.medicineName.trim() : "";
  if (!raw || raw.startsWith("$t:")) return ctx.t("config.medicineName.default");
  return raw.slice(0, 60);
}

function snoozeMs(cfg) {
  const minutes = Number(cfg.snoozeMinutes);
  return (Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 120) : 10) * MINUTE_MS;
}

async function takenToday(ctx) {
  const record = await ctx.storage.get(TAKEN_KEY);
  if (!record || typeof record !== "object" || record.date !== localDateKey()) return [];
  return Array.isArray(record.times) ? record.times.filter((t) => typeof t === "string") : [];
}

export async function markTaken(ctx, time) {
  const times = await takenToday(ctx);
  if (!times.includes(time)) times.push(time);
  await ctx.storage.set(TAKEN_KEY, { date: localDateKey(), times });
}

/** The dose a manual "I took it" should count for: the latest past dose today, else the first. */
export function currentDose(times, now = Date.now()) {
  const past = times.filter((time) => doseTodayMs(time, now) <= now);
  return past.length ? past[past.length - 1] : times[0];
}

let scheduledIds = [];
let activeAlert = null;

export async function scheduleDoses(ctx) {
  for (const id of scheduledIds) await ctx.schedule.cancel(id);
  scheduledIds = [];
  const times = parseDoseTimes((await config(ctx)).doseTimes);
  for (const time of times) {
    const id = DOSE_SCHEDULE_PREFIX + time.replace(":", "");
    await ctx.schedule.daily(id, time, () => fireDose(ctx, time));
    scheduledIds.push(id);
  }
  return times;
}

export async function fireDose(ctx, time, { force = false, missed = false } = {}) {
  if (!force && (await takenToday(ctx)).includes(time)) return false;
  if (activeAlert) {
    try { activeAlert.dismiss?.(); } catch {}
    activeAlert = null;
  }
  const cfg = await config(ctx);
  const name = medicineName(ctx, cfg);
  const text = ctx.t(missed ? "bubble.missed" : "bubble.due", { name, time });
  const spec = {
    text,
    indicator: {
      icon: ctx.assets.icon("pill"),
      label: ctx.t("indicator.due"),
      tone: missed ? "warning" : "info",
      color: "#db2777",
      background: "#fce7f3",
      borderColor: "#f9a8d4",
    },
    tone: "info",
    sound: cfg.customSound || "alert",
    notify: { title: ctx.t("plugin.name"), body: text },
    dismissOn: ["action"],
    actions: [
      { id: "taken", label: ctx.t("action.taken"), style: "primary" },
      { id: "snooze", label: ctx.t("action.snooze", { minutes: Math.round(snoozeMs(cfg) / MINUTE_MS) }) },
    ],
  };
  try {
    const alert = await ctx.ui.alert(spec);
    activeAlert = alert;
    alert.onAction(async (actionId) => {
      if (activeAlert === alert) activeAlert = null;
      if (actionId === "taken") {
        await markTaken(ctx, time);
        await ctx.pet.speak(ctx.t("speech.taken"));
      } else if (actionId === "snooze") {
        await ctx.schedule.cancel(SNOOZE_SCHEDULE_ID);
        await ctx.schedule.once(SNOOZE_SCHEDULE_ID, snoozeMs(cfg), () => fireDose(ctx, time));
      }
    });
    alert.onDismiss(() => {
      if (activeAlert === alert) activeAlert = null;
    });
  } catch {
    activeAlert = null;
    try { await ctx.pet.speak(text); } catch {}
  }
  return true;
}

export async function surfaceMissed(ctx) {
  const times = parseDoseTimes((await config(ctx)).doseTimes);
  const missed = findMissedDoses(times, await takenToday(ctx));
  if (missed.length) await fireDose(ctx, missed[missed.length - 1], { missed: true });
  return missed;
}

export async function showToday(ctx) {
  const times = parseDoseTimes((await config(ctx)).doseTimes);
  if (!times.length) return ctx.pet.speak(ctx.t("speech.noTimes"));
  const taken = await takenToday(ctx);
  const list = times.map((t) => (taken.includes(t) ? `${t} ✓` : t)).join(", ");
  return ctx.pet.speak(ctx.t("speech.today", { list }));
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await scheduleDoses(ctx);
      ctx.config.onChange(() => scheduleDoses(ctx));
      const pillIcon = ctx.assets.icon("pill");
      await ctx.commands.register(
        { id: "test-reminder", title: "$t:command.testReminder.title", description: "$t:command.testReminder.description", icon: pillIcon },
        async () => {
          const times = parseDoseTimes((await config(ctx)).doseTimes);
          await fireDose(ctx, currentDose(times) ?? "08:00", { force: true });
        },
      );
      await ctx.commands.register(
        { id: "taken-now", title: "$t:command.takenNow.title", description: "$t:command.takenNow.description", icon: "check" },
        async () => {
          const times = parseDoseTimes((await config(ctx)).doseTimes);
          const dose = currentDose(times);
          if (dose) await markTaken(ctx, dose);
          await ctx.pet.speak(ctx.t("speech.taken"));
        },
      );
      await ctx.commands.register(
        { id: "show-today", title: "$t:command.showToday.title", description: "$t:command.showToday.description", icon: "list" },
        () => showToday(ctx),
      );
      await surfaceMissed(ctx);
    },
    async stop() {
      activeAlert = null;
      scheduledIds = [];
    },
  });
}
