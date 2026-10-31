/**
 * Calibration: build cliché clouds for bench/prompts.json, score hand-written anchors
 * (cliche / mid / far) and grid-search the Cliché Score parameters.
 *   bun run bench/calibrate.ts            -> bench/calibration.json + docs/calibration.md
 * Needs ANTHROPIC_API_KEY and/or GEMINI_API_KEY (embeddings: gemini-embedding-001).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { baseline, judgeMechanism } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, combineScores, DEFAULT_PARAMS, JUDGE_WEIGHT, type ScoreParams } from "../src/math.js";

type Band = "cliche" | "mid" | "far";
const BANDS: Band[] = ["cliche", "mid", "far"];
const inBand = (b: Band, s: number) => (b === "cliche" ? s >= 70 : b === "mid" ? s >= 30 && s <= 70 : s <= 35);

const set = JSON.parse(await readFile(new URL("./prompts.json", import.meta.url), "utf8")) as {
  prompts: ({ prompt: string; relabel?: Record<string, Band | "drop"> } & Record<Band, string[]>)[];
};

const emb = embedder();
const rows: { prompt: string; cloudSize: number; models: string[]; density?: number; anchors: { band: Band | "drop"; orig: Band; text: string; v: number[]; overlap?: number }[] }[] = [];
for (const p of set.prompts) {
  const t0 = Date.now();
  const cloud = await baseline(p.prompt);
  // band = cloud-checked label (relabel), orig = the label the anchor was written with.
  const anchors = BANDS.flatMap((orig) => p[orig].map((text) => ({ orig, band: p.relabel?.[text] ?? orig, text })));
  const vs = await emb.embed(anchors.map((a) => a.text));
  const verdicts = await judgeMechanism(p.prompt, anchors.map((a) => a.text), cloud).catch((e) => (console.error(`judge failed: ${e.message}`), []));
  rows.push({ prompt: p.prompt, cloudSize: cloud.cliches.length, models: [...new Set(cloud.cliches.map((c) => c.model))], anchors: anchors.map((a, i) => ({ ...a, v: vs[i]!, overlap: verdicts[i]?.overlap })) });
  (rows.at(-1) as any).cloud = cloud.vectors;
  console.error(`${cloud.cliches.length} clichés  ${Date.now() - t0}ms  ${p.prompt}`);
}

function evaluate(params: Partial<ScoreParams>, judgeWeight = 0, labels: "checked" | "original" = "checked") {
  let hits = 0, total = 0, pairs = 0, ordered = 0;
  const perBand: Record<Band, number[]> = { cliche: [], mid: [], far: [] };
  const detail = rows.map((r) => {
    const scored = r.anchors.flatMap((a) => {
      const band = labels === "original" ? a.orig : a.band;
      if (band === "drop") return [];
      const b = clicheScore(a.v, (r as any).cloud, params);
      const cliche = combineScores(b.cliche, a.overlap, judgeWeight);
      perBand[band].push(cliche);
      total++;
      if (inBand(band, cliche)) hits++;
      return [{ band, text: a.text, cliche, embedding: b.cliche, overlap: a.overlap, density: b.density }];
    });
    for (const x of scored) for (const y of scored) {
      if (BANDS.indexOf(x.band) < BANDS.indexOf(y.band)) { pairs++; if (x.cliche > y.cliche) ordered++; else if (x.cliche === y.cliche) ordered += 0.5; }
    }
    return { prompt: r.prompt, density: scored[0]?.density, scored };
  });
  const mean = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  return { params: { ...params, judgeWeight }, labels, bandAccuracy: hits / total, pairOrder: ordered / pairs, means: { cliche: mean(perBand.cliche), mid: mean(perBand.mid), far: mean(perBand.far) }, detail };
}

const grid: ReturnType<typeof evaluate>[] = [];
for (let k = 0.3; k <= 1.61; k += 0.1) for (let w = 0.4; w <= 1.01; w += 0.1) for (const jw of [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1])
  grid.push(evaluate({ spreadK: +k.toFixed(2), nearestWeight: +w.toFixed(2) }, jw));
// Pair order is threshold-free (does a cliché outrank a mid, a mid a far?); band accuracy checks the 70/35 thresholds. Rank by their sum.
grid.sort((a, b) => b.bandAccuracy + b.pairOrder - (a.bandAccuracy + a.pairOrder));
const best = grid[0]!;
const base = evaluate(DEFAULT_PARAMS);
const current = evaluate(DEFAULT_PARAMS, JUDGE_WEIGHT);
const judgeOnly = evaluate(DEFAULT_PARAMS, 1);
const original = [evaluate(DEFAULT_PARAMS, 0, "original"), evaluate(DEFAULT_PARAMS, JUDGE_WEIGHT, "original"), evaluate(DEFAULT_PARAMS, 1, "original")];

await writeFile(new URL("./calibration.json", import.meta.url), JSON.stringify({
  date: new Date().toISOString(), embedder: emb.name,
  clouds: rows.map((r) => ({ prompt: r.prompt, size: r.cloudSize, models: r.models })),
  embeddingOnly: base, current, judgeOnly, originalLabels: original.map(({ detail, ...g }) => g), best: { ...best }, top10: grid.slice(0, 10).map(({ detail, ...g }) => g),
}, null, 2));

const pct = (x: number) => `${Math.round(x * 100)}%`;
const md = [
  `# Cliché Score calibration`, ``,
  `Date: ${new Date().toISOString().slice(0, 10)}. Embedder: ${emb.name}. Cloud models: ${[...new Set(rows.flatMap((r) => r.models))].join(", ")}.`,
  `Set: ${rows.length} prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.`, ``,
  `Labels: cloud-checked (anchors the cloud already contains count as clichés, see "relabel" in prompts.json); the last three rows use the labels as originally written.`, ``,
  `| params (k = spread, w = nearest weight, j = judge weight) | band accuracy | pair order | mean cliché | mean mid | mean far |`, `|---|---|---|---|---|---|`,
  ...[["embedding only", base], ["judge only", judgeOnly], [`current default`, current], ["best", best], ...grid.slice(1, 5).map((g, i) => [`#${i + 2}`, g] as const),
    ["original labels, embedding only", original[0]], ["original labels, current default", original[1]], ["original labels, judge only", original[2]]].map(([n, g]: any) =>
    `| ${n} k=${g.params.spreadK} w=${g.params.nearestWeight} j=${g.params.judgeWeight} | ${pct(g.bandAccuracy)} | ${pct(g.pairOrder)} | ${g.means.cliche} | ${g.means.mid} | ${g.means.far} |`),
  ``, `## Per prompt (current default)`, ``,
  `| prompt | density | cliché | mid | far |`, `|---|---|---|---|---|`,
  ...current.detail.map((d) => `| ${d.prompt} | ${d.density?.toFixed(3)} | ${BANDS.map((b) => d.scored.filter((s) => s.band === b).map((s) => s.cliche).join(" / ")).slice(0, 3).join(" | ")} |`),
  ``,
];
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
// Hand-written findings below "## Findings" survive regeneration.
const docUrl = new URL("../docs/calibration.md", import.meta.url);
const prev = await readFile(docUrl, "utf8").catch(() => "");
const findings = prev.includes("## Findings") ? prev.slice(prev.indexOf("## Findings")) : "";
await writeFile(docUrl, md.join("\n") + (findings ? `\n${findings}` : ""));
console.log(md.join("\n"));
