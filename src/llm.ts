import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Minimal text-generation layer. Each provider returns plain text.
 * Order of providers = fallback chain (first that works wins).
 */

export type Tier = "fast" | "smart";

export interface CompleteOpts {
  tier: Tier;
  system?: string;
  json?: boolean;
  /**
   * Expected reply shape (root must be an object). Claude enforces it with structured outputs,
   * Gemini gets it as responseJsonSchema. Implies json.
   */
  schema?: z.ZodObject;
}

export interface Provider {
  name: string;
  /** Model label used in the cliché cloud / leaderboard, e.g. "claude-haiku-5-5". */
  model(tier: Tier): string;
  complete(prompt: string, opts: CompleteOpts): Promise<string>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

const TIMEOUT_MS = Number(env("NOT_OBVIOUS_TIMEOUT_MS") ?? 60_000);

export interface RetryOpts {
  attempts?: number;
  /** Base backoff in ms; attempt i waits base * 2^i unless the server sent Retry-After. */
  baseMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

/** Seconds from a Retry-After header (number or HTTP date), capped at 60s. */
export function retryAfterMs(r: Response): number | undefined {
  const h = r.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(h) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 60_000) : undefined;
}

/**
 * Retry raw HTTP calls on 408/429/5xx, timeouts and network errors with exponential backoff.
 * Every attempt gets its own AbortSignal: the free Gemini tier sometimes accepts a request and never answers.
 * (The Anthropic SDK retries on its own.)
 */
export async function withRetry(call: (signal: AbortSignal) => Promise<Response>, opts: RetryOpts = {}): Promise<Response> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  let last: Response | undefined;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep((last && retryAfterMs(last)) ?? baseMs * 2 ** i);
    // Own controller + timer instead of AbortSignal.timeout: Bun does not fire the latter reliably.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(Object.assign(new Error("timed out"), { name: "TimeoutError" })), opts.timeoutMs ?? TIMEOUT_MS);
    try {
      last = await call(ctl.signal);
      lastErr = undefined;
      if (!retryable(last.status)) return last;
    } catch (e) {
      last = undefined;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (last) return last;
  throw lastErr instanceof Error && lastErr.name === "TimeoutError" ? new Error(`request timed out after ${attempts} attempts`) : lastErr;
}

/** "a, b" -> ["a", "b"]: a tier may list several models, tried in order (free tiers rate-limit per model). */
export const modelList = (v: string | undefined, fallback: string) =>
  (v ?? fallback).split(",").map((m) => m.trim()).filter(Boolean);

export function anthropicProvider(): Provider | null {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return null;
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 3 });
  const models: Record<Tier, string> = {
    fast: env("NOT_OBVIOUS_CLAUDE_FAST") ?? "claude-haiku-5-5",
    smart: env("NOT_OBVIOUS_CLAUDE_SMART") ?? "claude-sonnet-5-5",
  };
  return {
    name: "anthropic",
    model: (t) => models[t],
    async complete(prompt, { tier, system, json, schema }) {
      // With a schema the API guarantees valid JSON, so no "reply with JSON" instruction is needed.
      const jsonHint = json && !schema ? "Reply with valid JSON only, no prose, no code fences." : "";
      const sys = [system, jsonHint].filter(Boolean).join("\n\n");
      const res = await client.messages.create({
        model: models[tier],
        max_tokens: 8000,
        ...(sys ? { system: sys } : {}),
        ...(schema ? { output_config: { format: zodOutputFormat(schema) } } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") throw new Error(`anthropic refused: ${res.stop_details?.category ?? "unknown"}`);
      if (res.stop_reason === "max_tokens") throw new Error("anthropic reply truncated at max_tokens");
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    },
  };
}

export function geminiProvider(): Provider | null {
  const key = env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY");
  if (!key) return null;
  const models: Record<Tier, string[]> = {
    fast: modelList(env("NOT_OBVIOUS_GEMINI_FAST"), "gemini-flash-latest,gemini-flash-lite-latest"),
    smart: modelList(env("NOT_OBVIOUS_GEMINI_SMART"), "gemini-pro-latest,gemini-flash-latest"),
  };
  /** Last model that answered per tier, so labels in the cloud match who actually spoke. */
  const used: Partial<Record<Tier, string>> = {};
  return {
    name: "gemini",
    model: (t) => used[t] ?? models[t][0]!,
    async complete(prompt, { tier, system, json, schema }) {
      const body = JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: schema
          ? { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema) }
          : json
            ? { responseMimeType: "application/json" }
            : {},
      });
      const errors: string[] = [];
      for (const m of models[tier]) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
        try {
          const r = await withRetry(
            (signal) => fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body, signal }),
            { attempts: models[tier].length > 1 ? 2 : 4 },
          );
          if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
          const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (!text) throw new Error("empty reply");
          used[tier] = m;
          return text;
        } catch (e) {
          errors.push(`${m} ${(e as Error).message}`);
        }
      }
      throw new Error(`gemini: ${errors.join("; ")}`);
    },
  };
}

export function providers(): Provider[] {
  const all = [anthropicProvider(), geminiProvider()].filter((p): p is Provider => p !== null);
  if (all.length === 0) {
    throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY.");
  }
  return all;
}

/** Run on the first provider that answers; fall back to the next one on error. */
export async function complete(
  prompt: string,
  opts: CompleteOpts,
): Promise<{ text: string; model: string }> {
  const errors: string[] = [];
  for (const p of providers()) {
    try {
      return { text: await p.complete(prompt, opts), model: p.model(opts.tier) };
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All providers failed:\n${errors.join("\n")}`);
}

/** Parse JSON from a model reply, tolerating code fences and leading prose. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error(`No JSON in model reply: ${text.slice(0, 200)}`);
  const open = cleaned[start];
  const end = cleaned.lastIndexOf(open === "[" ? "]" : "}");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Parse a JSON list from a model reply. Models often wrap it: {"ideas": [...]} -> [...]. */
export function parseList<T>(text: string): T[] {
  const v = parseJson<unknown>(text);
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const inner = Object.values(v).find(Array.isArray);
    if (inner) return inner as T[];
  }
  throw new Error(`Expected a JSON list in model reply: ${text.slice(0, 200)}`);
}
