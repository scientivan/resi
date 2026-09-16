import "./_bootstrap.ts";
import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, formatEther, formatUnits, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";

const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET!,
});
const pc = createPublicClient({ chain: baseSepolia, transport: http(process.env.UPSTREAM_RPC) });
const USDC = (process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`;

const res: any = await cdp.evm.listAccounts({});
const accts = res.accounts ?? res.data ?? res;
console.log("jumlah akun CDP:", Array.isArray(accts) ? accts.length : "?");
for (const a of accts) {
  const addr = (a.address ?? a) as `0x${string}`;
  const eth = await pc.getBalance({ address: addr });
  let usdc = 0n;
  try { usdc = await pc.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr] }); } catch {}
  console.log(`  ${addr}  name=${a.name ?? "-"}  ETH=${formatEther(eth)}  USDC=${formatUnits(usdc, 6)}`);
}
