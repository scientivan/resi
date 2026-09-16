import { createHash } from "node:crypto";
import { KEEPERHUB_BASE_URL } from "./constants.js";

export interface KeeperHubClientConfig {
  apiKey: string;
  baseUrl?: string;
  /** Timeout per permintaan HTTP, milidetik. */
  timeoutMs?: number;
}

export interface SimulationResult {
  success: boolean;
  wouldRevert: boolean;
  failureKind?: string;
  revertReason?: string;
  gasEstimate?: string;
  error?: string;
}

export interface ExecutionResult {
  executionId?: string;
  status?: string;
  transactionHash?: string;
  transactionLink?: string;
  error?: string;
  code?: string;
  httpStatus: number;
}

export interface Receipt {
  hash: string;
  chainId: number;
  gasUsed?: string;
  verified?: boolean;
  verifiedAt?: string;
  blockNumber?: number;
  receiptStatus?: string;
}

export interface StatusResult {
  executionId: string;
  status: string;
  transactionHash?: string;
  transactionLink?: string;
  receipts?: Receipt[];
  error?: string | null;
  httpStatus: number;
}

/**
 * Kunci idempotency deterministik.
 *
 * Skemanya persis yang didokumentasikan KeeperHub di panduan "Choosing a stable
 * key": `taskId|chainId|recipientAddress|amount|tokenAddress`, pemisah U+007C
 * tanpa spasi di sekitarnya.
 *
 * Kenapa diturunkan, bukan diacak: UUID yang dibuat per percobaan tidak
 * bertahan melewati retry, karena percobaan kedua menghasilkan UUID lain
 * sehingga dianggap pekerjaan baru dan dieksekusi lagi. Kunci harus menandai
 * PEKERJAAN, bukan PERCOBAAN.
 *
 * Hasil hash dibentuk menjadi UUID v4 karena beberapa lapisan di bawah
 * mensyaratkan format itu.
 */
export function deriveIdempotencyKey(parts: {
  taskId: string;
  chainId: number;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
}): string {
  const canonical = [
    parts.taskId,
    parts.chainId,
    parts.recipientAddress,
    parts.amount,
    parts.tokenAddress ?? "",
  ].join("|");
  const b = Buffer.from(createHash("sha256").update(canonical).digest().subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class KeeperHubClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;

  constructor(config: KeeperHubClientConfig) {
    if (!config.apiKey) throw new Error("KEEPERHUB_API_KEY tidak diisi");
    this.#apiKey = config.apiKey;
    this.#baseUrl = config.baseUrl ?? KEEPERHUB_BASE_URL;
    this.#timeoutMs = config.timeoutMs ?? 60_000;
  }

  async #request(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
    const { idempotencyKey, ...rest } = init;
    const res = await fetch(`${this.#baseUrl}${path}`, {
      ...rest,
      signal: AbortSignal.timeout(this.#timeoutMs),
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { httpStatus: res.status, json };
  }

  /**
   * Dry run. Kunci `simulate` ditulis di sini, satu kali, oleh kode.
   * Ia tidak pernah berasal dari input model, sehingga kelas salah eja yang
   * dilacak KeeperHub di #2004 tidak bisa terjadi lewat jalur ini.
   */
  async simulateTransfer(body: Record<string, unknown>): Promise<SimulationResult> {
    const { json } = await this.#request("/api/execute/transfer", {
      method: "POST",
      body: JSON.stringify({ ...body, simulate: true }),
    });
    return {
      success: json.success === true,
      wouldRevert: json.wouldRevert === true,
      failureKind: json.failureKind as string | undefined,
      revertReason: json.revertReason as string | undefined,
      gasEstimate: json.gasEstimate as string | undefined,
      error: json.error as string | undefined,
    };
  }

  async executeTransfer(
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ExecutionResult> {
    const { httpStatus, json } = await this.#request("/api/execute/transfer", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    });
    return {
      executionId: json.executionId as string | undefined,
      status: json.status as string | undefined,
      transactionHash: json.transactionHash as string | undefined,
      transactionLink: json.transactionLink as string | undefined,
      error: json.error as string | undefined,
      code: json.code as string | undefined,
      httpStatus,
    };
  }

  /** Hasil akhir sebuah eksekusi, dengan receipt yang diambil ulang dari chain. */
  async getStatus(executionId: string): Promise<StatusResult> {
    const { httpStatus, json } = await this.#request(`/api/execute/${executionId}/status`);
    return {
      executionId: (json.executionId as string) ?? executionId,
      status: (json.status as string) ?? "unknown",
      transactionHash: json.transactionHash as string | undefined,
      transactionLink: json.transactionLink as string | undefined,
      receipts: json.receipts as Receipt[] | undefined,
      error: (json.error as string | null) ?? null,
      httpStatus,
    };
  }
}
