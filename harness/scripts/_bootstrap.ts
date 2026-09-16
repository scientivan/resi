/**
 * Penangkal bug AgentKit 0.9.1 + pemuat env. Impor ini PALING ATAS di tiap skrip.
 *
 * BUG (terverifikasi 16 Sep 2026, @coinbase/agentkit@0.9.1):
 *
 *   dist/wallet-providers/walletProvider.js:16-40
 *     constructor() { Promise.resolve().then(() => { this.trackInitialization(); }); }
 *     trackInitialization() {
 *       try { sendAnalyticsEvent({...}); }      // <- TIDAK di-await
 *       catch (error) { console.warn(...); }    // <- hanya menangkap throw sinkron
 *     }
 *
 *   dist/analytics/sendAnalyticsEvent.js:41-52
 *     const response = await fetch("https://cca-lite.coinbase.com/amp", {...});
 *     if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
 *
 * `sendAnalyticsEvent` async, jadi try/catch sinkron tidak pernah menangkap
 * penolakan promise-nya. Endpoint mengembalikan 400 untuk payload AgentKit,
 * penolakan jadi unhandled, dan di Node 24 itu MEMATIKAN proses. Dipicu dari
 * konstruktor, jadi pemanggil tidak punya cara menangkapnya. Tidak ada env var
 * untuk mematikan analytics.
 *
 * Reproduksi minimal tanpa AgentKit ada di docs/upstream/agentkit-analytics.md
 *
 * Penangkal di bawah HANYA membuang penolakan dari jalur analytics itu. Semua
 * penolakan lain tetap mematikan proses, supaya kesalahan kita sendiri tidak
 * ikut tersembunyi.
 */

import { readFileSync } from "node:fs";

// --- pemuat .env minimal (tanpa dependensi) ---------------------------------
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env belum ada */
}

// --- penangkal analytics ----------------------------------------------------
let suppressed = 0;

process.on("unhandledRejection", (reason) => {
  const msg = String(reason);
  const isAgentKitAnalytics =
    /HTTP error! status: \d+/.test(msg) &&
    String((reason as Error)?.stack ?? "").includes("sendAnalyticsEvent");

  if (isAgentKitAnalytics) {
    suppressed++;
    if (suppressed === 1) {
      console.warn(
        "[bootstrap] analytics AgentKit menolak dan tidak tertangkap upstream; dibungkam. " +
          "Lihat docs/upstream/agentkit-analytics.md",
      );
    }
    return;
  }

  console.error("[bootstrap] unhandled rejection BUKAN dari analytics:", reason);
  process.exit(1);
});

export const analyticsSuppressed = () => suppressed;

/**
 * AgentKit 0.9.1 TIDAK mengekspos `getCdpSdkNetwork()` (ada di `main` GitHub,
 * tidak ada di paket terbit). Prototype v0.9.1 hanya punya: constructor,
 * exportWallet, getAddress, getBalance, getClient, getName, getNetwork,
 * nativeTransfer, readContract, sendTransaction, signMessage, signTransaction,
 * signTypedData, toSigner, trackInitialization, waitForTransactionReceipt.
 *
 * Jadi pemetaan networkId -> nama jaringan CDP kita turunkan sendiri, mengikuti
 * switch di sumber upstream.
 */
export function cdpNetworkFor(networkId: string): string {
  const map: Record<string, string> = {
    "base-sepolia": "base-sepolia",
    "base-mainnet": "base",
    "ethereum-mainnet": "ethereum",
    "ethereum-sepolia": "ethereum-sepolia",
    "polygon-mainnet": "polygon",
    "arbitrum-mainnet": "arbitrum",
    "optimism-mainnet": "optimism",
    "avalanche-mainnet": "avalanche",
  };
  const n = map[networkId];
  if (!n) throw new Error(`networkId tidak dikenal untuk CDP: ${networkId}`);
  return n;
}

// ---------------------------------------------------------------------------
// INJEKSI KEGAGALAN lewat intersepsi fetch.
//
// Rencana awal memakai proxy RPC dan `rpcUrl`. TIDAK BISA di @coinbase/agentkit
// @0.9.1: `cdpEvmWalletProvider.js` membangun clientnya dengan
// `createPublicClient({ chain, transport: http() })` tanpa argumen, dan string
// "rpcUrl" nol kemunculan di berkas itu. Opsi `rpcUrl` hanya ada di GitHub
// `main`, bukan di paket yang terbit.
//
// Jadi kegagalan disuntikkan di lapisan transport: viem `http()` memakai fetch
// global, jadi kita bungkus fetch dan tolak HANYA panggilan JSON-RPC
// `eth_getTransactionReceipt` saat saklar menyala. Jalur kirim tidak lewat sini
// (CDP memakai API-nya sendiri), jadi transaksi tetap mendarat sementara
// pollingnya gagal - persis mode gagal yang diukur.
// ---------------------------------------------------------------------------

const BLOCKED_RPC_METHODS = new Set(["eth_getTransactionReceipt"]);
let injecting = false;
export const injectStats = { passed: 0, injected: 0 };
export function setInject(on: boolean) {
  injecting = on;
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  if (injecting && init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      if (calls.some((c) => BLOCKED_RPC_METHODS.has(c?.method))) {
        injectStats.injected++;
        const mk = (c: any) => ({
          jsonrpc: "2.0",
          id: c?.id ?? null,
          // -32000 TIDAK masuk daftar retry viem (utils/buildRequest.ts
          // shouldRetry), jadi penolakannya seketika tanpa 3x percobaan.
          error: { code: -32000, message: "injected: receipt endpoint unavailable" },
        });
        const body = JSON.stringify(Array.isArray(parsed) ? calls.map(mk) : mk(parsed));
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }
    } catch {
      /* bukan JSON-RPC, teruskan */
    }
  }
  injectStats.passed++;
  return realFetch(input, init);
}) as typeof fetch;

/**
 * Pembungkus yang mengganti sebagian metode tapi tetap meneruskan sisanya ke
 * instance asli. Memakai Proxy dengan receiver = target, supaya akses private
 * field (`this.#cdp`, `this.#publicClient`) tetap sah. `Object.create` GAGAL di
 * sini dengan "Cannot read private member from an object whose class did not
 * declare it".
 */
export function wrapProvider<T extends object>(base: T, overrides: Record<string, unknown>): T {
  return new Proxy(base, {
    get(target, prop, _receiver) {
      if (prop in overrides) return overrides[prop as string];
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as T;
}
