import Anthropic from "@anthropic-ai/sdk";

/**
 * Minimal text-generation layer. Each provider returns plain text.
 * Order of providers = fallback chain (first that works wins).
 */

export type Tier = "fast" | "smart";

export interface Provider {
  name: string;
  /** Model label used in the cliché cloud / leaderboard, e.g. "claude-haiku-4-5". */
  model(tier: Tier): string;
  complete(prompt: string, opts: { tier: Tier; system?: string; json?: boolean }): Promise<string>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

/** Retry raw HTTP calls on 429/5xx with exponential backoff (the Anthropic SDK retries on its own). */
export async function withRetry(call: () => Promise<Response>, attempts = 4): Promise<Response> {
  let r = await call();
  for (let i = 1; i < attempts && (r.status === 429 || r.status >= 500); i++) {
    await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    r = await call();
  }
  return r;
}

export function anthropicProvider(): Provider | null {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return null;
  const client = new Anthropic({ apiKey: key });
  const models: Record<Tier, string> = {
    fast: env("NOT_OBVIOUS_CLAUDE_FAST") ?? "claude-haiku-4-5",
    smart: env("NOT_OBVIOUS_CLAUDE_SMART") ?? "claude-sonnet-5",
  };
  return {
    name: "anthropic",
    model: (t) => models[t],
    async complete(prompt, { tier, system, json }) {
      const res = await client.messages.create({
        model: models[tier],
        max_tokens: 8000,
        ...(system || json
          ? { system: [system, json ? "Reply with valid JSON only, no prose, no code fences." : ""].filter(Boolean).join("\n\n") }
          : {}),
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    },
  };
}

export function geminiProvider(): Provider | null {
  const key = env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY");
  if (!key) return null;
  const models: Record<Tier, string> = {
    fast: env("NOT_OBVIOUS_GEMINI_FAST") ?? "gemini-flash-latest",
    smart: env("NOT_OBVIOUS_GEMINI_SMART") ?? "gemini-pro-latest",
  };
  return {
    name: "gemini",
    model: (t) => models[t],
    async complete(prompt, { tier, system, json }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${models[tier]}:generateContent`;
      const body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: json ? { responseMimeType: "application/json" } : {},
      };
      const r = await withRetry(() =>
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
        }),
      );
      if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    },
  };
}

export function providers(): Provider[] {
  const all = [anthropicProvider(), geminiProvider()].filter((p): p is Provider => p !== null);
  if (all.length === 0) {
    throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY.");
  }
  return all;
}

/** Run on the first provider that answers; fall back to the next one on error. */
export async function complete(
  prompt: string,
  opts: { tier: Tier; system?: string; json?: boolean },
): Promise<{ text: string; model: string }> {
  const errors: string[] = [];
  for (const p of providers()) {
    try {
      return { text: await p.complete(prompt, opts), model: p.model(opts.tier) };
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All providers failed:\n${errors.join("\n")}`);
}

/** Parse JSON from a model reply, tolerating code fences and leading prose. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error(`No JSON in model reply: ${text.slice(0, 200)}`);
  const open = cleaned[start];
  const end = cleaned.lastIndexOf(open === "[" ? "]" : "}");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
