import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { keeperHubActionProvider } from "../dist/index.js";

/**
 * Semua tes di sini memalsukan `fetch`, bukan menyuntik klien palsu, supaya
 * kode klien yang sebenarnya ikut teruji: header, bentuk body, dan penguraian
 * respons.
 */

type Reply = { status?: number; body: unknown };
let queue: Reply[] = [];
let sent: Array<{ url: string; method: string; body: any; headers: Record<string, string> }> = [];

const realFetch = globalThis.fetch;

beforeEach(() => {
  queue = [];
  sent = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    sent.push({
      url: String(input),
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const next = queue.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const walletOn = (chainId: string) =>
  ({ getNetwork: () => ({ protocolFamily: "evm", chainId, networkId: "base-sepolia" }) }) as never;

const kh = () => keeperHubActionProvider({ apiKey: "kh_test" });

const args = {
  recipientAddress: "0x33b1499a92793B3e634f2D8B9e83A7185f4eC44D",
  amount: "1.5",
  tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  taskId: "invoice-1",
};

const OK_SIM = { body: { success: true, wouldRevert: false, gasEstimate: "45415" } };

describe("transfer: gerbang sebelum jaringan", () => {
  it("menolak chain yang tidak didukung KeeperHub tanpa memanggil API", async () => {
    // KeeperHub menjawab 503 untuk chain tak didukung, yang menyerupai gangguan
    // sementara dan mengundang percobaan ulang tanpa akhir. Ditolak di sini.
    const out = await kh().transfer(walletOn("100"), args as never);
    expect(out).toMatch(/tidak mendukung chainId 100/);
    expect(sent).toHaveLength(0);
  });
});

describe("transfer: gerbang simulasi", () => {
  it("membatalkan ketika simulasi memprediksi revert, dan tidak mengeksekusi", async () => {
    queue.push({ status: 400, body: { success: false, wouldRevert: true, failureKind: "revert", revertReason: "Error(ERC20: transfer amount exceeds balance)" } });
    const out = await kh().transfer(walletOn("84532"), args as never);
    expect(out).toMatch(/Dibatalkan sebelum disiarkan/);
    expect(out).toMatch(/Simulasi memprediksi revert/);
    expect(out).toMatch(/tidak ada gas yang terpakai/);
    expect(sent).toHaveLength(1); // hanya simulasi, tidak ada eksekusi
  });

  it("membedakan kegagalan validasi dari prediksi revert", async () => {
    // Konsekuensinya berbeda: masukan yang salah tidak boleh diulang apa adanya,
    // sedangkan masalah keadaan chain boleh dicoba lagi nanti.
    queue.push({ status: 400, body: { success: false, wouldRevert: true, failureKind: "validation", revertReason: "bad address checksum" } });
    const out = await kh().transfer(walletOn("84532"), args as never);
    expect(out).toMatch(/Masukan ditolak/);
    expect(out).not.toMatch(/Simulasi memprediksi revert/);
  });

  it("selalu mengirim simulate:true, dan nilainya tidak berasal dari input", async () => {
    // Pertahanan terhadap kelas yang dilacak KeeperHub di #2004: kunci body yang
    // salah eja diterima diam-diam lalu transaksinya disiarkan sungguhan.
    queue.push(OK_SIM, { status: 202, body: { executionId: "e1", status: "completed" } });
    await kh().transfer(walletOn("84532"), args as never);
    expect(sent[0].body.simulate).toBe(true);
    expect(sent[1].body.simulate).toBeUndefined();
  });
});

describe("transfer: eksekusi", () => {
  it("mengirim Idempotency-Key yang diturunkan, bukan diacak", async () => {
    queue.push(OK_SIM, { status: 202, body: { executionId: "e1", status: "completed" } });
    await kh().transfer(walletOn("84532"), args as never);
    const key1 = sent[1].headers["Idempotency-Key"];

    queue.push(OK_SIM, { status: 202, body: { executionId: "e1", status: "completed" } });
    await kh().transfer(walletOn("84532"), args as never);
    const key2 = sent[3].headers["Idempotency-Key"];

    expect(key1).toBeDefined();
    expect(key1).toBe(key2); // pekerjaan sama -> kunci sama -> diputar ulang
  });

  it("mengembalikan executionId dan menyuruh menanyakannya alih-alih mengirim ulang", async () => {
    queue.push(OK_SIM, { status: 202, body: { executionId: "ks9u", status: "completed", transactionHash: "0xabc" } });
    const out = await kh().transfer(walletOn("84532"), args as never);
    expect(out).toMatch(/executionId: ks9u/);
    expect(out).toMatch(/get_execution_status/);
  });

  it("menjelaskan konflik idempotency sebagai kesalahan pemakaian taskId", async () => {
    queue.push(OK_SIM, { status: 409, body: { code: "idempotency_conflict", originalExecutionId: "e0" } });
    const out = await kh().transfer(walletOn("84532"), args as never);
    expect(out).toMatch(/sudah dipakai untuk pekerjaan dengan rincian berbeda/);
  });

  it("tidak pernah meminta atau meneruskan calldata mentah", async () => {
    queue.push(OK_SIM, { status: 202, body: { executionId: "e1" } });
    await kh().transfer(walletOn("84532"), args as never);
    for (const req of sent) {
      expect(req.body).not.toHaveProperty("data");
      expect(req.body).not.toHaveProperty("calldata");
      expect(req.body).not.toHaveProperty("abi");
    }
  });
});

describe("get_execution_status: membedakan TIGA keadaan", () => {
  it("BERHASIL ketika ada receipt terverifikasi dengan status success", async () => {
    queue.push({ body: { executionId: "e1", status: "completed", receipts: [{ hash: "0xabc", chainId: 84532, verified: true, receiptStatus: "success", blockNumber: 123, gasUsed: "67338" }] } });
    const out = await kh().getExecutionStatus(walletOn("84532"), { executionId: "e1" } as never);
    expect(out).toMatch(/transaksi BERHASIL/);
    expect(out).toMatch(/Jangan kirim ulang/);
  });

  it("REVERT ketika receipt terverifikasi tapi statusnya bukan success", async () => {
    queue.push({ body: { executionId: "e1", status: "completed", receipts: [{ hash: "0xabc", chainId: 84532, verified: true, receiptStatus: "reverted" }] } });
    const out = await kh().getExecutionStatus(walletOn("84532"), { executionId: "e1" } as never);
    expect(out).toMatch(/REVERT/);
    expect(out).toMatch(/Dana tidak berpindah/);
  });

  it("BELUM DIKETAHUI ketika belum ada receipt terverifikasi, dan melarang kirim ulang", async () => {
    // Ini inti argumennya: "belum diketahui" bukan "gagal". Menyamakan keduanya
    // adalah cara paling umum sebuah agent membayar dua kali.
    queue.push({ body: { executionId: "e1", status: "pending", receipts: [] } });
    const out = await kh().getExecutionStatus(walletOn("84532"), { executionId: "e1" } as never);
    expect(out).toMatch(/BELUM DIKETAHUI, bukan gagal/);
    expect(out).toMatch(/Jangan kirim ulang/);
  });

  it("mengabaikan receipt yang belum terverifikasi", async () => {
    // `transactionHash` dilaporkan sendiri oleh jalur tulis; hanya receipt yang
    // diambil ulang dari chain yang dianggap bukti.
    queue.push({ body: { executionId: "e1", status: "completed", receipts: [{ hash: "0xabc", chainId: 84532, verified: false, receiptStatus: "success" }] } });
    const out = await kh().getExecutionStatus(walletOn("84532"), { executionId: "e1" } as never);
    expect(out).toMatch(/BELUM DIKETAHUI/);
  });
});

describe("supportsNetwork", () => {
  it("menerima chain EVM yang didukung dan menolak yang tidak", () => {
    const p = kh();
    expect(p.supportsNetwork({ protocolFamily: "evm", chainId: "84532" } as never)).toBe(true);
    expect(p.supportsNetwork({ protocolFamily: "evm", chainId: "100" } as never)).toBe(false);
    expect(p.supportsNetwork({ protocolFamily: "svm", chainId: "101" } as never)).toBe(false);
  });
});
