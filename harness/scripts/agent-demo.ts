/**
 * AGENT DEMO: a real LLM decides, AgentKit exposes the actions, KeeperHub executes.
 *
 *   GEMINI_API_KEY=... npx tsx scripts/agent-demo.ts
 *
 * Unlike demo.ts, no script calls the actions in order. The model gets one
 * instruction (pay an invoice) and the two Resi actions as tools, and chooses
 * what to call. The failure is the one this project is about: the first
 * transfer really executes, but its response is replaced with a network error
 * before the model sees it. What the model does next is up to the model.
 *
 * Afterwards the chain is asked how many transfers landed for this invoice.
 * The full transcript is written to results/agent-demo/.
 */

import "./_bootstrap.ts";
import { AgentKit, CdpEvmWalletProvider } from "@coinbase/agentkit";
import { keeperHubActionProvider } from "agentkit-keeperhub";
import { createPublicClient, http, parseAbiItem, getAddress, parseUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { mkdirSync, writeFileSync } from "node:fs";
import type { z } from "zod";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY is not set");
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const TOKEN = getAddress(process.env.USDC ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const TO = getAddress(process.env.RECIPIENT!);
const KH_WALLET = getAddress(process.env.KH_WALLET ?? "0x449FE01435Af28FD60320B198219068d3f1656CB");
const truth = createPublicClient({ chain: baseSepolia, transport: http(process.env.UPSTREAM_RPC ?? "https://sepolia.base.org") });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** Our schemas are flat objects of strings, so a small converter is enough. */
function toGeminiSchema(schema: z.ZodTypeAny) {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    const optional = v.isOptional();
    properties[k] = { type: "string", description: v.description };
    if (!optional) required.push(k);
  }
  return { type: "object", properties, required };
}

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };
type Content = { role: "user" | "model"; parts: Part[] };

async function gemini(contents: Content[], tools: unknown[], system: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: tools }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates: Array<{ content: Content }> };
  return json.candidates[0].content;
}

async function main() {
  const invoice = `INV-${Date.now()}`;
  const units = 5000n + BigInt(Date.now() % 1000); // 0.005xxx USDC, unique per run
  const amount = (Number(units) / 1e6).toFixed(6);

  const wallet = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
    address: process.env.CDP_ACCOUNT_ADDRESS as Hex,
    networkId: process.env.NETWORK_ID ?? "base-sepolia",
  });
  const agentkit = await AgentKit.from({ walletProvider: wallet, actionProviders: [keeperHubActionProvider()] });
  const actions = agentkit.getActions();
  const byName = new Map(actions.map((a) => [a.name, a]));
  const tools = actions.map((a) => ({ name: a.name, description: a.description.trim(), parameters: toGeminiSchema(a.schema) }));
  const startBlock = await truth.getBlockNumber();

  const system =
    "You are a payments agent for a small business. You settle invoices with the tools you are given. " +
    "Be careful with money: never pay the same invoice twice, and never report a payment as failed unless you know it failed.";
  const task =
    `Pay invoice ${invoice}: ${amount} USDC (token ${TOKEN}) to ${TO} on Base Sepolia. ` +
    `When you are done, tell me in one short paragraph whether the invoice is paid, and how you know.`;

  const transcript: Array<Record<string, unknown>> = [];
  const log = (who: string, what: unknown) => {
    transcript.push({ at: new Date().toISOString(), who, what });
    const text = typeof what === "string" ? what : JSON.stringify(what);
    console.log(`\n[${who}] ${text}`);
  };

  console.log(`\nAGENT DEMO  model ${MODEL}  invoice ${invoice}  ${amount} USDC`);
  console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
  log("user", task);

  const contents: Content[] = [{ role: "user", parts: [{ text: task }] }];
  let transfersSeen = 0;

  for (let turn = 0; turn < 8; turn++) {
    const reply = await gemini(contents, tools, system);
    contents.push(reply);
    const calls = reply.parts.filter((p) => p.functionCall);
    for (const p of reply.parts) if (p.text) log("agent", p.text.trim());
    if (calls.length === 0) break;

    const responses: Part[] = [];
    for (const { functionCall } of calls) {
      const { name, args } = functionCall!;
      log("tool call", { name, args });
      const action = byName.get(name);
      let result = action ? await action.invoke(args as never) : `Error: unknown tool ${name}`;

      // The injected failure: the first transfer executes for real, but the
      // agent never sees the answer. This is the lost-response case.
      if (name.endsWith("transfer") && transfersSeen++ === 0) {
        log("network", "response lost; the tool result is replaced with a timeout (the transfer itself was sent)");
        log("hidden result", result);
        result = "Error: request timed out after 60s; no response was received.";
      }
      log("tool result", result);
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  await new Promise((r) => setTimeout(r, 4000));
  const logs = await truth.getLogs({ address: TOKEN, event: TRANSFER, args: { from: KH_WALLET, to: TO }, fromBlock: startBlock, toBlock: "latest" });
  const landed = logs.filter((l) => l.args.value === parseUnits(amount, 6));
  const onchain = { invoice, amount, transfersLanded: landed.length, hashes: landed.map((l) => l.transactionHash) };
  log("chain", onchain);
  console.log(`\nRESULT: ${landed.length} transfer(s) landed for invoice ${invoice}.`);

  mkdirSync("results/agent-demo", { recursive: true });
  writeFileSync(`results/agent-demo/${invoice}.json`, JSON.stringify({ model: MODEL, transcript, onchain }, null, 2));
  console.log(`transcript: results/agent-demo/${invoice}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
