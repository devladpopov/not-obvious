import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { embedder, type Vector } from "./embed.js";
import { complete, parseJson, parseList, providers } from "./llm.js";
import { clicheScore, combineScores, cosine, type ClicheBreakdown } from "./math.js";
import { AnswersSchema, ExplainSchema, HybridsSchema, IdeasSchema, JudgeSchema, UsefulnessSchema } from "./schemas.js";
import { technique, TECHNIQUES } from "./techniques.js";
import { webCheck, type WebCheck } from "./web.js";

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
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
/** Cache key: normalised prompt + embedder, so switching embedders never mixes vector spaces. */
export const cloudKey = (prompt: string, embedderName: string) =>
  hash(`${embedderName}\n${prompt.trim().toLowerCase().replace(/\s+/g, " ")}`);

async function loadCloud(prompt: string, embedderName: string): Promise<Cloud | null> {
  try {
    const c = JSON.parse(await readFile(join(CACHE_DIR, `${cloudKey(prompt, embedderName)}.json`), "utf8")) as Cloud;
    return c.embedder === embedderName && c.vectors.length === c.cliches.length && c.cliches.length > 0 ? c : null;
  } catch {
    return null;
  }
}

async function saveCloud(cloud: Cloud): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${cloudKey(cloud.prompt, cloud.embedder)}.json`), JSON.stringify(cloud));
}

/**
 * Embeddings of scored ideas are cached on disk too (one file per embedder):
 * re-scoring the same idea is free and survives free-tier rate limits.
 */
const embMemo = new Map<string, Map<string, Vector>>();
export async function embedCached(texts: string[]): Promise<{ name: string; vectors: Vector[] }> {
  const emb = embedder();
  const file = join(CACHE_DIR, `emb-${emb.name.replace(/[^\w.-]/g, "_")}.json`);
  let memo = embMemo.get(file);
  if (!memo) {
    memo = new Map(Object.entries(await readFile(file, "utf8").then((t) => JSON.parse(t) as Record<string, Vector>).catch(() => ({}))));
    embMemo.set(file, memo);
  }
  const missing = [...new Set(texts.filter((t) => !memo!.has(hash(t))))];
  if (missing.length) {
    const vs = await emb.embed(missing);
    missing.forEach((t, i) => memo!.set(hash(t), vs[i]!));
    if (emb.name !== "lexical-trigram") {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(Object.fromEntries(memo)));
    }
  }
  return { name: emb.name, vectors: texts.map((t) => memo!.get(hash(t))!) };
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
  const embName = embedder().name;
  if (!opts.refresh) {
    const cached = await loadCloud(prompt, embName);
    if (cached) return cached;
  }
  const n = opts.perModel ?? 10;
  const ask = `${prompt}\n\nGive ${n} distinct answers. Return JSON {"items": [${n} strings]}, one short answer (max 25 words) each.`;
  const batches = await Promise.allSettled(
    providers().map(async (p) => {
      // One retry on malformed or short output: flash-lite sometimes returns 2 items or broken JSON.
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await p.complete(ask, { tier: "fast", json: true, schema: AnswersSchema });
          const list = parseList<unknown>(text).map((t) => String(typeof t === "object" && t ? Object.values(t)[0] : t).trim()).filter(Boolean);
          if (list.length >= Math.ceil(n / 2)) return list.map((t) => ({ text: t, model: p.model("fast") }));
          lastErr = new Error(`${p.name} returned ${list.length}/${n} answers`);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    }),
  );
  const items = batches.flatMap((b) => (b.status === "fulfilled" ? b.value : []));
  if (items.length === 0) {
    const reasons = batches.map((b) => (b.status === "rejected" ? String(b.reason) : "")).join("\n");
    throw new Error(`Could not build a cliché cloud:\n${reasons}`);
  }
  const { name, vectors: raw } = await embedCached(items.map((i) => i.text));
  const { cliches, vectors } = dedupe(items, raw);
  const cloud: Cloud = { prompt, cliches, embedder: name, vectors };
  await saveCloud(cloud);
  return cloud;
}

export interface Judgement {
  /** 0 = a genuinely different mechanism, 10 = the same idea as a cliché in other words. */
  overlap: number;
  /** 1-based index into the cloud of the cliché with the same mechanism, 0 if none. */
  closest: number;
  why: string;
}

export interface Scored {
  idea: string;
  /** Final score: embedding distance blended with the mechanism judge. */
  cliche: number;
  /** Embedding-only score, 0..100. */
  embedding: number;
  nearest: string;
  breakdown: ClicheBreakdown;
  judge?: Judgement;
  usefulness?: { score: number; why: string };
  /** Web prevalence: does the idea already exist online? A separate axis, not folded into cliche (see docs/calibration.md). */
  web?: WebCheck;
}

/** Ideas at or above this web prevalence are flagged: already a common product or practice. */
export const WEB_EXISTS = 8;

async function usefulness(prompt: string, ideas: string[]): Promise<{ score: number; why: string }[]> {
  const ask = `Task: ${prompt}\n\nRate how useful and feasible each idea is for the task (1 = nonsense or impossible, 10 = clearly workable and valuable). Originality is NOT the criterion here. Ideas:\n${ideas
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n")}\n\nReturn JSON {"items": [{"score": number, "why": string (max 15 words)}]} in the same order.`;
  const { text } = await complete(ask, { tier: "fast", json: true, schema: UsefulnessSchema });
  return parseList<{ score: number; why: string }>(text);
}

/** Judge verdicts are cached per (cloud, idea): calibration re-runs and repeated scoring cost nothing. */
let judgeMemo: Map<string, Judgement> | undefined;
const judgeFile = () => join(CACHE_DIR, "judge.json");

/**
 * Mechanism judge: does the idea do the same thing, for the same people, in the same way as some cliché,
 * whatever the wording? Fixes the main embedding failure from day-2 calibration (far ideas in cloud vocabulary).
 */
export async function judgeMechanism(prompt: string, ideas: string[], cloud: Cloud): Promise<Judgement[]> {
  judgeMemo ??= new Map(Object.entries(await readFile(judgeFile(), "utf8").then((t) => JSON.parse(t) as Record<string, Judgement>).catch(() => ({}))));
  const memo = judgeMemo;
  const ck = cloudKey(prompt, cloud.embedder);
  const k = (idea: string) => hash(`${ck}\n${cloud.cliches.length}\n${idea}`);
  const missing = [...new Set(ideas.filter((i) => !memo.has(k(i))))];
  if (missing.length) {
    const ask = `Task: ${prompt}\n\nTypical answers every AI gives (clichés):\n${cloud.cliches
      .map((c, i) => `${i + 1}. ${c.text}`)
      .join("\n")}\n\nFor each idea below judge whether its underlying MECHANISM matches a cliché: the same action, for the same audience, creating value the same way. Ignore wording, tone and small details; a cliché with a cosmetic twist is still the cliché. Score overlap 0-10 (0 = a mechanism no cliché uses, 5 = shares a core part with one, 10 = the same idea in other words).\n\nIdeas:\n${missing
      .map((t, i) => `${i + 1}. ${t}`)
      .join("\n")}\n\nReturn JSON {"items": [{"overlap": number, "closest": number (cliché number, 0 if none), "why": string (max 15 words)}]} in the same order.`;
    const { text } = await complete(ask, { tier: "fast", json: true, schema: JudgeSchema });
    const out = parseList<Judgement>(text);
    if (out.length !== missing.length) throw new Error(`judge returned ${out.length}/${missing.length} verdicts`);
    missing.forEach((t, i) => memo.set(k(t), { overlap: Number(out[i]!.overlap), closest: Number(out[i]!.closest) || 0, why: String(out[i]!.why ?? "") }));
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(judgeFile(), JSON.stringify(Object.fromEntries(memo)));
  }
  return ideas.map((i) => memo.get(k(i))!);
}

/**
 * score: how clichéd are these ideas relative to the cloud for this prompt (0 = original, 100 = what every AI says).
 * web: also search the web for each idea (slower, ~1 search per idea); off by default inside generation loops.
 */
export async function score(prompt: string, ideas: string[], opts: { critic?: boolean; judge?: boolean; web?: boolean } = {}): Promise<Scored[]> {
  const cloud = await baseline(prompt);
  const [{ vectors: vecs }, critic, verdicts, web] = await Promise.all([
    embedCached(ideas),
    opts.critic === false ? [] : usefulness(prompt, ideas).catch(() => []),
    // A failed judge degrades to embedding-only scoring instead of failing the call.
    opts.judge === false ? [] : judgeMechanism(prompt, ideas, cloud).catch(() => []),
    opts.web ? webCheck(prompt, ideas, CACHE_DIR).catch(() => []) : [],
  ]);
  return ideas.map((idea, i) => {
    const b = clicheScore(vecs[i]!, cloud.vectors);
    const j = verdicts[i];
    const nearest = j && j.closest >= 1 && j.closest <= cloud.cliches.length ? j.closest - 1 : b.nearestIndex;
    return {
      idea,
      cliche: combineScores(b.cliche, j?.overlap, undefined, web[i]?.prevalence),
      embedding: b.cliche,
      nearest: cloud.cliches[nearest]!.text,
      breakdown: b,
      judge: j,
      usefulness: critic[i],
      web: web[i],
    };
  });
}

/** Attach web checks to already scored ideas (diverge checks only its survivors). */
async function withWeb<T extends Scored>(prompt: string, items: T[]): Promise<T[]> {
  if (!items.length) return items;
  const web = await webCheck(prompt, items.map((s) => s.idea), CACHE_DIR).catch(() => []);
  return items.map((s, i) => ({ ...s, web: web[i], cliche: combineScores(s.embedding, s.judge?.overlap, undefined, web[i]?.prevalence) }));
}

function cloudBrief(cloud: Cloud, max = 30) {
  return cloud.cliches
    .slice(0, max)
    .map((c) => `- ${c.text}`)
    .join("\n");
}

export interface DivergeOpts {
  /** Survivors wanted per technique. */
  count?: number;
  /** Keep ideas with Cliché Score below this. */
  maxCliche?: number;
  /** Keep ideas the critic rates at least this useful (1-10). */
  minUseful?: number;
  /** Generation rounds per technique; later rounds see what was rejected and why. */
  rounds?: number;
  /** Web-check the survivors (default true; no-op without a web mode). */
  web?: boolean;
}

/** An idea escapes when it is far enough from the cloud and still useful. No critic verdict = not rejected for usefulness. */
export function passes(s: Pick<Scored, "cliche" | "usefulness">, maxCliche = 50, minUseful = 6): boolean {
  return s.cliche < maxCliche && (s.usefulness === undefined || s.usefulness.score >= minUseful);
}

export function rejectionReason(s: Scored, maxCliche = 50): string {
  return s.cliche >= maxCliche ? `too close to "${s.nearest}" (${s.cliche}%)` : `not useful enough: ${s.usefulness?.why ?? ""}`;
}

type DivergeIdea = Scored & { move: string; technique: string };

async function divergeOne(prompt: string, techniqueId: string, cloud: Cloud, o: Required<DivergeOpts>) {
  const t = technique(techniqueId);
  const kept: DivergeIdea[] = [];
  const rejected: DivergeIdea[] = [];
  let model = "";
  let rounds = 0;
  let lastErr: unknown;
  for (; rounds < o.rounds && kept.length < o.count; rounds++) {
    const feedback = rejected.length
      ? `\n\nAlready tried and rejected (do not retry these directions):\n${rejected.map((r) => `- ${r.idea} -> ${rejectionReason(r, o.maxCliche)}`).join("\n")}`
      : "";
    const want = Math.max(o.count - kept.length + 2, 3);
    const ask = `Task: ${prompt}\n\nThese are the answers every AI model gives (the cliché cloud). Do NOT repeat, rephrase or slightly vary any of them, and do not reuse their mechanism with a cosmetic twist:\n${cloudBrief(cloud)}${feedback}\n\nTechnique: ${t.name}. ${t.instruction}\n\nProduce ${want} ideas that are concrete, workable and far from the cloud. Return JSON {"items": [{"idea": string (max 40 words), "move": string (which step of the technique produced it, max 15 words)}]}.`;
    try {
      const r = await complete(ask, { tier: "smart", json: true, schema: IdeasSchema });
      model = r.model;
      const raw = parseList<{ idea: string; move: string }>(r.text).filter((x) => x?.idea);
      const scored = await score(prompt, raw.map((x) => String(x.idea)));
      scored.forEach((s, i) => {
        const item = { ...s, move: String(raw[i]?.move ?? ""), technique: t.name };
        (passes(s, o.maxCliche, o.minUseful) ? kept : rejected).push(item);
      });
    } catch (e) {
      // A bad round (malformed JSON, provider hiccup) costs one round, not the whole technique.
      lastErr = e;
    }
  }
  if (!model && lastErr) throw lastErr;
  return { technique: t.name, model, rounds, kept, rejected };
}

/**
 * diverge: generate ideas away from the cloud with one technique (or "all" five in parallel),
 * keep only those that measurably escaped (Cliché < maxCliche, usefulness >= minUseful),
 * and regenerate with the rejection reasons when too few survive.
 */
export async function diverge(prompt: string, techniqueId: string, opts: DivergeOpts = {}) {
  const o: Required<DivergeOpts> = { count: 4, maxCliche: 50, minUseful: 6, rounds: 2, web: true, ...opts };
  const ids = techniqueId === "all" ? TECHNIQUES.map((t) => t.id) : techniqueId.split(",").map((s) => s.trim());
  ids.forEach((id) => technique(id));
  const cloud = await baseline(prompt);
  const runs = await Promise.allSettled(ids.map((id) => divergeOne(prompt, id, cloud, o)));
  const ok = runs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ok.length === 0) throw new Error(`diverge failed:\n${runs.map((r) => (r.status === "rejected" ? String(r.reason) : "")).join("\n")}`);
  const byScore = (a: DivergeIdea, b: DivergeIdea) => a.cliche - b.cliche || (b.usefulness?.score ?? 0) - (a.usefulness?.score ?? 0);
  const kept = ok.flatMap((r) => r.kept);
  const ideas = o.web ? await withWeb(prompt, kept) : kept;
  return {
    technique: ok.map((r) => r.technique).join(", "),
    model: [...new Set(ok.map((r) => r.model))].join(", "),
    thresholds: { maxCliche: o.maxCliche, minUseful: o.minUseful },
    techniques: ok.map((r) => ({ technique: r.technique, rounds: r.rounds, kept: r.kept.length, rejected: r.rejected.length })),
    errors: runs.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${(r.reason as Error).message}`] : [])),
    // Survivors that already exist online sink to the bottom: escaping the AI cloud is not enough if it is a known product.
    ideas: ideas
      .map((s) => ({ ...s, existsOnline: (s.web?.prevalence ?? 0) >= WEB_EXISTS }))
      .sort((a, b) => Number(a.existsOnline) - Number(b.existsOnline) || byScore(a, b)),
    /** Closest misses, so the user sees what was filtered out and why. */
    rejected: ok
      .flatMap((r) => r.rejected)
      .sort(byScore)
      .slice(0, 5)
      .map((r) => ({ idea: r.idea, technique: r.technique, cliche: r.cliche, reason: rejectionReason(r, o.maxCliche) })),
  };
}

export interface RemixOpts {
  count?: number;
  maxCliche?: number;
  minUseful?: number;
}

/**
 * remix: cross two ideas (A x B) into hybrids that neither parent nor the cloud contains.
 * Parents are scored first, so the model knows which parent is the clichéd one and what to take from each.
 */
export async function remix(prompt: string, a: string, b: string, opts: RemixOpts = {}) {
  const o = { count: 4, maxCliche: 50, minUseful: 6, ...opts };
  const cloud = await baseline(prompt);
  const parents = await score(prompt, [a, b], { critic: false });
  const describe = (s: Scored, label: string) =>
    `Idea ${label}: ${s.idea}\n  Cliché Score ${s.cliche}/100, closest cliché: "${s.nearest}"${s.judge ? ` (mechanism overlap ${s.judge.overlap}/10)` : ""}`;
  const ask = `Task: ${prompt}\n\n${describe(parents[0]!, "A")}\n${describe(parents[1]!, "B")}\n\nCliché cloud to avoid:\n${cloudBrief(cloud, 15)}\n\nFirst, silently split each parent into mechanism (how value is created), audience, channel and constraint. Then build ${o.count} hybrids: each takes at least one component from A and one from B, and its mechanism must differ from both parents and from every cliché. Take more from the less clichéd parent. No "A plus B" bundles, no "A, but for B's audience" when that is already a cliché.\n\nReturn JSON {"items": [{"idea": string (max 40 words), "from_a": string (component taken from A), "from_b": string (component taken from B)}]}.`;
  const { text, model } = await complete(ask, { tier: "smart", json: true, schema: HybridsSchema });
  const raw = parseList<{ idea: string; from_a: string; from_b: string }>(text).filter((x) => x?.idea);
  const scored = await score(prompt, raw.map((r) => String(r.idea)));
  // A hybrid that is a near-copy of a parent is not a remix.
  const { vectors } = await embedCached([a, b, ...scored.map((s) => s.idea)]);
  const hybrids = scored.map((s, i) => {
    const parentSim = Math.max(cosine(vectors[i + 2]!, vectors[0]!), cosine(vectors[i + 2]!, vectors[1]!));
    return {
      ...s,
      from_a: raw[i]?.from_a ?? "",
      from_b: raw[i]?.from_b ?? "",
      parentSim: Math.round(parentSim * 1000) / 1000,
      escaped: passes(s, o.maxCliche, o.minUseful) && parentSim < 0.95,
    };
  });
  return {
    model,
    parents: parents.map((p) => ({ idea: p.idea, cliche: p.cliche, nearest: p.nearest })),
    hybrids: hybrids.sort((x, y) => Number(y.escaped) - Number(x.escaped) || x.cliche - y.cliche),
  };
}

/**
 * explain: why an idea scored the way it did (embedding distance, judge verdict, nearest cliché),
 * one concrete move to push it further, and the idea rewritten with that move, re-scored as proof.
 */
export async function explain(prompt: string, idea: string) {
  const [s] = await score(prompt, [idea], { web: true });
  const cloud = await baseline(prompt);
  const ask = `Task: ${prompt}\nIdea: ${idea}\n\nMeasurements:\n- Cliché Score ${s!.cliche}/100 (0 = original, 100 = what every AI says)\n- Embedding distance part: ${s!.embedding}/100 (how close the wording is to the cloud)\n- Mechanism judge: ${s!.judge ? `overlap ${s!.judge.overlap}/10, ${s!.judge.why}` : "not available"}\n- Closest cliché: "${s!.nearest}"\n- Usefulness: ${s!.usefulness ? `${s!.usefulness.score}/10, ${s!.usefulness.why}` : "not rated"}\n- Already on the web: ${s!.web ? `prevalence ${s!.web.prevalence}/10, ${s!.web.why}` : "not checked"}\n\nOther clichés:\n${cloudBrief(cloud, 12)}\n\nExplain the score in plain words and propose ONE move that pushes the idea away from the cloud (and from what already exists online) without losing usefulness. Return JSON {"cliched": string (what in the idea is shared with the clichés, max 30 words), "different": string (what is genuinely new, max 30 words), "technique": one of ${TECHNIQUES.map((t) => `"${t.id}"`).join(", ")}, "move": string (the concrete change, max 25 words), "rewrite": string (the idea after the move, max 40 words)}.`;
  const { text, model } = await complete(ask, { tier: "smart", json: true, schema: ExplainSchema });
  const e = ExplainSchema.parse(parseJson<unknown>(text));
  const [r] = await score(prompt, [e.rewrite], { web: true });
  return {
    ...s!,
    model,
    explanation: { cliched: e.cliched, different: e.different, technique: e.technique, move: e.move },
    rewrite: { idea: e.rewrite, cliche: r!.cliche, delta: r!.cliche - s!.cliche, usefulness: r!.usefulness, web: r!.web },
  };
}
