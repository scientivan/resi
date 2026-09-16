/**
 * Proxy RPC untuk injeksi kegagalan.
 *
 * AgentKit membangun viem publicClient dari `RPC_URL` (cdpEvmWalletProvider.ts
 * baris 116-120). Jalur KIRIM tidak lewat sini: `cdp.evm.sendTransaction` pergi
 * ke API CDP. Jadi menolak `eth_getTransactionReceipt` di sini membuat
 * transaksinya tetap mendarat sementara pollingnya gagal — persis mode gagal
 * yang kita ukur.
 *
 * Kenapa error JSON-RPC, bukan HTTP 500: `shouldRetry` viem
 * (utils/buildRequest.ts) mengembalikan false untuk kode di luar -1, -32603,
 * dan 429, jadi penolakannya seketika tanpa 3x retry. Cepat untuk ratusan
 * percobaan.
 *
 * Saklar: GET /inject/on, /inject/off, /inject/status
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

// Tanpa dependensi apa pun, supaya proxy bisa dijalankan sebelum `npm install`.
// Pembaca .env minimal: KEY=VALUE per baris, '#' komentar, tanpa kutip.
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
  /* .env belum ada: pakai default di bawah */
}

const PORT = Number(process.env.PROXY_PORT ?? 8545);
const UPSTREAM = process.env.UPSTREAM_RPC ?? "https://sepolia.base.org";
const BLOCKED = new Set(["eth_getTransactionReceipt"]);

let injecting = false;
const stats = { passed: 0, injected: 0 };

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/inject/")) {
    const cmd = req.url.split("/")[2];
    if (cmd === "on") injecting = true;
    if (cmd === "off") injecting = false;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ injecting, ...stats }));
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400).end();
      return;
    }

    const calls = Array.isArray(parsed) ? parsed : [parsed];
    const shouldBlock = injecting && calls.some((c) => BLOCKED.has(c?.method));

    if (shouldBlock) {
      stats.injected++;
      const mk = (c: any) => ({
        jsonrpc: "2.0",
        id: c?.id ?? null,
        // -32000: server error generik. TIDAK masuk daftar retry viem,
        // jadi ditolak seketika.
        error: { code: -32000, message: "injected: receipt endpoint unavailable" },
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(parsed) ? calls.map(mk) : mk(parsed)));
      return;
    }

    stats.passed++;
    try {
      const up = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const text = await up.text();
      res.writeHead(up.status, { "content-type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e) } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`proxy di http://127.0.0.1:${PORT} -> ${UPSTREAM}`);
  console.log(`blokir saat injeksi aktif: ${[...BLOCKED].join(", ")}`);
  console.log(`saklar: curl http://127.0.0.1:${PORT}/inject/on | /off | /status`);
});
