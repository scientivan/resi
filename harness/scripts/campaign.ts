/**
 * KAMPANYE M1 — transfer ganda setelah kegagalan polling receipt.
 *
 *   A  AgentKit apa adanya                     (baseline)
 *   B  AgentKit + Idempotency-Key CDP          (perbaikan termurah)
 *   C  AgentKit + KeeperHub direct execution   (perlakuan)
 *
 * Lengan B ada supaya kita tidak membandingkan KeeperHub dengan ketiadaan.
 * Kalau B menang di semua mode, itu yang kita laporkan.
 *
 * ATRIBUSI: tiap (lengan, percobaan) memakai NOMINAL UNIK, dan tiap lengan
 * mengirim dari alamat berbeda:
 *   A, B -> akun CDP         (CDP_ACCOUNT_ADDRESS)
 *   C    -> wallet KeeperHub (KH_WALLET)
 * Hitungan diambil dari log `Transfer` on-chain, bukan dari hash yang
 * dilaporkan SDK, karena AgentKit justru membuang hash di jalur error.
 *
 * Runs against the INSTALLED @coinbase/agentkit and adapts to its transfer schema:
 *   0.9.x : { amount (raw units), contractAddress, destination }
 *   0.10.x: { amount (whole units), tokenAddress, destinationAddress }
 * Output goes to OUT_DIR (default: results/agentkit-<version>/), so a run on one
 * version never overwrites the published results of another.
 */

import "./_bootstrap.ts";
import { cdpNetworkFor, setInject, injectStats, wrapProvider } from "./_bootstrap.ts";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AK_VERSION: string = JSON.parse(
  readFileSync(new URL("../node_modules/@coinbase/agentkit/package.json", import.meta.url), "utf8"),
).version;
const AK_LEGACY_SCHEMA = AK_VERSION.startsWith("0.9.");
const OUT_DIR = process.env.OUT_DIR ?? join("results", `agentkit-${AK_VERSION}`);
import { createPublicClient, http, parseAbiItem, getAddress, formatUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { CdpEvmWalletProvider, erc20ActionProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";

const CFG = {
  chainId: Number(process.env.CHAIN_ID ?? 84532),
  networkId: process.env.NETWORK_ID ?? "base-sepolia",
  upstreamRpc: process.env.UPSTREAM_RPC ?? "https://sepolia.base.org",
  token: getAddress(process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  decimals: 6,
  recipient: getAddress(process.env.RECIPIENT!),
  cdpAccount: getAddress(process.env.CDP_ACCOUNT_ADDRESS!),
  khWallet: getAddress(process.env.KH_WALLET ?? "0x449FE01435Af28FD60320B198219068d3f1656CB"),
  trials: Number(process.env.TRIALS ?? 20),
  khBase: process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com",
  khKey: process.env.KEEPERHUB_API_KEY ?? "",
};

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const truth = createPublicClient({ chain: baseSepolia, transport: http(CFG.upstreamRpc) });

// 0.001 / 0.002 / 0.003 USDC. Saldo uji kecil, jadi nominalnya dibuat kecil.
const ARM_OFFSET = { A: 1_000n, B: 2_000n, C: 3_000n } as const;
type Arm = keyof typeof ARM_OFFSET;

function senderFor(arm: Arm): Hex {
  return (arm === "C" ? CFG.khWallet : CFG.cdpAccount) as Hex;
}

function amountFor(arm: Arm, trial: number) {
  if (BigInt(trial) >= 1_000n) throw new Error("TRIALS terlalu besar, blok nominal bertabrakan");
  const units = ARM_OFFSET[arm] + BigInt(trial);
  // AgentKit v0.9.1 memakai UNIT MENTAH; API KeeperHub memakai unit utuh.
  return { units, raw: units.toString(), text: formatUnits(units, CFG.decimals) };
}

/**
 * Kunci idempotency deterministik mengikuti skema yang DIDOKUMENTASIKAN
 * KeeperHub: `taskId|chainId|recipientAddress|amount|tokenAddress`, lalu
 * dibentuk jadi UUID v4 karena CDP menuntut format itu.
 */
/**
 * Nonce per-run. Kunci idempotency diturunkan dari identitas PEKERJAAN, dan itu
 * memang tujuannya - tapi artinya dua kampanye yang menjalankan "pekerjaan" yang
 * sama dalam 24 jam akan me-replay eksekusi lama alih-alih mengirim baru.
 *
 * Kami menemukan ini karena kecelakaan: kampanye kedua menghasilkan 0 transfer
 * baru di lengan B dan C, dengan hash yang identik dengan kampanye pertama.
 * Perilaku KeeperHub dan CDP benar; harness-nya yang harus menambahkan nonce.
 */
const RUN_ID = process.env.RUN_ID ?? String(Date.now());

function stableKey(taskId: string, amountText: string): string {
  const canonical = [RUN_ID, taskId, CFG.chainId, CFG.recipient, amountText, CFG.token].join("|");
  const b = Buffer.from(createHash("sha256").update(canonical).digest().subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

type Attempt = {
  arm: string; trial: number; attempt: number; ok: boolean;
  hash: Hex | null; error?: string; ms: number;
  executionId?: string;
  /** Apakah pemanggil bisa memperoleh hasil yang TERVERIFIKASI DARI CHAIN lewat
   *  permukaan API yang didukung, setelah kegagalan? Ini ukuran utama. */
  outcomeKnown?: boolean;
  /** Longgar: apakah hash setidaknya BOCOR di teks error (harus di-parse
   *  sendiri dari gema debug viem)? Untuk A/B ini satu-satunya harapan. */
  hashLeaked?: boolean;
};
const attempts: Attempt[] = [];

async function record(
  arm: string,
  trial: number,
  attempt: number,
  fn: () => Promise<{ ok: boolean; hash: Hex | null; error?: string; executionId?: string; outcomeKnown?: boolean; hashLeaked?: boolean }>,
) {
  const t0 = Date.now();
  let r: { ok: boolean; hash: Hex | null; error?: string; executionId?: string; outcomeKnown?: boolean; hashLeaked?: boolean };
  try {
    r = await fn();
  } catch (e) {
    r = { ok: false, hash: null, error: String(e).slice(0, 300) };
  }
  attempts.push({ arm, trial, attempt, ...r, ms: Date.now() - t0 });
  return r;
}

async function makeWallet() {
  return CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
    // WAJIB dipin: tanpa ini configureWithWallet membuat akun BARU tiap panggil.
    address: CFG.cdpAccount as Hex,
    networkId: CFG.networkId,
  });
}

/** Lengan B: teruskan `idempotencyKey` ke CDP SDK, perbaikan satu-lapis yang
 *  DIMUNGKINKAN SDK tapi tidak dilakukan AgentKit. */
function withCdpIdempotency(base: CdpEvmWalletProvider, key: () => string) {
  const cdp = (base as unknown as { getClient: () => any }).getClient();
  return wrapProvider(base, {
    sendTransaction: async (tx: { to: Hex; value?: bigint; data?: Hex }) => {
      const res = await cdp.evm.sendTransaction({
        address: CFG.cdpAccount,
        transaction: { to: tx.to, value: tx.value ?? 0n, data: tx.data ?? "0x" },
        network: cdpNetworkFor(CFG.networkId),
        idempotencyKey: key(),
      });
      return res.transactionHash as Hex;
    },
  });
}

async function runAgentKitArm(arm: Arm, wallet: CdpEvmWalletProvider, trial: number, amountRaw: string, amountText: string) {
  const erc20 = erc20ActionProvider();
  const input = AK_LEGACY_SCHEMA
    ? { amount: amountRaw, contractAddress: CFG.token, destination: CFG.recipient }
    : { amount: amountText, tokenAddress: CFG.token, destinationAddress: CFG.recipient };
  const call = () => erc20.transfer(wallet as never, input as never);

  const parse = (out: string) => {
    const hash = (out.match(/0x[a-fA-F0-9]{64}/)?.[0] ?? null) as Hex | null;
    const failed = out.startsWith("Error");
    return {
      ok: !failed,
      hash,
      error: failed ? out.slice(0, 300) : undefined,
      // AgentKit tidak punya endpoint status. Setelah gagal, pemanggil tidak
      // bisa menanyakan hasil terverifikasi lewat permukaan yang didukung.
      outcomeKnown: false,
      // Longgar: hash kadang bocor lewat gema request viem di teks error.
      hashLeaked: failed ? hash !== null : undefined,
    };
  };

  const r1 = await record(arm, trial, 1, async () => parse(await call()));
  // Agent mengulang pekerjaan yang sama, persis seperti LLM yang menerima
  // pesan error tanpa hash.
  if (!r1.ok) await record(arm, trial, 2, async () => parse(await call()));
}

async function khPost(path: string, body: unknown, idemKey?: string) {
  const res = await fetch(`${CFG.khBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CFG.khKey}`,
      ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

/** Injeksi fetch tidak menyentuh KeeperHub (eksekusi di sisi server), jadi
 *  kegagalan setaranya disimulasikan di sisi klien: respons pertama dianggap
 *  hilang, lalu pekerjaan yang sama diulang dengan Idempotency-Key yang sama.
 *  Asimetri ini WAJIB ditulis di README. */
async function runKeeperHubArm(
  wallet: CdpEvmWalletProvider,
  trial: number,
  amountText: string,
  taskId: string,
) {
  // Lengan C memakai PAKET YANG KITA KIRIM, bukan fetch mentah, supaya angka
  // kampanye menggambarkan barang yang benar-benar diterbitkan.
  const kh = keeperHubActionProvider();
  const args = {
    recipientAddress: CFG.recipient,
    amount: amountText,
    tokenAddress: CFG.token,
    taskId,
  };

  const parseExec = (out: string) => ({
    ok: !out.startsWith("Error") && !out.startsWith("Aborted"),
    hash: (out.match(/transactionHash: (0x[a-fA-F0-9]{64})/)?.[1] ?? null) as Hex | null,
    executionId: out.match(/executionId: (\S+)/)?.[1],
    error: out.startsWith("Error") || out.startsWith("Aborted") ? out.slice(0, 300) : undefined,
  });

  const r1 = await record("C", trial, 1, async () => parseExec(await kh.transfer(wallet as never, args as never)));
  // Klien "kehilangan" jawaban, lalu mengulang pekerjaan yang sama.
  const r2 = await record("C", trial, 2, async () => parseExec(await kh.transfer(wallet as never, args as never)));

  // Ukuran utama: setelah itu, bisakah pemanggil menanyakan hasilnya?
  const eid = r1.executionId ?? r2.executionId;
  if (eid) {
    await record("C", trial, 3, async () => {
      const st = await kh.getExecutionStatus(wallet as never, { executionId: eid } as never);
      return {
        ok: true,
        hash: (st.match(/hash (0x[a-fA-F0-9]{64})/)?.[1] ?? null) as Hex | null,
        executionId: eid,
        outcomeKnown: st.includes("Verified onchain result"),
      };
    });
  }
}

async function landedBy(from: Hex, fromBlock: bigint) {
  const logs = await truth.getLogs({
    address: CFG.token,
    event: TRANSFER_EVENT,
    args: { from, to: CFG.recipient },
    fromBlock,
    toBlock: "latest",
  });
  const m = new Map<string, Hex[]>();
  for (const l of logs) {
    const v = (l.args.value as bigint).toString();
    m.set(v, [...(m.get(v) ?? []), l.transactionHash]);
  }
  return m;
}

async function main() {
  if (!CFG.khKey) throw new Error("KEEPERHUB_API_KEY kosong");
  const startBlock = await truth.getBlockNumber();
  const wallet = await makeWallet();
  console.log("akun CDP        :", wallet.getAddress());
  console.log("wallet KeeperHub:", CFG.khWallet);
  console.log("blok awal       :", startBlock);
  console.log("percobaan       :", CFG.trials, "per lengan");
  console.log("RUN_ID          :", RUN_ID);
  console.log("agentkit        :", AK_VERSION, "->", OUT_DIR, "\n");
  mkdirSync(OUT_DIR, { recursive: true });

  for (let i = 0; i < CFG.trials; i++) {
    const a = amountFor("A", i);
    const b = amountFor("B", i);
    const c = amountFor("C", i);

    setInject(true);
    await runAgentKitArm("A", wallet, i, a.raw, a.text);
    setInject(false);

    const keyB = stableKey(`m1-${i}`, b.text);
    setInject(true);
    await runAgentKitArm("B", withCdpIdempotency(wallet, () => keyB) as CdpEvmWalletProvider, i, b.raw, b.text);
    setInject(false);

    await runKeeperHubArm(wallet, i, c.text, `${RUN_ID}-m1-${i}`);
    process.stdout.write(".");
  }
  console.log("\n");

  const byCdp = await landedBy(CFG.cdpAccount as Hex, startBlock);
  const byKh = await landedBy(CFG.khWallet as Hex, startBlock);

  const receipts: Array<{ hash: Hex; arm: Arm; trial: number; amount: string }> = [];
  const summary: Record<Arm, { landed: number; clean: number; duplicated: number; none: number; outcomeKnown: number; hashLeaked: number; failedAttempts: number }> = {
    A: { landed: 0, clean: 0, duplicated: 0, none: 0, outcomeKnown: 0, hashLeaked: 0, failedAttempts: 0 },
    B: { landed: 0, clean: 0, duplicated: 0, none: 0, outcomeKnown: 0, hashLeaked: 0, failedAttempts: 0 },
    C: { landed: 0, clean: 0, duplicated: 0, none: 0, outcomeKnown: 0, hashLeaked: 0, failedAttempts: 0 },
  };

  // Ukuran utama dihitung per PERCOBAAN (trial), bukan per attempt.
  for (const arm of ["A", "B", "C"] as Arm[]) {
    for (let i = 0; i < CFG.trials; i++) {
      const mine = attempts.filter((a) => a.arm === arm && a.trial === i);
      if (mine.some((a) => a.outcomeKnown === true)) summary[arm].outcomeKnown++;
      if (mine.some((a) => a.hashLeaked === true)) summary[arm].hashLeaked++;
      summary[arm].failedAttempts += mine.filter((a) => !a.ok).length;
    }
  }

  for (const arm of ["A", "B", "C"] as Arm[]) {
    const src = arm === "C" ? byKh : byCdp;
    for (let i = 0; i < CFG.trials; i++) {
      const { units, text } = amountFor(arm, i);
      const hashes = src.get(units.toString()) ?? [];
      hashes.forEach((h) => receipts.push({ hash: h, arm, trial: i, amount: text }));
      summary[arm].landed += hashes.length;
      if (hashes.length === 0) summary[arm].none++;
      else if (hashes.length === 1) summary[arm].clean++;
      else summary[arm].duplicated++;
    }
  }

  writeFileSync(join(OUT_DIR, "receipts.json"), JSON.stringify(receipts, null, 2));
  writeFileSync(join(OUT_DIR, "attempts.json"), JSON.stringify(attempts, null, 2));
  writeFileSync(
    join(OUT_DIR, "summary.json"),
    JSON.stringify(
      {
        agentkitVersion: AK_VERSION,
        runId: RUN_ID,
        trials: CFG.trials,
        startBlock: startBlock.toString(),
        senders: { A: senderFor("A"), B: senderFor("B"), C: senderFor("C") },
        injectStats,
        summary,
      },
      null,
      2,
    ),
  );

  console.log(`${"lengan".padEnd(8)}${"mendarat".padEnd(10)}${"1x benar".padEnd(11)}${"2x GANDA".padEnd(11)}0x`);
  for (const arm of ["A", "B", "C"] as Arm[]) {
    const s = summary[arm];
    console.log(
      `${arm.padEnd(8)}${String(s.landed).padEnd(10)}${String(s.clean).padEnd(11)}${String(s.duplicated).padEnd(11)}${s.none}`,
    );
  }
  console.log();
  console.log("UKURAN UTAMA - setelah gagal, bisakah pemanggil tahu hasilnya?");
  console.log(`${"lengan".padEnd(8)}${"hasil diketahui".padEnd(18)}${"hash bocor di error".padEnd(22)}attempt gagal`);
  for (const arm of ["A", "B", "C"] as Arm[]) {
    const s2 = summary[arm];
    console.log(
      `${arm.padEnd(8)}${`${s2.outcomeKnown}/${CFG.trials}`.padEnd(18)}${`${s2.hashLeaked}/${CFG.trials}`.padEnd(22)}${s2.failedAttempts}`,
    );
  }
  console.log(`\ninjeksi: ${injectStats.injected} ditolak, ${injectStats.passed} diteruskan`);
  console.log(`percobaan tercatat: ${attempts.length}`);
  console.log(`ditulis: ${OUT_DIR}/{receipts,attempts,summary}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
