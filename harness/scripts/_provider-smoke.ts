import "./_bootstrap.ts";
import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";

const wallet = await CdpEvmWalletProvider.configureWithWallet({
  apiKeyId: process.env.CDP_API_KEY_ID, apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  address: process.env.CDP_ACCOUNT_ADDRESS as `0x${string}`,
  networkId: process.env.NETWORK_ID,
});
const kh = keeperHubActionProvider();

console.log("=== aksi yang terdaftar ke agent ===");
for (const a of kh.getActions(wallet as never)) console.log("  -", a.name);

const task = `smoke-${Date.now()}`;
const args = {
  recipientAddress: process.env.RECIPIENT!,
  amount: "0.000321",
  tokenAddress: process.env.USDC!,
  taskId: task,
};

console.log("\n=== 1. transfer (percobaan pertama) ===");
const r1 = await kh.transfer(wallet as never, args as never);
console.log(r1);

console.log("\n=== 2. transfer ULANG dengan taskId sama (harus diputar ulang, bukan dikirim lagi) ===");
const r2 = await kh.transfer(wallet as never, args as never);
console.log(r2);

const eid = r1.match(/executionId: (\S+)/)?.[1];
console.log("\n=== 3. get_execution_status ===");
console.log(await kh.getExecutionStatus(wallet as never, { executionId: eid! } as never));

console.log("\n=== 4. gerbang simulasi: nominal di atas saldo ===");
console.log(await kh.transfer(wallet as never, { ...args, amount: "999999", taskId: task + "-big" } as never));

console.log("\n=== 5. chain tak didukung ditolak lokal ===");
const fake = { ...wallet, getNetwork: () => ({ protocolFamily: "evm", chainId: "100", networkId: "gnosis" }) };
console.log(await kh.transfer(fake as never, { ...args, taskId: task + "-gnosis" } as never));
