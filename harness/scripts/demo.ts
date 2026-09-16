/**
 * DEMO — satu perintah, di bawah 90 detik, bisa diulang kapan saja.
 *
 *   npm run demo
 *
 * Tidak bergantung kondisi pasar, tidak menunggu event, tidak ada cron.
 * Kegagalannya diinduksi sesuai jadwal, jadi hasilnya sama setiap kali.
 *
 * Alurnya persis cerita submission:
 *   1. Agent mengirim uang lewat AgentKit. Jaringan putus saat menunggu
 *      konfirmasi. Agent hanya menerima teks error.
 *   2. Agent melakukan yang wajar: mengulang. Uang keluar DUA KALI.
 *   3. Jalur yang sama lewat KeeperHub: pengulangan diputar ulang, bukan
 *      dikirim lagi, dan agent bisa MENANYAKAN apa yang sebenarnya terjadi.
 */

import "./_bootstrap.ts";
import { setInject } from "./_bootstrap.ts";
import { CdpEvmWalletProvider, erc20ActionProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";
import { createPublicClient, http, parseAbiItem, getAddress, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

const TOKEN = getAddress(process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const TO = getAddress(process.env.RECIPIENT!);
const RPC = process.env.UPSTREAM_RPC ?? "https://sepolia.base.org";
const truth = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const line = (c = "-") => console.log(c.repeat(74));
const pause = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

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

  console.log("\nDEMO — apa yang terjadi saat jaringan putus setelah uang terkirim");
  console.log(`Base Sepolia | akun AgentKit ${cdpAddr} | wallet KeeperHub ${khAddr}`);

  // ---------------------------------------------------------------- BAGIAN 1
  line("=");
  console.log("BAGIAN 1 — AgentKit apa adanya");
  line("=");

  const amtA = 4200n + BigInt(stamp % 100);
  const erc20 = erc20ActionProvider();
  const sendA = () =>
    erc20.transfer(wallet as never, {
      amount: amtA.toString(),
      contractAddress: TOKEN,
      destination: TO,
    } as never);

  setInject(true); // polling receipt ditolak mulai sekarang
  console.log("\n[1] Agent mengirim uang. Konfirmasi tidak pernah kembali.\n");
  const a1 = await sendA();
  console.log(a1.split("\n").slice(0, 3).join("\n"));
  await pause();

  console.log("\n[2] Yang diterima agent hanyalah teks error di atas.");
  console.log("    Tidak ada executionId. Tidak ada cara bertanya lagi.");
  console.log("    Agent tidak tahu uangnya sudah keluar atau belum.\n");
  await pause();

  console.log("[3] Agent melakukan yang wajar: mengulang.\n");
  const a2 = await sendA();
  console.log(a2.split("\n").slice(0, 3).join("\n"));
  setInject(false);
  await pause(4000); // tunggu keduanya masuk blok

  const landedA = await countTransfers(cdpAddr, amtA, startBlock);
  line();
  console.log(`HASIL: ${landedA.length} transfer mendarat untuk SATU pekerjaan.`);
  landedA.forEach((l) => console.log(`  ${l.transactionHash}`));
  if (landedA.length >= 2) console.log("  ^ uang keluar dua kali.");
  await pause(1500);

  // ---------------------------------------------------------------- BAGIAN 2
  line("=");
  console.log("BAGIAN 2 — pekerjaan yang sama lewat KeeperHub");
  line("=");

  const kh = keeperHubActionProvider();
  const amtC = "0.00" + String(4200 + (stamp % 100)).slice(0, 4);
  const args = { recipientAddress: TO, amount: amtC, tokenAddress: TOKEN, taskId: `demo-${stamp}` };

  console.log("\n[1] Agent mengirim uang lewat KeeperHub.\n");
  const c1 = await kh.transfer(wallet as never, args as never);
  console.log(c1);
  const eid = c1.match(/executionId: (\S+)/)?.[1];
  await pause();

  console.log("\n[2] Agent mengulang pekerjaan yang sama, persis seperti tadi.\n");
  const c2 = await kh.transfer(wallet as never, args as never);
  console.log(c2.split("\n").slice(0, 4).join("\n"));
  const eid2 = c2.match(/executionId: (\S+)/)?.[1];
  console.log(`\n    executionId sama? ${eid === eid2 ? "YA — diputar ulang, tidak dikirim lagi" : "TIDAK"}`);
  await pause(1500);

  console.log("\n[3] Dan inilah yang tidak bisa dilakukan AgentKit:");
  console.log("    agent BERTANYA apa yang sebenarnya terjadi.\n");
  if (eid) console.log(await kh.getExecutionStatus(wallet as never, { executionId: eid } as never));
  await pause(2000);

  // ---------------------------------------------------------------- BAGIAN 3
  line("=");
  console.log("BAGIAN 3 — gerbang simulasi");
  line("=");
  console.log("\nAgent meminta nominal yang mustahil. Tidak ada gas yang terpakai.\n");
  console.log(await kh.transfer(wallet as never, { ...args, amount: "999999", taskId: `demo-${stamp}-big` } as never));

  line("=");
  const landedC = await countTransfers(khAddr, BigInt(Math.round(Number(amtC) * 1e6)), startBlock);
  console.log(`RINGKAS  AgentKit: ${landedA.length} transfer untuk 1 pekerjaan, hasil tidak bisa ditanyakan.`);
  console.log(`         KeeperHub: ${landedC.length} transfer untuk 1 pekerjaan, hasil terverifikasi dari chain.`);
  line("=");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
