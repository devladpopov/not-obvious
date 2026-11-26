/**
 * Mechanism judge on the human AUT check (docs/human-calibration.md, "Judge on a sample").
 * Takes an evenly spaced sample of responses per object, asks the mechanism judge (the same prompt as src/engine.ts)
 * how much each one overlaps a cliché, and compares overlap, Cliché Score and their blends with the human rating.
 * The judge runs through a CLI (no API key): HJ_CMD, default the Claude Code OAuth wrapper with Haiku (the "fast" tier).
 *   NOT_OBVIOUS_EMBEDDER=local bun run bench/human-judge.ts [perObject=15] -> bench/human-judge.json
 * Verdicts are cached in research/human-data/judge-cache.json, so a rerun only asks for what is missing.
 */
import { readFile, writeFile } from "node:fs/promises";
import { baseline, embedCached, judgePrompt } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, spearman } from "../src/math.js";
import { claudeCli } from "./providers.js";
import { rowsByObject, type Row } from "./human-data.js";

const PER = Number(process.argv[2] ?? 15) || 15;
const CMD = process.env.HJ_CMD ?? "bash C:/Users/Vlad/bin/claude-oauth.sh --model haiku";
const CACHE = "research/human-data/judge-cache.json";
const ask = (object: string) => `List alternative uses for a ${object}, a few words each.`;
const words = (t: string) => t.split(/\s+/).length;

const cache: Record<string, number> = await readFile(CACHE, "utf8").then((t) => JSON.parse(t)).catch(() => ({}));
const call = claudeCli(CMD);

function parse(out: string, n: number): number[] {
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in judge output: ${out.slice(0, 200)}`);
  const items = (JSON.parse(m[0]) as { items: { overlap: number }[] }).items;
  if (items.length !== n) throw new Error(`judge returned ${items.length}/${n}`);
  return items.map((x) => Number(x.overlap));
}

type S = Row & { overlap?: number; object: string };
const sample: S[] = [];
const jobs: (() => Promise<void>)[] = [];
for (const [object, rows] of rowsByObject()) {
  const step = Math.max(1, rows.length / PER);
  const picked = Array.from({ length: Math.min(PER, rows.length) }, (_, i) => ({ ...rows[Math.floor(i * step)]!, object }));
  const prompt = ask(object);
  const cloud = await baseline(prompt, { perModel: 20 });
  const { vectors } = await embedCached(picked.map((r) => r.text));
  picked.forEach((r, i) => (r.cliche = clicheScore(vectors[i]!, cloud.vectors).cliche));
  sample.push(...picked);
  const key = (t: string) => `${object}\n${t}`;
  const missing = picked.filter((r) => cache[key(r.text)] === undefined);
  if (missing.length)
    jobs.push(async () => {
      const texts = missing.map((r) => r.text);
      const reply = `${judgePrompt(prompt, cloud.cliches.map((c) => c.text), texts)}\n\nReply with the JSON only, no prose, no code fences.`;
      for (let attempt = 1; ; attempt++) {
        try {
          parse(await call(reply), texts.length).forEach((o, i) => (cache[key(texts[i]!)] = o));
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          console.error(`${object}: retry ${attempt}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      await writeFile(CACHE, JSON.stringify(cache));
      console.log(`${object}: ${texts.length} judged`);
    });
}
await Promise.all(jobs.map((j) => j()));
sample.forEach((r) => (r.overlap = cache[`${r.object}\n${r.text}`]));

// Score where higher = more original, for each signal; blends as in src/math.ts finalScore (cliché 0-100, overlap*10).
const signals: Record<string, (r: S) => number> = {
  "cliche (embeddings)": (r) => -r.cliche!,
  "judge overlap": (r) => -r.overlap!,
  ...Object.fromEntries([0.25, 0.5, 0.75].map((j) => [`blend j=${j}`, (r: S) => -((1 - j) * r.cliche! + j * r.overlap! * 10)])),
  semdis: (r) => r.semdis,
  ocsai: (r) => r.ocsai ?? NaN,
  length: (r) => words(r.text),
};
const objects = [...new Set(sample.map((r) => r.object))];
const result: Record<string, { pooled: number; within: number; vsLength: number }> = {};
for (const [name, f] of Object.entries(signals)) {
  const ok = sample.filter((r) => !Number.isNaN(f(r)));
  let w = 0, n = 0;
  for (const o of objects) {
    const rs = ok.filter((r) => r.object === o);
    const rho = spearman(rs.map(f), rs.map((r) => r.human));
    if (!Number.isNaN(rho)) (w += rho * rs.length), (n += rs.length);
  }
  result[name] = { pooled: spearman(ok.map(f), ok.map((r) => r.human)), within: w / n, vsLength: spearman(ok.map(f), ok.map((r) => words(r.text))) };
}
const judgeVsCliche = spearman(sample.map((r) => r.overlap!), sample.map((r) => r.cliche!));
await writeFile("bench/human-judge.json", JSON.stringify({ n: sample.length, perObject: PER, judge: CMD.replace(/^.*\//, ""), embedder: embedder().name, judgeVsCliche, result }, null, 1));
console.table(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { pooled: v.pooled.toFixed(2), within: v.within.toFixed(2), vsLength: v.vsLength.toFixed(2) }])));
console.log(`n=${sample.length}, judge overlap vs Cliché Score rho=${judgeVsCliche.toFixed(2)}`);
