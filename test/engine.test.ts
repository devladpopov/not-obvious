/**
 * End-to-end engine tests without keys or network: a fake Gemini endpoint answers every model call,
 * embeddings run in the offline lexical mode and the cache goes to a temp dir.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseline, diverge, explain, remix, score } from "../src/engine.js";

const PROMPT = "Suggest a side business for a software developer";
// A tight cloud, as real ones are: variations of a few answers, so the lexical embedder can tell far ideas apart.
const CLOUD = [
  "Build a SaaS product for small businesses",
  "Build a SaaS tool for small business owners",
  "Sell a SaaS app to small businesses",
  "Freelance web development for small businesses",
  "Freelance web design for local businesses",
  "Sell an online course about web development",
  "Sell an online programming course",
  "Start a YouTube channel about web development",
  "Sell WordPress themes to small businesses",
  "Offer IT consulting to small businesses",
];
const FAR = [
  "Rescue floppy disks and obsolete file formats for genealogists, charged per item",
  "Referee contested deliverables between agencies and clients as a neutral, flat fee split",
  "Play a hostile, confused user and record sessions breaking signup flows",
];

const asks: string[] = [];
const saved = { ...process.env };
const realFetch = globalThis.fetch;
let dir = "";

/** Every prompt the engine sends is recognised by a phrase from its template. */
function reply(ask: string): unknown {
  const ideasIn = (marker: string) =>
    ask.slice(ask.indexOf(marker)).split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
  if (ask.includes("Give 10 distinct answers")) return { items: CLOUD };
  if (ask.includes("Rate how useful")) return { items: ideasIn("Ideas:").map((i) => ({ score: /nonsense/.test(i) ? 2 : 7, why: "workable" })) };
  if (ask.includes("MECHANISM")) return { items: ideasIn("Ideas:").map((i) => ({ overlap: /SaaS/.test(i) ? 9 : 1, closest: /SaaS/.test(i) ? 1 : 0, why: "test" })) };
  if (ask.includes("Technique:")) return { items: [{ idea: CLOUD[0], move: "none" }, ...FAR.map((idea) => ({ idea, move: "far" }))] };
  if (ask.includes("hybrids")) return { items: [{ idea: FAR[1], from_a: "contracts", from_b: "neutral" }, { idea: CLOUD[0], from_a: "SaaS", from_b: "-" }] };
  if (ask.includes("Explain the score"))
    return { cliched: "a course", different: "nothing", technique: "far-analogy", move: "escape room", rewrite: "A coding escape room kit for libraries" };
  throw new Error(`unexpected prompt: ${ask.slice(0, 80)}`);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "not-obvious-test-"));
  for (const k of Object.keys(process.env)) if (/^(ANTHROPIC|GEMINI|GOOGLE|BRAVE)_/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    GEMINI_API_KEY: "test",
    NOT_OBVIOUS_GEMINI_FAST: "fake-fast",
    NOT_OBVIOUS_GEMINI_SMART: "fake-smart",
    NOT_OBVIOUS_EMBEDDER: "lexical",
    NOT_OBVIOUS_WEB: "off",
    NOT_OBVIOUS_CACHE: dir,
  });
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { contents: { parts: { text: string }[] }[] };
    const ask = body.contents[0]!.parts[0]!.text;
    asks.push(ask);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply(ask)) }] } }] }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  await rm(dir, { recursive: true, force: true });
});

describe("engine (fake provider, lexical embeddings)", () => {
  test("baseline builds the cloud once and then serves it from the cache", async () => {
    const c = await baseline(PROMPT);
    expect(c.cliches.map((x) => x.text)).toEqual(CLOUD);
    expect(c.cliches[0]!.model).toBe("fake-fast");
    expect(c.embedder).toBe("lexical-trigram");
    const n = asks.length;
    await baseline(PROMPT);
    expect(asks.length).toBe(n);
    expect((await readdir(dir)).some((f) => f.endsWith(".json"))).toBe(true);
  });

  test("score: a cloud answer scores 100 and higher than far ideas, with judge and critic attached", async () => {
    const [copy, ...far] = await score(PROMPT, [CLOUD[0]!, ...FAR]);
    expect(copy!.cliche).toBe(100);
    expect(copy!.nearest).toBe(CLOUD[0]!);
    expect(copy!.judge?.overlap).toBe(9);
    for (const f of far) {
      expect(f.cliche).toBeLessThan(copy!.cliche);
      expect(f.usefulness?.score).toBe(7);
      expect(f.web).toBeUndefined();
    }
  });

  test("diverge keeps far ideas, rejects the cloud copy and feeds the rejection into the next round", async () => {
    asks.length = 0;
    const r = await diverge(PROMPT, "scamper", { count: 10, rounds: 2 });
    expect(r.errors).toEqual([]);
    expect(r.ideas.length).toBeGreaterThan(0);
    for (const i of r.ideas) expect(i.cliche).toBeLessThan(50);
    expect(r.ideas.map((i) => i.idea)).not.toContain(CLOUD[0]);
    expect(r.rejected[0]?.idea).toBe(CLOUD[0]!);
    expect(r.techniques[0]!.rounds).toBe(2);
    const rounds = asks.filter((a) => a.includes("Technique:"));
    expect(rounds.length).toBe(2);
    expect(rounds[1]).toContain("Already tried and rejected");
    expect(rounds[1]).toContain(CLOUD[0]!);
  });

  test("diverge rejects unknown techniques before calling any model", async () => {
    await expect(diverge(PROMPT, "brainstorm")).rejects.toThrow();
  });

  test("remix scores parents and marks escaped hybrids first", async () => {
    const r = await remix(PROMPT, CLOUD[6]!, FAR[0]!);
    expect(r.parents.map((p) => p.idea)).toEqual([CLOUD[6]!, FAR[0]!]);
    expect(r.hybrids.length).toBe(2);
    expect(r.hybrids[0]!.escaped).toBe(true);
    expect(r.hybrids.at(-1)!.idea).toBe(CLOUD[0]!);
    expect(r.hybrids.at(-1)!.escaped).toBe(false);
  });

  test("explain returns the move and the re-scored rewrite", async () => {
    const r = await explain(PROMPT, CLOUD[6]!);
    expect(r.cliche).toBe(100);
    expect(r.explanation.technique).toBe("far-analogy");
    expect(r.rewrite.idea).toBe("A coding escape room kit for libraries");
    expect(r.rewrite.delta).toBe(r.rewrite.cliche - r.cliche);
    expect(r.rewrite.cliche).toBeLessThan(100);
  });
});

describe("withContext", () => {
  const { withContext } = require("../src/engine.js") as typeof import("../src/engine.js");
  test("no context keeps the prompt as is", () => {
    expect(withContext(PROMPT)).toBe(PROMPT);
    expect(withContext(PROMPT, "  ")).toBe(PROMPT);
  });
  test("context goes in front, labelled once", () => {
    expect(withContext(PROMPT, "I'm a nurse in Lagos.")).toBe(`About me: I'm a nurse in Lagos.\n\n${PROMPT}`);
    expect(withContext(PROMPT, "About me: I'm a nurse.")).toBe(`About me: I'm a nurse.\n\n${PROMPT}`);
  });
  test("a different context gives a different cloud", async () => {
    const plain = await baseline(PROMPT);
    const mine = await baseline(withContext(PROMPT, "I'm a retired ferry mechanic in northern Norway."));
    expect(mine.prompt).not.toBe(plain.prompt);
    expect(mine.prompt.startsWith("About me:")).toBe(true);
  });
});
