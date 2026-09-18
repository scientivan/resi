import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ACTIONS } from "../script";
import { c, font } from "../theme";

/**
 * A second, quieter caption track that names what is happening on screen, separate from the
 * narration subtitle at the bottom.
 *
 * The two answer different questions. The subtitle carries the argument ("Agent 50283: one
 * reviewer"); this carries the mechanics ("opening: Reviews missing below a proven one"). Without
 * it a viewer watching muted has to guess which row was just clicked, and a judge scrubbing the
 * timeline cannot tell a click from a scroll.
 */
export const ActionCaption: React.FC = () => {
  const frame = useCurrentFrame();
  const action = ACTIONS.find((a) => frame >= a.from && frame < a.from + a.durationInFrames);
  if (!action) return null;

  const local = frame - action.from;
  const opacity = Math.min(
    interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(local, [action.durationInFrames - 8, action.durationInFrames], [1, 0], { extrapolateLeft: "clamp" }),
  );

  return (
    <div
      style={{
        position: "absolute",
        right: 128,
        top: 34,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        borderRadius: 999,
        border: `1px solid ${c.borderStrong}`,
        backgroundColor: "oklch(0.19 0.018 190 / 0.94)",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.primaryInk }} />
      <div style={{ fontFamily: font.mono, fontSize: 22, color: c.primaryInk, letterSpacing: "0.02em" }}>
        {action.text}
      </div>
    </div>
  );
};
