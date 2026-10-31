import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseList } from "../src/llm.js";
import { ExplainSchema, IdeasSchema, JudgeSchema } from "../src/schemas.js";

describe("reply schemas", () => {
  test("list schemas wrap items in an object root and round-trip through parseList", () => {
    const reply = JSON.stringify({ items: [{ idea: "x", move: "y" }] });
    expect(IdeasSchema.parse(JSON.parse(reply)).items).toHaveLength(1);
    expect(parseList<{ idea: string }>(reply)[0]!.idea).toBe("x");
  });

  test("JSON Schema export has an object root (required by structured outputs)", () => {
    for (const s of [IdeasSchema, JudgeSchema, ExplainSchema]) expect(z.toJSONSchema(s).type).toBe("object");
  });

  test("explain schema rejects a reply without the rewrite", () => {
    expect(() => ExplainSchema.parse({ cliched: "", different: "", technique: "triz", move: "" })).toThrow();
  });
});
