import { describe, expect, test } from "bun:test";
import { lexicalEmbedder } from "../src/embed.js";
import { clicheScore, combineScores, cosine } from "../src/math.js";

describe("cosine", () => {
  test("identical and orthogonal", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("clicheScore", () => {
  const cloudTexts = [
    "Start a YouTube channel about cooking",
    "Start a cooking blog",
    "Start a cooking channel on YouTube with recipes",
    "Open a small cooking school",
  ];

  test("a copy of a cliché scores high, an unrelated idea scores lower", async () => {
    const emb = lexicalEmbedder();
    const cloud = await emb.embed(cloudTexts);
    const [copy, far] = await emb.embed([
      "Start a YouTube channel about cooking recipes",
      "Rent out sourdough starters to offices by subscription",
    ]);
    const a = clicheScore(copy!, cloud);
    const b = clicheScore(far!, cloud);
    expect(a.cliche).toBeGreaterThan(b.cliche);
    expect(a.cliche).toBeGreaterThanOrEqual(70);
    expect(b.cliche).toBeLessThanOrEqual(100);
    expect(b.cliche).toBeGreaterThanOrEqual(0);
  });

  test("empty cloud throws", () => {
    expect(() => clicheScore([1, 0], [])).toThrow();
  });
});

describe("combineScores", () => {
  test("no judge = embedding only", () => {
    expect(combineScores(80, undefined)).toBe(80);
  });
  test("judge pulls a same-mechanism idea up and a new mechanism down", () => {
    expect(combineScores(30, 10, 0.5)).toBe(65);
    expect(combineScores(85, 1, 0.5)).toBe(48);
    expect(combineScores(85, 1, 0)).toBe(85);
  });
  test("clamps the overlap to 0-10", () => {
    expect(combineScores(50, 42, 1)).toBe(100);
    expect(combineScores(50, -3, 1)).toBe(0);
  });
});
