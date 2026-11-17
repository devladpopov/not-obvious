/** Plain-text callers for the bench scripts (leaderboard.ts, context.ts): one user turn in, raw text out. */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { compatProvider, withRetry } from "../src/llm.js";

export type Call = (ask: string) => Promise<string>;
export interface Model { id: string; vendor: string; call: Call }

export const env = (k: string) => process.env[k]?.trim() || undefined;
export const anthropic = env("ANTHROPIC_API_KEY") ? new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 4, timeout: 120_000 }) : null;
export const claude = (model: string): Call => async (ask) => {
  const r = await anthropic!.messages.create({ model, max_tokens: 2000, messages: [{ role: "user", content: ask }] });
  return r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
};
// Free-tier daily quotas are small (20 requests per model for the newest flash models): stop asking once one is hit.
const dayLimited = new Set<string>();
export const gemini = (model: string): Call => async (ask) => {
  if (dayLimited.has(model)) throw new Error(`${model}: daily quota used up, re-run tomorrow`);
  const r = await withRetry((signal) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY")! }, signal,
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ask }] }] }),
  }), { attempts: 4, baseMs: 5000, timeoutMs: 120_000 });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429 && body.includes("PerDay")) dayLimited.add(model);
    throw new Error(`${model} ${r.status}: ${body.slice(0, 200)}`);
  }
  const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  return d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
};
// Any OpenAI-compatible /chat/completions endpoint (OpenRouter, Ollama, Gemini's OpenAI endpoint for Gemma), plain text.
export const compat = (baseUrl: string, model: string, apiKey?: string): Call => {
  const p = compatProvider({ name: model, baseUrl, model, apiKey });
  return (ask) => p.complete(ask, { tier: "fast" });
};
// A CLI that reads the prompt on stdin and prints the reply (e.g. "claude -p --model claude-opus-5-5").
// At most LB_CLI_CONCURRENCY (default 2) at a time: CLI sessions are heavy and share one subscription limit.
// On Windows a shell script needs its interpreter in front: "bash path/to/script.sh --model opus".
let cliRunning = 0;
const cliWaiting: (() => void)[] = [];
export const claudeCli = (cmd: string): Call => async (ask) => {
  const max = Number(env("LB_CLI_CONCURRENCY") ?? 2);
  if (cliRunning >= max) await new Promise<void>((res) => cliWaiting.push(res));
  cliRunning++;
  try {
    const proc = Bun.spawn(cmd.split(" ").filter(Boolean), { stdin: new Blob([ask]), stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) throw new Error(`${cmd} exited ${code}: ${err.slice(0, 200)}`);
    return out;
  } finally {
    cliRunning--;
    cliWaiting.shift()?.();
  }
};
// GigaChat (Sber): OAuth token for 30 min; Russian CA, hence TLS verification off for these two hosts only.
let giga: { token: string; until: number } | undefined;
const gigaFetch = (url: string, init: RequestInit) => fetch(url, { ...init, tls: { rejectUnauthorized: false } } as RequestInit);
// The free tier allows one request at a time: calls are chained and 429s retried.
let gigaQueue: Promise<unknown> = Promise.resolve();
export const gigachat = (model: string): Call => (ask) => {
  const run = gigaQueue.then(() => gigaCall(model, ask));
  gigaQueue = run.catch(() => {});
  return run;
};
async function gigaCall(model: string, ask: string, attempt = 0): Promise<string> {
  if (!giga || giga.until < Date.now() + 60_000) {
    const r = await gigaFetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
      method: "POST",
      headers: { Authorization: `Basic ${env("GIGACHAT_AUTH_KEY")}`, RqUID: randomUUID(), "Content-Type": "application/x-www-form-urlencoded" },
      body: `scope=${env("GIGACHAT_SCOPE") ?? "GIGACHAT_API_PERS"}`,
    });
    const d = (await r.json()) as { access_token: string; expires_at: number };
    giga = { token: d.access_token, until: d.expires_at };
  }
  const r = await gigaFetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${giga.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: ask }] }),
  });
  if (r.status === 429 && attempt < 5) return Bun.sleep(5000 * 2 ** attempt).then(() => gigaCall(model, ask, attempt + 1));
  if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
}

/** "1. **Foo** - bar" -> "Foo - bar". Keeps the first n numbered items; falls back to non-empty lines. */
export function parseAnswers(text: string, n = 5): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l));
  return (numbered.length >= 2 ? numbered : lines)
    .map((l) => l.replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, "").replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length > 2)
    .slice(0, n);
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
// Deterministic bootstrap over prompts (mulberry32), so the docs do not change between identical runs.
export const rng = (seed: number) => () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 4294967296);
export const ci = (xs: number[], B = 2000) => {
  const r = rng(42);
  const ms = Array.from({ length: B }, () => mean(xs.map(() => xs[Math.floor(r() * xs.length)]!))).sort((a, b) => a - b);
  return [ms[Math.floor(B * 0.025)]!, ms[Math.floor(B * 0.975)]!] as const;
};
