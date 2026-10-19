// Copies the exhibit's settings, words and media into the Android headset app before it is built.
// Run from the project folder:  node tools/export-android.mjs
// (GitHub does this automatically when it builds the app.)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "android/app/src/main/assets/web");

// load js/config.js and js/translations.js (browser modules) in Node
globalThis.location = { search: "" };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exhibit-"));
fs.cpSync(path.join(root, "js"), tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, "package.json"), '{ "type": "module" }');
const cfg = await import(pathToFileURL(path.join(tmp, "config.js")).href);
const tr = await import(pathToFileURL(path.join(tmp, "translations.js")).href);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "data.json"), JSON.stringify({
  firebaseConfig: cfg.firebaseConfig, TIMING: cfg.TIMING, MEDIA: cfg.MEDIA,
  DEFAULT_HOTSPOTS: cfg.DEFAULT_HOTSPOTS, DEFAULT_CALIBRATION: cfg.DEFAULT_CALIBRATION,
  LANGUAGES: tr.LANGUAGES, T: tr.T
}));

// media used by the headset (pathway videos are not played any more)
const wanted = [
  ["videos", f => /^eye-intro.*\.mp4$/.test(f) || f === "home.mp4"],
  ["images", f => /\.(jpe?g|png)$/i.test(f)],
  ["audio", f => /\.mp3$/i.test(f)]
];
let bytes = 0;
for (const [dir, ok] of wanted) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(out, dir), { recursive: true });
  for (const f of fs.readdirSync(src).filter(ok)) {
    fs.copyFileSync(path.join(src, f), path.join(out, dir, f));
    bytes += fs.statSync(path.join(src, f)).size;
    console.log("  " + dir + "/" + f);
  }
}
console.log(`Copied into the app: ${(bytes / 1e6).toFixed(1)} MB of media + data.json`);
