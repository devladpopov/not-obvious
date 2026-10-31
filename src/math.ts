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
 * so by default spread adapts to the cloud: 0.6 * (1 - density).
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

/** Calibrated on bench/prompts.json (docs/calibration.md): k 0.7 -> 0.6 lifts band accuracy 53% -> 60%. */
export const DEFAULT_PARAMS: ScoreParams = { spreadK: 0.6, nearestWeight: 0.7 };

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
