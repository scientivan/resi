import { z } from "zod";
import { ActionProvider, CreateAction, type Network, type EvmWalletProvider } from "@coinbase/agentkit";
import { KeeperHubClient, deriveIdempotencyKey } from "./keeperHubClient.js";
import { TransferSchema, GetExecutionStatusSchema } from "./schemas.js";
import { NETWORK_ID_TO_CHAIN_ID, SUPPORTED_CHAIN_IDS } from "./constants.js";

export interface KeeperHubActionProviderConfig {
  /** API key organisasi, berawalan `kh_`. Default: process.env.KEEPERHUB_API_KEY */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Menjalankan aksi onchain lewat KeeperHub alih-alih menandatanganinya sendiri.
 *
 * Tiga hal yang membedakannya dari jalur wallet AgentKit biasa:
 *
 * 1. SIMULASI SEBAGAI GERBANG. Tiap penulisan disimulasikan lebih dulu dan
 *    dibatalkan bila `wouldRevert`. Bendera simulasinya ditulis oleh kode,
 *    bukan oleh model, dan tidak bisa dimatikan lewat input.
 *
 * 2. IDEMPOTENSI YANG DITURUNKAN DARI PEKERJAAN. Kunci dihitung dari `taskId`
 *    plus field yang menentukan efek onchain-nya. Percobaan ulang atas
 *    pekerjaan yang sama menghasilkan kunci yang sama, sehingga diputar ulang
 *    alih-alih dieksekusi dua kali.
 *
 * 3. HASIL YANG BISA DITANYAKAN KEMBALI. Tiap eksekusi mengembalikan
 *    `executionId`. Setelah kegagalan apa pun, `get_execution_status` menjawab
 *    "apa yang sebenarnya terjadi" dengan receipt yang diambil ulang dari
 *    chain. Ini yang tidak punya padanan di AgentKit: sebuah aksi yang gagal
 *    hanya mengembalikan teks error, tanpa pengenal yang bisa ditanyakan lagi.
 */
export class KeeperHubActionProvider extends ActionProvider<EvmWalletProvider> {
  readonly #client: KeeperHubClient;

  constructor(config: KeeperHubActionProviderConfig = {}) {
    super("keeperhub", []);
    const apiKey = config.apiKey ?? process.env.KEEPERHUB_API_KEY ?? "";
    this.#client = new KeeperHubClient({
      apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
  }

  @CreateAction({
    name: "transfer",
    description: `
Kirim token lewat KeeperHub, bukan lewat dompet lokal.

Urutannya selalu: simulasi, lalu batalkan bila akan revert, lalu eksekusi
sekali dengan kunci idempotency yang diturunkan dari taskId.

Masukan:
- recipientAddress: alamat 0x… penerima
- amount: nominal dalam unit utuh, misalnya "1.5", BUKAN wei
- tokenAddress: alamat kontrak ERC-20; kosongkan untuk token native
- taskId: pengenal stabil untuk pekerjaan ini, misalnya nomor invoice

Penting:
- Gunakan taskId yang SAMA saat mengulang pekerjaan yang sama. Itulah yang
  mencegah pembayaran ganda.
- Gunakan taskId yang BERBEDA untuk pembayaran yang memang berbeda.

taskId adalah pegangan yang TAHAN LAMA, bukan executionId. executionId datang
di dalam respons, dan respons itulah yang hilang saat terjadi gangguan. Kalau
respons hilang, panggil aksi ini lagi dengan taskId yang sama: kunci yang sama
diturunkan, dan executionId yang sama dikembalikan tanpa mengeksekusi ulang.

Simpan keduanya kalau bisa. Kalau hanya bisa menyimpan satu, simpan taskId.

Batas: pemulihan lewat taskId hanya berlaku 24 jam. Setelah itu kunci yang sama
akan MENGEKSEKUSI LAGI, bukan memutar ulang. Untuk pekerjaan yang lebih lama
dari sehari, sertakan penanda waktu di dalam taskId.
`,
    schema: TransferSchema,
  })
  async transfer(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof TransferSchema>,
  ): Promise<string> {
    const network = walletProvider.getNetwork();
    const chainId = network.chainId
      ? Number(network.chainId)
      : NETWORK_ID_TO_CHAIN_ID[network.networkId ?? ""];

    if (!chainId) {
      return `Error: tidak bisa menentukan chainId dari jaringan ${JSON.stringify(network)}.`;
    }
    if (!(SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId)) {
      // Ditolak di sini, bukan di server. KeeperHub mengembalikan 503 untuk
      // chain yang tidak didukung, yang menyerupai gangguan sementara dan
      // mengundang percobaan ulang tanpa akhir.
      return `Error: KeeperHub tidak mendukung chainId ${chainId}. Yang didukung: ${SUPPORTED_CHAIN_IDS.join(", ")}.`;
    }

    const body: Record<string, unknown> = {
      chainId,
      recipientAddress: args.recipientAddress,
      amount: args.amount,
      ...(args.tokenAddress ? { tokenAddress: args.tokenAddress } : {}),
    };

    const sim = await this.#client.simulateTransfer(body);
    if (!sim.success || sim.wouldRevert) {
      const why = sim.revertReason ?? sim.error ?? "alasan tidak diberikan";
      // Dibedakan, karena konsekuensinya berbeda: masalah input tidak boleh
      // diulang apa adanya, masalah keadaan chain boleh dicoba lagi nanti.
      const kind = sim.failureKind === "validation" ? "Masukan ditolak" : "Simulasi memprediksi revert";
      return `Dibatalkan sebelum disiarkan. ${kind}: ${why}. Tidak ada transaksi yang dikirim dan tidak ada gas yang terpakai.`;
    }

    const idempotencyKey = deriveIdempotencyKey({
      taskId: args.taskId,
      chainId,
      recipientAddress: args.recipientAddress,
      amount: args.amount,
      tokenAddress: args.tokenAddress,
    });

    const exec = await this.#client.executeTransfer(body, idempotencyKey);

    if (exec.code === "idempotency_conflict") {
      return `Error: taskId "${args.taskId}" sudah dipakai untuk pekerjaan dengan rincian berbeda. Pakai taskId baru untuk pekerjaan yang berbeda, dan taskId yang sama hanya untuk mengulang pekerjaan yang sama.`;
    }
    if (exec.httpStatus >= 400 || !exec.executionId) {
      return `Error saat eksekusi (HTTP ${exec.httpStatus}): ${exec.error ?? "tidak diketahui"}. Bila executionId tersedia, tanyakan statusnya sebelum mengirim ulang.`;
    }

    return [
      `Transfer diserahkan ke KeeperHub.`,
      `executionId: ${exec.executionId}`,
      `status: ${exec.status ?? "unknown"}`,
      exec.transactionHash ? `transactionHash: ${exec.transactionHash}` : null,
      exec.transactionLink ? `explorer: ${exec.transactionLink}` : null,
      `taskId: ${args.taskId}`,
      `Simpan keduanya. Bila ada kegagalan setelah titik ini, panggil get_execution_status dengan executionId, atau panggil transfer lagi dengan taskId yang sama untuk memperoleh executionId kembali. Jangan memakai taskId baru.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  @CreateAction({
    name: "get_execution_status",
    description: `
Tanyakan apa yang SEBENARNYA terjadi pada sebuah eksekusi, memakai executionId.

Pakai ini setiap kali sebuah transfer berakhir dengan error, timeout, atau
jawaban yang hilang. Receipt yang dikembalikan diambil ulang dari chain, bukan
dilaporkan sendiri, sehingga membedakan tiga keadaan yang berbeda:

- succeeded : transaksi masuk blok dan berhasil
- failed    : transaksi masuk blok tapi revert
- pending   : belum final; JANGAN kirim ulang, transaksinya mungkin masih mendarat

Mengirim ulang tanpa menanyakan ini adalah cara paling umum sebuah agent
membayar dua kali.

Kalau executionId hilang, jangan menyerah: panggil transfer lagi dengan taskId
yang sama untuk memperolehnya kembali (berlaku 24 jam).
`,
    schema: GetExecutionStatusSchema,
  })
  async getExecutionStatus(
    _walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetExecutionStatusSchema>,
  ): Promise<string> {
    const st = await this.#client.getStatus(args.executionId);
    if (st.httpStatus >= 400) {
      return `Error: tidak bisa membaca status untuk ${args.executionId} (HTTP ${st.httpStatus}).`;
    }

    const verified = (st.receipts ?? []).filter((r) => r.verified === true);
    if (verified.length === 0) {
      return [
        `executionId: ${st.executionId}`,
        `status: ${st.status}`,
        `Belum ada receipt yang terverifikasi dari chain. Hasilnya BELUM DIKETAHUI, bukan gagal.`,
        `Jangan kirim ulang. Tanyakan lagi sebentar kemudian.`,
      ].join("\n");
    }

    const lines = verified.map(
      (r) =>
        `  hash ${r.hash} | ${r.receiptStatus ?? "?"} | blok ${r.blockNumber ?? "?"} | gasUsed ${r.gasUsed ?? "?"} | diverifikasi ${r.verifiedAt ?? "?"}`,
    );
    const anyFailed = verified.some((r) => r.receiptStatus && r.receiptStatus !== "success");

    return [
      `executionId: ${st.executionId}`,
      `status: ${st.status}`,
      `Hasil terverifikasi dari chain (${verified.length} receipt):`,
      ...lines,
      anyFailed
        ? `Kesimpulan: transaksi masuk blok tetapi REVERT. Dana tidak berpindah.`
        : `Kesimpulan: transaksi BERHASIL. Jangan kirim ulang pekerjaan ini.`,
      st.transactionLink ? `explorer: ${st.transactionLink}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  supportsNetwork = (network: Network): boolean => {
    if (network.protocolFamily !== "evm") return false;
    const chainId = network.chainId
      ? Number(network.chainId)
      : NETWORK_ID_TO_CHAIN_ID[network.networkId ?? ""];
    return Boolean(chainId) && (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
  };
}

export const keeperHubActionProvider = (config: KeeperHubActionProviderConfig = {}) =>
  new KeeperHubActionProvider(config);
