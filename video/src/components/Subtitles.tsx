import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CUES } from "../script";
import { c, font, size } from "../theme";

/**
 * Burned in, because Dien records the voice-over against this picture: the subtitle is his cue
 * sheet as well as the viewer's. Reads over both the drawn scenes and the screen recordings, so it
 * sits on its own plate rather than trusting whatever is behind it.
 */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const cue = CUES.find((q) => frame >= q.from && frame < q.from + q.durationInFrames);
  if (!cue) return null;

  const local = frame - cue.from;
  const opacity = Math.min(
    interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(local, [cue.durationInFrames - 6, cue.durationInFrames], [1, 0], { extrapolateLeft: "clamp" }),
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
      <div
        style={{
          opacity,
          maxWidth: 1400,
          padding: "18px 34px",
          borderRadius: 12,
          backgroundColor: "oklch(0.19 0.018 190 / 0.94)",
          border: `1px solid ${c.border}`,
          fontFamily: font.sans,
          fontWeight: 500,
          fontSize: size.subtitle,
          lineHeight: 1.32,
          color: c.ink,
          textAlign: "center",
          textWrap: "balance",
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};
