/**
 * Web novelty: does the idea already exist out there? The cliché cloud says what models would answer;
 * the web says what people already do. An idea can escape the cloud and still be a well-known product.
 * - claude: Claude with the web_search server tool searches and rates in one call (default with ANTHROPIC_API_KEY)
 * - brave: Brave Search top results, rated by the regular judge model (BRAVE_API_KEY)
 * NOT_OBVIOUS_WEB=claude|brave|off picks one explicitly.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { complete, parseJson, parseList, withRetry } from "./llm.js";

export interface WebSource {
  title: string;
  url: string;
}

export interface WebCheck {
  /** 0 = nothing like it found online, 10 = a widespread, well-documented practice. */
  prevalence: number;
  why: string;
  sources: WebSource[];
  via: string;
}

const env = (k: string) => process.env[k]?.trim() || undefined;
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const RUBRIC =
  "Rate prevalence 0-10: 0 = nothing like it exists, 3 = only loosely related things exist, 5 = the core mechanism exists in some niche, 8 = several products or guides do exactly this, 10 = a widespread, standard practice. Judge the mechanism (what is done, for whom, how value is created), not the wording.";

export const WebRatingSchema = z.object({ prevalence: z.number(), why: z.string() });
const WebRatingsSchema = z.object({ items: z.array(WebRatingSchema) });

export type WebMode = "claude" | "brave" | "off";

export function webMode(): WebMode {
  const m = env("NOT_OBVIOUS_WEB");
  if (m === "claude" || m === "brave" || m === "off") return m;
  if (env("ANTHROPIC_API_KEY")) return "claude";
  if (braveKey()) return "brave";
  return "off";
}

const braveKey = () => env("BRAVE_API_KEY") ?? env("BRAVE_SEARCH_API_KEY");

/** One idea, one Claude call: the model searches (up to 2 queries), reads the results and rates prevalence. */
async function claudeCheck(prompt: string, idea: string): Promise<WebCheck> {
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), timeout: 90_000, maxRetries: 3 });
  const model = env("NOT_OBVIOUS_WEB_MODEL") ?? "claude-haiku-5-5";
  // Haiku takes the basic tool; Sonnet 5 / Opus can use web_search_20260209 (dynamic filtering) via env.
  const type = env("NOT_OBVIOUS_WEB_TOOL") ?? "web_search_20250305";
  const res = await client.messages.create({
    model,
    max_tokens: 4000,
    tools: [{ type, name: "web_search", max_uses: 2 } as Anthropic.WebSearchTool20250305],
    messages: [
      {
        role: "user",
        content: `Task: ${prompt}\nIdea: ${idea}\n\nSearch the web for products, services, projects or common advice that already implement this idea. ${RUBRIC}\n\nAfter searching reply with JSON only: {"prevalence": number, "why": string (max 20 words, name what you found, no quotation marks inside)}.`,
      },
    ],
  });
  const sources: WebSource[] = [];
  for (const b of res.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (!sources.some((s) => s.url === r.url)) sources.push({ title: r.title, url: r.url });
    }
  }
  // Citations split the reply into several text blocks; glue them back before parsing.
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const r = WebRatingSchema.parse(parseJson<unknown>(text));
  return { prevalence: clamp(r.prevalence), why: r.why, sources: sources.slice(0, 5), via: `${model} web_search` };
}

async function braveSearch(q: string): Promise<{ title: string; url: string; description: string }[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(q.slice(0, 380))}`;
  const r = await withRetry((signal) => fetch(url, { headers: { accept: "application/json", "x-subscription-token": braveKey()! }, signal }), { baseMs: 1100 });
  if (!r.ok) throw new Error(`brave ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
  return (data.web?.results ?? []).map((x) => ({ title: x.title, url: x.url, description: (x.description ?? "").replace(/<[^>]+>/g, "") }));
}

/** Brave: search each idea (free plan allows 1 request/s, so sequentially), then rate all ideas in one model call. */
async function braveCheck(prompt: string, ideas: string[]): Promise<WebCheck[]> {
  const results: Awaited<ReturnType<typeof braveSearch>>[] = [];
  for (const idea of ideas) {
    if (results.length) await new Promise((res) => setTimeout(res, 1100));
    results.push(await braveSearch(idea));
  }
  const ask = `Task: ${prompt}\n\nFor each idea below you get the top web search results for it. ${RUBRIC}\n\n${ideas
    .map((idea, i) => `Idea ${i + 1}: ${idea}\nResults:\n${results[i]!.map((r) => `- ${r.title}: ${r.description}`).join("\n") || "- (none)"}`)
    .join("\n\n")}\n\nReturn JSON {"items": [{"prevalence": number, "why": string (max 20 words)}]} in the same order.`;
  const { text, model } = await complete(ask, { tier: "fast", json: true, schema: WebRatingsSchema });
  const out = parseList<{ prevalence: number; why: string }>(text);
  if (out.length !== ideas.length) throw new Error(`web judge returned ${out.length}/${ideas.length} ratings`);
  return out.map((r, i) => ({
    prevalence: clamp(Number(r.prevalence)),
    why: String(r.why ?? ""),
    sources: results[i]!.slice(0, 5).map(({ title, url }) => ({ title, url })),
    via: `brave + ${model}`,
  }));
}

const clamp = (x: number) => Math.min(10, Math.max(0, Number.isFinite(x) ? x : 0));

/** Checks are cached per (prompt, idea, mode) next to the clouds: web search is the slowest and priciest step. */
let memo: Map<string, WebCheck> | undefined;
const memoFile = (dir: string) => join(dir, "web.json");

/**
 * Web prevalence per idea. Ideas whose check fails get undefined, so scoring degrades instead of failing.
 */
export async function webCheck(prompt: string, ideas: string[], cacheDir: string): Promise<(WebCheck | undefined)[]> {
  const mode = webMode();
  if (mode === "off") return ideas.map(() => undefined);
  memo ??= new Map(Object.entries(await readFile(memoFile(cacheDir), "utf8").then((t) => JSON.parse(t) as Record<string, WebCheck>).catch(() => ({}))));
  const m = memo;
  const k = (idea: string) => hash(`${mode}\n${prompt.trim().toLowerCase()}\n${idea}`);
  const missing = [...new Set(ideas.filter((i) => !m.has(k(i))))];
  if (missing.length) {
    if (mode === "brave") {
      const out = await braveCheck(prompt, missing).catch(() => []);
      out.forEach((c, i) => m.set(k(missing[i]!), c));
    } else {
      const out = await Promise.allSettled(missing.map((idea) => claudeCheck(prompt, idea)));
      out.forEach((r, i) => r.status === "fulfilled" && m.set(k(missing[i]!), r.value));
    }
    await mkdir(cacheDir, { recursive: true });
    await writeFile(memoFile(cacheDir), JSON.stringify(Object.fromEntries(m)));
  }
  return ideas.map((i) => m.get(k(i)));
}
