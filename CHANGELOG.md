# Changelog

## 0.4.1 (unreleased)

- `stripThinking`: the OpenAI-compatible provider drops `<think>` and `<thought>` blocks; Gemma 4 on Gemini's OpenAI endpoint puts its reasoning drafts into the reply.
- Leaderboard: 13 models, open-weight Gemma 4 31b and 26b-a4b added through the compat provider; any OpenAI-compatible server via `LB_COMPAT_URL` / `LB_COMPAT_MODELS`; Claude judge through a CLI via `LB_CLAUDE_CMD`.
- Judge weight by script: `judgeWeightFor(prompt)` gives the mechanism judge weight 1 for prompts written mostly outside the Latin script (Cyrillic, CJK, Arabic...), 0 otherwise. On the Russian calibration set the judge alone scores 61% / 79% / 0.55 against 50% / 70% / 0.37 for embeddings, in English the difference is noise (docs/scoring.md#language). `bench/calibrate.ts` sweeps the judge weight and picks it by leave-one-prompt-out CV.
- Tests: 60.

## 0.4.0 (2026-11-17, staged on npm, awaiting approval)

- New tool `map`: the cliché cloud as 2-8 themes (average-linkage clustering of the cached cloud, medoid as the representative), each with a name, the assumption behind it, its share of the cloud, the models that landed there and `consensus` (share of all models). `everyAiSays` lists the themes every model hits. Labels take one fast model call; `label: false` makes none. CLI: `not-obvious map "prompt" [themes] [--no-label]`.
- New providers: OpenRouter (`OPENROUTER_API_KEY`, `NOT_OBVIOUS_OPENROUTER_MODELS`) and any OpenAI-compatible `/chat/completions` server (`NOT_OBVIOUS_OPENAI_BASE_URL`, `NOT_OBVIOUS_OPENAI_MODELS`, optional `NOT_OBVIOUS_OPENAI_API_KEY`): Ollama, LM Studio, vLLM, Groq, Together and others. Each model is its own provider and adds its own batch to the cloud. Structured output via `json_schema`, automatic fallback to `json_object` when a server rejects it, `<think>` blocks stripped. With Ollama and local embeddings Not Obvious runs with no keys and nothing leaving the machine.
- New MCP prompt `not-obvious` (task, optional about_me): map, diverge all, the three best ideas, explain the best one.
- `examples/`: Claude Desktop, Claude Code, Cursor + OpenRouter, fully local Ollama, and a real session (map, score, diverge). `docs/providers.md`.
- Tests: 41 -> 55 (compat provider against a fake endpoint, clustering, map). Smoke test checks 6 tools and the prompt.

## 0.3.0 (2026-11-06)

- Local embeddings through transformers.js (multilingual-e5-small by default), no Gemini key needed. `NOT_OBVIOUS_EMBEDDER=gemini|local|lexical`.

## 0.2.0 (2026-11-05)

- Optional `context` (a few sentences about the person asking) in every tool and the CLI.

## 0.1.0 (2026-11-03)

- First release: baseline, diverge, remix, score, explain; Cliché Score with web prevalence; leaderboard of 11 models.
