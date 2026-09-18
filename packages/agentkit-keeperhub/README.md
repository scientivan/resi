# agentkit-keeperhub

KeeperHub action provider for Coinbase AgentKit. Simulate-gated onchain
execution, idempotent retries, and **a chain-verified result the agent can ask
for after a failure**.

The latest Coinbase AgentKit (0.10.4) exports 47 action providers, including
Enso, Morpho and x402. There was none for KeeperHub, although KeeperHub lists
AgentKit as a partner.

## The problem this solves

After a transfer, three things can be true:

1. **Succeeded** — the money moved.
2. **Failed** — it did not.
3. **Unknown** — the transaction was broadcast but the answer was lost.

AgentKit reports state 3 as state 2. `erc20ActionProvider.transfer` catches
errors and returns `Error transferring the asset: ${error}` — **without the
transaction hash**. There is no execution id, so nothing can be asked again.

An agent that hits this has two choices and both are wrong: retry and risk
paying twice, or don't retry and risk never paying at all.

### Measured

100 trials per arm on Base Sepolia with receipt polling deliberately broken,
run twice: on AgentKit 0.10.4 (latest) and 0.9.1.

| Arm | Could the caller determine the outcome? | Double transfers (0.10.4 / 0.9.1) |
|---|---|---|
| AgentKit as shipped | **0 / 100** on both | **47 of 47** / 50 of 50 comparable trials |
| AgentKit + CDP idempotency key | **0 / 100** on both | 0 of 86 / 0 of 81 |
| **This provider** | **99 / 100** on both | **0 of 100** on both |

Double-transfer rates count only trials where both attempts actually reached the
API, so unrelated network failures do not inflate them.

The one unresolved trial in each run is described under *What is not done*. It
is a limitation of this package, not of KeeperHub.

Adding a CDP idempotency key stops the double spend — but the agent still cannot
find out what happened. That is the gap this package closes.

Full method, raw logs and every transaction hash are in the project repository.

## Install

```bash
npm install agentkit-keeperhub
```

Peer dependencies: `@coinbase/agentkit >= 0.9.0` (tested on 0.9.1 and 0.10.4),
`zod ^3`.

With AgentKit 0.10 and later, the CDP wallet provider reads `RPC_URL` from the
environment. A stale value makes every read fail before anything is sent.

## Use

```ts
import { AgentKit, CdpEvmWalletProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";

const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
  address: process.env.CDP_ACCOUNT_ADDRESS, // pin it: omitting this creates a NEW account each call
  networkId: "base-sepolia",
});

const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [
    keeperHubActionProvider({ apiKey: process.env.KEEPERHUB_API_KEY }),
  ],
});
```

### Actions

**`transfer`** — simulate, refuse if it would revert, then execute once with an
idempotency key derived from `taskId`.

```ts
{
  recipientAddress: "0x…",
  amount: "1.5",        // whole units, not wei
  tokenAddress: "0x…",  // omit for the chain's native token
  taskId: "invoice-2026-0042"
}
```

`taskId` names **the work**, not the attempt. Same work retried → same key →
replayed instead of executed twice. Different work → different key.

**`taskId` is the durable handle, not `executionId`.** The execution id arrives
inside the response, and the response is exactly what gets lost. If it does,
call `transfer` again with the same `taskId`: the same key is derived and the
same `executionId` comes back without executing again. Verified by discarding a
response and recovering it.

**This recovery lasts 24 hours.** KeeperHub's idempotency window is 24h; past
it, the same key **executes again**, silently. Work that can outlive a day
should put a time bucket in its `taskId`.

There is also no way to list executions: `GET /api/executions` returns 404
(still, as of 16 Sep 2026 — the same finding the n8n adapter reported last
month). If both the `taskId` and the `executionId` are lost after the window
closes, that execution cannot be found through the API at all.

**`get_execution_status`** — ask what actually happened, by `executionId`.

```
executionId: ks9u9qbhqtrr43gste078
status: completed
Verified onchain result (1 receipt):
  hash 0x9c57ece7… | success | block 46880970 | gasUsed 67338
Conclusion: the transaction SUCCEEDED. Do not resend this work.
```

When no verified receipt exists yet it says so explicitly and tells the agent
**not** to resend — because "pending" is not "failed".

## Design decisions

**`simulate` is not a parameter.** Every write is simulated first and aborted on
`wouldRevert`. The flag is written by this package, once, in code. A model
cannot turn it off, and the misspelling class KeeperHub tracks in
[keeperhub#2004](https://github.com/KeeperHub/keeperhub/issues/2004) (an
unrecognised body key is accepted silently and the transaction broadcasts for
real) cannot happen through this path.

**The model never touches calldata.** The schema accepts a recipient, an amount,
a token and a task id. No `data`, no `abi`, no raw hex. Models are unreliable at
producing and checking hex, so producing it is not their job.

**Unsupported chains are refused locally.** KeeperHub answers `503 Simulation
unavailable` for a chain it does not support, which looks like a transient
outage and invites endless retries. This package checks the chain id first.

**Validation errors are reported differently from revert predictions**, because
the consequences differ: a malformed input must not be retried as-is, while a
chain-state problem may be retried later.

## What is not done

- **Only `transfer`.** `contract-call` and protocol actions are not wrapped.
  KeeperHub's own docs note that `simulate: true` is *accepted and ignored* on
  protocol actions and `/api/execute/node`, so wrapping those safely needs work
  this package has not done.
- **No Solana.** KeeperHub supports it; this provider does not.
- **Failure injection in the published measurement is induced**, not observed in
  the wild: `eth_getTransactionReceipt` is rejected at the fetch layer on demand.
  Naturally occurring failures did appear: `NetworkError: certificate has
  expired` (106 attempts in the 0.9.1 run, 85 in the 0.10.4 run) and `Wallet
  authentication error` (14, 0.10.4 run). They are reported separately.
- **0.1.2 and 0.1.3 did not work through `AgentKit.getActions()`.** A
  type-only import of `EvmWalletProvider` left the decorator metadata empty, so
  AgentKit called the actions without the wallet. Every measurement here called
  the methods directly and was not affected; the first LLM agent run found it.
  Fixed in 0.1.4, with a test that goes through `getActions()`.
- **Retries added in 0.1.3, re-measured on a smaller run.** Both published runs used
  0.1.2, which had no retry policy, and that cost one trial out of 100 in each.
  0.1.3 fixes both causes: a transfer answered with `409` "already being
  processed" is retried with the same key (0.9.1 run), and `get_execution_status`
  retries on timeout, network error, 429 and 5xx behind a deadline that holds
  even if fetch ignores its abort signal (0.10.4 run, where one call hung 925 s
  against a 60 s timeout). Why that call hung is still not explained. Covered by
  unit tests; the 99 / 100 figures above are from 0.1.2 and stand as measured.
- **Tested on Base Sepolia only.** Other supported chains are declared but
  unexercised.

## License

MIT
