// Writes out/demo.srt from the same cue list the burned-in subtitles use, so the two can never
// disagree. Node 24 strips the TypeScript types on import; no build step.
import { mkdirSync, writeFileSync } from "node:fs";
import { CUES } from "../src/script.ts";

const FPS = 30;

const stamp = (frames) => {
  const total = frames / FPS;
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(total % 60)).padStart(2, "0");
  const ms = String(Math.round((total % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
};

const srt = CUES.map((cue, i) =>
  [i + 1, `${stamp(cue.from)} --> ${stamp(cue.from + cue.durationInFrames)}`, cue.text, ""].join("\n"),
).join("\n");

mkdirSync("out", { recursive: true });
writeFileSync("out/demo.srt", srt);

const words = CUES.reduce((n, q) => n + q.text.split(/\s+/).length, 0);
const seconds = CUES.reduce((n, q) => n + q.durationInFrames, 0) / FPS;
console.log(`out/demo.srt · ${CUES.length} cues · ${words} words over ${seconds.toFixed(0)}s`);
console.log(`pace: ${(words / seconds).toFixed(2)} words/sec (target 2.4 or below)`);
