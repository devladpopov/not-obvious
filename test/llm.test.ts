import { describe, expect, test } from "bun:test";
import { cloudKey } from "../src/engine.js";
import { modelList, parseJson, retryAfterMs, withRetry } from "../src/llm.js";

const res = (status: number, headers: Record<string, string> = {}) => new Response("x", { status, headers });
const noSleep = async () => {};

describe("withRetry", () => {
  test("retries 429/5xx and returns the first success", async () => {
    const seq = [429, 503, 200];
    let calls = 0;
    const r = await withRetry(async () => res(seq[calls++]!), { sleep: noSleep });
    expect(r.status).toBe(200);
    expect(calls).toBe(3);
  });

  test("does not retry 4xx client errors", async () => {
    let calls = 0;
    const r = await withRetry(async () => (calls++, res(401)), { sleep: noSleep });
    expect(r.status).toBe(401);
    expect(calls).toBe(1);
  });

  test("retries thrown network errors and timeouts, then rethrows", async () => {
    let calls = 0;
    const boom = () => {
      calls++;
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    };
    await expect(withRetry(async () => boom(), { attempts: 3, sleep: noSleep })).rejects.toThrow("timed out after 3 attempts");
    expect(calls).toBe(3);
  });

  test("honours Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    await withRetry(async () => (calls++ === 0 ? res(429, { "retry-after": "2" }) : res(200)), {
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toEqual([2000]);
    expect(retryAfterMs(res(429, { "retry-after": "999" }))).toBe(60_000);
    expect(retryAfterMs(res(429))).toBeUndefined();
  });

  test("aborts a hanging request via the per-attempt signal", async () => {
    const hang = (signal: AbortSignal) =>
      new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    await expect(withRetry(hang, { attempts: 2, timeoutMs: 20, sleep: noSleep })).rejects.toThrow("timed out");
  });
});

describe("helpers", () => {
  test("parseJson tolerates fences and prose", () => {
    expect(parseJson<string[]>('Sure!\n```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
    expect(parseJson<{ x: number }>('{"x": 1} trailing')).toEqual({ x: 1 });
  });

  test("modelList splits comma lists", () => {
    expect(modelList(" a, b ,", "z")).toEqual(["a", "b"]);
    expect(modelList(undefined, "z")).toEqual(["z"]);
  });

  test("cloudKey normalises the prompt and separates embedders", () => {
    expect(cloudKey("Side  business ", "e1")).toBe(cloudKey("side business", "e1"));
    expect(cloudKey("side business", "e1")).not.toBe(cloudKey("side business", "e2"));
  });
});
