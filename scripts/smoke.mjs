// Smoke test of the built server over stdio, as an MCP client would see it: node scripts/smoke.mjs
// Needs no API keys: lists tools and checks that a call without providers fails cleanly instead of crashing.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC|GEMINI|GOOGLE|BRAVE)_/.test(k)));
const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/server.js"], env: { ...env, NOT_OBVIOUS_CACHE: "dist/.smoke-cache" } });
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
const want = ["baseline", "diverge", "explain", "remix", "score"];
if (JSON.stringify(names) !== JSON.stringify(want)) throw new Error(`tools: ${names.join(", ")}`);
const noContext = tools.filter((t) => !t.inputSchema?.properties?.context).map((t) => t.name);
if (noContext.length) throw new Error(`no context field: ${noContext.join(", ")}`);

const r = await client.callTool({ name: "baseline", arguments: { prompt: "Suggest a side business for a software developer" } });
const text = r.content?.[0]?.text ?? "";
if (!r.isError || !/No LLM provider/.test(text)) throw new Error(`expected a clean "no provider" error, got: ${text.slice(0, 200)}`);

await client.close();
console.log(`ok: ${names.length} tools, clean error without keys`);
