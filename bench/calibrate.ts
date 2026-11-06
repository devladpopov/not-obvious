/**
 * Calibration: build cliché clouds for bench/prompts.json, score hand-written anchors
 * (cliche / mid / far) and grid-search the Cliché Score parameters.
 *   bun run bench/calibrate.ts            -> bench/calibration.json + docs/calibration.md
 *   bun run bench/calibrate.ts set20      -> bench/calibration-set20.json + docs/calibration-set20.md (blind-labelled set, see build-set20.ts)
 *   bun run bench/calibrate.ts all        -> both sets pooled (cross-validation holds out a prompt from both), used to pick the defaults
 *   bun run bench/calibrate.ts all-ru     -> the same in Russian (bench/translate-ru.ts)
 * Needs ANTHROPIC_API_KEY and/or GEMINI_API_KEY (embeddings: gemini-embedding-001).
 *   NOT_OBVIOUS_EMBEDDER=local [NOT_OBVIOUS_LOCAL_MODEL=...] -> same with a local model; clouds cached for gemini are re-embedded, no model calls.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { baseline, embedCached, judgeMechanism } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, combineScores, DEFAULT_PARAMS, JUDGE_WEIGHT, spearman, WEB_WEIGHT, type ScoreParams } from "../src/math.js";
import { webCheck, webMode } from "../src/web.js";

const CACHE = process.env.NOT_OBVIOUS_CACHE?.trim() || "research/clouds";

type Band = "cliche" | "mid" | "far";
const BANDS: Band[] = ["cliche", "mid", "far"];
const inBand = (b: Band, s: number) => (b === "cliche" ? s >= 70 : b === "mid" ? s >= 30 && s <= 70 : s <= 35);

const SET = process.argv[2] ?? "prompts";
const emb = embedder();
// Runs with another embedder (NOT_OBVIOUS_EMBEDDER=local) write next to the default ones instead of over them.
const suffix = (SET === "prompts" ? "" : `-${SET}`) + (emb.name === "gemini-embedding-001" ? "" : `-${emb.name}`);
type SetFile = {
  /** labels: continuous originality per idea (1-7, higher = more original), when the set has them. */
  prompts: ({ prompt: string; relabel?: Record<string, Band | "drop">; labels?: Record<string, number> } & Record<Band, string[]>)[];
};
const SOURCES = SET === "all" ? ["prompts", "set20"] : SET === "all-ru" ? ["prompts-ru", "set20-ru"] : [SET];
const set: SetFile = { prompts: [] };
for (const name of SOURCES) set.prompts.push(...(JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), "utf8")) as SetFile).prompts);
const hasRelabel = set.prompts.some((p) => p.relabel);
const hasLabels = set.prompts.some((p) => p.labels);

const rows: { prompt: string; cloudSize: number; models: string[]; density?: number; anchors: { band: Band | "drop"; orig: Band; text: string; label?: number; v: number[]; overlap?: number; web?: number }[] }[] = [];
for (const p of set.prompts) {
  const t0 = Date.now();
  const cloud = await baseline(p.prompt);
  // band = cloud-checked label (relabel), orig = the label the anchor was written with.
  const anchors = BANDS.flatMap((orig) => p[orig].map((text) => ({ orig, band: p.relabel?.[text] ?? orig, text, label: p.labels?.[text] })));
  const { vectors: vs } = await embedCached(anchors.map((a) => a.text));
  const verdicts = await judgeMechanism(p.prompt, anchors.map((a) => a.text), cloud).catch((e) => (console.error(`judge failed: ${e.message}`), []));
  const web = await webCheck(p.prompt, anchors.map((a) => a.text), CACHE);
  rows.push({ prompt: p.prompt, cloudSize: cloud.cliches.length, models: [...new Set(cloud.cliches.map((c) => c.model))], anchors: anchors.map((a, i) => ({ ...a, v: vs[i]!, overlap: verdicts[i]?.overlap, web: web[i]?.prevalence })) });
  (rows.at(-1) as any).cloud = cloud.vectors;
  console.error(`${cloud.cliches.length} clichés  ${Date.now() - t0}ms  ${p.prompt}`);
}

// Embedding scores depend only on (spreadK, nearestWeight): computed once per pair, the grid and cross-validation reuse them.
const embMemo = new Map<string, ReturnType<typeof clicheScore>>();
const embScore = (params: Partial<ScoreParams>, ri: number, ai: number) => {
  const key = `${params.spreadK}|${params.nearestWeight}|${ri}|${ai}`;
  let b = embMemo.get(key);
  if (!b) embMemo.set(key, (b = clicheScore(rows[ri]!.anchors[ai]!.v, (rows[ri] as any).cloud, params)));
  return b;
};

function evaluate(params: Partial<ScoreParams>, judgeWeight = 0, labels: "checked" | "original" = "checked", webWeight = 0, only?: (ri: number) => boolean) {
  let hits = 0, total = 0, pairs = 0, ordered = 0;
  const rhos: number[] = [];
  const perBand: Record<Band, number[]> = { cliche: [], mid: [], far: [] };
  const detail = rows.flatMap((r, ri) => {
    if (only && !only(ri)) return [];
    const scored = r.anchors.flatMap((a, ai) => {
      const band = labels === "original" ? a.orig : a.band;
      if (band === "drop") return [];
      const b = embScore(params, ri, ai);
      const cliche = combineScores(b.cliche, a.overlap, judgeWeight, a.web, webWeight);
      perBand[band].push(cliche);
      total++;
      if (inBand(band, cliche)) hits++;
      return [{ band, text: a.text, cliche, embedding: b.cliche, overlap: a.overlap, web: a.web, density: b.density }];
    });
    // Threshold-free check against continuous labels: higher originality should mean a lower Cliché Score.
    const labelled = r.anchors.filter((a) => a.label !== undefined && a.band !== "drop");
    if (labelled.length === scored.length && scored.length > 2) rhos.push(spearman(scored.map((s) => s.cliche), labelled.map((a) => -a.label!)));
    for (const x of scored) for (const y of scored) {
      if (BANDS.indexOf(x.band) < BANDS.indexOf(y.band)) { pairs++; if (x.cliche > y.cliche) ordered++; else if (x.cliche === y.cliche) ordered += 0.5; }
    }
    return [{ prompt: r.prompt, density: scored[0]?.density, scored }];
  });
  const mean = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  return { params: { ...params, judgeWeight, webWeight }, labels, counts: { hits, total, pairs, ordered }, spearman: rhos.length ? rhos.reduce((s, x) => s + x, 0) / rhos.length : undefined, bandAccuracy: hits / total, pairOrder: ordered / pairs, means: { cliche: mean(perBand.cliche), mid: mean(perBand.mid), far: mean(perBand.far) }, detail };
}

const grid: ReturnType<typeof evaluate>[] = [];
for (let k = 0.3; k <= 1.61; k += 0.1) for (let w = 0.4; w <= 1.01; w += 0.1) for (const jw of [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1]) for (const ww of [0, 0.1, 0.2, 0.3, 0.4])
  grid.push(evaluate({ spreadK: +k.toFixed(2), nearestWeight: +w.toFixed(2) }, jw, "checked", ww));
// Pair order is threshold-free (does a cliché outrank a mid, a mid a far?); band accuracy checks the 70/35 thresholds. Rank by their sum.
grid.sort((a, b) => b.bandAccuracy + b.pairOrder - (a.bandAccuracy + a.pairOrder));
const best = grid[0]!;

/**
 * Leave-one-prompt-out: pick the best parameters on 9 prompts, score the held-out one, sum over folds.
 * An honest estimate of what a component adds, since a few hundred labels and a big grid overfit easily.
 */
function crossValidate(allowed: (g: (typeof grid)[number]) => boolean) {
  const sum = { hits: 0, total: 0, pairs: 0, ordered: 0 };
  const picks: string[] = [];
  const rhos: number[] = [];
  const cands = grid.filter(allowed);
  // Fold = prompt text, so a prompt present in both pooled sets is held out from both.
  [...new Set(rows.map((r) => r.prompt))].forEach((heldPrompt) => {
    const isHeld = (ri: number) => rows[ri]!.prompt === heldPrompt;
    let top: (typeof grid)[number] | undefined, topV = -1;
    for (const g of cands) {
      const p = g.params;
      const e = evaluate({ spreadK: p.spreadK, nearestWeight: p.nearestWeight }, p.judgeWeight, "checked", p.webWeight, (ri) => !isHeld(ri));
      const v = e.bandAccuracy + e.pairOrder;
      if (v > topV) (topV = v), (top = g);
    }
    const p = top!.params;
    const e = evaluate({ spreadK: p.spreadK, nearestWeight: p.nearestWeight }, p.judgeWeight, "checked", p.webWeight, isHeld);
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += e.counts[k];
    if (e.spearman !== undefined) rhos.push(e.spearman);
    picks.push(`k=${p.spreadK} w=${p.nearestWeight} j=${p.judgeWeight} web=${p.webWeight}`);
  });
  return { bandAccuracy: sum.hits / sum.total, pairOrder: sum.ordered / sum.pairs, spearman: rhos.length ? rhos.reduce((s, x) => s + x, 0) / rhos.length : undefined, picks };
}
const cv = {
  embeddingOnly: crossValidate((g) => g.params.judgeWeight === 0 && g.params.webWeight === 0),
  embeddingJudge: crossValidate((g) => g.params.webWeight === 0),
  embeddingJudgeWeb: crossValidate(() => true),
};
console.error("cross-validation:", JSON.stringify(Object.fromEntries(Object.entries(cv).map(([k, v]) => [k, { band: v.bandAccuracy.toFixed(3), pair: v.pairOrder.toFixed(3), rho: v.spearman?.toFixed(3) }]))));
const base = evaluate(DEFAULT_PARAMS);
const current = evaluate(DEFAULT_PARAMS, JUDGE_WEIGHT, "checked", WEB_WEIGHT);
// Web prevalence on top of the current embedding + judge blend, and alone.
const webSweep = [0.1, 0.2, 0.3, 0.5].map((ww) => evaluate(DEFAULT_PARAMS, JUDGE_WEIGHT, "checked", ww));
const webOnly = evaluate(DEFAULT_PARAMS, 0, "checked", 1);
const webCoverage = rows.flatMap((r) => r.anchors).filter((a) => a.web !== undefined).length;
const judgeOnly = evaluate(DEFAULT_PARAMS, 1);
// The best spread / nearest weight with the web component missing: what users get from `score` without web: true.
const bestNoWeb = evaluate({ spreadK: best.params.spreadK, nearestWeight: best.params.nearestWeight }, best.params.judgeWeight);
const original = !hasRelabel ? [] : [evaluate(DEFAULT_PARAMS, 0, "original"), evaluate(DEFAULT_PARAMS, JUDGE_WEIGHT, "original"), evaluate(DEFAULT_PARAMS, 1, "original")];

await writeFile(new URL(`./calibration${suffix}.json`, import.meta.url), JSON.stringify({
  date: new Date().toISOString(), embedder: emb.name,
  clouds: rows.map((r) => ({ prompt: r.prompt, size: r.cloudSize, models: r.models })),
  crossValidation: cv,
  web: { mode: webMode(), coverage: webCoverage, sweep: webSweep.map(({ detail, ...g }) => g), webOnly: (({ detail, ...g }) => g)(webOnly) },
  embeddingOnly: base, current, judgeOnly, originalLabels: original.map(({ detail, ...g }) => g), best: { ...best }, bestNoWeb: (({ detail, ...g }) => g)(bestNoWeb), top10: grid.slice(0, 10).map(({ detail, ...g }) => g),
}, null, 2));

const pct = (x: number) => `${Math.round(x * 100)}%`;
const md = [
  `# Cliché Score calibration`, ``,
  `Date: ${new Date().toISOString().slice(0, 10)}. Embedder: ${emb.name}. Cloud models: ${[...new Set(rows.flatMap((r) => r.models))].join(", ")}.`,
  ...(SET === "prompts"
    ? [`Set: ${rows.length} prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.`, ``,
       `Labels: cloud-checked (anchors the cloud already contains count as clichés, see "relabel" in prompts.json); the last three rows use the labels as originally written.`, ``]
    : [`Set: ${rows.length} prompt rows, ${rows.reduce((s, r) => s + r.anchors.length, 0)} ideas, see ${SOURCES.map((n) => `bench/${n}.json`).join(" + ")}.${SET === "all" || SET === "all-ru" ? " Bands: cloud-checked hand labels (prompts.json) and" : ""} Bands from blind judge ratings (originality 1-7: <= 2.5 cliché, >= 4.5 far). Targets: cliché >= 70, mid 30-70, far <= 35.`, ``,
       `rho = mean per-prompt Spearman between the Cliché Score and the judges' originality (sign flipped, 1 = same order).`, ``]),
  `Web check: ${webMode()}, ${webCoverage} of ${rows.reduce((s, r) => s + r.anchors.length, 0)} anchors rated.`, ``,
  `| params (k = spread, w = nearest weight, j = judge weight, web = web prevalence weight) | band accuracy | pair order | rho | mean cliché | mean mid | mean far |`, `|---|---|---|---|---|---|---|`,
  ...[["embedding only", base], ["judge only", judgeOnly], ["web only", webOnly], [`current default`, current], ...webSweep.map((g) => [`current + web ${g.params.webWeight}`, g] as const), ["best", best], ["best without web", bestNoWeb], ...grid.slice(1, 5).map((g, i) => [`#${i + 2}`, g] as const),
    ...(hasRelabel ? [["original labels, embedding only", original[0]], ["original labels, current default", original[1]], ["original labels, judge only", original[2]]] : [])].map(([n, g]: any) =>
    `| ${n} k=${g.params.spreadK} w=${g.params.nearestWeight} j=${g.params.judgeWeight} web=${g.params.webWeight ?? 0} | ${pct(g.bandAccuracy)} | ${pct(g.pairOrder)} | ${g.spearman?.toFixed(2) ?? "-"} | ${g.means.cliche} | ${g.means.mid} | ${g.means.far} |`),
  ``, `Leave-one-prompt-out cross-validation (parameters picked on the other prompts, scored on the held-out one):`, ``,
  `| components | band accuracy | pair order | rho |`, `|---|---|---|---|`,
  ...([["embedding", cv.embeddingOnly], ["embedding + judge", cv.embeddingJudge], ["embedding + judge + web", cv.embeddingJudgeWeb]] as const).map(([n, c]) => `| ${n} | ${pct(c.bandAccuracy)} | ${pct(c.pairOrder)} | ${c.spearman?.toFixed(2) ?? "-"} |`),
  ``, `## Per prompt (current default)`, ``,
  `| prompt | density | cliché | mid | far |`, `|---|---|---|---|---|`,
  ...current.detail.map((d) => `| ${d.prompt} | ${d.density?.toFixed(3)} | ${BANDS.map((b) => d.scored.filter((s) => s.band === b).map((s) => s.cliche).join(" / ")).slice(0, 3).join(" | ")} |`),
  ``,
];
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
// Hand-written findings below "## Findings" survive regeneration.
const docUrl = new URL(`../docs/calibration${suffix}.md`, import.meta.url);
const prev = await readFile(docUrl, "utf8").catch(() => "");
const findings = prev.includes("## Findings") ? prev.slice(prev.indexOf("## Findings")) : "";
await writeFile(docUrl, md.join("\n") + (findings ? `\n${findings}` : ""));
console.log(md.join("\n"));
