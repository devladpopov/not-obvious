/**
 * Does your own context make a model less banal?
 *   bun run bench/context.ts   -> bench/context.json + docs/context.md
 * The leaderboard asks bare prompts, and every model lands in the same cloud. Here one model per vendor gets the same
 * 30 prompts with a short "about me" paragraph in front (two different people), and we measure:
 * 1. vs the crowd: banality (leaderboard metric) against the bare answers of every other-vendor model. Does context
 *    move the answers away from what everyone else gets?
 * 2. vs the same context: banality against the other vendors' answers to the same person. Given the same context,
 *    do the models converge again, just on a new spot?
 * Answers and embeddings are cached (bench/context.json, research/clouds), so a re-run only fills gaps.
 * Needs ANTHROPIC_API_KEY, GEMINI_API_KEY, GIGACHAT_AUTH_KEY (+ GIGACHAT_SCOPE).
 */
import { readFile, writeFile } from "node:fs/promises";
import { embedCached } from "../src/engine.js";
import { clicheScore } from "../src/math.js";
import { ci, claude, env, gemini, gigachat, parseAnswers, type Model } from "./providers.js";

const N = 5;
const OUT = new URL("./context.json", import.meta.url);
const lb = JSON.parse(await readFile(new URL("./leaderboard.json", import.meta.url), "utf8")) as {
  prompts: string[]; answers: Record<string, Record<string, string[]>>; board: { model: string; vendor: string }[];
};
const PROMPTS = lb.prompts;
const PERSONAS: Record<string, string> = {
  mechanic: "About me: I'm 61, a retired ferry mechanic on a small island in northern Norway, about 900 people live here. I have around $500 to spend and a shed full of old marine engine parts. I don't use social media. In December we get about three hours of daylight.",
  nurse: "About me: I'm 24, a night-shift nurse in Lagos. I have about four free hours a week, no car, and the power goes out most evenings. I speak Yoruba and English, I play chess online, and I love Afrobeat.",
};
const ASK = (persona: string, prompt: string) => `${persona}\n\n${prompt}\n\nGive ${N} distinct answers as a numbered list, one short answer (max 25 words) each, no introduction. Answer in English.`;

// One model per vendor, all three already on the leaderboard with bare answers.
const MODELS: Model[] = [
  ...(env("ANTHROPIC_API_KEY") ? [{ id: "claude-sonnet-5-5", vendor: "Anthropic", call: claude("claude-sonnet-5-5") }] : []),
  ...(env("GEMINI_API_KEY") ? [{ id: "gemini-3.5-flash-lite", vendor: "Google", call: gemini("gemini-3.5-flash-lite") }] : []),
  ...(env("GIGACHAT_AUTH_KEY") ? [{ id: "GigaChat-2-Max", vendor: "Sber", call: gigachat("GigaChat-2-Max") }] : []),
];
// The crowd: every leaderboard model with bare answers to all prompts.
const CROWD = lb.board.filter((b) => PROMPTS.every((p) => lb.answers[b.model]?.[p]?.length));

/** answers[persona][model][prompt] */
type Store = { date?: string; answers: Record<string, Record<string, Record<string, string[]>>> };
const store: Store = await readFile(OUT, "utf8").then((t) => JSON.parse(t) as Store).catch(() => ({ answers: {} }));
const save = () => writeFile(OUT, JSON.stringify(store, null, 1));

// 1. Answers (cached per persona x model x prompt).
await Promise.all(MODELS.map(async (m) => {
  for (const [key, persona] of Object.entries(PERSONAS)) {
    const mine = ((store.answers[key] ??= {})[m.id] ??= {});
    for (const p of PROMPTS) {
      if (mine[p]?.length) continue;
      try {
        const list = parseAnswers(await m.call(ASK(persona, p)), N);
        if (list.length >= 3) (mine[p] = list), await save();
        else console.error(`${m.id}/${key}: ${list.length} answers for "${p}"`);
      } catch (e) {
        console.error(`${m.id}/${key}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    console.error(`${m.id}/${key}: ${Object.keys(mine).length}/${PROMPTS.length} prompts answered`);
  }
}));
await save();

// 2. Embeddings, prompt by prompt, until the daily quota runs out. Bare crowd answers are already cached.
const vec = new Map<string, number[]>();
const bare = (model: string, p: string) => lb.answers[model]![p]!;
const said = (cond: string, model: string, p: string) => (cond === "bare" ? lb.answers[model]?.[p] : store.answers[cond]?.[model]?.[p]);
const CONDS = ["bare", ...Object.keys(PERSONAS)];
const ready: string[] = [];
for (const p of PROMPTS) {
  if (CONDS.some((c) => MODELS.some((m) => !said(c, m.id, p)?.length))) continue;
  const texts = [...CROWD.flatMap((b) => bare(b.model, p)), ...CONDS.flatMap((c) => MODELS.flatMap((m) => said(c, m.id, p)!))];
  try {
    const { vectors } = await embedCached(texts);
    texts.forEach((t, i) => vec.set(t, vectors[i]!));
    ready.push(p);
  } catch (e) {
    console.error(`embeddings stopped at "${p}": ${(e as Error).message.slice(0, 160)}`);
    break;
  }
}
console.error(`${ready.length}/${PROMPTS.length} prompts embedded`);

// 3. Scores: mean Cliché Score of a model's answers against each other-vendor cloud, averaged per vendor.
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const against = (mine: string[], clouds: { vendor: string; texts: string[] }[], vendor: string) => {
  const a = mine.map((t) => vec.get(t)!);
  const byVendor = [...new Set(clouds.map((c) => c.vendor))].filter((v) => v !== vendor).map((v) => {
    const vs = clouds.filter((c) => c.vendor === v).flatMap((c) => a.map((x) => clicheScore(x, c.texts.map((t) => vec.get(t)!))));
    return { score: mean(vs.map((b) => b.cliche)), share: mean(vs.map((b) => (b.cliche >= 70 ? 1 : 0))) };
  });
  return { score: mean(byVendor.map((x) => x.score)), share: mean(byVendor.map((x) => x.share)) };
};
const rows = ready.length ? MODELS.flatMap((m) => CONDS.map((c) => {
  const crowd = ready.map((p) => against(said(c, m.id, p)!, CROWD.map((b) => ({ vendor: b.vendor, texts: bare(b.model, p) })), m.vendor));
  const same = ready.map((p) => against(said(c, m.id, p)!, MODELS.map((o) => ({ vendor: o.vendor, texts: said(c, o.id, p)! })), m.vendor));
  return {
    model: m.id, vendor: m.vendor, cond: c,
    crowd: mean(crowd.map((r) => r.score)), crowdCi: ci(crowd.map((r) => r.score)), crowdShare: mean(crowd.map((r) => r.share)),
    same: mean(same.map((r) => r.score)), sameCi: ci(same.map((r) => r.score)), sameShare: mean(same.map((r) => r.share)),
    perPrompt: crowd.map((r) => r.score),
  };
})) : [];
// Per-prompt drop vs the bare answers, with a bootstrap interval.
const drops = rows.filter((r) => r.cond !== "bare").map((r) => {
  const base = rows.find((b) => b.model === r.model && b.cond === "bare")!;
  const d = r.perPrompt.map((x, i) => base.perPrompt[i]! - x);
  return { model: r.model, cond: r.cond, drop: mean(d), ci: ci(d) };
});

store.date = new Date().toISOString();
await writeFile(OUT, JSON.stringify({ ...store, ready, rows: rows.map(({ perPrompt, ...r }) => r), drops }, null, 1));

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const md = [
  `# Does your own context make a model less banal?`, ``,
  `Date: ${store.date.slice(0, 10)}. ${MODELS.length} models (one per vendor), ${ready.length} of ${PROMPTS.length} leaderboard prompts, ${N} answers each, three conditions: the bare prompt (leaderboard answers) and the same prompt after a short "about me" paragraph from one of two people (bench/context.ts, answers in bench/context.json).`, ``,
  ...Object.entries(PERSONAS).map(([k, v]) => `- **${k}**: ${v}`), ``,
  `**vs crowd** = banality against the bare answers of all ${CROWD.length} leaderboard models from other vendors (the leaderboard metric). **vs same context** = banality against the other two vendors' answers to the same person. 100 = says what the others say, 0 = far from all of them. 95% bootstrap intervals over prompts.`, ``,
  `| model | condition | vs crowd (95% CI) | at 70+ | vs same context (95% CI) | at 70+ |`, `|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.model} | ${r.cond} | ${f1(r.crowd)} (${f1(r.crowdCi[0])}-${f1(r.crowdCi[1])}) | ${pct(r.crowdShare)} | ${f1(r.same)} (${f1(r.sameCi[0])}-${f1(r.sameCi[1])}) | ${pct(r.sameShare)} |`),
  ``,
  ...(drops.length ? [
    `Drop in "vs crowd" banality against the bare prompt (per-prompt difference, 95% CI):`, ``,
    `| model | context | drop |`, `|---|---|---|`,
    ...drops.map((d) => `| ${d.model} | ${d.cond} | ${f1(d.drop)} (${f1(d.ci[0])}-${f1(d.ci[1])}) |`), ``,
  ] : []),
];
const docUrl = new URL("../docs/context.md", import.meta.url);
const prev = await readFile(docUrl, "utf8").catch(() => "");
const notes = prev.includes("## Notes") ? prev.slice(prev.indexOf("## Notes")) : "";
await writeFile(docUrl, md.join("\n") + (notes ? `\n${notes}` : ""));
console.log(md.join("\n"));
