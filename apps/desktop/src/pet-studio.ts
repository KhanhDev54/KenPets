// KenDev: "Xưởng Pet Mặt Mình" — the face-photo pet maker bundled with KenPets.
// The page lives inside the app archive (assets/pet-maker.html), which an external
// browser cannot read, so it is copied to the user data folder and opened from there.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, shell } from "electron";

export async function openBundledPetStudio(): Promise<void> {
  const html = await readFile(join(app.getAppPath(), "assets", "pet-maker.html"));
  const dir = join(app.getPath("userData"), "pet-studio");
  await mkdir(dir, { recursive: true });
  const target = join(dir, "index.html");
  await writeFile(target, html);
  const error = await shell.openPath(target);
  if (error) throw new Error(`Không mở được Xưởng Pet: ${error}`);
}
