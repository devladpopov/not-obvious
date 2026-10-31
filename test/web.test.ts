import { afterEach, describe, expect, test } from "bun:test";
import { webCheck, webMode } from "../src/web.js";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["NOT_OBVIOUS_WEB", "ANTHROPIC_API_KEY", "BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const clear = () => {
  for (const k of ["NOT_OBVIOUS_WEB", "ANTHROPIC_API_KEY", "BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"]) delete process.env[k];
};

describe("webMode", () => {
  test("off without keys", () => {
    clear();
    expect(webMode()).toBe("off");
  });
  test("claude when an Anthropic key is set, brave otherwise", () => {
    clear();
    process.env.BRAVE_API_KEY = "b";
    expect(webMode()).toBe("brave");
    process.env.ANTHROPIC_API_KEY = "a";
    expect(webMode()).toBe("claude");
  });
  test("NOT_OBVIOUS_WEB overrides", () => {
    clear();
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.NOT_OBVIOUS_WEB = "off";
    expect(webMode()).toBe("off");
  });
  test("off mode returns no checks without touching the network", async () => {
    clear();
    expect(await webCheck("task", ["a", "b"], "/nonexistent")).toEqual([undefined, undefined]);
  });
});
