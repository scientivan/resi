import { z } from "zod";

/**
 * Skema input transfer.
 *
 * Perhatikan apa yang TIDAK ada di sini: `calldata`, `data`, `abi`, dan
 * `simulate`.
 *
 * - Calldata mentah tidak pernah diminta dari model. Model memilih penerima,
 *   nominal, dan token; kode yang menyusun transaksinya. Ini mengikuti pola
 *   yang sama dengan address book, karena model tidak bisa diandalkan untuk
 *   menghasilkan hex yang benar.
 * - `simulate` bukan parameter. Provider ini SELALU menyimulasikan lebih dulu
 *   dan menolak bila `wouldRevert`. Menjadikannya opsi berarti membuka
 *   kemungkinan model mematikannya, dan membuka kelas salah eja yang sudah
 *   dilacak KeeperHub di issue #2004 (kunci yang salah eja diterima diam-diam
 *   lalu transaksinya disiarkan sungguhan).
 */
export const TransferSchema = z
  .object({
    recipientAddress: z
      .string()
      .describe("Alamat penerima. Format 0x…, huruf kecil semua atau checksum EIP-55 yang benar."),
    amount: z
      .string()
      .describe('Nominal dalam unit utuh, bukan wei. Contoh: "1.5" untuk 1,5 USDC.'),
    tokenAddress: z
      .string()
      .optional()
      .describe("Alamat kontrak ERC-20. Kosongkan untuk mengirim token native chain."),
    taskId: z
      .string()
      .describe(
        "Pengenal stabil untuk PEKERJAAN ini, bukan untuk percobaan ini. " +
          "Contoh: nomor invoice, periode payroll, id job. Harus sama saat " +
          "pekerjaan yang sama diulang, dan berbeda untuk pekerjaan berbeda. " +
          "Dari sinilah kunci idempotency diturunkan.",
      ),
  })
  .strict()
  .describe("Kirim token lewat KeeperHub: simulasi dulu, lalu eksekusi idempoten.");

/**
 * Skema untuk menanyakan hasil sebuah eksekusi.
 *
 * Aksi inilah yang tidak punya padanan di AgentKit. Setelah sebuah aksi gagal,
 * AgentKit hanya mengembalikan teks error; tidak ada pengenal yang bisa
 * ditanyakan kembali. `executionId` membuat pertanyaan "apa yang sebenarnya
 * terjadi?" bisa dijawab kapan saja.
 */
export const GetExecutionStatusSchema = z
  .object({
    executionId: z
      .string()
      .describe("executionId yang dikembalikan aksi transfer sebelumnya."),
  })
  .strict()
  .describe("Tanyakan hasil akhir sebuah eksekusi, dengan receipt yang diambil ulang dari chain.");
