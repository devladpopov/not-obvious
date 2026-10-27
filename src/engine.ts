import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { embedder, type Vector } from "./embed.js";
import { complete, parseJson, providers } from "./llm.js";
import { clicheScore, cosine, type ClicheBreakdown } from "./math.js";
import { technique, TECHNIQUES } from "./techniques.js";

export interface Cliche {
  text: string;
  model: string;
}

export interface Cloud {
  prompt: string;
  cliches: Cliche[];
  embedder: string;
  vectors: Vector[];
}

const CACHE_DIR = process.env.NOT_OBVIOUS_CACHE?.trim() || join(homedir(), ".not-obvious", "clouds");
const key = (prompt: string) => createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 16);

async function loadCloud(prompt: string): Promise<Cloud | null> {
  try {
    return JSON.parse(await readFile(join(CACHE_DIR, `${key(prompt)}.json`), "utf8")) as Cloud;
  } catch {
    return null;
  }
}

async function saveCloud(cloud: Cloud): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${key(cloud.prompt)}.json`), JSON.stringify(cloud));
}

/** Drop near-duplicates so one phrasing repeated by every model counts once in the cloud view. */
function dedupe(items: Cliche[], vectors: Vector[], threshold = 0.95) {
  const keep: number[] = [];
  vectors.forEach((v, i) => {
    if (!keep.some((k) => cosine(v, vectors[k]!) >= threshold)) keep.push(i);
  });
  return { cliches: keep.map((i) => items[i]!), vectors: keep.map((i) => vectors[i]!) };
}

/**
 * baseline: what would any AI say? Asks every configured model the plain question,
 * exactly as a user would, and collects the answers into a cliché cloud.
 */
export async function baseline(prompt: string, opts: { perModel?: number; refresh?: boolean } = {}): Promise<Cloud> {
  if (!opts.refresh) {
    const cached = await loadCloud(prompt);
    if (cached) return cached;
  }
  const n = opts.perModel ?? 10;
  const ask = `${prompt}\n\nGive ${n} distinct answers. Return a JSON array of ${n} strings, one short answer (max 25 words) each.`;
  const batches = await Promise.allSettled(
    providers().map(async (p) => {
      const text = await p.complete(ask, { tier: "fast", json: true });
      return parseJson<string[]>(text).map((t) => ({ text: String(t), model: p.model("fast") }));
    }),
  );
  const items = batches.flatMap((b) => (b.status === "fulfilled" ? b.value : []));
  if (items.length === 0) {
    const reasons = batches.map((b) => (b.status === "rejected" ? String(b.reason) : "")).join("\n");
    throw new Error(`Could not build a cliché cloud:\n${reasons}`);
  }
  const emb = embedder();
  const { cliches, vectors } = dedupe(items, await emb.embed(items.map((i) => i.text)));
  const cloud: Cloud = { prompt, cliches, embedder: emb.name, vectors };
  await saveCloud(cloud);
  return cloud;
}

export interface Scored {
  idea: string;
  cliche: number;
  nearest: string;
  breakdown: ClicheBreakdown;
  usefulness?: { score: number; why: string };
}

async function usefulness(prompt: string, ideas: string[]): Promise<{ score: number; why: string }[]> {
  const ask = `Task: ${prompt}\n\nRate how useful and feasible each idea is for the task (1 = nonsense or impossible, 10 = clearly workable and valuable). Originality is NOT the criterion here. Ideas:\n${ideas
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n")}\n\nReturn a JSON array of {"score": number, "why": string (max 15 words)} in the same order.`;
  const { text } = await complete(ask, { tier: "fast", json: true });
  return parseJson<{ score: number; why: string }[]>(text);
}

/** score: how clichéd are these ideas relative to the cloud for this prompt (0 = original, 100 = what every AI says). */
export async function score(prompt: string, ideas: string[], opts: { critic?: boolean } = {}): Promise<Scored[]> {
  const cloud = await baseline(prompt);
  const emb = embedder();
  if (emb.name !== cloud.embedder) throw new Error(`Cloud was embedded with ${cloud.embedder}, current embedder is ${emb.name}. Re-run baseline with refresh.`);
  const vecs = await emb.embed(ideas);
  const critic = opts.critic === false ? [] : await usefulness(prompt, ideas).catch(() => []);
  return ideas.map((idea, i) => {
    const b = clicheScore(vecs[i]!, cloud.vectors);
    return { idea, cliche: b.cliche, nearest: cloud.cliches[b.nearestIndex]!.text, breakdown: b, usefulness: critic[i] };
  });
}

function cloudBrief(cloud: Cloud, max = 30) {
  return cloud.cliches
    .slice(0, max)
    .map((c) => `- ${c.text}`)
    .join("\n");
}

/** diverge: generate ideas away from the cloud with a named technique, then keep only the ones that measurably escaped. */
export async function diverge(prompt: string, techniqueId: string, opts: { count?: number } = {}) {
  const t = technique(techniqueId);
  const cloud = await baseline(prompt);
  const n = opts.count ?? 6;
  const ask = `Task: ${prompt}\n\nThese are the answers every AI model gives (the cliché cloud). Do NOT repeat, rephrase or slightly vary any of them:\n${cloudBrief(cloud)}\n\nTechnique: ${t.name}. ${t.instruction}\n\nProduce ${n} ideas that are concrete, workable and far from the cloud. Return a JSON array of {"idea": string (max 40 words), "move": string (which step of the technique produced it, max 15 words)}.`;
  const { text, model } = await complete(ask, { tier: "smart", json: true });
  const raw = parseJson<{ idea: string; move: string }[]>(text);
  const scored = await score(prompt, raw.map((r) => r.idea));
  return {
    technique: t.name,
    model,
    ideas: scored.map((s, i) => ({ ...s, move: raw[i]?.move ?? "" })).sort((a, b) => a.cliche - b.cliche),
  };
}

/** remix: cross two ideas (A x B) into hybrids that neither parent nor the cloud contains. */
export async function remix(prompt: string, a: string, b: string, opts: { count?: number } = {}) {
  const cloud = await baseline(prompt);
  const n = opts.count ?? 4;
  const ask = `Task: ${prompt}\n\nIdea A: ${a}\nIdea B: ${b}\n\nCliché cloud to avoid:\n${cloudBrief(cloud, 15)}\n\nCross A and B: take the mechanism of one and the audience, channel or constraint of the other. Produce ${n} hybrids that are not just "A plus B" and not in the cloud. Return a JSON array of {"idea": string (max 40 words), "from_a": string, "from_b": string}.`;
  const { text, model } = await complete(ask, { tier: "smart", json: true });
  const raw = parseJson<{ idea: string; from_a: string; from_b: string }[]>(text);
  const scored = await score(prompt, raw.map((r) => r.idea));
  return { model, hybrids: scored.map((s, i) => ({ ...s, from_a: raw[i]?.from_a, from_b: raw[i]?.from_b })) };
}

/** explain: why an idea scored the way it did, and the single best move to push it further from the cloud. */
export async function explain(prompt: string, idea: string) {
  const [s] = await score(prompt, [idea]);
  const cloud = await baseline(prompt);
  const ask = `Task: ${prompt}\nIdea: ${idea}\nIts closest cliché (what every AI says): ${s!.nearest}\nCliché Score: ${s!.cliche}/100.\nOther clichés:\n${cloudBrief(cloud, 12)}\n\nIn 3 short bullet points: what in the idea is clichéd, what is genuinely different, and one concrete move (pick from: ${TECHNIQUES.map((t) => t.id).join(", ")}) that would push it further away without losing usefulness.`;
  const { text } = await complete(ask, { tier: "fast" });
  return { ...s!, explanation: text.trim() };
}
