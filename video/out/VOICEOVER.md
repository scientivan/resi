# Resi · voiceover script

Read each line so it starts at its timestamp. The subtitles in the video show the same words at the same moment, so you can also just read along while the video plays muted.

## 0:00.0 · The question

- `0:01.3` An AI agent sends a payment.
- `0:04.2` The network drops before the answer comes back.
- `0:08.0` Did the money move?
- `0:10.1` Across 100 trials, AgentKit could not tell. Not once.
- `0:14.3` Through Resi, it could. 99 times.

## 0:17.6 · Why now

- `0:17.6` This is not a thought experiment.
- `0:20.6` Agents already pay on their own: 75 million x402 payments in 30 days.
- `0:26.3` 24 million dollars, moved by software.
- `0:29.2` Coinbase AgentKit was downloaded 40,000 times last month.
- `0:33.0` Its own issue tracker already names the failure:
- `0:36.7` a retry after a lost response sends the transfer twice. Still open.

## 0:42.5 · The gap

- `0:42.5` Coinbase AgentKit ships 47 action providers.
- `0:45.5` None of them route through KeeperHub.
- `0:48.5` Resi is that provider. One npm package, two actions.

## 0:52.9 · Three states

- `0:52.9` After a transfer, three things can be true.
- `0:56.7` It succeeded.
- `0:58.1` It failed.
- `0:59.5` Or it went out, and the answer was lost.
- `1:03.6` AgentKit reports that third state as a failure,
- `1:07.3` with no id you can ever ask about again.

## 1:12.0 · Demo: AgentKit as shipped

- `1:12.0` This is a real run. Receipt polling is blocked.
- `1:16.1` The agent gets an error string. Nothing else.
- `1:19.8` So it does the reasonable thing, and retries.
- `1:23.5` On chain: two transfers, for one job.
- `1:26.9` The money left twice.

## 1:29.6 · Demo: through KeeperHub

- `1:29.6` The same job, through Resi.
- `1:32.2` It returns an executionId, and the taskId.
- `1:35.5` The agent retries, exactly as before.
- `1:38.5` Same executionId. Replayed, not sent again.
- `1:41.5` Then it asks what really happened,
- `1:44.5` and gets a receipt re-read from chain.
- `1:47.8` One transfer. Confirmed.

## 1:50.3 · Demo: the simulation gate

- `1:50.3` Last, the agent asks for 50 USDC it doesn't have.
- `1:54.9` KeeperHub simulates first, and predicts the revert.
- `1:58.2` Nothing broadcast. No gas spent.

## 2:01.3 · Who decides what

- `2:01.3` The model proposes: recipient, amount, taskId.
- `2:04.2` Code derives the idempotency key, and runs the simulation.
- `2:08.4` The model cannot switch simulation off.
- `2:11.4` KeeperHub executes once, and keeps the receipt.

## 2:15.2 · The hundred

- `2:15.2` One demo proves little. So we measured it.
- `2:19.0` 100 trials per arm, the same failure, on Base Sepolia.
- `2:23.5` AgentKit as shipped: outcome known, zero times,
- `2:26.9` and it paid twice in 47 of 47.
- `2:30.6` Add a CDP idempotency key, the cheapest fix:
- `2:34.3` double payments stop. Outcome known: still zero.
- `2:37.7` Through Resi: 99 of 100, and no double payments.
- `2:41.8` AgentKit 0.9.1 gave the same answer.

## 2:45.5 · Why knowing matters

- `2:45.5` If the money only leaves once, why know more?
- `2:49.6` Because the same error means two opposite things.
- `2:53.3` In our runs, 99 of 400 AgentKit calls failed before anything was sent.
- `2:59.0` Expired certificates. Wallet auth errors. Real, not ours.
- `3:02.8` Under our injection, the money had already left.
- `3:06.5` Both times, the agent read the same sentence.
- `3:10.2` Guess it went out, and a real failure is never paid.
- `3:15.1` Guess it didn't, and without a key it pays twice.
- `3:19.7` Only an answer from chain ends the guessing.

## 3:24.1 · A real model

- `3:25.4` Last, a real model makes the calls, not a script.
- `3:30.0` It is asked to pay one invoice.
- `3:33.3` The first transfer goes out, but the answer is lost.
- `3:37.9` It retries with the same taskId, and gets the same execution back.
- `3:43.2` Then it asks what happened, and gets a receipt from chain.
- `3:48.1` One invoice, one transfer.

## 3:51.5 · What we want you to know

- `3:51.5` The failure is induced, not sampled from production.
- `3:55.2` The cheap fix does stop double payments. It can't say what happened.
- `4:00.5` And it's 99, not 100: our one status call hung, and we never retried.

## 4:07.1 · Check it yourself

- `4:07.1` Don't trust these numbers. Check them.
- `4:10.1` npm run verify re-reads all 625 hashes from chain.
- `4:14.2` 625 succeeded. None missing.
- `4:16.6` And 22 tests cover the provider.

## 4:20.1 · Resi

- `4:20.1` Resi. A receipt for every payment your agent makes.
- `4:24.2` Transfers only, on Base Sepolia, for now.
- `4:27.6` Install it, run the demo, and check every hash.
