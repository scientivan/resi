# Harness

Measures what happens to an AgentKit payment when receipt polling fails, and
records every transaction so anyone can check it.

```bash
cp .env.example .env    # CDP + KeeperHub keys; leave RPC_URL unset
npm install
npm run demo            # ~30s: double payment, then the same job through KeeperHub
npm run campaign        # TRIALS=100; writes results/agentkit-<installed version>/
npm run verify          # re-reads every hash in results/ from a public RPC
npm run survey          # counts pre-flight checks in the installed AgentKit
```

## Contents

| Path | Purpose |
|---|---|
| `scripts/_bootstrap.ts` | Env loading and failure injection at the `fetch` layer |
| `scripts/campaign.ts` | Arms A/B/C x N trials; adapts to the installed AgentKit schema |
| `scripts/demo.ts` | The three-part demo shown in the video |
| `scripts/record-demo.ts` | Runs the demo and saves a timestamped transcript for the video |
| `scripts/verify-receipts.sh` | Checks every hash in a `receipts.json` |
| `scripts/survey-preflight.py` | Survey of pre-flight checks across AgentKit actions |
| `results/agentkit-0.10.4/` | Run on the latest AgentKit (315 transfers) |
| `results/agentkit-0.9.1/` | Earlier run (310 transfers) |
| `finale.html` | Closing frame with the results |

`scripts/rpc-proxy.ts` and `scripts/exp0-revert.ts` are from the first
experiments and are kept for the record; the campaign no longer uses the proxy.
