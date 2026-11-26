/**
 * Length experiment on the human AUT check (bench/human.ts must have run: clouds and embeddings are cached).
 *   NOT_OBVIOUS_EMBEDDER=local bun run bench/human-length.ts [plain|surprising]
 * Compares ways to keep answer length out of the Cliché Score, Spearman with human originality:
 *  raw        clicheScore (0..100, clipped)
 *  nearest    -nearestSim, continuous (no clipping)
 *  cloudfit   nearestSim minus the length trend fitted on the cloud itself (leave-one-out nearest sim of each
 *             cloud answer vs log word count); per idea, no human data and no other ideas needed
 *  batch      nearestSim residualised on log length over the scored ideas of the prompt (needs a batch of ideas)
 * plus length alone and the partial correlation of nearestSim with length held out.
 */
import { readFile } from "node:fs/promises";
import { baseline, embedCached } from "../src/engine.js";
import { clicheScore, cosine, spearman } from "../src/math.js";

const VARIANT = process.argv[2] ?? "plain";
const ask = (o: string) => (VARIANT === "plain" ? `List alternative uses for a ${o}, a few words each.` : `What is a surprising use for a ${o}?`);
const words = (t: string) => Math.max(1, t.trim().split(/\s+/).length);
const fit = (x: number[], y: number[]) => {
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i]! - my), 0);
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
};

import { rowsByObject } from "./human-data.js";
const out: Record<string, number[][]> = {};
const add = (k: string, xs: number[], h: number[]) => ((out[k] ??= []).push(...xs.map((x, i) => [x, h[i]!])));
const within: Record<string, number> = {};
let total = 0;
for (const [object, rows] of rowsByObject()) {
  const cloud = await baseline(ask(object), { perModel: 20 });
  const { vectors } = await embedCached(rows.map((r) => r.text));
  const h = rows.map((r) => r.human);
  const len = rows.map((r) => Math.log(words(r.text)));
  const near = vectors.map((v) => clicheScore(v, cloud.vectors).nearestSim);
  const raw = vectors.map((v) => clicheScore(v, cloud.vectors).cliche);
  // Cloud self-fit: each cloud answer against the rest of the cloud.
  const cl = cloud.vectors.map((v, i) => Math.max(...cloud.vectors.filter((_, j) => j !== i).map((u) => cosine(v, u))));
  const cf = fit(cloud.cliches.map((c) => Math.log(words(c.text))), cl);
  const cloudfit = near.map((s, i) => s - cf.b * len[i]!);
  const bf = fit(len, near);
  const batch = near.map((s, i) => s - bf.b * len[i]!);
  const variants: Record<string, number[]> = { raw: raw.map((x) => -x), nearest: near.map((x) => -x), cloudfit: cloudfit.map((x) => -x), batch: batch.map((x) => -x), length: len };
  for (const [k, xs] of Object.entries(variants)) {
    within[k] = (within[k] ?? 0) + spearman(xs, h) * rows.length;
    add(k, xs, h);
  }
  within.cloudSlope = (within.cloudSlope ?? 0) + cf.b * rows.length;
  within.batchSlope = (within.batchSlope ?? 0) + bf.b * rows.length;
  total += rows.length;
}
for (const k of Object.keys(within)) within[k] = within[k]! / total;
const pooled = Object.fromEntries(Object.entries(out).map(([k, xy]) => [k, spearman(xy.map((p) => p[0]!), xy.map((p) => p[1]!))]));
console.log(JSON.stringify({ variant: VARIANT, n: total, within, pooled }, null, 1));
