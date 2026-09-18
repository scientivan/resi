/**
 * Records `npm run demo` as a timestamped transcript.
 *
 *   npx tsx scripts/record-demo.ts
 *
 * Output: video/demo-transcript.json — array {t, text} dengan t = milidetik
 * sejak proses dimulai. Video me-replay ini dengan timing aslinya, jadi yang
 * terlihat di layar adalah keluaran run yang benar-benar terjadi, bukan
 * teks yang ditulis ulang.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const t0 = Date.now();
const chunks: { t: number; text: string }[] = [];

const child = spawn("npx", ["tsx", "scripts/demo.ts"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: process.env,
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (b: Buffer) => {
    const text = b.toString("utf8");
    chunks.push({ t: Date.now() - t0, text });
    process.stdout.write(text);
  });
}

child.on("close", (code) => {
  mkdirSync("video", { recursive: true });
  writeFileSync(
    "video/demo-transcript.json",
    JSON.stringify({ recordedAt: new Date().toISOString(), exitCode: code, durationMs: Date.now() - t0, chunks }, null, 2),
  );
  console.log(`\n[record] ${chunks.length} chunks, ${((Date.now() - t0) / 1000).toFixed(1)}s → video/demo-transcript.json`);
  process.exit(code ?? 0);
});
