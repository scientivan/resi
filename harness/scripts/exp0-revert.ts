/**
 * EKSPERIMEN 0 — menentukan nasib M3.
 *
 * Pertanyaan: kalau AgentKit diminta mengirim transaksi yang PASTI revert,
 * apakah CDP menyiarkannya (gas terbakar) atau menolaknya lebih dulu karena
 * estimasi gas gagal?
 *
 * Latar: openapi CDP menyatakan endpoint send "handles nonce management and gas
 * estimation" dan mengestimasi `gasLimit` dari `to` + `data` bila tidak
 * diberikan. AgentKit tidak pernah mengirim `gasLimit`.
 *
 * Hasil:
 *   - Error tanpa hash          -> M3 MATI. AgentKit terlindungi tak sengaja.
 *   - Ada hash, status 0x0      -> M3 HIDUP. Gas terbakar, jadi tulang punggung.
 *
 * Biaya: satu transaksi Base Sepolia.
 */

import "./_bootstrap.ts";
import { CdpEvmWalletProvider, erc721ActionProvider } from "@coinbase/agentkit";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { writeFileSync } from "node:fs";

// Aksi yang DIJAMIN revert, tanpa perlu kontrak tambahan.
//
// ERC-721 `transferFrom(address,address,uint256)` dan ERC-20
// `transferFrom(address,address,uint256)` punya selector yang SAMA (0x23b872dd).
// Jadi memanggil aksi erc721.transfer terhadap kontrak USDC menghasilkan
// transferFrom ERC-20 dengan "tokenId" sebagai nominal. Dengan nominal jauh di
// atas saldo (dan tanpa allowance), kontrak pasti revert.
//
// erc721ActionProvider.transfer() tidak punya pra-pemeriksaan APA PUN
// (baris 82-104), jadi tidak ada yang menahannya di sisi klien.
const NFT_CONTRACT = process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NFT_TOKEN_ID = "1000000000000"; // 1.000.000 USDC, saldo cuma 20

async function main() {
  // PENTING: jangan lewat proxy di eksperimen ini. Kita ingin jalur normal.
  const wallet = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
    address: process.env.CDP_ACCOUNT_ADDRESS as `0x${string}` | undefined,
    networkId: process.env.NETWORK_ID ?? "base-sepolia",
    rpcUrl: process.env.UPSTREAM_RPC,
  });

  const from = wallet.getAddress();
  console.log("akun CDP:", from);

  const provider = erc721ActionProvider();
  const started = Date.now();

  // transferFrom(from, to, tokenId) untuk NFT yang bukan milik kita -> revert
  const result = await provider.transfer(wallet as never, {
    contractAddress: NFT_CONTRACT,
    fromAddress: from,
    destination: from,
    tokenId: NFT_TOKEN_ID,
  } as never);

  const elapsedMs = Date.now() - started;
  console.log("\n--- keluaran mentah AgentKit ---\n" + result + "\n");

  // AgentKit membuang hash di jalur error, jadi kita cari sendiri.
  const hash = result.match(/0x[a-fA-F0-9]{64}/)?.[0] ?? null;

  let onchain: unknown = null;
  let verdict: string;

  if (!hash) {
    verdict = "M3_MATI: tidak ada hash. CDP kemungkinan menolak sebelum siar.";
  } else {
    const pc = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.UPSTREAM_RPC),
    });
    try {
      const r = await pc.getTransactionReceipt({ hash: hash as `0x${string}` });
      onchain = { status: r.status, gasUsed: r.gasUsed.toString() };
      verdict =
        r.status === "reverted"
          ? `M3_HIDUP: tersiar dan revert. gasUsed=${r.gasUsed}`
          : "TIDAK TERDUGA: transaksi sukses, pilih skenario revert yang lain.";
    } catch {
      verdict = "M3_TIDAK_PASTI: ada hash tapi receipt tidak ditemukan.";
    }
  }

  const out = { at: new Date().toISOString(), from, NFT_CONTRACT, NFT_TOKEN_ID, elapsedMs, hash, onchain, verdict, raw: result };
  writeFileSync("exp0-result.json", JSON.stringify(out, null, 2));
  console.log("VERDICT:", verdict);
  console.log("ditulis ke exp0-result.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
