// Writes out/VOICEOVER.md: the narration as a read-along sheet, from the same cues as the subtitles.
import { writeFileSync, mkdirSync } from "node:fs";
import { CUES, SCENES } from "../src/script.ts";
const t = (f) => { const s = f / 30; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`; };
let md = "# Resi · voiceover script\n\nRead each line so it starts at its timestamp. The subtitles in the video show the same words at the same moment, so you can also just read along while the video plays muted.\n";
for (const s of SCENES) {
  md += `\n## ${t(s.from)} · ${s.title}\n\n`;
  for (const q of CUES.filter((c) => c.scene === s.id)) md += `- \`${t(q.from)}\` ${q.text}\n`;
}
mkdirSync("out", { recursive: true });
writeFileSync("out/VOICEOVER.md", md);
console.log(md);
