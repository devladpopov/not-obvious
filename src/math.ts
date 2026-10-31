import type { Vector } from "./embed.js";

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function centroid(vs: Vector[]): Vector {
  const c = new Array<number>(vs[0]?.length ?? 0).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) c[i]! += v[i]! / vs.length;
  return c;
}

/** Mean similarity of each cloud point to its nearest neighbour: how "tight" the cliché cloud is. */
export function cloudDensity(vs: Vector[]): number {
  if (vs.length < 2) return 1;
  let sum = 0;
  for (let i = 0; i < vs.length; i++) {
    let best = -1;
    for (let j = 0; j < vs.length; j++) if (i !== j) best = Math.max(best, cosine(vs[i]!, vs[j]!));
    sum += best;
  }
  return sum / vs.length;
}

export interface ClicheBreakdown {
  /** 0..100, higher = more clichéd. */
  cliche: number;
  /** Similarity to the closest cliché. */
  nearestSim: number;
  nearestIndex: number;
  /** Similarity to the cloud centroid ("the average AI answer"). */
  centroidSim: number;
  /** Reference: how close typical clichés are to each other. */
  density: number;
}

/**
 * Cliché Score v0.
 * An idea that sits as close to the cloud as clichés sit to each other scores ~100.
 * Every `spread` of cosine below that density takes it linearly to 0.
 * Embedders compress cosine differently (gemini-embedding: on-topic texts sit in 0.75-0.95),
 * so by default spread adapts to the cloud: 0.8 * (1 - density).
 * Blend: 70% nearest cliché (you re-invented one specific answer) + 30% centroid
 * (you landed in the middle of the AI consensus), each against the cloud's own reference.
 */
export interface ScoreParams {
  /** spread = spreadK * (1 - density). */
  spreadK: number;
  /** Weight of the nearest-cliché term; the centroid term gets the rest. */
  nearestWeight: number;
  /** Fixed spread, bypasses spreadK (useful for embedders with a known cosine range). */
  spread?: number;
}

/** Calibrated on bench/prompts.json with cloud-checked labels (docs/calibration.md). */
export const DEFAULT_PARAMS: ScoreParams = { spreadK: 0.8, nearestWeight: 0.7 };

export function clicheScore(idea: Vector, cloud: Vector[], params: Partial<ScoreParams> = {}): ClicheBreakdown {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (cloud.length === 0) throw new Error("Empty cliché cloud");
  let nearestSim = -1;
  let nearestIndex = 0;
  cloud.forEach((c, i) => {
    const s = cosine(idea, c);
    if (s > nearestSim) {
      nearestSim = s;
      nearestIndex = i;
    }
  });
  const density = cloudDensity(cloud);
  const spread = p.spread ?? Math.max(0.05, p.spreadK * (1 - density));
  const center = centroid(cloud);
  const centroidSim = cosine(idea, center);
  const centroidRef = cloud.reduce((s, c) => s + cosine(c, center), 0) / cloud.length;
  const norm = (s: number, ref: number) => Math.min(1, Math.max(0, 1 - (ref - s) / spread));
  const blended = p.nearestWeight * norm(nearestSim, density) + (1 - p.nearestWeight) * norm(centroidSim, centroidRef);
  return { cliche: Math.round(blended * 100), nearestSim, nearestIndex, centroidSim, density };
}

/** Weight of the mechanism judge in the final score (calibrated on bench/prompts.json, see docs/calibration.md). */
export const JUDGE_WEIGHT = 0.6;

/** Weight of web prevalence in the final score (calibrated on bench/prompts.json, see docs/calibration.md). */
export const WEB_WEIGHT = 0;

/**
 * Final Cliché Score: embedding distance blended with an LLM judge's verdict on mechanism overlap (0-10),
 * then optionally with web prevalence (0-10, "does this already exist out there?").
 * Embeddings see wording, the judge sees "is this the same idea in other words", the web sees "people already do this".
 * A missing component drops out: no judge = embedding only, no web check = embedding + judge.
 */
export function combineScores(
  embedding: number,
  overlap: number | undefined,
  judgeWeight = JUDGE_WEIGHT,
  web?: number,
  webWeight = WEB_WEIGHT,
): number {
  const to100 = (x: number) => Math.min(10, Math.max(0, x)) * 10;
  const base = overlap === undefined || !Number.isFinite(overlap) ? embedding : (1 - judgeWeight) * embedding + judgeWeight * to100(overlap);
  const total = web === undefined || !Number.isFinite(web) ? base : (1 - webWeight) * base + webWeight * to100(web);
  return Math.round(total);
}

/** Ranks with ties averaged (0-based). */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation, -1..1 (0 when either side is constant). */
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
