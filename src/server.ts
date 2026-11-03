#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { baseline, diverge, explain, remix, score } from "./engine.js";
import { TECHNIQUES } from "./techniques.js";

const server = new McpServer({ name: "not-obvious", version: "0.1.0" });

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (e as Error).message }] });
const run = async (fn: () => Promise<unknown>) => {
  try {
    return json(await fn());
  } catch (e) {
    return fail(e);
  }
};

const prompt = z.string().min(3).describe("The task or question, exactly as you would ask an AI.");

server.registerTool(
  "baseline",
  {
    title: "Cliché cloud",
    description:
      "See what every AI would say. Asks each configured model the plain question and returns the cloud of typical answers. Call this first; other tools reuse the cached cloud.",
    inputSchema: { prompt, per_model: z.number().int().min(3).max(30).optional(), refresh: z.boolean().optional() },
  },
  ({ prompt, per_model, refresh }) =>
    run(async () => {
      const c = await baseline(prompt, { perModel: per_model, refresh });
      return { prompt: c.prompt, embedder: c.embedder, size: c.cliches.length, cliches: c.cliches };
    }),
);

server.registerTool(
  "diverge",
  {
    title: "Go somewhere else",
    description: `Generate ideas away from the cliché cloud with a creativity technique (or "all" five in parallel). Keeps only ideas that measurably escaped: Cliché Score below max_cliche and usefulness at least min_usefulness; regenerates with the rejection reasons when too few survive. Techniques: ${TECHNIQUES.map((t) => `${t.id} (${t.name})`).join(", ")}.`,
    inputSchema: {
      prompt,
      technique: z.enum(["all", ...TECHNIQUES.map((t) => t.id)] as [string, ...string[]]),
      count: z.number().int().min(1).max(12).optional().describe("Surviving ideas wanted per technique (default 4)."),
      max_cliche: z.number().min(1).max(100).optional().describe("Keep ideas with Cliché Score below this (default 50)."),
      min_usefulness: z.number().min(1).max(10).optional().describe("Keep ideas rated at least this useful, 1-10 (default 6)."),
      rounds: z.number().int().min(1).max(4).optional().describe("Generation rounds per technique (default 2)."),
      web: z.boolean().optional().describe("Search the web for each surviving idea and flag ones that already exist online (default true)."),
    },
  },
  ({ prompt, technique, count, max_cliche, min_usefulness, rounds, web }) =>
    run(() => diverge(prompt, technique, { count, maxCliche: max_cliche, minUseful: min_usefulness, rounds, web })),
);

server.registerTool(
  "remix",
  {
    title: "Remix A x B",
    description:
      "Cross two ideas into hybrids that neither parent nor the cliché cloud contains. Scores both parents first, takes at least one component (mechanism, audience, channel, constraint) from each, and marks hybrids that escaped: Cliché Score below max_cliche, usefulness at least min_usefulness, not a near-copy of a parent.",
    inputSchema: {
      prompt,
      idea_a: z.string().min(3),
      idea_b: z.string().min(3),
      count: z.number().int().min(1).max(8).optional(),
      max_cliche: z.number().min(1).max(100).optional(),
      min_usefulness: z.number().min(1).max(10).optional(),
    },
  },
  ({ prompt, idea_a, idea_b, count, max_cliche, min_usefulness }) =>
    run(() => remix(prompt, idea_a, idea_b, { count, maxCliche: max_cliche, minUseful: min_usefulness })),
);

server.registerTool(
  "score",
  {
    title: "Cliché Score",
    description:
      "Measure how clichéd ideas are: 0 = far from what every AI says, 100 = the typical AI answer. Semantic distance to the cliché cloud for this prompt (60%) blended with web prevalence (40%): each idea is searched on the web and rated 0-10 for how much of it already exists, with sources. Also returns an LLM judge verdict on mechanism overlap (closest cliché and why) and a usefulness critic (1-10). With web: false the score is the embedding part alone.",
    inputSchema: {
      prompt,
      ideas: z.array(z.string().min(3)).min(1).max(30),
      critic: z.boolean().optional(),
      judge: z.boolean().optional(),
      web: z.boolean().optional().describe("Search the web per idea and blend prevalence into the score (one search each, cached). Default true."),
    },
  },
  ({ prompt, ideas, critic, judge, web }) => run(() => score(prompt, ideas, { critic, judge, web })),
);

server.registerTool(
  "explain",
  {
    title: "Explain the score",
    description:
      "Why an idea got its Cliché Score (embedding distance, mechanism judge, closest cliché, what already exists on the web): what is clichéd, what is new, one concrete move to push it further, and the idea rewritten with that move and re-scored.",
    inputSchema: { prompt, idea: z.string().min(3) },
  },
  ({ prompt, idea }) => run(() => explain(prompt, idea)),
);

await server.connect(new StdioServerTransport());
