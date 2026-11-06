import { afterEach, describe, expect, test } from "bun:test";
import { embedder, knownEmbedders, localEmbedder } from "../src/embed.js";

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});
const clear = () => {
  for (const k of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "NOT_OBVIOUS_EMBEDDER", "NOT_OBVIOUS_LOCAL_MODEL"]) delete process.env[k];
};

describe("embedder choice", () => {
  test("a Gemini key wins by default", () => {
    clear();
    process.env.GEMINI_API_KEY = "k";
    expect(embedder().name).toBe("gemini-embedding-001");
  });
  test("without a key: local when transformers.js is installed (it is a dev dependency here)", () => {
    clear();
    expect(embedder().name).toBe("local-multilingual-e5-small");
  });
  test("NOT_OBVIOUS_EMBEDDER forces one, NOT_OBVIOUS_LOCAL_MODEL picks the model", () => {
    clear();
    process.env.GEMINI_API_KEY = "k";
    process.env.NOT_OBVIOUS_EMBEDDER = "lexical";
    expect(embedder().name).toBe("lexical-trigram");
    process.env.NOT_OBVIOUS_EMBEDDER = "local";
    process.env.NOT_OBVIOUS_LOCAL_MODEL = "Xenova/bge-small-en-v1.5";
    expect(embedder().name).toBe("local-bge-small-en-v1.5");
    expect(knownEmbedders()).toContain("local-bge-small-en-v1.5");
  });
  test("gemini without a key is an error, not a silent fallback", () => {
    clear();
    process.env.NOT_OBVIOUS_EMBEDDER = "gemini";
    expect(() => embedder()).toThrow(/GEMINI_API_KEY/);
  });
  test("local model names are file-safe", () => {
    expect(localEmbedder("Xenova/multilingual-e5-small").name).toBe("local-multilingual-e5-small");
  });
});
