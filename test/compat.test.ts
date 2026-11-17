/** OpenAI-compatible providers (OpenRouter, Ollama, LM Studio) against a fake /chat/completions endpoint. */
import { afterEach, describe, expect, test } from "bun:test";
import { AnswersSchema } from "../src/schemas.js";
import { compatProvider, compatProviders, DEFAULT_OPENROUTER_MODELS, providers, stripThinking } from "../src/llm.js";

const realFetch = globalThis.fetch;
const saved = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

type Call = { url: string; headers: Record<string, string>; body: Record<string, any> };
function fake(answer: (c: Call, i: number) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(c);
    return answer(c, calls.length - 1);
  }) as typeof fetch;
  return calls;
}
const ok = (content: string, finish = "stop") =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { headers: { "content-type": "application/json" } });

const clearKeys = () => {
  for (const k of Object.keys(process.env)) if (/^(ANTHROPIC|GEMINI|GOOGLE|OPENROUTER)_|^NOT_OBVIOUS_(OPENAI|OPENROUTER)_/.test(k)) delete process.env[k];
};

describe("compatProvider", () => {
  test("sends system + user messages and a json_schema response_format", async () => {
    const calls = fake(() => ok('{"items": ["a", "b"]}'));
    const p = compatProvider({ name: "t", baseUrl: "http://x/v1/", model: "m1", apiKey: "k" });
    const text = await p.complete("hi", { tier: "fast", system: "sys", json: true, schema: AnswersSchema });
    expect(text).toBe('{"items": ["a", "b"]}');
    expect(calls[0]!.url).toBe("http://x/v1/chat/completions");
    expect(calls[0]!.headers.authorization).toBe("Bearer k");
    expect(calls[0]!.body.model).toBe("m1");
    expect(calls[0]!.body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
    expect(calls[0]!.body.response_format.type).toBe("json_schema");
    expect(calls[0]!.body.response_format.json_schema.schema.properties.items.type).toBe("array");
    expect(p.model("smart")).toBe("m1");
  });

  test("no key = no authorization header (local servers)", async () => {
    const calls = fake(() => ok("x"));
    await compatProvider({ name: "t", baseUrl: "http://x/v1", model: "m" }).complete("hi", { tier: "fast" });
    expect(calls[0]!.headers.authorization).toBeUndefined();
    expect(calls[0]!.body.response_format).toBeUndefined();
  });

  test("falls back to json_object + a JSON hint when json_schema is rejected, and remembers it", async () => {
    const calls = fake((c) => (c.body.response_format?.type === "json_schema" ? new Response("unsupported", { status: 400 }) : ok('{"items": []}')));
    const p = compatProvider({ name: "t", baseUrl: "http://x/v1", model: "m" });
    await p.complete("hi", { tier: "fast", json: true, schema: AnswersSchema });
    expect(calls.map((c) => c.body.response_format.type)).toEqual(["json_schema", "json_object"]);
    expect(calls[1]!.body.messages[0].content).toContain("valid JSON only");
    await p.complete("again", { tier: "fast", json: true, schema: AnswersSchema });
    expect(calls.length).toBe(3);
    expect(calls[2]!.body.response_format.type).toBe("json_object");
  });

  test("strips leaked <think> blocks", async () => {
    fake(() => ok('<think>\nlet me think\n</think>\n{"items": ["x"]}'));
    const text = await compatProvider({ name: "t", baseUrl: "http://x/v1", model: "m" }).complete("hi", { tier: "fast" });
    expect(text).toBe('{"items": ["x"]}');
  });

  test("strips Gemma <thought> drafts, unclosed blocks too", () => {
    expect(stripThinking("<thought>\n* Draft 1: x (20 words) - Good.\n</thought>1. Loyalty cards\n2. Events")).toBe("1. Loyalty cards\n2. Events");
    expect(stripThinking("answer <think>a</think> and <thought>b")).toBe("answer  and");
    expect(stripThinking("plain")).toBe("plain");
  });

  test("errors: HTTP status, truncation, refusal, empty reply", async () => {
    const p = compatProvider({ name: "t", baseUrl: "http://x/v1", model: "m" });
    fake(() => new Response("bad key", { status: 401 }));
    await expect(p.complete("hi", { tier: "fast" })).rejects.toThrow("m 401: bad key");
    fake(() => ok("half", "length"));
    await expect(p.complete("hi", { tier: "fast" })).rejects.toThrow("truncated");
    fake(() => new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: "no" } }] })));
    await expect(p.complete("hi", { tier: "fast" })).rejects.toThrow("refused");
    fake(() => ok("  "));
    await expect(p.complete("hi", { tier: "fast" })).rejects.toThrow("empty reply");
  });
});

describe("compatProviders from env", () => {
  test("OpenRouter: one provider per model, default list when none given", () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = "or";
    expect(compatProviders().map((p) => p.model("fast"))).toEqual(DEFAULT_OPENROUTER_MODELS.split(","));
    process.env.NOT_OBVIOUS_OPENROUTER_MODELS = "a/x, b/y";
    expect(compatProviders().map((p) => p.name)).toEqual(["openrouter:a/x", "openrouter:b/y"]);
  });

  test("OpenRouter requests go to openrouter.ai with attribution headers", async () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = "or";
    process.env.NOT_OBVIOUS_OPENROUTER_MODELS = "a/x";
    const calls = fake(() => ok("x"));
    await compatProviders()[0]!.complete("hi", { tier: "fast" });
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.headers["X-Title"]).toBe("Not Obvious");
  });

  test("generic endpoint (Ollama) needs a model list, key optional", () => {
    clearKeys();
    process.env.NOT_OBVIOUS_OPENAI_BASE_URL = "http://localhost:11434/v1";
    expect(() => compatProviders()).toThrow("NOT_OBVIOUS_OPENAI_MODELS");
    process.env.NOT_OBVIOUS_OPENAI_MODELS = "llama3.3,qwen3";
    expect(compatProviders().map((p) => p.name)).toEqual(["compat:llama3.3", "compat:qwen3"]);
    // A local server alone is a complete setup: no cloud keys needed.
    expect(providers().length).toBe(2);
  });

  test("no provider at all names every option", () => {
    clearKeys();
    expect(() => providers()).toThrow(/OPENROUTER_API_KEY.*NOT_OBVIOUS_OPENAI_BASE_URL/);
  });
});
