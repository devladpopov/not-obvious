#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { baseline, diverge, explain, remix, score } from "./engine.js";
import { TECHNIQUES } from "./techniques.js";

const server = new McpServer({ name: "not-obvious", version: "0.0.1" });

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
    },
  },
  ({ prompt, technique, count, max_cliche, min_usefulness, rounds }) =>
    run(() => diverge(prompt, technique, { count, maxCliche: max_cliche, minUseful: min_usefulness, rounds })),
);

server.registerTool(
  "remix",
  {
    title: "Remix A x B",
    description: "Cross two ideas into hybrids that neither parent nor the cliché cloud contains. Returns scored hybrids.",
    inputSchema: { prompt, idea_a: z.string().min(3), idea_b: z.string().min(3), count: z.number().int().min(1).max(8).optional() },
  },
  ({ prompt, idea_a, idea_b, count }) => run(() => remix(prompt, idea_a, idea_b, { count })),
);

server.registerTool(
  "score",
  {
    title: "Cliché Score",
    description:
      "Measure how clichéd ideas are: 0 = far from what every AI says, 100 = the typical AI answer. Blends semantic distance to the cliché cloud for this prompt with an LLM judge of mechanism overlap (same idea in other words?), plus a usefulness critic (1-10).",
    inputSchema: { prompt, ideas: z.array(z.string().min(3)).min(1).max(30), critic: z.boolean().optional(), judge: z.boolean().optional() },
  },
  ({ prompt, ideas, critic, judge }) => run(() => score(prompt, ideas, { critic, judge })),
);

server.registerTool(
  "explain",
  {
    title: "Explain the score",
    description: "Why an idea got its Cliché Score: what is clichéd, what is new, and one concrete move to push it further.",
    inputSchema: { prompt, idea: z.string().min(3) },
  },
  ({ prompt, idea }) => run(() => explain(prompt, idea)),
);

await server.connect(new StdioServerTransport());
