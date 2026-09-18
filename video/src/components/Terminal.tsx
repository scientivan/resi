import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { c, font } from "../theme";

/**
 * A drawn terminal that prints real captured output.
 *
 * Every line passed in comes from src/data/terminal.ts, which scripts/terminal-data.mjs generates
 * from actual runs. The picture is drawn rather than screen-recorded so 26px text stays sharp at
 * 1080p; the words are not ours to invent. Lines appear on `schedule` (local frames), so the output
 * lands under the subtitle that talks about it.
 */
export type Tone = "bad" | "good" | "note" | "plain";

export const Terminal: React.FC<{
  title: string;
  command: string;
  lines: readonly string[];
  /** local frame at which each line appears; shorter than lines = remaining lines follow at +4 */
  schedule: number[];
  tone?: (line: string) => Tone;
  typeFrom?: number;
  typeFrames?: number;
  visible?: number;
  fontSize?: number;
  height?: number | string;
}> = ({ title, command, lines, schedule, tone = () => "plain", typeFrom = 0, typeFrames = 24, visible = 18, fontSize = 26, height = "100%" }) => {
  const frame = useCurrentFrame();
  const typed = command.slice(
    0,
    Math.floor(interpolate(frame, [typeFrom, typeFrom + typeFrames], [0, command.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })),
  );
  const at = (i: number) => schedule[i] ?? (schedule[schedule.length - 1] ?? 0) + (i - schedule.length + 1) * 4;
  const shown = lines.filter((_, i) => frame >= at(i)).length;
  const start = Math.max(0, shown - visible);
  const caret = Math.floor(frame / 15) % 2 === 0;
  // Rough fit check: characters per row from the pane width, rows from the pane height.
  const rows = lines.slice(start, shown).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 118)), 1);
  const overflowing = typeof height === "number" && rows * fontSize * 1.48 > height - 120;
  const color: Record<Tone, string> = { bad: c.held, good: c.clear, note: c.weak, plain: c.muted };

  return (
    <div style={{ height, borderRadius: 16, border: `1px solid ${c.border}`, backgroundColor: c.well, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 40px 120px rgba(0,0,0,.45)" }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 20px", gap: 16, borderBottom: `1px solid ${c.border}`, backgroundColor: c.surface2, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 11, height: 11, borderRadius: 99, backgroundColor: c.borderStrong }} />)}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 19, color: c.faint }}>{title}</div>
      </div>
      <div style={{ padding: "22px 28px", fontFamily: font.mono, fontSize, lineHeight: 1.48, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: shown > 0 && overflowing ? "flex-end" : "flex-start" }}>
        <div style={{ color: c.ink }}>
          <span style={{ color: c.primaryInk }}>$ </span>{typed}
          {shown === 0 && caret ? <span style={{ color: c.primaryInk }}>▍</span> : null}
        </div>
        <div style={{ marginTop: 12 }}>
          {lines.slice(start, shown).map((line, j) => {
            const i = start + j;
            const p = interpolate(frame - at(i), [0, 6], [0, 1], { extrapolateRight: "clamp" });
            const t = tone(line);
            return (
              <div key={i} style={{ opacity: p, color: color[t], fontWeight: t === "plain" ? 400 : 500, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
