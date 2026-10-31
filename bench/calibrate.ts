/**
 * Day-2 calibration: build cliché clouds for bench/prompts.json, score hand-written anchors
 * (cliche / mid / far) and grid-search the Cliché Score parameters.
 *   bun run bench/calibrate.ts            -> bench/calibration.json + docs/calibration.md
 * Needs ANTHROPIC_API_KEY and/or GEMINI_API_KEY (embeddings: gemini-embedding-001).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { baseline } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, DEFAULT_PARAMS, type ScoreParams } from "../src/math.js";

type Band = "cliche" | "mid" | "far";
const BANDS: Band[] = ["cliche", "mid", "far"];
const inBand = (b: Band, s: number) => (b === "cliche" ? s >= 70 : b === "mid" ? s >= 30 && s <= 70 : s <= 35);

const set = JSON.parse(await readFile(new URL("./prompts.json", import.meta.url), "utf8")) as {
  prompts: ({ prompt: string } & Record<Band, string[]>)[];
};

const emb = embedder();
const rows: { prompt: string; cloudSize: number; models: string[]; density?: number; anchors: { band: Band; text: string; v: number[] }[] }[] = [];
for (const p of set.prompts) {
  const t0 = Date.now();
  const cloud = await baseline(p.prompt);
  const anchors = BANDS.flatMap((band) => p[band].map((text) => ({ band, text })));
  const vs = await emb.embed(anchors.map((a) => a.text));
  rows.push({ prompt: p.prompt, cloudSize: cloud.cliches.length, models: [...new Set(cloud.cliches.map((c) => c.model))], anchors: anchors.map((a, i) => ({ ...a, v: vs[i]! })) });
  (rows.at(-1) as any).cloud = cloud.vectors;
  console.error(`${cloud.cliches.length} clichés  ${Date.now() - t0}ms  ${p.prompt}`);
}

function evaluate(params: Partial<ScoreParams>) {
  let hits = 0, total = 0, pairs = 0, ordered = 0;
  const perBand: Record<Band, number[]> = { cliche: [], mid: [], far: [] };
  const detail = rows.map((r) => {
    const scored = r.anchors.map((a) => {
      const b = clicheScore(a.v, (r as any).cloud, params);
      perBand[a.band].push(b.cliche);
      total++;
      if (inBand(a.band, b.cliche)) hits++;
      return { band: a.band, text: a.text, cliche: b.cliche, density: b.density };
    });
    for (const x of scored) for (const y of scored) {
      if (BANDS.indexOf(x.band) < BANDS.indexOf(y.band)) { pairs++; if (x.cliche > y.cliche) ordered++; else if (x.cliche === y.cliche) ordered += 0.5; }
    }
    return { prompt: r.prompt, density: scored[0]?.density, scored };
  });
  const mean = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  return { params, bandAccuracy: hits / total, pairOrder: ordered / pairs, means: { cliche: mean(perBand.cliche), mid: mean(perBand.mid), far: mean(perBand.far) }, detail };
}

const grid: ReturnType<typeof evaluate>[] = [];
for (let k = 0.3; k <= 1.61; k += 0.1) for (let w = 0.4; w <= 1.01; w += 0.1)
  grid.push(evaluate({ spreadK: +k.toFixed(2), nearestWeight: +w.toFixed(2) }));
// Ordering is fixed by geometry for a given weight; band accuracy is what spreadK tunes. Rank by band accuracy, tie-break on order.
grid.sort((a, b) => b.bandAccuracy - a.bandAccuracy || b.pairOrder - a.pairOrder);
const best = grid[0]!;
const base = evaluate(DEFAULT_PARAMS);

await writeFile(new URL("./calibration.json", import.meta.url), JSON.stringify({
  date: new Date().toISOString(), embedder: emb.name,
  clouds: rows.map((r) => ({ prompt: r.prompt, size: r.cloudSize, models: r.models })),
  v0: { ...base, detail: base.detail }, best: { ...best }, top10: grid.slice(0, 10).map(({ detail, ...g }) => g),
}, null, 2));

const pct = (x: number) => `${Math.round(x * 100)}%`;
const md = [
  `# Cliché Score calibration (day 2)`, ``,
  `Date: ${new Date().toISOString().slice(0, 10)}. Embedder: ${emb.name}. Cloud models: ${[...new Set(rows.flatMap((r) => r.models))].join(", ")}.`,
  `Set: ${rows.length} prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.`, ``,
  `| params | band accuracy | pair order | mean cliché | mean mid | mean far |`, `|---|---|---|---|---|---|`,
  ...[["v0 (Day 1)", base], ["best", best], ...grid.slice(1, 5).map((g, i) => [`#${i + 2}`, g] as const)].map(([n, g]: any) =>
    `| ${n} k=${g.params.spreadK} w=${g.params.nearestWeight} | ${pct(g.bandAccuracy)} | ${pct(g.pairOrder)} | ${g.means.cliche} | ${g.means.mid} | ${g.means.far} |`),
  ``, `## Per prompt (best params)`, ``,
  `| prompt | density | cliché | mid | far |`, `|---|---|---|---|---|`,
  ...best.detail.map((d) => `| ${d.prompt} | ${d.density?.toFixed(3)} | ${BANDS.map((b) => d.scored.filter((s) => s.band === b).map((s) => s.cliche).join(" / ")).slice(0, 3).join(" | ")} |`),
  ``,
];
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
await writeFile(new URL("../docs/calibration.md", import.meta.url), md.join("\n"));
console.log(md.join("\n"));
