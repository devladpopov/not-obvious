/**
 * Second external check, outside AUT: research ideas with expert novelty ratings.
 * Data: Si, Yang, Hashimoto (2024/ICLR 2025), "Can LLMs Generate Novel Research Ideas?", MIT,
 * https://github.com/NoviScl/AI-Researcher (reviews_ideation/data_points_all_anonymized.json, id_title_mapping.csv,
 * idea texts from the Google Drive links in its README). 49 expert-written and 49 AI-generated prompting ideas on 7 NLP topics,
 * each blind-reviewed by 2-4 NLP researchers, novelty 1-10. The AI + human rerank condition is left out: its files carry no ids.
 *   NOT_OBVIOUS_EMBEDDER=local bun run bench/human-ideas.ts [title|summary] -> bench/human-ideas-<variant>.json
 * Expects research/si-ideas/raw/{data_points_all_anonymized.json,id_title_mapping.csv} and research/si-ideas/ex/{human,ai}/<dir>/*.txt.
 * Optional: HJ_JUDGE=1 also runs the mechanism judge through HJ_CMD (default Claude Haiku via the OAuth CLI).
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { baseline, embedCached, judgePrompt } from "../src/engine.js";
import { embedder } from "../src/embed.js";
import { clicheScore, spearman } from "../src/math.js";
import { claudeCli } from "./providers.js";

const VARIANT = (process.argv[2] ?? "title") as "title" | "summary";
const DIR = "research/si-ideas";
/** Topic descriptions as given to both experts and the AI agent in the study. */
const TOPICS: Record<string, string> = {
  Bias: "reduce social biases and stereotypes of large language models",
  Coding: "improve code generation by large language models",
  Safety: "improve the robustness of large language models against adversarial attacks or improve their security or privacy",
  Multilingual: "improve the multilingual capabilities of large language models, including low-resource languages and vernaculars",
  Factuality: "improve the factuality of large language models and reduce hallucination",
  Math: "improve the mathematical problem solving of large language models",
  Uncertainty: "better quantify uncertainty or calibrate the confidence of large language models",
};
const ask = (topic: string) => `Propose a novel prompting-based research idea to ${TOPICS[topic]}.`;

type Idea = { id: string; topic: string; condition: "Human" | "AI"; title: string; text: string; novelty: number; reviews: number; cliche?: number; overlap?: number };

// Reviews: columns of equal length; ids like "Multilingual_9 _AI" lose the stray space.
const rv = JSON.parse(await readFile(join(DIR, "raw/data_points_all_anonymized.json"), "utf8")) as Record<string, (string | number)[]>;
const scores = new Map<string, number[]>();
rv.idea_id!.forEach((raw, i) => {
  const id = String(raw).replace(/\s+/g, "");
  if (id.endsWith("_AI_Rerank")) return;
  scores.set(id, [...(scores.get(id) ?? []), Number(rv.novelty_score![i])]);
});

// Idea texts: Human ids map to titles, AI ids to file names.
const mapping = (await readFile(join(DIR, "raw/id_title_mapping.csv"), "utf8")).split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
  const c = l.indexOf(",");
  return [l.slice(0, c).trim(), l.slice(c + 1).trim().replace(/^"|"$/g, "")] as const;
});
const files = new Map<string, string>(); // key: lowercased title or file stem
for (const cond of ["human", "ai"]) {
  for (const sub of await readdir(join(DIR, "ex", cond))) {
    if (sub.startsWith("__")) continue;
    for (const f of await readdir(join(DIR, "ex", cond, sub))) {
      if (!f.endsWith(".txt")) continue;
      const t = await readFile(join(DIR, "ex", cond, sub, f), "utf8");
      files.set(f.replace(/\.txt$/, "").toLowerCase(), t);
      files.set(t.trim().split(/\r?\n/)[0]!.replace(/^Title:\s*/i, "").trim().toLowerCase(), t);
    }
  }
}
const section = (t: string, name: string) => t.match(new RegExp(`${name}:\\s*([\\s\\S]*?)(?:\\n\\s*\\d\\.\\s|$)`, "i"))?.[1]?.trim().replace(/\s+/g, " ") ?? "";
const ideas: Idea[] = [];
for (const [id, key] of mapping) {
  const s = scores.get(id);
  const body = files.get(key.replace(/\.json$/, "").toLowerCase());
  if (!s || !body) {
    console.error(`skip ${id}: ${!s ? "no reviews" : "no text"}`);
    continue;
  }
  const title = body.trim().split(/\r?\n/)[0]!.replace(/^Title:\s*/i, "").trim();
  const problem = section(body, "Problem Statement").split(/(?<=\.)\s/).slice(0, 2).join(" ");
  const text = VARIANT === "title" ? title : `${title}. ${problem}`;
  ideas.push({ id, topic: id.split("_")[0]!, condition: id.endsWith("_Human") ? "Human" : "AI", title, text, novelty: s.reduce((a, b) => a + b, 0) / s.length, reviews: s.length });
}

const judge = process.env.HJ_JUDGE ? claudeCli(process.env.HJ_CMD ?? "bash C:/Users/Vlad/bin/claude-oauth.sh --model haiku") : undefined;
const JCACHE = join(DIR, `judge-cache-${VARIANT}.json`);
const jcache: Record<string, number> = await readFile(JCACHE, "utf8").then((t) => JSON.parse(t)).catch(() => ({}));
const topics = Object.keys(TOPICS);
const perTopic: { topic: string; n: number; cloud: number; models: string[]; rho: Record<string, number> }[] = [];
for (const topic of topics) {
  const rows = ideas.filter((i) => i.topic === topic);
  if (!rows.length) continue;
  const prompt = ask(topic);
  const cloud = await baseline(prompt, { perModel: 20 });
  const { vectors } = await embedCached(rows.map((r) => r.text));
  rows.forEach((r, i) => (r.cliche = clicheScore(vectors[i]!, cloud.vectors).cliche));
  if (judge) {
    const missing = rows.filter((r) => jcache[r.id] === undefined);
    if (missing.length) {
      const out = await judge(`${judgePrompt(prompt, cloud.cliches.map((c) => c.text), missing.map((r) => r.text))}\n\nReply with the JSON only, no prose, no code fences.`);
      const items = (JSON.parse(out.match(/\{[\s\S]*\}/)![0]) as { items: { overlap: number }[] }).items;
      if (items.length !== missing.length) throw new Error(`${topic}: judge returned ${items.length}/${missing.length}`);
      missing.forEach((r, i) => (jcache[r.id] = Number(items[i]!.overlap)));
      await writeFile(JCACHE, JSON.stringify(jcache));
    }
    rows.forEach((r) => (r.overlap = jcache[r.id]));
  }
  const nov = rows.map((r) => r.novelty);
  const rho: Record<string, number> = {
    cliche: spearman(rows.map((r) => -r.cliche!), nov),
    length: spearman(rows.map((r) => r.text.split(/\s+/).length), nov),
    ...(judge ? { judge: spearman(rows.map((r) => -r.overlap!), nov) } : {}),
  };
  perTopic.push({ topic, n: rows.length, cloud: cloud.cliches.length, models: [...new Set(cloud.cliches.map((c) => c.model))], rho });
  console.log(`${topic}: n=${rows.length} cloud=${cloud.cliches.length} rho cliche=${rho.cliche!.toFixed(2)}${judge ? ` judge=${rho.judge!.toFixed(2)}` : ""} length=${rho.length!.toFixed(2)}`);
}

const used = ideas.filter((i) => i.cliche !== undefined);
const nov = used.map((r) => r.novelty);
const n = perTopic.reduce((s, p) => s + p.n, 0);
const keys = Object.keys(perTopic[0]!.rho);
const within = Object.fromEntries(keys.map((k) => [k, perTopic.reduce((s, p) => s + (Number.isNaN(p.rho[k]!) ? 0 : p.rho[k]! * p.n), 0) / n]));
const pooled: Record<string, number> = {
  cliche: spearman(used.map((r) => -r.cliche!), nov),
  length: spearman(used.map((r) => r.text.split(/\s+/).length), nov),
  ...(judge ? { judge: spearman(used.map((r) => -r.overlap!), nov) } : {}),
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const byCondition = Object.fromEntries((["Human", "AI"] as const).map((c) => {
  const xs = used.filter((r) => r.condition === c);
  return [c, { n: xs.length, novelty: mean(xs.map((r) => r.novelty)), cliche: mean(xs.map((r) => r.cliche!)), ...(judge ? { overlap: mean(xs.map((r) => r.overlap!)) } : {}) }];
}));
// AUC-style: share of (AI, Human) pairs within a topic where the AI idea has the higher Cliché Score.
let pairs = 0, aiHigher = 0;
for (const t of topics) {
  const ai = used.filter((r) => r.topic === t && r.condition === "AI"), hu = used.filter((r) => r.topic === t && r.condition === "Human");
  for (const a of ai) for (const h of hu) (pairs++, (aiHigher += a.cliche! > h.cliche! ? 1 : a.cliche! === h.cliche! ? 0.5 : 0));
}
const out = { variant: VARIANT, cloudPrompt: ask("<topic>"), source: "github.com/NoviScl/AI-Researcher reviews_ideation (MIT)", embedder: embedder().name, n: used.length, pooled, within, byCondition, aiMoreCliche: aiHigher / pairs, perTopic, ideas: used.map(({ id, novelty, reviews, cliche, overlap }) => ({ id, novelty, reviews, cliche, overlap })) };
await writeFile(`bench/human-ideas-${VARIANT}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ n: used.length, pooled, within, byCondition, aiMoreCliche: out.aiMoreCliche }, null, 1));
