/**
 * Embeddings for semantic distance.
 * - gemini: gemini-embedding-001 (free tier key works), default when GEMINI_API_KEY is set
 * - local: a small sentence-embedding model run on the CPU with transformers.js, no key and no quota.
 *   Used when @huggingface/transformers is installed (an optional peer dependency, ~300 MB with onnxruntime).
 * - lexical: offline fallback (hashed character trigrams). Crude, but keeps the
 *   server usable with zero keys and makes tests deterministic.
 * NOT_OBVIOUS_EMBEDDER=gemini|local|lexical forces one.
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { withRetry } from "./llm.js";

export type Vector = number[];

export interface Embedder {
  name: string;
  embed(texts: string[]): Promise<Vector[]>;
}

const DIM = 768;

export function lexicalEmbedder(): Embedder {
  return {
    name: "lexical-trigram",
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array<number>(512).fill(0);
        const s = ` ${t.toLowerCase().replace(/\s+/g, " ")} `;
        for (let i = 0; i < s.length - 2; i++) {
          let h = 2166136261;
          for (let j = i; j < i + 3; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619);
          v[(h >>> 0) % 512]! += 1;
        }
        return v;
      });
    },
  };
}

export function geminiEmbedder(key: string): Embedder {
  const model = process.env.NOT_OBVIOUS_EMBED_MODEL?.trim() || "gemini-embedding-001";
  return {
    name: model,
    async embed(texts) {
      const out: Vector[] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const chunk = texts.slice(i, i + 100);
        const r = await withRetry((signal) => fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              requests: chunk.map((text) => ({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                taskType: "SEMANTIC_SIMILARITY",
                outputDimensionality: DIM,
              })),
            }),
            signal,
          },
        ), { attempts: 5, baseMs: 4000 }); // the free tier limits per minute: back off up to ~2 min
        if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const data = (await r.json()) as { embeddings: { values: number[] }[] };
        out.push(...data.embeddings.map((e) => e.values));
      }
      return out;
    },
  };
}

/** Multilingual (~100 languages), 384 dimensions, 118 MB quantized. Best of four local models in calibration, on par with gemini-embedding-001 (docs/scoring.md). */
export const DEFAULT_LOCAL_MODEL = "Xenova/multilingual-e5-small";

export function localAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("@huggingface/transformers");
    return true;
  } catch {
    return false;
  }
}

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
const extractors = new Map<string, Promise<Extractor>>();

async function loadExtractor(model: string): Promise<Extractor> {
  const t = await import("@huggingface/transformers");
  // Models download once (from the Hugging Face hub) into ~/.not-obvious/models, next to the cloud cache.
  t.env.cacheDir = process.env.NOT_OBVIOUS_MODELS?.trim() || join(homedir(), ".not-obvious", "models");
  t.env.localModelPath = t.env.cacheDir;
  // The hub drops connections now and then: retry each request, then (below) the whole load.
  const hubFetch = t.env.fetch;
  t.env.fetch = async (...args: Parameters<typeof hubFetch>) => {
    for (let i = 0; ; i++) {
      try {
        return await hubFetch(...args);
      } catch (e) {
        if (i >= 5) throw e;
        await new Promise((res) => setTimeout(res, 500 * 2 ** i));
      }
    }
  };
  let lastErr: unknown;
  // Downloaded files stay cached, so a retry picks up where it stopped.
  for (let i = 0; i < 4; i++) {
    try {
      return (await t.pipeline("feature-extraction", model, { dtype: "q8" })) as unknown as Extractor;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
  throw new Error(`could not load the local embedding model ${model}: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

export function localEmbedder(model = process.env.NOT_OBVIOUS_LOCAL_MODEL?.trim() || DEFAULT_LOCAL_MODEL): Embedder {
  // e5 models are trained with a "query: " prefix and drift without it.
  const prefix = /e5/i.test(model) ? "query: " : "";
  return {
    name: `local-${model.split("/").at(-1)}`,
    async embed(texts) {
      let ext = extractors.get(model);
      if (!ext) extractors.set(model, (ext = loadExtractor(model)));
      const pipe = await ext.catch((e) => {
        extractors.delete(model);
        throw e;
      });
      const out: Vector[] = [];
      for (let i = 0; i < texts.length; i += 32) {
        const res = await pipe(texts.slice(i, i + 32).map((t) => prefix + t), { pooling: "mean", normalize: true });
        out.push(...res.tolist());
      }
      return out;
    },
  };
}

export function embedder(): Embedder {
  const mode = process.env.NOT_OBVIOUS_EMBEDDER?.trim().toLowerCase();
  if (mode === "lexical") return lexicalEmbedder();
  if (mode === "local") return localEmbedder();
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (key) return geminiEmbedder(key);
  if (mode === "gemini") throw new Error("NOT_OBVIOUS_EMBEDDER=gemini needs GEMINI_API_KEY");
  return localAvailable() ? localEmbedder() : lexicalEmbedder();
}

/** Embedders a cached cloud may have been built with: their cliché texts can be re-embedded instead of asking the models again. */
export const knownEmbedders = () => ["gemini-embedding-001", localEmbedder().name, "lexical-trigram"];
