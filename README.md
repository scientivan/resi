# agentkit-keeperhub

**In 100 trials with receipt polling deliberately broken, a Coinbase AgentKit
agent (0.10.4, the latest release) could determine the outcome of its own
payment in 0 of them. Through this KeeperHub provider, 99 of 100, with receipts
re-read from chain. AgentKit paid twice in 47 of 47 comparable trials; this
provider in 0 of 100.**

The same campaign on AgentKit 0.9.1 gave the same answer: 0 / 100, 99 / 100,
50 of 50.

625 transfers on Base Sepolia across both runs, all arms. 200 of them were
executed through KeeperHub (arm C, 100 per run); the rest are the AgentKit
baselines they are compared against. Every hash is in
[`harness/results/`](harness/results/), tagged by arm. Verify any of them yourself.

A transfer executed through KeeperHub (arm C, trial 0, executionId
`fbap203n45jrwl61ijfvs`):
[`0xe085aa27…631d`](https://sepolia.basescan.org/tx/0xe085aa27d4ddeb8ccebd03e39c9c6b5f07864c33bf382d1edcf8a387eb30631d)

```bash
curl -s https://sepolia.base.org -H 'content-type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt",
      "params":["0xe085aa27d4ddeb8ccebd03e39c9c6b5f07864c33bf382d1edcf8a387eb30631d"]}'
# status 0x1, block 46890775: 0.003 USDC from the KeeperHub wallet 0x449F…56CB
```

Or check all of them at once: `cd harness && npm run verify`.

---

## The gap

The latest Coinbase AgentKit on npm (0.10.4) exports 47 action providers,
among them Enso, Morpho and x402, and none for KeeperHub, although KeeperHub
names AgentKit as a partner. Verified 16 Sep 2026: zero GitHub repositories,
zero npm packages, zero mentions in either issue tracker.

Adapters exist for LangChain, ElizaOS, OpenClaw and n8n. AgentKit — the largest,
at 40,037 npm downloads a month — has none.

**Upstream:** the provider is proposed into AgentKit itself as
[coinbase/agentkit#1504](https://github.com/coinbase/agentkit/pull/1504)
(`typescript/agentkit/src/action-providers/keeperhub/`, 22 tests, lint clean).
Open, not yet reviewed. Until it merges, use the npm package.

## The problem

After a transfer, three things can be true:

1. **Succeeded** — the money moved.
2. **Failed** — it did not.
3. **Unknown** — it was broadcast, but the answer was lost.

**AgentKit reports state 3 as state 2.** In `erc20ActionProvider.transfer`,
the catch-all returns `Error transferring the asset: ${error}`, without the
transaction hash. That line is unchanged from 0.9.1 to 0.10.4
(`dist/action-providers/erc20/erc20ActionProvider.js:117` in 0.10.4). There is no execution id, so nothing can be asked
again.

An agent that hits this has two options and both are wrong: retry and risk
paying twice, or don't retry and risk never paying at all.

This is not our discovery. It was reported independently as
[coinbase/agentkit#1483](https://github.com/coinbase/agentkit/issues/1483) on
4 Sep 2026. What this repository adds is the measurement of what it costs, and
a provider that closes it.

## The measurement

One failure mode, three arms, the same conditions.

| Arm | What it is |
|---|---|
| **A** | AgentKit as shipped |
| **B** | AgentKit + a CDP idempotency key — the cheapest possible fix |
| **C** | AgentKit + this provider, routing through KeeperHub |

Arm B exists so that KeeperHub is not compared against nothing. The CDP SDK
accepts an `idempotencyKey` that AgentKit never passes; arm B passes it.

**Failure injection.** `eth_getTransactionReceipt` is rejected at the `fetch`
layer with JSON-RPC `-32000` (outside viem's retry set, so it fails fast). The
send path is untouched — CDP broadcasts over its own API — so the transaction
lands while the agent loses the answer. That is the real-world shape of an RPC
hiccup during receipt polling.

The failure is **induced**, not observed in the wild. Said plainly because a
reader will check.

### Results

Two full runs, 100 trials per arm each, Base Sepolia:

| Run | AgentKit | From block | RPC calls rejected | Transfers |
|---|---|---|---|---|
| 1 | 0.9.1 | 46881051 | 582 | 310 |
| 2 | 0.10.4 (latest) | 46890768 | 602 | 315 |

**Primary measure — after the failure, can the caller determine the outcome?**

| Arm | 0.10.4 | 0.9.1 | Hash merely leaked into error text (0.10.4) |
|---|---|---|---|
| A | **0 / 100** | 0 / 100 | 79 / 100 |
| B | **0 / 100** | 0 / 100 | 89 / 100 |
| C | **99 / 100** | 99 / 100 | not needed |

"Determinable" means a chain-verified receipt obtained through a supported API
surface: `executionId` → `GET /api/execute/{id}/status` → `receipts[].verified`.

For A and B the hash sometimes appears inside viem's echoed request body — a
debugging artifact, not a return value. On network-layer failures it does not
appear at all.

**Secondary measure — double transfers**, counted only where both attempts
actually reached the API, so unrelated failures cannot inflate it:

| Arm | 0.10.4: both sent → duplicated | 0.9.1: both sent → duplicated |
|---|---|---|
| A | 47 → **47** (100%) | 50 → **50** (100%) |
| B | 86 → 0 | 81 → 0 |
| C | 100 → 0 | 100 → 0 |

### A prediction, written before the run

> The duplicate rate will equal the induced failure rate.

Injection was on for 100% of arm A trials. Result: 47 of 47 on 0.10.4, 50 of 50
on 0.9.1, and 49 of 49 in an earlier pilot run.

### What arm B proves, and what it doesn't

Passing a CDP idempotency key **does** stop the double spend — as well as
KeeperHub does. We report that rather than hide it.

What it does not do is tell the agent what happened: 0 of 100, the same as
doing nothing, on both versions. And it is not available to AgentKit users today, because
`WalletProvider.sendTransaction(tx)` has no parameter to carry a work identity;
arm B had to reach past AgentKit into the CDP client to exist at all.

So the honest claim is not *"KeeperHub prevents double spends and AgentKit
doesn't."* It is: **the prevention lives in CDP but AgentKit does not expose it,
and reconciliation exists in neither.**

## A failure we did not plan

In the 0.9.1 run, 106 attempts failed with `NetworkError: certificate has
expired` while calling the CDP API (85 more in the 0.10.4 run, plus 14
`Wallet authentication error`): real failures, not our injection. It made the argument for us:
there the transaction was never created, so no hash existed anywhere, while
under injection the transaction existed and the hash leaked into debug text.
Two different situations, and AgentKit reports both with the same sentence.

Arm C's one unresolved trial is worth naming in each run, because the causes
differ and both are ours:

- **0.9.1 run:** the client timed out at 60s, the retry met
  `409 idempotency_in_progress` ("Retry the same key shortly; do not rotate it"),
  and since neither attempt returned an `executionId`, the caller had no handle,
  even though the transfer did land.
- **0.10.4 run:** both transfer calls returned the `executionId` and the transfer
  landed, but the one `get_execution_status` call hung for 925 seconds before
  aborting with `TimeoutError`, and was not retried. The configured timeout is
  60 seconds; why it took 15 minutes to fire is not yet explained.

KeeperHub behaved correctly both times. **Our provider has no retry policy of its
own**, and that is what cost the hundredth trial.

## Architecture

```
  LLM proposes            deterministic code decides         KeeperHub executes
 ──────────────────  →  ──────────────────────────────  →  ────────────────────
  recipient, amount       chain supported?                   simulate
  token, taskId           derive idempotency key             gate on wouldRevert
                          simulate, abort on revert          execute once
  never: calldata,        never reads `simulate` from        verified receipts
  abi, raw hex            model input
```

The model chooses *what* to do. Code decides *what is true*. KeeperHub moves the
value and keeps the receipt.

## Repository

| Path | What it is |
|---|---|
| `packages/agentkit-keeperhub/` | The product. npm package, 22 tests |
| `harness/scripts/campaign.ts` | The three-arm campaign, adapts to the installed AgentKit |
| `harness/scripts/_bootstrap.ts` | Failure injection at the fetch layer |
| `harness/scripts/demo.ts` | `npm run demo`, about 30 seconds, repeatable |
| `harness/scripts/survey-preflight.py` | Counts pre-flight checks across AgentKit |
| `harness/results/agentkit-<version>/receipts.json` | Every transaction hash, per run |
| `harness/results/agentkit-<version>/attempts.json` | Raw per-attempt log, including failures |
| `harness/scripts/verify-receipts.sh` | One command to check every hash |
| `video/` | The demo video (Remotion), built from captured runs |

## A survey, and its honest limit

Of 28 AgentKit actions that broadcast transactions in v0.9.1 (not yet re-run on 0.10.4), **26 run no
pre-flight simulation** and 21 have no pre-flight check of any kind. Re-run it
with `python3 harness/scripts/survey-preflight.py`.

But "no simulation" does not mean "wastes gas". We tested it: CDP estimates gas
before broadcasting and **refuses** transactions that would revert — no hash, no
gas, nonce unchanged. AgentKit is protected here not by its own code but
incidentally by CDP, and only on the CDP wallet path. The count stands; the
consequence does not.

## Versions matter

`@coinbase/agentkit` 0.9.1 and 0.10.4 differ in ways that break code written
against one of them: the erc20 transfer schema (`contractAddress` / `destination`
in raw units vs `tokenAddress` / `destinationAddress` in whole units), a balance
check before sending (absent vs present), and `RPC_URL` (ignored vs read by the
CDP wallet provider). The campaign reads the installed version and adapts.

The `RPC_URL` change bit us: a stale `RPC_URL` from an old proxy setup made
every 0.10.4 transfer fail at `Could not fetch token details` before anything was
sent. If you run the harness, leave `RPC_URL` unset.

## What is not done

- Only `transfer` is wrapped. Contract calls and protocol actions are not.
- No Solana.
- No client-side retry policy, which cost the one unresolved trial in each run.
- Base Sepolia only.
- Failure injection is induced, not sampled from production.
- Not merged into AgentKit yet. The provider is proposed as
  [coinbase/agentkit#1504](https://github.com/coinbase/agentkit/pull/1504), open
  and unreviewed. No new issues filed: everything we found was already tracked
  (`keeperhub#1959`, `#2004`, `#2371`, `coinbase/agentkit#1483`, `#1408`).

## Run it

```bash
cd packages/agentkit-keeperhub && npm install && npm test    # 22 tests
cd ../../harness && npm install && cp .env.example .env      # fill in keys
npm run demo                                                  # ~30s, repeatable
TRIALS=100 npm run campaign                                   # writes results/agentkit-<version>/
npm run verify                                                # check every hash, every run
```

## License

MIT
