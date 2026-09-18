import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { c, font, size } from "../theme";

const FADE = 15;

// The subtitle plate lives in the bottom 230px. Scene content never enters it: burning a caption
// over your own content is the single fastest way to look unfinished.
export const SAFE = "96px 128px 230px";

/**
 * Every scene sits on a Stage: same ground, same margins, same fade in and out.
 *
 * Scenes dip to the background colour rather than cross-fading. TransitionSeries would cross-fade,
 * but it shifts frame numbers around as durations change, and the subtitle cues in script.ts are
 * absolute. Keeping the timeline flat is what keeps the voice-over in sync with the picture.
 */
export const Stage: React.FC<{
  durationInFrames: number;
  label?: string;
  children: React.ReactNode;
}> = ({ durationInFrames, label, children }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], { extrapolateLeft: "clamp" }),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: c.bg, opacity }}>
      {/* A single soft pool of light, off-centre. Flat fields read as unfinished. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at 22% 18%, ${c.surface} 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{ padding: SAFE, display: "flex", flexDirection: "column" }}>
        {label ? (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: size.label - 6,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: c.faint,
              marginBottom: 40,
            }}
          >
            {label}
          </div>
        ) : null}
        {/* positioned, so a scene can overlay inside the safe area instead of over the whole frame */}
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
