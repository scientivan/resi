// Single source of truth for the timeline.
//
// Scene lengths drive the composition. The cue list drives the burned-in subtitles AND out/demo.srt,
// and it is the voice-over script: record by reading these cues, in order, at their timestamps.
// Pace target: about 2.4 spoken words per second or slower (npm run srt prints the actual pace).

export type Scene = { id: string; title: string; from: number; durationInFrames: number };
export type Cue = { scene: string; from: number; durationInFrames: number; text: string };

/**
 * Cues per scene. A bare string is timed from its word count (see auto); [frames, text] is used
 * where the picture needs longer than the sentence, e.g. terminal output landing under it.
 */
type CueIn = string | [number, string];
const auto = (text: string) => Math.max(40, Math.round(text.split(/\s+/).length * 11.8) + 18);

const CUES_BY_SCENE: Array<[id: string, title: string, cues: CueIn[], tail?: number]> = [
  ["hook", "The question", [
    [20, ""],
    "An AI agent sends a payment.",
    "The network drops before the answer comes back.",
    [50, "Did the money move?"],
    [90, "Across 100 trials, AgentKit could not tell. Not once."],
    [75, "Through Resi, it could. 99 times."],
  ], 10],
  ["stakes", "Why now", [
    "This is not a thought experiment.",
    [85, "Agents already pay on their own: 75 million x402 payments in 30 days."],
    [60, "24 million dollars, moved by software."],
    [75, "Coinbase AgentKit was downloaded 40,000 times last month."],
    [70, "Its own issue tracker already names the failure:"],
    [95, "a retry after a lost response sends the transfer twice. Still open."],
  ], 15],
  ["gap", "The gap", [
    [75, "Coinbase AgentKit ships 47 action providers."],
    "None of them route through KeeperHub.",
    [95, "Resi is that provider. One npm package, two actions."],
  ], 10],
  ["problem", "Three states", [
    "After a transfer, three things can be true.",
    [42, "It succeeded."],
    [40, "It failed."],
    "Or it went out, and the answer was lost.",
    [95, "AgentKit reports that third state as a failure,"],
    "with no id you can ever ask about again.",
  ], 15],
  ["demo1", "Demo: AgentKit as shipped", [
    [85, "This is a real run. Receipt polling is blocked."],
    [80, "The agent gets an error string. Nothing else."],
    [85, "So it does the reasonable thing, and retries."],
    [95, "On chain: two transfers, for one job."],
    [65, "The money left twice."],
  ], 15],
  ["demo2", "Demo: through KeeperHub", [
    [70, "The same job, through Resi."],
    [90, "It returns an executionId, and the taskId."],
    [85, "The agent retries, exactly as before."],
    [90, "Same executionId. Replayed, not sent again."],
    [75, "Then it asks what really happened,"],
    [95, "and gets a receipt re-read from chain."],
    [60, "One transfer. Confirmed."],
  ], 15],
  ["demo3", "Demo: the simulation gate", [
    [90, "Last, the agent asks for 50 USDC it doesn't have."],
    [95, "KeeperHub simulates first, and predicts the revert."],
    [70, "Nothing broadcast. No gas spent."],
  ], 15],
  ["design", "Who decides what", [
    [85, "The model proposes: recipient, amount, taskId."],
    [95, "Code derives the idempotency key, and runs the simulation."],
    [70, "The model cannot switch simulation off."],
    [85, "KeeperHub executes once, and keeps the receipt."],
  ], 15],
  ["measure", "The hundred", [
    [80, "One demo proves little. So we measured it."],
    [90, "100 trials per arm, the same failure, on Base Sepolia."],
    [80, "AgentKit as shipped: outcome known, zero times,"],
    [70, "and it paid twice in 47 of 47."],
    [85, "Add a CDP idempotency key, the cheapest fix:"],
    [90, "double payments stop. Outcome known: still zero."],
    [90, "Through Resi: 99 of 100, and no double payments."],
    [70, "AgentKit 0.9.1 gave the same answer."],
  ], 20],
  ["why", "Why knowing matters", [
    [80, "If the money only leaves once, why know more?"],
    "Because the same error means two opposite things.",
    [100, "In our runs, 99 of 400 AgentKit calls failed before anything was sent."],
    [80, "Expired certificates. Wallet auth errors. Real, not ours."],
    [80, "Under our injection, the money had already left."],
    [75, "Both times, the agent read the same sentence."],
    [80, "Guess it went out, and a real failure is never paid."],
    [75, "Guess it didn't, and without a key it pays twice."],
    [85, "Only an answer from chain ends the guessing."],
  ], 20],
  ["agent", "A real model", [
    [20, ""],
    "Last, a real model makes the calls, not a script.",
    "It is asked to pay one invoice.",
    [95, "The first transfer goes out, but the answer is lost."],
    [100, "It retries with the same taskId, and gets the same execution back."],
    [95, "Then it asks what happened, and gets a receipt from chain."],
    [80, "One invoice, one transfer."],
  ], 20],
  ["honest", "What we want you to know", [
    [95, "The failure is induced, not sampled from production."],
    [95, "The cheap fix does stop double payments. It can't say what happened."],
    [120, "And it's 99, not 100: our one status call hung, and we never retried."],
  ], 15],
  ["verify", "Check it yourself", [
    [70, "Don't trust these numbers. Check them."],
    [95, "npm run verify re-reads all 625 hashes from chain."],
    [70, "625 succeeded. None missing."],
    [90, "And 22 tests cover the provider."],
  ], 15],
  ["close", "Resi", [
    [100, "Resi. A receipt for every payment your agent makes."],
    [85, "Transfers only, on Base Sepolia, for now."],
    [90, "Install it, run the demo, and check every hash."],
  ], 75],
];

// An explicit frame count is a FLOOR, not an override: it exists so terminal output has room to
// land, never so a long sentence gets read faster than the rest.
const frames = (q: CueIn) => (typeof q === "string" ? auto(q) : Math.max(q[0], auto(q[1])));
const words = (q: CueIn) => (typeof q === "string" ? q : q[1]);

export const SCENES: Scene[] = (() => {
  let at = 0;
  return CUES_BY_SCENE.map(([id, title, cues, tail = 0]) => {
    const durationInFrames = cues.reduce((n, q) => n + frames(q), 0) + tail;
    const s = { id, title, from: at, durationInFrames };
    at += durationInFrames;
    return s;
  });
})();

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.durationInFrames, 0);

export const scene = (id: string): Scene => {
  const found = SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scene: ${id}`);
  return found;
};

export const CUES: Cue[] = CUES_BY_SCENE.flatMap(([id, , cues]) => {
  let at = scene(id).from;
  return cues.flatMap((q) => {
    const durationInFrames = frames(q), text = words(q);
    const cue = { scene: id, from: at, durationInFrames, text };
    at += durationInFrames;
    return text ? [cue] : [];
  });
});

/** Local (scene-relative) start frame of the n-th cue of a scene, counting blank spacer cues. */
export const cueAt = (id: string, n: number): number => {
  const entry = CUES_BY_SCENE.find(([sid]) => sid === id);
  if (!entry) throw new Error(`unknown scene: ${id}`);
  return entry[2].slice(0, n).reduce((f, q) => f + frames(q), 0);
};

/** Quieter top-right track: what is on screen, and where it came from. [atSeconds, seconds | null = to scene end, text] */
const ACTIONS_BY_SCENE: Record<string, Array<[number, number | null, string]>> = {
  stakes: [[0.3, null, "sources: x402.org · npm registry API · github.com/coinbase/agentkit · read 17 Sep 2026"]],
  gap: [[0.3, 5, "@coinbase/agentkit 0.10.4 · latest on npm"]],
  problem: [[10, null, "erc20ActionProvider.js:117 · 0.10.4"]],
  demo1: [[0.3, null, "npm run demo · part 1 · captured 16 Sep 2026"]],
  demo2: [[0.3, null, "npm run demo · part 2 · same run"]],
  demo3: [[0.3, null, "npm run demo · part 3 · same run"]],
  measure: [[0.3, null, "results/agentkit-0.10.4 · from block 46890768"]],
  why: [[2.5, null, "results/agentkit-0.10.4/attempts.json · arms A and B"]],
  agent: [[0.3, null, "npm run agent · gemini-3.6-flash · run of 18 Sep 2026"]],
  verify: [[2.3, null, "npm run verify · took 4m 21s, shortened here"]],
};

export const ACTIONS: Cue[] = SCENES.flatMap((s) =>
  (ACTIONS_BY_SCENE[s.id] ?? []).map(([at, seconds, text]) => {
    const from = Math.round(at * 30);
    return {
      scene: s.id,
      from: s.from + from,
      durationInFrames: seconds === null ? s.durationInFrames - from - 15 : Math.round(seconds * 30),
      text,
    };
  }),
);
