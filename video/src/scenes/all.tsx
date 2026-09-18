import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { Terminal, type Tone } from "../components/Terminal";
import { FadeUp, Pulse, Drift, useFocus } from "../components/motion";
import { TERM } from "../data/terminal";
import { cueAt } from "../script";
import { c, font, size } from "../theme";

type P = { durationInFrames: number };

const mono = (s: number, color: string = c.muted, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: font.mono, fontSize: s, color, ...extra });
const sans = (s: number, color: string = c.ink, weight = 600, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: font.sans, fontSize: s, color, fontWeight: weight, lineHeight: 1.15, ...extra });

const display = (s: number, color: string = c.ink, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: font.display, fontSize: s, color, fontWeight: 600, lineHeight: 1.12, ...extra });

/** Visible from `at` (fades up), and optionally dims after `until`. */
const Show: React.FC<{ at: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, style, children }) => {
  const frame = useCurrentFrame();
  if (frame < at - 1) return <div style={{ ...style, opacity: 0 }}>{children}</div>;
  return <FadeUp delay={at} style={style}>{children}</FadeUp>;
};

// ---------------------------------------------------------------- 1. HOOK
export const Hook: React.FC<P> = ({ durationInFrames }) => {
  const a = cueAt("hook", 4), b = cueAt("hook", 5);
  const figure = (at: number, n: string, color: string, who: string) => (
    <Show at={at}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 30, padding: "22px 0", borderTop: `1px solid ${c.border}` }}>
        <Pulse at={at + 8} style={{ width: 300 }}><div style={mono(76, color, { whiteSpace: "nowrap" })}>{n}<span style={{ color: c.faint, fontSize: 40 }}> / 100</span></div></Pulse>
        <div style={sans(36, c.muted, 500)}>{who}</div>
      </div>
    </Show>
  );
  return (
    <Stage durationInFrames={durationInFrames}>
      <Show at={cueAt("hook", 1)}><div style={mono(28, c.faint, { letterSpacing: ".16em", textTransform: "uppercase" })}>agent pays · network drops · answer lost</div></Show>
      <Show at={cueAt("hook", 3)} style={{ marginTop: 22, marginBottom: 56 }}><div style={display(size.hero + 20)}>Did the money <span style={{ color: c.primaryInk }}>move?</span></div></Show>
      {figure(a, "0", c.held, "times AgentKit could tell")}
      {figure(b, "99", c.clear, "times it could, through Resi")}
    </Stage>
  );
};

// ---------------------------------------------------------------- 1b. STAKES
// Every figure read on 17 Sep 2026 from the source named on its row. None of them is ours.
export const Stakes: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("stakes", n);
  const rows: Array<[number, string, string, string]> = [
    [q(1), "75.41M", "x402 payments by agents, last 30 days", "x402.org"],
    [q(2), "$24.24M", "moved by those payments", "x402.org"],
    [q(3), "40,037", "@coinbase/agentkit downloads, 13 Aug – 11 Sep", "npm registry API"],
    [q(4), "#1483", "\u201ca retry after a lost response sends the transfer twice\u201d · open since 4 Sep", "coinbase/agentkit"],
  ];
  return (
    <Stage durationInFrames={durationInFrames} label="Why this matters now">
      <Show at={0} style={{ marginBottom: 40 }}><div style={display(size.headline)}>Agents already move real money.</div></Show>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map(([at, figure, claim, source]) => (
          <Show key={figure} at={at}>
            <div style={{ display: "flex", alignItems: "center", gap: 30, padding: "20px 30px", borderRadius: 12, border: `1px solid ${at === q(4) && true ? c.borderStrong : c.border}`, backgroundColor: c.surface }}>
              <Pulse at={at + 10} style={{ width: 270, flexShrink: 0 }}><div style={mono(46, at === q(4) ? c.weak : c.primaryInk, { whiteSpace: "nowrap" })}>{figure}</div></Pulse>
              <div style={sans(30, c.ink, 500, { flex: 1, lineHeight: 1.25 })}>{at === q(4) ? <>{claim.split(" · ")[0]}<span style={{ color: c.faint }}> · {claim.split(" · ")[1]}</span></> : claim}</div>
              <div style={mono(21, c.faint, { width: 240, textAlign: "right" })}>{source}</div>
            </div>
          </Show>
        ))}
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- 2. GAP
const PROVIDERS = ["across", "alchemy", "allora", "basename", "clanker", "compound", "defillama", "enso", "erc20", "erc721", "farcaster", "flaunch", "jupiter", "messari", "moonwell", "morpho", "opensea", "pyth", "superfluid", "sushi", "weth", "x402", "zerion", "zora"];
export const Gap: React.FC<P> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pitch = cueAt("gap", 2);
  const dim = interpolate(spring({ frame: frame - pitch, fps, config: { damping: 200 } }), [0, 1], [1, 0]);
  return (
    <Stage durationInFrames={durationInFrames} label="@coinbase/agentkit · action providers">
      <div style={{ position: "relative", flex: 1 }}>
        <div style={{ opacity: dim, display: "flex", flexWrap: "wrap", gap: 16, maxWidth: 1500 }}>
          {PROVIDERS.map((p, i) => (
            <Show key={p} at={6 + i * 3}>
              <div style={{ ...mono(28, ["enso", "morpho", "x402"].includes(p) && frame >= 40 ? c.ink : c.muted), padding: "12px 22px", borderRadius: 10, border: `1px solid ${["enso", "morpho", "x402"].includes(p) && frame >= 40 ? c.borderStrong : c.border}`, backgroundColor: c.surface }}>{p}</div>
            </Show>
          ))}
          <Show at={6 + PROVIDERS.length * 3}><div style={{ ...mono(28, c.faint), padding: "12px 22px" }}>+ 23 more</div></Show>
          <Show at={cueAt("gap", 1)}>
            <div style={{ ...mono(28, c.held), padding: "12px 22px", borderRadius: 10, border: `2px dashed ${c.held}` }}>keeperhub · none</div>
          </Show>
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Show at={pitch}>
            <div style={display(130)}>Resi</div>
            <div style={{ ...mono(40, c.clear), marginTop: 18, padding: "18px 28px", borderRadius: 12, backgroundColor: c.well, border: `1px solid ${c.border}`, display: "inline-block" }}>$ npm i agentkit-keeperhub</div>
          </Show>
          <div style={{ display: "flex", gap: 22, marginTop: 34 }}>
            {["transfer", "get_execution_status"].map((a, i) => (
              <Show key={a} at={pitch + 40 + i * 12}>
                <div style={{ ...mono(34, c.ink), padding: "14px 26px", borderRadius: 10, border: `1px solid ${c.borderStrong}`, backgroundColor: c.surface }}>{a}</div>
              </Show>
            ))}
          </div>
        </div>
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- 3. PROBLEM
export const Problem: React.FC<P> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const collapse = cueAt("problem", 4);
  const p = spring({ frame: frame - collapse, fps, config: { damping: 200 } });
  const card = (label: string, sub: string, color: string, at: number, extra: React.CSSProperties = {}, child?: React.ReactNode) => (
    <Show at={at}>
      <div style={{ width: 440, padding: "34px 36px", borderRadius: 16, border: `1px solid ${color}`, backgroundColor: c.surface, ...extra }}>
        <div style={mono(24, color, { letterSpacing: ".14em", textTransform: "uppercase" })}>{label}</div>
        <div style={{ ...sans(40, c.ink, 500), marginTop: 14 }}>{sub}</div>
        {child}
      </div>
    </Show>
  );
  const merged = (
    <div style={{ ...mono(24, c.weak), marginTop: 12, opacity: interpolate(p, [0.6, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>+ unknown, reported as failed</div>
  );
  return (
    <Stage durationInFrames={durationInFrames} label="after a transfer">
      <div style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
        {card("succeeded", "the money moved", c.clear, cueAt("problem", 1))}
        {card("failed", "it did not", c.held, cueAt("problem", 2), {
          ...(frame > collapse ? {} : {}), boxShadow: frame > collapse ? `0 0 0 ${interpolate(p, [0, 1], [0, 4])}px ${c.held}` : undefined }, merged)}
        {card("unknown", "it went out, the answer was lost", c.weak, cueAt("problem", 3), {
          transform: `translateX(${interpolate(p, [0, 1], [0, -480])}px)`,
          opacity: interpolate(p, [0, 0.7, 1], [1, 0.4, 0]),
        })}
      </div>
      <Show at={collapse + 10} style={{ marginTop: 44 }}>
        <div style={mono(30, c.faint)}>AgentKit, every catch in erc20ActionProvider.transfer:</div>
        <div style={{ ...mono(36, c.ink), marginTop: 14, padding: "22px 30px", borderRadius: 12, backgroundColor: c.well, border: `1px solid ${c.border}`, display: "inline-block" }}>
          <span style={{ color: c.held }}>return</span> {"`Error transferring the asset: ${error}`"}
        </div>
      </Show>
      <Show at={cueAt("problem", 5)} style={{ marginTop: 26 }}>
        <div style={mono(32, c.held)}>no transaction hash · no execution id · nothing to ask again</div>
      </Show>
    </Stage>
  );
};

// ---------------------------------------------------------------- 4–6. DEMO
const tone = (l: string): Tone => {
  if (/Same executionId\? YES|SUCCEEDED|\| success \||Zero transactions|Verified onchain result|^Aborted/.test(l)) return "good";
  if (/Error transferring|RESULT: 2|left twice|^\s+0x[0-9a-f]{64}$/.test(l)) return "bad";
  if (/^\[\d\]|^\s{4}\S|^The agent asks/.test(l)) return "note";
  return "plain";
};
const stagger = (from: number, n: number, gap: number) => Array.from({ length: n }, (_, i) => from + i * gap);

export const Demo1: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("demo1", n);
  const schedule = [q(0) + 30, q(0) + 60, q(0) + 64, q(1) + 5, q(1) + 12, q(1) + 19, q(2) + 5, q(2) + 45, q(2) + 49, q(3) + 5, q(3) + 30, q(3) + 42, q(4) + 5];
  return (
    <Stage durationInFrames={durationInFrames} label="part 1 · AgentKit as shipped · receipt polling blocked">
      <Terminal title="harness" command="npm run demo" typeFrom={4} typeFrames={20} lines={TERM.part1} schedule={schedule} tone={tone} fontSize={27} height={650} />
    </Stage>
  );
};

export const Demo2: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("demo2", n);
  const schedule = [q(0) + 8, ...stagger(q(1) + 5, 7, 7), q(2) + 5, ...stagger(q(2) + 35, 4, 7), q(3) + 10, q(4) + 5, q(4) + 11, ...stagger(q(5) + 5, 6, 8)];
  return (
    <Stage durationInFrames={durationInFrames} label="part 2 · the same job, through KeeperHub">
      <Terminal title="harness" command="npm run demo" typeFrames={1} typeFrom={-2} lines={TERM.part2} schedule={schedule} tone={tone} fontSize={24} visible={40} height={650} />
    </Stage>
  );
};

export const Demo3: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("demo3", n);
  return (
    <Stage durationInFrames={durationInFrames} label="part 3 · the simulation gate">
      <Terminal title="harness" command="npm run demo" typeFrames={1} typeFrom={-2} lines={TERM.part3} schedule={[q(0) + 10, q(1) + 20, q(2) + 8]} tone={tone} fontSize={30} height={650} />
    </Stage>
  );
};

// ---------------------------------------------------------------- 7. DESIGN
export const Design: React.FC<P> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const q = (n: number) => cueAt("design", n);
  const hi = frame >= q(2) && frame < q(3);
  const col = (at: number, head: string, color: string, items: Array<[string, boolean?]>, foot?: string) => (
    <Show at={at} style={{ flex: 1 }}>
      <div style={{ height: 560, padding: "32px 34px", borderRadius: 16, border: `1px solid ${c.border}`, backgroundColor: c.surface }}>
        <div style={mono(24, color, { letterSpacing: ".14em", textTransform: "uppercase" })}>{head}</div>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map(([t, strong]) => (
            <div key={t} style={{ ...mono(32, strong ? c.ink : c.muted), ...(strong && hi ? { color: c.weak } : {}) }}>{t}</div>
          ))}
        </div>
        {foot ? <div style={{ ...mono(26, c.held), marginTop: 30 }}>{foot}</div> : null}
      </div>
    </Show>
  );
  const arrow = (at: number) => <Show at={at}><div style={{ ...sans(64, c.faint, 400), paddingTop: 230 }}>→</div></Show>;
  return (
    <Stage durationInFrames={durationInFrames} label="the model chooses what · code decides what is true">
      <div style={{ display: "flex", gap: 26 }}>
        {col(q(0) + 8, "model proposes", c.weak, [["recipient"], ["amount"], ["token"], ["taskId"]], "never: calldata, abi, hex")}
        {arrow(q(1))}
        {col(q(1), "code decides", c.primaryInk, [["chain supported?"], ["key = hash(taskId, …)"], ["simulate: true", true], ["abort if wouldRevert"]])}
        {arrow(q(3))}
        {col(q(3), "keeperhub executes", c.clear, [["execute once"], ["executionId"], ["receipt, verified"]])}
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- 8. MEASURE
export const Measure: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("measure", n);
  const rows: Array<{ name: string; sub: string; at: number; outAt: number; out: string; outGood: boolean; dbl: string; dblGood: boolean; dblAt: number }> = [
    { name: "AgentKit as shipped", sub: "no execution id exists", at: q(2), outAt: q(2) + 25, out: "0 / 100", outGood: false, dbl: "47 of 47", dblGood: false, dblAt: q(3) + 10 },
    { name: "+ CDP idempotency key", sub: "the cheapest possible fix", at: q(4), outAt: q(5) + 60, out: "0 / 100", outGood: false, dbl: "0 of 86", dblGood: true, dblAt: q(5) + 10 },
    { name: "+ Resi, through KeeperHub", sub: "chain-verified receipts", at: q(6), outAt: q(6) + 30, out: "99 / 100", outGood: true, dbl: "0 of 100", dblGood: true, dblAt: q(6) + 60 },
  ];
  const cell: React.CSSProperties = { padding: "26px 0", borderBottom: `1px solid ${c.border}` };
  return (
    <Stage durationInFrames={durationInFrames} label="100 trials per arm · AgentKit 0.10.4 · Base Sepolia · 602 RPC calls rejected">
      <Show at={q(1)}>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", ...mono(24, c.faint, { letterSpacing: ".12em", textTransform: "uppercase" }), paddingBottom: 14, borderBottom: `1px solid ${c.borderStrong}` }}>
          <div>arm</div><div>outcome known</div><div>paid twice</div>
        </div>
      </Show>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", alignItems: "center" }}>
          <Show at={r.at} style={cell}><div style={display(42)}>{r.name}</div><div style={{ ...mono(24, c.faint), marginTop: 6 }}>{r.sub}</div></Show>
          <Show at={r.outAt} style={cell}><Pulse at={r.outAt + 6}><div style={mono(60, r.outGood ? c.clear : c.held)}>{r.out}</div></Pulse></Show>
          <Show at={r.dblAt} style={cell}><Pulse at={r.dblAt + 6}><div style={mono(60, r.dblGood ? c.clear : c.held)}>{r.dbl}</div></Pulse></Show>
        </div>
      ))}
      <Show at={q(7)} style={{ marginTop: 30 }}>
        <div style={mono(30, c.muted)}>AgentKit 0.9.1, same campaign: <span style={{ color: c.held }}>0 / 100</span> · <span style={{ color: c.clear }}>99 / 100</span> · paid twice <span style={{ color: c.held }}>50 of 50</span></div>
      </Show>
    </Stage>
  );
};

// ---------------------------------------------------------------- 8b. WHY KNOWING MATTERS
// Both error strings are verbatim from results/agentkit-0.10.4/attempts.json. 99 = arms A and B
// attempts that failed on "certificate has expired" or "Wallet authentication error": 0 hashes.
export const Why: React.FC<P> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const q = (n: number) => cueAt("why", n);
  const prefix = "Error transferring the asset: ";
  const row = (at: number, tail: string, verdict: string, color: string, count: string) => (
    <Show at={at}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 330px", gap: 30, alignItems: "center", padding: "24px 30px", borderRadius: 12, border: `1px solid ${c.border}`, backgroundColor: c.surface }}>
        <div style={mono(28, c.ink, { lineHeight: 1.4 })}>
          <span style={{ color: frame >= q(5) ? c.weak : c.ink, backgroundColor: frame >= q(5) ? "oklch(0.8 0.11 80 / 0.12)" : "transparent" }}>{prefix}</span>
          <span style={{ color: c.faint }}>{tail}</span>
        </div>
        <div>
          <div style={mono(22, c.faint, { letterSpacing: ".12em", textTransform: "uppercase" })}>{count}</div>
          <div style={sans(34, color, 600, { marginTop: 6 })}>{verdict}</div>
        </div>
      </div>
    </Show>
  );
  const guess = (at: number, head: string, body: string) => (
    <Show at={at} style={{ flex: 1 }}>
      <div style={{ padding: "22px 28px", borderLeft: `3px solid ${c.held}` }}>
        <div style={mono(24, c.faint)}>{head}</div>
        <div style={sans(34, c.ink, 500, { marginTop: 8 })}>{body}</div>
      </div>
    </Show>
  );
  return (
    <Stage durationInFrames={durationInFrames} label="Paying once is not enough">
      <Show at={0} style={{ marginBottom: 36 }}><div style={display(size.headline)}>One sentence, <span style={{ color: c.weak }}>two opposite facts.</span></div></Show>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {row(q(2), "NetworkError: certificate has expired", "nothing was sent", c.muted, "99 of 400 · real")}
        {row(q(4), "InvalidInputRpcError: Missing or invalid parameters…", "the money had left", c.held, "under injection")}
      </div>
      <div style={{ display: "flex", gap: 30, marginTop: 34 }}>
        {guess(q(6), "guess: it went out", "a real failure is never paid")}
        {guess(q(7), "guess: it did not", "no key, so it pays twice")}
      </div>
      <Show at={q(8)} style={{ marginTop: 26 }}><div style={mono(30, c.clear)}>executionId → receipt re-read from chain → no guess</div></Show>
    </Stage>
  );
};

// ---------------------------------------------------------------- 9. HONEST
export const Honest: React.FC<P> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const q = (n: number) => cueAt("honest", n);
  const focusAt = [q(0) + 4, q(1), q(2)];
  const current = frame >= q(2) ? 2 : frame >= q(1) ? 1 : 0;
  const cards: Array<[string, string]> = [
    ["the failure is induced", "Not sampled from production. We reject eth_getTransactionReceipt on demand."],
    ["the cheap fix also works", "A CDP idempotency key stops double payments as well as we do. It cannot tell the agent what happened."],
    ["99, not 100", "The transfer landed, but our one status call hung and was never retried. KeeperHub behaved correctly. We did not."],
  ];
  return (
    <Stage durationInFrames={durationInFrames} label="what we would rather tell you ourselves">
      <div style={{ display: "flex", gap: 30 }}>
        {cards.map(([h, b], i) => (
          <Card key={h} at={focusAt[i]} focus={current === i} dimAt={current > i ? focusAt[current] : -1} head={h} body={b} />
        ))}
      </div>
    </Stage>
  );
};
const Card: React.FC<{ at: number; focus: boolean; dimAt: number; head: string; body: string }> = ({ at, focus, dimAt, head, body }) => {
  const f = useFocus(dimAt < 0 ? 99999 : dimAt, focus);
  return (
    <Show at={at} style={{ flex: 1 }}>
      <div style={{ ...f, height: 480, padding: "34px 34px", borderRadius: 12, borderTop: `3px solid ${c.weak}`, border: `1px solid ${c.border}`, backgroundColor: c.surface }}>
        <div style={mono(24, c.weak, { letterSpacing: ".12em", textTransform: "uppercase" })}>{head}</div>
        <div style={{ ...sans(36, c.ink, 500, { lineHeight: 1.35 }), marginTop: 22 }}>{body}</div>
      </div>
    </Show>
  );
};

// ---------------------------------------------------------------- 10. VERIFY
export const Verify: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("verify", n);
  const vTone = (l: string): Tone => (/succeeded=\d+ reverted=0 not_found=0/.test(l) ? "good" : "plain");
  const tTone = (l: string): Tone => (/passed/.test(l) ? "good" : /✓/.test(l) ? "plain" : "plain");
  return (
    <Stage durationInFrames={durationInFrames} label="check it yourself">
      <div style={{ display: "flex", gap: 28, height: 640 }}>
        <div style={{ flex: 1 }}>
          <Terminal title="harness" command="npm run verify" typeFrom={q(1)} typeFrames={22} lines={TERM.verify} schedule={[q(1) + 30, q(1) + 34, q(1) + 70, q(2) + 5, q(2) + 30, q(2) + 36]} tone={vTone} fontSize={24} />
        </div>
        <div style={{ flex: 1.25 }}>
          <Terminal title="packages/agentkit-keeperhub" command="npm test" typeFrom={q(3)} typeFrames={14} lines={TERM.test.filter((l) => !/RUN|Start at|Duration/.test(l))} schedule={stagger(q(3) + 22, 8, 6)} tone={tTone} fontSize={23} />
        </div>
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- 11. CLOSE
export const Close: React.FC<P> = ({ durationInFrames }) => {
  const q = (n: number) => cueAt("close", n);
  return (
    <Stage durationInFrames={durationInFrames}>
      <Drift seed={3}>
        <Show at={6}><div style={display(180)}>Resi</div></Show>
        <Show at={30} style={{ marginTop: 6 }}><div style={display(54, c.muted, { fontWeight: 600 })}>A receipt for every payment your agent makes.</div></Show>
      </Drift>
      <Show at={q(1)} style={{ marginTop: 50, display: "flex", gap: 20, flexWrap: "wrap" }}>
        {["transfers only", "Base Sepolia", "failure induced"].map((t) => (
          <div key={t} style={{ ...mono(28, c.weak), padding: "10px 20px", borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.surface }}>{t}</div>
        ))}
      </Show>
      <Show at={q(2)} style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={mono(40, c.clear)}>$ npm i agentkit-keeperhub</div>
        <div style={mono(40, c.ink)}>github.com/scientivan/resi</div>
      </Show>
    </Stage>
  );
};
