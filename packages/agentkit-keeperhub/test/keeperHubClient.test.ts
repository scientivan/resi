import { describe, it, expect } from "vitest";
import { deriveIdempotencyKey } from "../dist/index.js";

const base = {
  taskId: "invoice-2026-0042",
  chainId: 84532,
  recipientAddress: "0x33b1499a92793B3e634f2D8B9e83A7185f4eC44D",
  amount: "1.5",
  tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

describe("deriveIdempotencyKey", () => {
  it("menghasilkan kunci yang sama untuk pekerjaan yang sama", () => {
    // Inilah properti yang mencegah pembayaran ganda: percobaan kedua atas
    // pekerjaan yang sama harus menghasilkan kunci yang sama persis.
    expect(deriveIdempotencyKey(base)).toBe(deriveIdempotencyKey({ ...base }));
  });

  it("menghasilkan kunci berbeda untuk taskId berbeda", () => {
    // Dua pembayaran yang memang berbeda tidak boleh saling menggabung.
    expect(deriveIdempotencyKey(base)).not.toBe(
      deriveIdempotencyKey({ ...base, taskId: "invoice-2026-0043" }),
    );
  });

  it.each([
    ["amount", { amount: "1.6" }],
    ["recipientAddress", { recipientAddress: "0x0000000000000000000000000000000000000001" }],
    ["chainId", { chainId: 8453 }],
    ["tokenAddress", { tokenAddress: "0x0000000000000000000000000000000000000002" }],
  ])("berubah ketika %s berubah", (_field, patch) => {
    // Field yang menentukan efek onchain ikut masuk ke kunci, supaya taskId
    // yang dipakai ulang dengan rincian berbeda terdeteksi sebagai konflik
    // alih-alih diputar ulang diam-diam.
    expect(deriveIdempotencyKey(base)).not.toBe(deriveIdempotencyKey({ ...base, ...patch }));
  });

  it("berbentuk UUID v4 yang sah", () => {
    // Beberapa lapisan di bawah menolak kunci yang bukan UUID v4.
    expect(deriveIdempotencyKey(base)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("memperlakukan tokenAddress yang kosong sebagai nilai tersendiri", () => {
    // Transfer native dan transfer ERC-20 dengan nominal sama adalah pekerjaan
    // yang berbeda.
    const { tokenAddress, ...native } = base;
    expect(deriveIdempotencyKey(native)).not.toBe(deriveIdempotencyKey(base));
  });

  it("stabil lintas proses (nilai tetap, bukan acak)", () => {
    // Kunci harus bisa disusun ulang setelah proses mati dan hidup lagi.
    // Nilai tetap ini mengunci algoritmanya; kalau berubah, retry lama
    // tidak akan lagi cocok dengan eksekusi lama.
    expect(deriveIdempotencyKey(base)).toBe("4b92288e-4690-4ad4-970e-8a8787520266");
  });
});
