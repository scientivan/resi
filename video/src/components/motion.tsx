import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { noise2D } from "@remotion/noise";

// The whole video uses three motions and nothing else. Adding a fourth is how a piece starts
// looking generated: every scene animating in its own dialect.

/** 1. Entrance. Fade up 24px on a heavy spring. `delay` is what creates the stagger. */
export const FadeUp: React.FC<{
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, distance = 24, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        ...style,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [distance, 0])}px)`,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
};

/** 2. Emphasis. One scale pulse, reserved for a number that carries weight. Never decorative. */
export const Pulse: React.FC<{ at: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: { damping: 20 }, durationInFrames: 26 });
  const scale = 1 + interpolate(p, [0, 0.5, 1], [0, 0.06, 0], { extrapolateRight: "clamp" });
  return <div style={{ ...style, transform: `scale(${scale})`, transformOrigin: "left center" }}>{children}</div>;
};

/** 3. Rest. A resting element still breathes, or the frame reads as a screenshot. 2-3px, no more. */
export const Drift: React.FC<{ seed?: number; amount?: number; children: React.ReactNode }> = ({
  seed = 1,
  amount = 2.5,
  children,
}) => {
  const frame = useCurrentFrame();
  const x = noise2D(`x${seed}`, frame / 90, 0) * amount;
  const y = noise2D(`y${seed}`, frame / 110, 0) * amount;
  return <div style={{ transform: `translate(${x}px, ${y}px)` }}>{children}</div>;
};

/** Dim-and-lift: used when one item in a list has to become the only thing that matters. */
export const useFocus = (at: number, isFocus: boolean) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: { damping: 200 } });
  return {
    opacity: isFocus ? 1 : interpolate(p, [0, 1], [1, 0.22]),
    transform: `scale(${isFocus ? interpolate(p, [0, 1], [1, 1.04]) : 1})`,
  };
};
