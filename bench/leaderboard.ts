/**
 * Leaderboard: which model is the most banal?
 *   bun run bench/leaderboard.ts   -> bench/leaderboard.json + docs/leaderboard.md
 * 1. Every model answers the same 30 open prompts as a user would ask them: plain text, provider defaults, 5 answers.
 * 2. Banality of model M = Cliché Score (embedding part, src/math.ts defaults) of M's answers against the answers of
 *    each model from another vendor, averaged per vendor first, so vendors with more models do not weigh more and
 *    every reference cloud has the same size. Same-vendor models are left out: siblings share training data and style.
 * 3. Also: share of answers at 70+ ("an answer another vendor gave"), raw nearest similarity, and self-repetition
 *    (mean cosine between a model's own 5 answers), with 95% bootstrap intervals over prompts.
 * 4. A second view without embeddings: two LLM judges (one Claude, one Gemini) group each prompt's anonymised, shuffled
 *    answers into ideas; a model's "shared" share = answers whose idea another vendor's model also gave.
 * Answers and embeddings are cached (bench/leaderboard.json, research/clouds), so a re-run only fills gaps:
 * the free Gemini embedding tier allows about 1000 texts a day.
 * Needs ANTHROPIC_API_KEY, GEMINI_API_KEY, GIGACHAT_AUTH_KEY (+ GIGACHAT_SCOPE).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { embedCached } from "../src/engine.js";
import { parseJson, withRetry } from "../src/llm.js";
import { clicheScore, cosine, spearman } from "../src/math.js";
import { z } from "zod";

const N = 5;
const OUT = new URL("./leaderboard.json", import.meta.url);
const set20 = JSON.parse(await readFile(new URL("./set20.json", import.meta.url), "utf8")) as { prompts: { prompt: string }[] };
const PROMPTS = [
  ...set20.prompts.map((p) => p.prompt),
  // Ten more, outside business ideas: names, fiction, personal life, science, health care.
  "Suggest a name for a black cat",
  "Give me a premise for a short science fiction story",
  "Suggest a theme for a wedding",
  "How can I learn a new language faster?",
  "Ideas for a first date",
  "Suggest a startup idea in climate tech",
  "How can a hospital reduce patient wait times?",
  "Suggest a plot twist for a detective novel",
  "Ideas for a high school science fair project",
  "How can a supermarket reduce plastic use?",
];
const ASK = (prompt: string) => `${prompt}\n\nGive ${N} distinct answers as a numbered list, one short answer (max 25 words) each, no introduction. Answer in English.`;

type Call = (ask: string) => Promise<string>;
interface Model { id: string; vendor: string; call: Call }

const env = (k: string) => process.env[k]?.trim() || undefined;
const anthropic = env("ANTHROPIC_API_KEY") ? new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 4, timeout: 120_000 }) : null;
const claude = (model: string): Call => async (ask) => {
  const r = await anthropic!.messages.create({ model, max_tokens: 2000, messages: [{ role: "user", content: ask }] });
  return r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
};
// Free-tier daily quotas are small (20 requests per model for the newest flash models): stop asking once one is hit.
const dayLimited = new Set<string>();
const gemini = (model: string): Call => async (ask) => {
  if (dayLimited.has(model)) throw new Error(`${model}: daily quota used up, re-run tomorrow`);
  const r = await withRetry((signal) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY")! }, signal,
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ask }] }] }),
  }), { attempts: 4, baseMs: 5000, timeoutMs: 120_000 });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429 && body.includes("PerDay")) dayLimited.add(model);
    throw new Error(`${model} ${r.status}: ${body.slice(0, 200)}`);
  }
  const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  return d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
};
// GigaChat (Sber): OAuth token for 30 min; Russian CA, hence TLS verification off for these two hosts only.
let giga: { token: string; until: number } | undefined;
const gigaFetch = (url: string, init: RequestInit) => fetch(url, { ...init, tls: { rejectUnauthorized: false } } as RequestInit);
// The free tier allows one request at a time: calls are chained and 429s retried.
let gigaQueue: Promise<unknown> = Promise.resolve();
const gigachat = (model: string): Call => (ask) => {
  const run = gigaQueue.then(() => gigaCall(model, ask));
  gigaQueue = run.catch(() => {});
  return run;
};
async function gigaCall(model: string, ask: string, attempt = 0): Promise<string> {
  if (!giga || giga.until < Date.now() + 60_000) {
    const r = await gigaFetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
      method: "POST",
      headers: { Authorization: `Basic ${env("GIGACHAT_AUTH_KEY")}`, RqUID: randomUUID(), "Content-Type": "application/x-www-form-urlencoded" },
      body: `scope=${env("GIGACHAT_SCOPE") ?? "GIGACHAT_API_PERS"}`,
    });
    const d = (await r.json()) as { access_token: string; expires_at: number };
    giga = { token: d.access_token, until: d.expires_at };
  }
  const r = await gigaFetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${giga.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: ask }] }),
  });
  if (r.status === 429 && attempt < 5) return Bun.sleep(5000 * 2 ** attempt).then(() => gigaCall(model, ask, attempt + 1));
  if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
}

// LB_SKIP="model,model": leave models out of this run (e.g. while a free-tier quota refills).
const SKIP = new Set((env("LB_SKIP") ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const MODELS: Model[] = [
  ...(anthropic ? ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5"].map((id) => ({ id, vendor: "Anthropic", call: claude(id) })) : []),
  ...(env("GEMINI_API_KEY") ? ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"].map((id) => ({ id, vendor: "Google", call: gemini(id) })) : []),
  ...(env("GIGACHAT_AUTH_KEY") ? ["GigaChat-2-Max", "GigaChat-2-Pro", "GigaChat-2"].map((id) => ({ id, vendor: "Sber", call: gigachat(id) })) : []),
].filter((m) => !SKIP.has(m.id));

/** "1. **Foo** - bar" -> "Foo - bar". Keeps the first N numbered items; falls back to non-empty lines. */
export function parseAnswers(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l));
  return (numbered.length >= 2 ? numbered : lines)
    .map((l) => l.replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, "").replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length > 2)
    .slice(0, N);
}

/** clusters[judge][prompt] = groups of answer ids ("model#i"), one group per idea. */
type Store = { date?: string; answers: Record<string, Record<string, string[]>>; clusters?: Record<string, Record<string, string[][]>> };
const store: Store = await readFile(OUT, "utf8").then((t) => JSON.parse(t) as Store).catch(() => ({ answers: {} }));
const save = () => writeFile(OUT, JSON.stringify(store, null, 1));

// 1. Answers (cached per model x prompt).
await Promise.all(MODELS.map(async (m) => {
  const mine = (store.answers[m.id] ??= {});
  for (const p of PROMPTS) {
    if (mine[p]?.length) continue;
    try {
      const list = parseAnswers(await m.call(ASK(p)));
      if (list.length >= 3) (mine[p] = list), await save();
      else console.error(`${m.id}: ${list.length} answers for "${p}"`);
    } catch (e) {
      console.error(`${m.id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  console.error(`${m.id}: ${Object.keys(mine).length}/${PROMPTS.length} prompts answered`);
}));
await save();

// 2. Embeddings, prompt by prompt, until the daily quota runs out.
const vec = new Map<string, number[]>();
const ready: string[] = [];
for (const p of PROMPTS) {
  const texts = MODELS.flatMap((m) => store.answers[m.id]?.[p] ?? []);
  if (MODELS.some((m) => !store.answers[m.id]?.[p])) continue;
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

// 3. Scores.
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const vendors = [...new Set(MODELS.map((m) => m.vendor))];
type PerPrompt = { score: number; cliche: number; nearest: number; self: number };
const perPrompt = (m: Model, p: string): PerPrompt => {
  const mine = store.answers[m.id]![p]!.map((t) => vec.get(t)!);
  const byVendor = vendors.filter((v) => v !== m.vendor).map((v) => {
    const others = MODELS.filter((o) => o.vendor === v).map((o) => store.answers[o.id]![p]!.map((t) => vec.get(t)!));
    const vs = others.flatMap((cloud) => mine.map((a) => clicheScore(a, cloud)));
    return { score: mean(vs.map((b) => b.cliche)), cliche: mean(vs.map((b) => (b.cliche >= 70 ? 1 : 0))), nearest: mean(vs.map((b) => b.nearestSim)) };
  });
  const pairs = mine.flatMap((a, i) => mine.slice(i + 1).map((b) => cosine(a, b)));
  return { score: mean(byVendor.map((x) => x.score)), cliche: mean(byVendor.map((x) => x.cliche)), nearest: mean(byVendor.map((x) => x.nearest)), self: mean(pairs) };
};
// Deterministic bootstrap over prompts (mulberry32), so the doc does not change between identical runs.
const rng = (seed: number) => () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 4294967296);
const ci = (xs: number[], B = 2000) => {
  const r = rng(42);
  const ms = Array.from({ length: B }, () => mean(xs.map(() => xs[Math.floor(r() * xs.length)]!))).sort((a, b) => a - b);
  return [ms[Math.floor(B * 0.025)]!, ms[Math.floor(B * 0.975)]!] as const;
};
const board = ready.length ? MODELS.map((m) => {
  const rows = ready.map((p) => perPrompt(m, p));
  return {
    model: m.id, vendor: m.vendor,
    banality: mean(rows.map((r) => r.score)), ci: ci(rows.map((r) => r.score)),
    clicheShare: mean(rows.map((r) => r.cliche)), nearestSim: mean(rows.map((r) => r.nearest)), selfSim: mean(rows.map((r) => r.self)),
  };
}).sort((a, b) => b.banality - a.banality) : [];

// 4. Idea overlap by LLM judges, on every prompt all models answered (no embeddings needed).
const ClustersSchema = z.object({ items: z.array(z.object({ idea: z.string(), members: z.array(z.string()) })) });
type Judge = { id: string; call: (ask: string) => Promise<string> };
const JUDGES: Judge[] = [
  ...(anthropic ? [{ id: "claude-opus-5-5", call: async (ask: string) => {
    const r = await anthropic.messages.create({ model: "claude-opus-5-5", max_tokens: 8000, output_config: { format: zodOutputFormat(ClustersSchema) }, messages: [{ role: "user", content: ask }] });
    return r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } }] : []),
  ...(env("GEMINI_API_KEY") ? [{ id: "gemini-3.5-flash-lite", call: async (ask: string) => {
    const r = await withRetry((signal) => fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY")! }, signal,
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ask }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(ClustersSchema) } }),
    }), { attempts: 4, baseMs: 5000, timeoutMs: 120_000 });
    if (!r.ok) throw new Error(`judge ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    return d.candidates?.[0]?.content?.parts?.filter((x) => !x.thought).map((x) => x.text ?? "").join("") ?? "";
  } }] : []),
];
const answered = PROMPTS.filter((p) => MODELS.every((m) => store.answers[m.id]?.[p]?.length));
const clusters = (store.clusters ??= {});
for (const j of JUDGES) {
  const mine = (clusters[j.id] ??= {});
  // A few prompts at a time: the free Gemini tier allows about 15 requests a minute.
  for (let start = 0; start < answered.length; start += 4) {
    await Promise.all(answered.slice(start, start + 4).map(async (p) => {
      const ids = MODELS.flatMap((m) => store.answers[m.id]![p]!.map((_, i) => `${m.id}#${i}`));
      const have = new Set((mine[p] ?? []).flat());
      if (ids.every((id) => have.has(id))) return;
      // Anonymised and shuffled, so a judge cannot group by vendor style or list order.
      const r = rng(1000 + PROMPTS.indexOf(p));
      const order = ids.map((id) => ({ id, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.id);
      const text = (id: string) => {
        const [m, i] = id.split("#");
        return store.answers[m!]![p]![Number(i)]!;
      };
      const ask = `Below are ${order.length} short answers that different AI assistants gave to the request "${p}".\n\nGroup them by IDEA. Two answers are the same idea when they suggest the same thing: the same name, the same core mechanism or proposal, whatever the wording, length or extra detail. Put every answer in exactly one group; an answer unlike all the others is a group of one.\n\nAnswers:\n${order.map((id, i) => `A${i + 1}. ${text(id)}`).join("\n")}\n\nReturn JSON {"items": [{"idea": string (max 8 words), "members": [answer ids such as "A1"]}]}.`;
      try {
        const groups = ClustersSchema.parse(parseJson(await j.call(ask))).items;
        const seen = new Set<string>();
        const out = groups
          .map((g) => g.members.map((a) => order[Number(a.replace(/\D/g, "")) - 1]).filter((id): id is string => !!id && !seen.has(id) && !!seen.add(id)))
          .filter((g) => g.length);
        for (const id of ids) if (!seen.has(id)) out.push([id]); // a forgotten answer counts as its own idea
        mine[p] = out;
        await save();
      } catch (e) {
        console.error(`${j.id} on "${p}": ${(e as Error).message.slice(0, 160)}`);
      }
    }));
  }
}
const judged = answered.filter((p) => JUDGES.length > 0 && JUDGES.every((j) => clusters[j.id]?.[p]));
const vendorOf = new Map(MODELS.map((m) => [m.id, m.vendor]));
/** Share of model m's answers to p whose idea some model of another vendor also gave, per judge. */
const sharedShare = (j: string, m: Model, p: string) => {
  const groupOf = new Map(clusters[j]![p]!.flatMap((g) => g.map((id) => [id, g] as const)));
  const mine = store.answers[m.id]![p]!.map((_, i) => groupOf.get(`${m.id}#${i}`) ?? []);
  return mean(mine.map((g) => (g.some((id) => vendorOf.get(id.split("#")[0]!) !== m.vendor) ? 1 : 0)));
};
const overlapBoard = judged.length
  ? MODELS.map((m) => {
      const per = judged.map((p) => mean(JUDGES.map((j) => sharedShare(j.id, m, p))));
      return {
        model: m.id, vendor: m.vendor, shared: mean(per), ci: ci(per),
        byJudge: Object.fromEntries(JUDGES.map((j) => [j.id, mean(judged.map((p) => sharedShare(j.id, m, p)))])),
      };
    }).sort((a, b) => b.shared - a.shared)
  : [];
// Do the judges rank the models the same way?
const judgeRho = JUDGES.length === 2 && overlapBoard.length > 2
  ? spearman(overlapBoard.map((b) => b.byJudge[JUDGES[0]!.id]!), overlapBoard.map((b) => b.byJudge[JUDGES[1]!.id]!))
  : undefined;

store.date = new Date().toISOString();
await writeFile(OUT, JSON.stringify({ ...store, prompts: PROMPTS, ready, board, judged, overlapBoard }, null, 1));

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const md = [
  `# Which model is the most banal?`, ``,
  `Date: ${store.date.slice(0, 10)}. ${MODELS.length} models from ${vendors.length} vendors, ${ready.length} of ${PROMPTS.length} prompts, ${N} answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).`, ``,
  `Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.`, ``,
  `| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |`, `|---|---|---|---|---|---|---|`,
  ...board.map((b, i) => `| ${i + 1} | ${b.model} | ${b.vendor} | ${f1(b.banality)} (${f1(b.ci[0])}-${f1(b.ci[1])}) | ${Math.round(b.clicheShare * 100)}% | ${b.nearestSim.toFixed(3)} | ${b.selfSim.toFixed(3)} |`),
  ``,
  `Nearest similarity: mean cosine between an answer and the closest answer of another vendor's model. Self-repetition: mean cosine between a model's own ${N} answers to one prompt (higher = the answers are variations of one idea). Intervals: bootstrap over prompts.`, ``,
  ...(overlapBoard.length ? [
    `## Second view: shared ideas, judged by LLMs`, ``,
    `No embeddings here. For each of ${judged.length} prompts all ${MODELS.length * N} answers were anonymised, shuffled and grouped into ideas by two judges (${JUDGES.map((j) => j.id).join(" and ")}). **Shared** = share of a model's answers whose idea at least one model from another vendor also gave. Mean of both judges, 95% bootstrap interval over prompts.`, ``,
    `| # | model | vendor | shared (95% CI) | ${JUDGES.map((j) => j.id).join(" | ")} |`, `|---|---|---|---|${JUDGES.map(() => "---|").join("")}`,
    ...overlapBoard.map((b, i) => `| ${i + 1} | ${b.model} | ${b.vendor} | ${pct(b.shared)} (${pct(b.ci[0])}-${pct(b.ci[1])}) | ${JUDGES.map((j) => pct(b.byJudge[j.id]!)).join(" | ")} |`),
    ``,
    ...(judgeRho !== undefined ? [`The two judges agree on the model order at Spearman ${judgeRho.toFixed(2)}.`, ``] : []),
  ] : []),
];
const docUrl = new URL("../docs/leaderboard.md", import.meta.url);
const prev = await readFile(docUrl, "utf8").catch(() => "");
const notes = prev.includes("## Notes") ? prev.slice(prev.indexOf("## Notes")) : "";
await writeFile(docUrl, md.join("\n") + (notes ? `\n${notes}` : ""));
console.log(md.join("\n"));
