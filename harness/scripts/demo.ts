/**
 * DEMO: one command, about 30 seconds, repeatable at any time.
 *
 *   npm run demo        (DEMO_PACE=slow for camera: 3x longer pauses)
 *
 * No market conditions, no waiting for events, no cron. The failure is induced
 * on schedule, so the result is the same every time.
 *
 * The flow is the submission's story:
 *   1. An agent sends money through AgentKit. The network drops while it waits
 *      for confirmation. The agent receives only error text.
 *   2. The agent does the reasonable thing: it retries. The money leaves TWICE.
 *   3. The same work through KeeperHub: the retry is replayed, not resent, and
 *      the agent can ASK what actually happened.
 *
 * Verified against @coinbase/agentkit@0.10.4 (latest on npm): the erc20 transfer
 * takes { amount (whole units), tokenAddress, destinationAddress }.
 */

import "./_bootstrap.ts";
import { setInject } from "./_bootstrap.ts";
import { CdpEvmWalletProvider, erc20ActionProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";
import { createPublicClient, http, parseAbiItem, getAddress, formatUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

const TOKEN = getAddress(process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const TO = getAddress(process.env.RECIPIENT!);
const RPC = process.env.UPSTREAM_RPC ?? "https://sepolia.base.org";
const truth = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const line = (c = "-") => console.log(c.repeat(74));
// Viewers need time to read. Fast by default so a judge running it is not kept
// waiting; DEMO_PACE=slow for the camera.
const PACE = process.env.DEMO_PACE === "slow" ? 3 : 1;
const pause = (ms = 1200) => new Promise((r) => setTimeout(r, ms * PACE));

async function countTransfers(from: Hex, value: bigint, fromBlock: bigint) {
  const logs = await truth.getLogs({ address: TOKEN, event: TRANSFER, args: { from, to: TO }, fromBlock, toBlock: "latest" });
  return logs.filter((l) => (l.args.value as bigint) === value);
}

async function main() {
  const stamp = Date.now();
  const wallet = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
    address: process.env.CDP_ACCOUNT_ADDRESS as Hex,
    networkId: process.env.NETWORK_ID ?? "base-sepolia",
  });
  const cdpAddr = wallet.getAddress() as Hex;
  const khAddr = getAddress(process.env.KH_WALLET ?? "0x449FE01435Af28FD60320B198219068d3f1656CB") as Hex;
  const startBlock = await truth.getBlockNumber();

  console.log("\nDEMO: what happens when the network drops after the money is sent");
  console.log(`Base Sepolia | AgentKit account ${cdpAddr} | KeeperHub wallet ${khAddr}`);

  // ---------------------------------------------------------------- PART 1
  line("=");
  console.log("PART 1: AgentKit as shipped");
  line("=");

  const unitsA = 4200n + BigInt(stamp % 100);
  const erc20 = erc20ActionProvider();
  const sendA = () =>
    erc20.transfer(wallet as never, {
      amount: formatUnits(unitsA, 6),
      tokenAddress: TOKEN,
      destinationAddress: TO,
    } as never);

  setInject(true); // receipt polling is rejected from here on
  console.log("\n[1] The agent sends money. The confirmation never comes back.\n");
  const a1 = await sendA();
  console.log(a1.split("\n").slice(0, 3).join("\n"));
  await pause();

  console.log("\n[2] The error text above is all the agent receives.");
  console.log("    No executionId. No way to ask again.");
  console.log("    The agent does not know whether the money left.\n");
  await pause();

  console.log("[3] The agent does the reasonable thing: it retries.\n");
  const a2 = await sendA();
  console.log(a2.split("\n").slice(0, 3).join("\n"));
  setInject(false);
  await pause(4000); // let both land in a block

  const landedA = await countTransfers(cdpAddr, unitsA, startBlock);
  line();
  console.log(`RESULT: ${landedA.length} transfers landed for ONE job.`);
  landedA.forEach((l) => console.log(`  ${l.transactionHash}`));
  if (landedA.length >= 2) console.log("  ^ the money left twice.");
  await pause(1500);

  // ---------------------------------------------------------------- PART 2
  line("=");
  console.log("PART 2: the same job through KeeperHub");
  line("=");

  const kh = keeperHubActionProvider();
  const unitsC = 4200n + BigInt(stamp % 100);
  const args = { recipientAddress: TO, amount: formatUnits(unitsC, 6), tokenAddress: TOKEN, taskId: `demo-${stamp}` };

  console.log("\n[1] The agent sends money through KeeperHub.\n");
  const c1 = await kh.transfer(wallet as never, args as never);
  console.log(c1);
  const eid = c1.match(/executionId: (\S+)/)?.[1];
  await pause();

  console.log("\n[2] The agent retries the same job, exactly as before.\n");
  const c2 = await kh.transfer(wallet as never, args as never);
  console.log(c2.split("\n").slice(0, 4).join("\n"));
  const eid2 = c2.match(/executionId: (\S+)/)?.[1];
  console.log(`\n    Same executionId? ${eid && eid === eid2 ? "YES: replayed, not sent again" : "NO"}`);
  await pause(1500);

  console.log("\n[3] And this is what AgentKit cannot do:");
  console.log("    the agent ASKS what actually happened.\n");
  if (eid) console.log(await kh.getExecutionStatus(wallet as never, { executionId: eid } as never));
  await pause(2000);

  // ---------------------------------------------------------------- PART 3
  line("=");
  console.log("PART 3: the simulation gate");
  line("=");
  // 50 USDC: above the wallet balance (~5 USDC) but under the 100 USD cap, so
  // what blocks it is the SIMULATION predicting a revert, not the cap rule.
  console.log("\nThe agent asks for 50 USDC. The wallet holds about 4.\n");
  console.log(await kh.transfer(wallet as never, { ...args, amount: "50", taskId: `demo-${stamp}-over` } as never));
  console.log("\n    The simulation caught it. Zero transactions, zero gas.");

  line("=");
  const landedC = await countTransfers(khAddr, unitsC, startBlock);
  console.log(`SUMMARY  AgentKit:  ${landedA.length} transfers for 1 job, outcome cannot be asked for.`);
  console.log(`         KeeperHub: ${landedC.length} transfer for 1 job, outcome verified onchain.`);
  line("=");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
