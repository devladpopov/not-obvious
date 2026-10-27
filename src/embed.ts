/**
 * Embeddings for semantic distance.
 * - gemini: gemini-embedding-001 (free tier key works), default when GEMINI_API_KEY is set
 * - lexical: offline fallback (hashed character trigrams). Crude, but keeps the
 *   server usable with zero keys and makes tests deterministic.
 */

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
        const r = await withRetry(() => fetch(
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
          },
        ));
        if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const data = (await r.json()) as { embeddings: { values: number[] }[] };
        out.push(...data.embeddings.map((e) => e.values));
      }
      return out;
    },
  };
}

export function embedder(): Embedder {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (key && process.env.NOT_OBVIOUS_EMBEDDER !== "lexical") return geminiEmbedder(key);
  return lexicalEmbedder();
}
