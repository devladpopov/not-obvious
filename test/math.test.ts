import { describe, expect, test } from "bun:test";
import { lexicalEmbedder } from "../src/embed.js";
import { clicheScore, combineScores, cosine, isNonLatin, JUDGE_WEIGHT, judgeWeightFor, spearman } from "../src/math.js";

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

describe("combineScores with web prevalence", () => {
  test("web is ignored at weight 0 and when missing", () => {
    expect(combineScores(30, 10, 0.5, 10, 0)).toBe(65);
    expect(combineScores(30, 10, 0.5, undefined, 0.5)).toBe(65);
  });
  test("web blends on top of embedding + judge", () => {
    expect(combineScores(30, 10, 0.5, 0, 0.5)).toBe(33);
    expect(combineScores(80, undefined, 0.6, 10, 0.25)).toBe(85);
  });
});

describe("spearman", () => {
  test("perfect, inverse and tied rankings", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.949, 2);
  });
});

describe("clustering", () => {
  const { agglomerate, medoid, defaultThemes } = require("../src/math.js") as typeof import("../src/math.js");
  const vs = [[1, 0, 0], [0.95, 0.1, 0], [0.9, 0.2, 0], [0, 1, 0], [0.1, 0.95, 0], [0, 0, 1]];
  test("agglomerate groups near vectors, biggest cluster first, every index once", () => {
    expect(agglomerate(vs, 3)).toEqual([[0, 1, 2], [3, 4], [5]]);
    expect(agglomerate(vs, 1)).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(agglomerate(vs, 99).length).toBe(6);
  });
  test("medoid picks the most central member", () => {
    expect(medoid(vs, [0, 1, 2])).toBe(1);
    expect(medoid(vs, [5])).toBe(5);
  });
  test("defaultThemes stays within 2-8", () => {
    expect(defaultThemes(2)).toBe(2);
    expect(defaultThemes(40)).toBe(4);
    expect(defaultThemes(500)).toBe(8);
  });
});

describe("judgeWeightFor", () => {
  test("Latin-script prompts keep the English-calibrated weight", () => {
    expect(judgeWeightFor("How can a small coffee shop attract more customers?")).toBe(JUDGE_WEIGHT);
    expect(judgeWeightFor("¿Cómo puede una cafetería atraer más clientes?")).toBe(JUDGE_WEIGHT);
    expect(judgeWeightFor("")).toBe(JUDGE_WEIGHT);
    expect(judgeWeightFor("123 !!!")).toBe(JUDGE_WEIGHT);
  });
  test("non-Latin prompts use the judge only", () => {
    expect(judgeWeightFor("Как небольшой кофейне привлечь больше клиентов?")).toBe(1);
    expect(judgeWeightFor("如何让小咖啡店吸引更多顾客")).toBe(1);
    expect(judgeWeightFor("Идеи для MVP на TypeScript и Bun")).toBe(1);
  });
  test("mixed text goes by the majority of letters", () => {
    expect(isNonLatin("Suggest a podcast idea, тема история")).toBe(false);
    expect(isNonLatin("Предложи идею подкаста про history")).toBe(true);
  });
  test("with j = 1 the score follows the judge", () => {
    expect(combineScores(20, 9, judgeWeightFor("Идея для кофейни"))).toBe(90);
  });
});
