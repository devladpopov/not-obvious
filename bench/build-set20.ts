/**
 * Day-6 calibration set: 20 prompts x 10 ideas, labelled blind by three judges.
 *   bun run bench/build-set20.ts   -> bench/set20.json (+ bench/set20-blind.csv for a human rater)
 * 1. A generator (claude-sonnet-5-5) writes 10 answers per prompt across a range: 3 obvious, 4 with a twist, 3 rare.
 *    The intended kind is kept as "author" but never shown to the judges.
 * 2. Judges see the prompt and the ideas in a shuffled order, no cloud, no scores, no kinds, and rate originality 1-7.
 *    Judges: claude-opus-5-5, claude-sonnet-5-5 (fresh context, does not know it wrote them), Gemini.
 *    claude-haiku-5-5 is left out on purpose: it is the mechanism judge inside the Cliché Score.
 * 3. Bands from the judge mean: <= 2.5 cliché, >= 4.5 far, mid in between. Same shape as prompts.json.
 * Every step is cached in set20.json, so a re-run only fills gaps.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { geminiProvider, parseJson } from "../src/llm.js";
import { spearman } from "../src/math.js";

const OLD = JSON.parse(await readFile(new URL("./prompts.json", import.meta.url), "utf8")).prompts.map((p: { prompt: string }) => p.prompt) as string[];
const NEW = [
  "Suggest a weekend project to teach kids about money",
  "How can a public library stay relevant?",
  "Ideas for a team-building activity for software engineers",
  "How can a restaurant reduce food waste?",
  "Suggest a gift for a grandmother who has everything",
  "How can a university improve student retention?",
  "Ideas for a podcast about history",
  "How can a small town attract young residents?",
  "How can a city get more people to commute by bike?",
  "Ideas for a mobile game to play during a commute",
];
const PROMPTS = [...OLD, ...NEW];

type Kind = "obvious" | "twist" | "rare";
type Band = "cliche" | "mid" | "far";
interface Idea {
  text: string;
  author: Kind;
  judges: Record<string, number>;
  mean?: number;
}
interface Entry {
  prompt: string;
  generator: string;
  ideas: Idea[];
  /** Shuffled order shown to judges (indices into ideas). */
  order: number[];
}

const GENERATOR = "claude-sonnet-5-5";
const JUDGES = ["claude-opus-5-5", "claude-sonnet-5-5", "gemini"];

const file = new URL("./set20.json", import.meta.url);
const prev = await readFile(file, "utf8").then((t) => JSON.parse(t) as { entries: Entry[] }).catch(() => ({ entries: [] as Entry[] }));
const entries = new Map(prev.entries.map((e) => [e.prompt, e]));
const save = async () => {
  const list = PROMPTS.flatMap((p) => (entries.has(p) ? [entries.get(p)!] : []));
  await writeFile(file, JSON.stringify({ note: NOTE, judges: JUDGES, generator: GENERATOR, entries: list, prompts: list.map(toBands) }, null, 2));
};
const NOTE =
  "Day-6 blind calibration set. ideas[].author = kind the generator was asked for (never shown to judges); judges = originality 1-7 per judge; mean = judge average. prompts[] = same shape as prompts.json, bands from mean: <= 2.5 cliche, >= 4.5 far, mid in between.";

const client = new Anthropic({ timeout: 120_000, maxRetries: 3 });

async function claudeJson<T extends z.ZodObject>(model: string, prompt: string, schema: T): Promise<z.infer<T>> {
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    // Opus 5.5 always thinks; low effort is plenty for rating a list.
    ...(model.includes("opus") ? { output_config: { effort: "low" as const, format: zodOutputFormat(schema) } } : { output_config: { format: zodOutputFormat(schema) } }),
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason !== "end_turn") throw new Error(`${model} stopped: ${res.stop_reason}`);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return schema.parse(parseJson<unknown>(text));
}

const GenSchema = z.object({ items: z.array(z.object({ idea: z.string(), kind: z.enum(["obvious", "twist", "rare"]) })) });
const RateSchema = z.object({ items: z.array(z.object({ n: z.number(), originality: z.number() })) });

async function generate(prompt: string): Promise<Entry> {
  const ask = `Task: ${prompt}\n\nWrite 10 different answers to this task, spread across originality:\n- 3 "obvious": what almost any person or chatbot would suggest first\n- 4 "twist": a known idea with a genuine twist\n- 3 "rare": workable, concrete, and something almost nobody would think of\nEach answer max 30 words, stated plainly (no hype words that signal originality). Return JSON {"items": [{"idea": string, "kind": "obvious" | "twist" | "rare"}]}.`;
  const r = await claudeJson(GENERATOR, ask, GenSchema);
  if (r.items.length !== 10) throw new Error(`generator returned ${r.items.length}/10`);
  const ideas = r.items.map((x) => ({ text: x.idea.trim(), author: x.kind as Kind, judges: {} }));
  // Deterministic shuffle per prompt (seeded by its text), so re-runs show the same order.
  let seed = [...prompt].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const order = ideas.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { prompt, generator: GENERATOR, ideas, order };
}

const RUBRIC = `Rate the ORIGINALITY of each idea for this task on a 1-7 scale:
1 = the first thing anyone or any chatbot would suggest
2 = a common, well-known suggestion
3 = a known idea with a small twist
4 = a known idea with a real twist, not obvious
5 = unusual, few people would suggest it
6 = surprising and still workable
7 = almost nobody would think of it, and it would work
Judge originality only, not quality. Rate each idea independently.`;

async function rate(judge: string, e: Entry): Promise<number[]> {
  const list = e.order.map((ix, n) => `${n + 1}. ${e.ideas[ix]!.text}`).join("\n");
  const ask = `Task: ${e.prompt}\n\n${RUBRIC}\n\nIdeas:\n${list}\n\nReturn JSON {"items": [{"n": number (idea number), "originality": number}]} for all ${e.order.length} ideas.`;
  let items: { n: number; originality: number }[];
  if (judge === "gemini") {
    const g = geminiProvider();
    if (!g) throw new Error("no GEMINI_API_KEY");
    items = RateSchema.parse(parseJson<unknown>(await g.complete(ask, { tier: "smart", json: true, schema: RateSchema }))).items;
  } else {
    items = (await claudeJson(judge, ask, RateSchema)).items;
  }
  const out = new Array<number>(e.ideas.length).fill(NaN);
  for (const it of items) {
    const ix = e.order[it.n - 1];
    if (ix !== undefined) out[ix] = Math.min(7, Math.max(1, it.originality));
  }
  if (out.some((x) => !Number.isFinite(x))) throw new Error(`${judge} rated ${items.length}/${e.ideas.length}`);
  return out;
}

const band = (m: number): Band => (m <= 2.5 ? "cliche" : m >= 4.5 ? "far" : "mid");
function toBands(e: Entry) {
  const pick = (b: Band) => e.ideas.filter((i) => i.mean !== undefined && band(i.mean) === b).map((i) => i.text);
  return { prompt: e.prompt, cliche: pick("cliche"), mid: pick("mid"), far: pick("far"), labels: Object.fromEntries(e.ideas.map((i) => [i.text, i.mean])) };
}

for (const p of PROMPTS) {
  if (!entries.has(p)) {
    entries.set(p, await generate(p));
    await save();
    console.error(`generated  ${p}`);
  }
}
// Judges per prompt in parallel; a judge that fails on a prompt is retried on the next run.
await Promise.all(
  PROMPTS.map(async (p) => {
    const e = entries.get(p)!;
    await Promise.all(
      JUDGES.filter((j) => e.ideas.some((i) => i.judges[j] === undefined)).map(async (j) => {
        try {
          const r = await rate(j, e);
          e.ideas.forEach((i, k) => (i.judges[j] = r[k]!));
        } catch (err) {
          console.error(`judge ${j} failed on "${p}": ${(err as Error).message}`);
        }
      }),
    );
    for (const i of e.ideas) {
      const v = Object.values(i.judges);
      i.mean = v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : undefined;
    }
  }),
);
await save();

// Agreement: Spearman of each judge vs the mean of the other two, per prompt, averaged.
const all = PROMPTS.map((p) => entries.get(p)!);
for (const j of JUDGES) {
  const rs = all.flatMap((e) => {
    const own = e.ideas.map((i) => i.judges[j]);
    if (own.some((x) => x === undefined)) return [];
    const others = e.ideas.map((i) => {
      const v = JUDGES.filter((o) => o !== j && i.judges[o] !== undefined).map((o) => i.judges[o]!);
      return v.reduce((s, x) => s + x, 0) / v.length;
    });
    return [spearman(own as number[], others)];
  });
  console.log(`${j}: vs others rho ${(rs.reduce((s, x) => s + x, 0) / rs.length).toFixed(2)} on ${rs.length} prompts`);
}
const kinds: Kind[] = ["obvious", "twist", "rare"];
for (const k of kinds) {
  const ms = all.flatMap((e) => e.ideas.filter((i) => i.author === k && i.mean !== undefined).map((i) => i.mean!));
  console.log(`author ${k}: judge mean ${(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(2)} (n=${ms.length})`);
}
const bands = all.flatMap((e) => e.ideas.filter((i) => i.mean !== undefined).map((i) => band(i.mean!)));
console.log(`bands: cliche ${bands.filter((b) => b === "cliche").length}, mid ${bands.filter((b) => b === "mid").length}, far ${bands.filter((b) => b === "far").length}`);

// Blind sheet for a human rater: same shuffled order, no labels.
const csv = ["prompt,n,idea,originality_1_7", ...all.flatMap((e) => e.order.map((ix, n) => [e.prompt, n + 1, e.ideas[ix]!.text, ""].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")))];
await writeFile(new URL("./set20-blind.csv", import.meta.url), csv.join("\n"));
