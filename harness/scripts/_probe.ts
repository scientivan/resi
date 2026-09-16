import "./_bootstrap.ts";
import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { formatEther } from "viem";
const w = await CdpEvmWalletProvider.configureWithWallet({
  apiKeyId: process.env.CDP_API_KEY_ID, apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  address: process.env.CDP_ACCOUNT_ADDRESS as `0x${string}`,
  networkId: process.env.NETWORK_ID, rpcUrl: process.env.UPSTREAM_RPC,
});
console.log("address:", w.getAddress());
console.log("ETH    :", formatEther(await w.getBalance()));
