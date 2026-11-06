/**
 * Russian copy of the calibration sets, to check embedders beyond English:
 * prompts, cached clouds and anchors are translated (claude, fast tier), labels carried over.
 *   bun run bench/translate-ru.ts   -> bench/prompts-ru.json, bench/set20-ru.json + clouds in $NOT_OBVIOUS_CACHE
 *   NOT_OBVIOUS_EMBEDDER=local bun run bench/calibrate.ts all-ru
 * The translated clouds are saved as lexical clouds; calibrate re-embeds them with the embedder under test.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cloudKey, type Cloud } from "../src/engine.js";
import { lexicalEmbedder } from "../src/embed.js";
import { complete, parseList } from "../src/llm.js";
import { AnswersSchema } from "../src/schemas.js";

const CACHE = process.env.NOT_OBVIOUS_CACHE?.trim() || "research/clouds";
const BANDS = ["cliche", "mid", "far"] as const;
const memo = new Map<string, string>();

async function translate(texts: string[]): Promise<string[]> {
  const todo = [...new Set(texts.filter((t) => !memo.has(t)))];
  if (todo.length) {
    const ask = `Translate each line into natural Russian, as a native speaker would phrase it. Keep the meaning and length, no comments.\n\n${todo.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nReturn JSON {"items": [${todo.length} strings]} in the same order.`;
    const { text } = await complete(ask, { tier: "fast", json: true, schema: AnswersSchema });
    const out = parseList<string>(text);
    if (out.length !== todo.length) throw new Error(`got ${out.length}/${todo.length} translations`);
    todo.forEach((t, i) => memo.set(t, String(typeof out[i] === "object" && out[i] ? Object.values(out[i] as object)[0] : out[i]).trim()));
  }
  return texts.map((t) => memo.get(t)!);
}

const lex = lexicalEmbedder();
for (const name of ["prompts", "set20"]) {
  const set = JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), "utf8")) as { prompts: any[] };
  const out: any[] = [];
  for (const p of set.prompts) {
    const cloud = JSON.parse(await readFile(join(CACHE, `${cloudKey(p.prompt, "gemini-embedding-001")}.json`), "utf8")) as Cloud;
    const anchors = BANDS.flatMap((b) => p[b] as string[]);
    const [promptRu, ...rest] = await translate([p.prompt, ...anchors, ...cloud.cliches.map((c) => c.text)]);
    const ru = new Map(anchors.map((a, i) => [a, rest[i]!]));
    if (!promptRu || rest.some((t) => !t)) throw new Error(`missing translations for ${p.prompt}`);
    const prompt = promptRu;
    const cliches = cloud.cliches.map((c, i) => ({ ...c, text: rest[anchors.length + i]! }));
    const mapKeys = (o?: Record<string, unknown>) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [ru.get(k) ?? k, v]));
    out.push({ prompt, ...Object.fromEntries(BANDS.map((b) => [b, (p[b] as string[]).map((a) => ru.get(a)!)])), relabel: mapKeys(p.relabel), labels: mapKeys(p.labels) });
    const lc: Cloud = { prompt, cliches, embedder: lex.name, vectors: await lex.embed(cliches.map((c) => c.text)) };
    await writeFile(join(CACHE, `${cloudKey(prompt, lex.name)}.json`), JSON.stringify(lc));
    console.error(`${prompt} (${cliches.length} clichés)`);
  }
  await writeFile(new URL(`./${name}-ru.json`, import.meta.url), JSON.stringify({ prompts: out }, null, 2));
}
