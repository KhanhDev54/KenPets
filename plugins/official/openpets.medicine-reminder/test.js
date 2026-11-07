// Golden test for openpets.medicine-reminder. Uses a small in-memory fake ctx so it runs with plain node.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MINUTE_MS,
  currentDose,
  doseTodayMs,
  findMissedDoses,
  fireDose,
  localDateKey,
  markTaken,
  parseDoseTimes,
  scheduleDoses,
} from "./index.js";

// Parsing
assert.deepEqual(parseDoseTimes("08:00, 20:00"), ["08:00", "20:00"]);
assert.deepEqual(parseDoseTimes("20:30;8h 13 8:00 bad 25:00"), ["08:00", "13:00", "20:30"]);
assert.deepEqual(parseDoseTimes(""), []);
assert.deepEqual(parseDoseTimes(undefined), []);
assert.equal(parseDoseTimes("1,2,3,4,5,6,7,8").length, 6);

// Missed-dose window and current dose
const now = new Date(2026, 0, 1, 9, 30).getTime();
assert.deepEqual(findMissedDoses(["08:00", "20:00"], [], now), ["08:00"]);
assert.deepEqual(findMissedDoses(["08:00", "20:00"], ["08:00"], now), []);
assert.deepEqual(findMissedDoses(["05:00"], [], now), [], "older than the window is not surfaced");
assert.equal(currentDose(["08:00", "20:00"], now), "08:00");
assert.equal(currentDose(["12:00", "20:00"], now), "12:00");
assert.equal(doseTodayMs("20:00", now), new Date(2026, 0, 1, 20, 0).getTime());

// Locales: vi has exactly the en keys, and speech passes the host safety filter.
const MESSAGE_FILTER_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\/;
const en = JSON.parse(await readFile(new URL("./locales/en.json", import.meta.url), "utf8"));
const vi = JSON.parse(await readFile(new URL("./locales/vi.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
for (const table of [en, vi]) {
  for (const [key, value] of Object.entries(table)) {
    if (key.startsWith("speech.") || key.startsWith("bubble.")) assert.equal(MESSAGE_FILTER_PATTERN.test(value), false, key);
  }
}

// Fake ctx
function makeCtx(cfg) {
  const store = new Map();
  const calls = { daily: [], once: [], cancel: [], alerts: [], speech: [] };
  let lastAlert = null;
  const ctx = {
    t: (key, vars = {}) => (en[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)),
    config: { get: async () => cfg, onChange: () => () => {} },
    storage: { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) },
    schedule: {
      daily: async (id, spec, fn) => void calls.daily.push({ id, spec, fn }),
      once: async (id, ms, fn) => void calls.once.push({ id, ms, fn }),
      cancel: async (id) => void calls.cancel.push(id),
    },
    assets: { icon: (name) => `icon:${name}` },
    pet: { speak: async (text) => void calls.speech.push(text) },
    ui: {
      alert: async (spec) => {
        const handlers = {};
        lastAlert = { spec, handlers, onAction: (fn) => (handlers.action = fn), onDismiss: (fn) => (handlers.dismiss = fn), dismiss() {} };
        calls.alerts.push(lastAlert);
        return lastAlert;
      },
    },
  };
  return { ctx, calls, store, get lastAlert() { return lastAlert; } };
}

// Schedules one daily job per dose time.
{
  const h = makeCtx({ doseTimes: "08:00, 20:00", snoozeMinutes: "5" });
  await scheduleDoses(h.ctx);
  assert.deepEqual(h.calls.daily.map((c) => c.spec), ["08:00", "20:00"]);
  // Re-scheduling cancels the previous jobs first.
  await scheduleDoses(h.ctx);
  assert.ok(h.calls.cancel.includes("medicine-dose-0800"));
}

// Due alert -> Taken records the dose; a second fire for the same dose is skipped.
{
  const h = makeCtx({ doseTimes: "08:00", medicineName: "Vitamin C" });
  assert.equal(await fireDose(h.ctx, "08:00"), true);
  assert.match(h.lastAlert.spec.text, /Vitamin C/);
  await h.lastAlert.handlers.action("taken");
  assert.deepEqual(h.store.get("taken"), { date: localDateKey(), times: ["08:00"] });
  assert.equal(await fireDose(h.ctx, "08:00"), false);
  assert.equal(await fireDose(h.ctx, "08:00", { force: true }), true);
}

// Snooze schedules a one-off re-fire with the configured delay.
{
  const h = makeCtx({ doseTimes: "08:00", snoozeMinutes: "30" });
  await fireDose(h.ctx, "08:00");
  await h.lastAlert.handlers.action("snooze");
  assert.equal(h.calls.once.at(-1).ms, 30 * MINUTE_MS);
}

// Untranslated default medicine name falls back to the locale default.
{
  const h = makeCtx({ doseTimes: "08:00", medicineName: "$t:config.medicineName.default" });
  await fireDose(h.ctx, "08:00");
  assert.match(h.lastAlert.spec.text, /your medicine/);
  await markTaken(h.ctx, "20:00");
  assert.deepEqual(h.store.get("taken").times, ["20:00"]);
}

console.log("openpets.medicine-reminder: all tests passed");
