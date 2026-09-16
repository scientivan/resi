import "./_bootstrap.ts";
import { CdpEvmWalletProvider, erc20ActionProvider } from "@coinbase/agentkit";

const KH_WALLET = "0x449FE01435Af28FD60320B198219068d3f1656CB";
const w = await CdpEvmWalletProvider.configureWithWallet({
  apiKeyId: process.env.CDP_API_KEY_ID, apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  address: process.env.CDP_ACCOUNT_ADDRESS as `0x${string}`,
  networkId: process.env.NETWORK_ID, rpcUrl: process.env.UPSTREAM_RPC, // langsung, bukan proxy
});
const out = await erc20ActionProvider().transfer(w as never, {
  // v0.9.1: field-nya contractAddress/destination, dan amount UNIT MENTAH.
  amount: "5000000", contractAddress: process.env.USDC!, destination: KH_WALLET,
} as never);
console.log(out);
