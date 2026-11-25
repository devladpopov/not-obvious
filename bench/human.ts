/**
 * External check against human originality ratings.
 * Data: Organisciak, Acar, Dumas, Berthiaume (2023), "Beyond Semantic Distance", MIT,
 * https://github.com/massivetexts/llm_aut_study (results/evaluation.zip, gt_main2 test split):
 * Alternate Uses Task responses for 21 objects, each with a human originality rating (1-5).
 * The same rows carry the predictions of SemDis (semantic distance) and Ocsai (fine-tuned GPT-3),
 * so all three are compared on identical data.
 *   NOT_OBVIOUS_EMBEDDER=local bun run bench/human.ts [maxPerPrompt|0] [plain|surprising] -> bench/human-<variant>.json + research/human-data/report-<variant>.md (summary: docs/human-calibration.md)
 * Expects research/human-data/raw/evaluation.zip (download link above).
 * Embedding-only Cliché Score (no judge, critic or web): the cloud is what the models answer
 * to the same AUT prompt; a response far from that cloud should be rated more original.
 */
import { readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { baseline, embedCached } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, spearman } from "../src/math.js";

const ZIP = "research/human-data/raw/evaluation.zip";
const MAX = Number(process.argv[2] ?? 0) || Infinity;
/** Cloud prompt variants: "plain" mirrors the AUT question people answered, "surprising" asks the models for unusual uses. */
const VARIANT = (process.argv[3] ?? "plain") as "plain" | "surprising";
const ask = (object: string) => (VARIANT === "plain" ? `List alternative uses for a ${object}, a few words each.` : `What is a surprising use for a ${object}?`);

/** Minimal zip reader (central directory, deflate or stored). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(lStart, lStart + size);
    if (!name.endsWith("/")) out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

const files = unzip(await readFile(ZIP));
const csv = (name: string) => parseCsv(files.get(`evaluation/gt_main2/${name}.csv`)!.toString("utf8"));
const semdis = csv("SemDis_MEAN");
// Ocsai = the paper's best model (GPT-3 davinci fine-tuned on human ratings); ocs-main is the earlier semantic-distance system.
const ocsai = new Map(csv("gpt-ft-davinci-1").filter((r) => r.predicted !== "").map((r) => [r.id, Number(r.predicted)]));
const withText = new Map(csv("SemDis_TASA_nf_m").map((r) => [r.id, r.response]));

type Row = { id: string; object: string; text: string; human: number; semdis: number; ocsai?: number; cliche?: number };
const byObject = new Map<string, Row[]>();
for (const r of semdis) {
  const text = (r.response || withText.get(r.id!) || "").trim();
  if (!text) continue;
  const list = byObject.get(r.prompt!) ?? [];
  list.push({ id: r.id!, object: r.prompt!, text, human: Number(r.target), semdis: Number(r.predicted), ocsai: ocsai.get(r.id!) });
  byObject.set(r.prompt!, list);
}

const emb = embedder().name;
const all: Row[] = [];
const perPrompt: { object: string; n: number; cloud: number; models: string[]; rho: { cliche: number; semdis: number; ocsai: number; length: number } }[] = [];
for (const [object, rowsAll] of [...byObject].sort((a, b) => b[1].length - a[1].length)) {
  const rows = rowsAll.slice(0, MAX);
  const prompt = ask(object);
  const t0 = Date.now();
  const cloud = await baseline(prompt, { perModel: 20 });
  const { vectors } = await embedCached(rows.map((r) => r.text));
  rows.forEach((r, i) => (r.cliche = clicheScore(vectors[i]!, cloud.vectors).cliche));
  const h = rows.map((r) => r.human);
  const rho = {
    cliche: spearman(rows.map((r) => -r.cliche!), h),
    semdis: spearman(rows.map((r) => r.semdis), h),
    ocsai: rows.every((r) => r.ocsai !== undefined) ? spearman(rows.map((r) => r.ocsai!), h) : NaN,
    length: spearman(rows.map((r) => r.text.split(/\s+/).length), h),
  };
  perPrompt.push({ object, n: rows.length, cloud: cloud.cliches.length, models: [...new Set(cloud.cliches.map((c) => c.model))], rho });
  all.push(...rows);
  console.log(`${object}: n=${rows.length} cloud=${cloud.cliches.length} rho cliche=${rho.cliche.toFixed(2)} semdis=${rho.semdis.toFixed(2)} ocsai=${rho.ocsai.toFixed(2)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const h = all.map((r) => r.human);
const pooled = {
  cliche: spearman(all.map((r) => -r.cliche!), h),
  semdis: spearman(all.map((r) => r.semdis), h),
  ocsai: spearman(all.filter((r) => r.ocsai !== undefined).map((r) => r.ocsai!), all.filter((r) => r.ocsai !== undefined).map((r) => r.human)),
  length: spearman(all.map((r) => r.text.split(/\s+/).length), h),
  clicheVsLength: spearman(all.map((r) => r.cliche!), all.map((r) => r.text.split(/\s+/).length)),
};
// Weighted mean of within-prompt correlations: what matters when ranking ideas for one prompt.
const n = perPrompt.reduce((s, p) => s + p.n, 0);
const within = Object.fromEntries((["cliche", "semdis", "ocsai", "length"] as const).map((k) => [k, perPrompt.reduce((s, p) => s + (Number.isNaN(p.rho[k]) ? 0 : p.rho[k] * p.n), 0) / n]));
// Bands: share of top-human (>=3) responses among the 20% lowest Cliché Score.
const sorted = [...all].sort((a, b) => a.cliche! - b.cliche!);
const k = Math.round(all.length / 5);
const hiShare = (xs: Row[]) => xs.filter((r) => r.human >= 3).length / xs.length;
const bands = { lowest20: hiShare(sorted.slice(0, k)), highest20: hiShare(sorted.slice(-k)), all: hiShare(all) };

await writeFile(`bench/human-${VARIANT}.json`, JSON.stringify({ variant: VARIANT, cloudPrompt: ask("<object>"), source: "github.com/massivetexts/llm_aut_study gt_main2 (MIT)", embedder: emb, n: all.length, pooled, within, bands, perPrompt }, null, 1));

const f = (x: number) => (Number.isNaN(x) ? "n/a" : x.toFixed(2));
const md = `# External check: human originality ratings

Data: ${all.length} Alternate Uses Task responses for ${perPrompt.length} objects from Organisciak, Acar, Dumas and Berthiaume (2023), *Beyond Semantic Distance* ([repo](https://github.com/massivetexts/llm_aut_study), MIT, test split \`gt_main2\`). Each response has a human originality rating from 1 to 5. The same rows carry predictions of SemDis (semantic distance from the object) and Ocsai (a GPT-3 model fine-tuned on human ratings), so the three are compared on identical data.

Not Obvious never saw these ratings: the Cliché Score here is embedding-only (no judge, critic or web), the cloud is what the models answer to "${ask("<object>")}", embedder \`${emb}\`. Reproduce: \`bun run bench/human.ts\`.

Spearman correlation with the human rating (higher = agrees with people; for Cliché Score the sign is flipped, low cliché = original):

| | Cliché Score | SemDis | Ocsai (trained on ratings) | Response length |
|---|---|---|---|---|
| Within prompt, weighted mean | ${f(within.cliche!)} | ${f(within.semdis!)} | ${f(within.ocsai!)} | ${f(within.length!)} |
| Pooled | ${f(pooled.cliche)} | ${f(pooled.semdis)} | ${f(pooled.ocsai)} | ${f(pooled.length)} |

Share of responses rated 3+ by people: ${(bands.all * 100).toFixed(0)}% overall, ${(bands.lowest20 * 100).toFixed(0)}% among the 20% with the lowest Cliché Score, ${(bands.highest20 * 100).toFixed(0)}% among the 20% with the highest.

## Per object

| Object | n | Cloud | Cliché Score | SemDis | Ocsai |
|---|---|---|---|---|---|
${perPrompt.map((p) => `| ${p.object} | ${p.n} | ${p.cloud} | ${f(p.rho.cliche)} | ${f(p.rho.semdis)} | ${f(p.rho.ocsai)} |`).join("\n")}

## Reading

Ocsai is supervised on this kind of rating and is the ceiling here. SemDis is the classic unsupervised baseline. Cliché Score is unsupervised too, but measures distance from what AI answers rather than from the object word, which is the question Not Obvious asks. AUT originality ratings also reward elaboration, hence the length column.
`;
await writeFile(`research/human-data/report-${VARIANT}.md`, md);
console.log(JSON.stringify({ n: all.length, pooled, within, bands }));
