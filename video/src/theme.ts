// Same system as the Tinjau demo (CTC Hackathon/video): oklch tokens, one quiet hue, a serif for
// headlines, mono for anything that came off a chain. Hue moved from 225 to 190 so Resi reads as
// its own piece. No neon: status colours are desaturated so the numbers, not the paint, carry it.
export const c = {
  bg: "oklch(0.17 0.016 190)",
  surface: "oklch(0.21 0.018 190)",
  surface2: "oklch(0.25 0.02 190)",
  well: "oklch(0.145 0.014 190)",
  border: "oklch(0.3 0.02 190)",
  borderStrong: "oklch(0.37 0.022 190)",
  ink: "oklch(0.975 0.005 180)",
  muted: "oklch(0.75 0.014 185)",
  faint: "oklch(0.63 0.014 185)",
  primary: "oklch(0.52 0.1 175)",
  primaryInk: "oklch(0.8 0.1 170)",
  clear: "oklch(0.72 0.13 155)",
  weak: "oklch(0.8 0.11 80)",
  held: "oklch(0.68 0.17 30)",
} as const;

export const font = {
  display: '"Fraunces", Georgia, serif',
  sans: '"Hanken Grotesk", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
} as const;

// One scale, used everywhere. Nothing a viewer must read goes below 28.
export const size = {
  hero: 84,
  headline: 64,
  label: 34,
  body: 40,
  subtitle: 40,
  mono: 30,
} as const;

export const FPS = 30;
