# agentkit-keeperhub

**In 100 trials with receipt polling deliberately broken, a Coinbase AgentKit
agent could determine the outcome of its own payment in 0 of them. Through this
KeeperHub provider, 99 of 100, with receipts re-fetched from chain. AgentKit
double-paid in 50 of 50 comparable trials; this provider in 0 of 100.**

310 transfers on Base Sepolia. Every hash is in
[`harness/receipts.json`](harness/receipts.json). Verify any of them yourself:

```bash
curl -s https://sepolia.base.org -H 'content-type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt",
      "params":["0x9c57ece7f3927ceb8da20c2f09adfd638e0c99b37cf9db7611c0444f4320715d"]}'
# status 0x1, block 46880970, gasUsed 0x10726 (67338)
```

Or check all of them at once: `cd harness && npm run verify`.

---

## The gap

Coinbase AgentKit ships 42 action providers — Enso, Morpho, x402, ERC-8004 —
and none for KeeperHub, although KeeperHub names AgentKit as a partner and
publishes an ERC-8004 agent registration. Verified 16 Sep 2026: zero GitHub
repositories, zero npm packages, zero mentions in either issue tracker.

Adapters exist for LangChain, ElizaOS, OpenClaw and n8n. AgentKit — the largest,
at 40,037 npm downloads a month — has none.

## The problem

After a transfer, three things can be true:

1. **Succeeded** — the money moved.
2. **Failed** — it did not.
3. **Unknown** — it was broadcast, but the answer was lost.

**AgentKit reports state 3 as state 2.** In `erc20ActionProvider.transfer`
(v0.9.1), every error path returns `Error transferring the asset: ${error}` —
without the transaction hash. There is no execution id, so nothing can be asked
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

100 trials per arm, Base Sepolia, from block 46881051. 582 RPC calls rejected,
2,193 passed through. 20.8 minutes of attempt time.

**Primary measure — after the failure, can the caller determine the outcome?**

| Arm | Outcome determinable | Hash merely leaked into error text |
|---|---|---|
| A | **0 / 100** | 79 / 100 |
| B | **0 / 100** | 81 / 100 |
| C | **99 / 100** | not needed |

"Determinable" means a chain-verified receipt obtained through a supported API
surface: `executionId` → `GET /api/execute/{id}/status` → `receipts[].verified`.

For A and B the hash sometimes appears inside viem's echoed request body — a
debugging artifact, not a return value. On network-layer failures it does not
appear at all.

**Secondary measure — double transfers**, counted only where both attempts
actually reached the API, so unrelated failures cannot inflate it:

| Arm | Both attempts sent | Duplicated | Rate |
|---|---|---|---|
| A | 50 | **50** | **100.0%** |
| B | 81 | 0 | 0.0% |
| C | 100 | 0 | 0.0% |

### A prediction, written before the run

> The duplicate rate will equal the induced failure rate.

Injection was on for 100% of arm A trials. Result: 50 of 50. It held in an
earlier 100-trial run too, at 49 of 49.

### What arm B proves, and what it doesn't

Passing a CDP idempotency key **does** stop the double spend — as well as
KeeperHub does. We report that rather than hide it.

What it does not do is tell the agent what happened: 0 of 100, the same as
doing nothing. And it is not available to AgentKit users today, because
`WalletProvider.sendTransaction(tx)` has no parameter to carry a work identity;
arm B had to reach past AgentKit into the CDP client to exist at all.

So the honest claim is not *"KeeperHub prevents double spends and AgentKit
doesn't."* It is: **the prevention lives in CDP but AgentKit does not expose it,
and reconciliation exists in neither.**

## A failure we did not plan

106 attempts failed with `NetworkError: certificate has expired` while calling
the CDP API — a real outage, not our injection. It made the argument for us:
there the transaction was never created, so no hash existed anywhere, while
under injection the transaction existed and the hash leaked into debug text.
Two different situations, and AgentKit reports both with the same sentence.

Arm C's one unresolved trial is also worth naming: the client timed out at 60s,
the retry met `409 idempotency_in_progress` ("Retry the same key shortly; do not
rotate it"), and since neither attempt returned an `executionId`, the caller had
no handle — even though the transfer did land. KeeperHub behaved correctly;
**our provider did not**, and the fix is described in its README.

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
| `harness/scripts/campaign.ts` | The three-arm campaign |
| `harness/scripts/_bootstrap.ts` | Failure injection at the fetch layer |
| `harness/scripts/demo.ts` | `npm run demo` — 90 seconds, repeatable |
| `harness/scripts/survey-preflight.py` | Counts pre-flight checks across AgentKit |
| `harness/receipts.json` | Every transaction hash |
| `harness/attempts.json` | Raw per-attempt log, including failures |
| `harness/scripts/verify-receipts.sh` | One command to check every hash |

## A survey, and its honest limit

Of 28 AgentKit actions that broadcast transactions in v0.9.1, **26 run no
pre-flight simulation** and 21 have no pre-flight check of any kind. Re-run it
with `python3 harness/scripts/survey-preflight.py`.

But "no simulation" does not mean "wastes gas". We tested it: CDP estimates gas
before broadcasting and **refuses** transactions that would revert — no hash, no
gas, nonce unchanged. AgentKit is protected here not by its own code but
incidentally by CDP, and only on the CDP wallet path. The count stands; the
consequence does not.

## Versions matter

The published `@coinbase/agentkit@0.9.1` differs from GitHub `main` in ways that
break code written against the docs: schema field names (`contractAddress` /
`destination` vs `tokenAddress` / `destinationAddress`), units (raw vs whole),
`rpcUrl` support (absent vs present), balance checks (absent vs present), and
`getCdpSdkNetwork()` (absent vs present). Everything here is verified against
the installed package.

## What is not done

- Only `transfer` is wrapped. Contract calls and protocol actions are not.
- No Solana.
- No client-side retry policy — which cost us the one unresolved trial.
- Base Sepolia only.
- Failure injection is induced, not sampled from production.
- No upstream contribution. We probed for issues and found that everything we
  found was already tracked — `keeperhub#1959`, `#2004`, `#2371`,
  `coinbase/agentkit#1483`, `#1408`. Reporting duplicates would have wasted
  maintainer time, so we filed nothing.

## Run it

```bash
cd packages/agentkit-keeperhub && npm install && npm test    # 22 tests
cd ../../harness && npm install && cp .env.example .env      # fill in keys
npm run demo                                                  # 90s, repeatable
TRIALS=100 npm run campaign                                   # the full run
npm run verify                                                # check every hash
```

## License

MIT
