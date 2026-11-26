# Which model is the most banal?

Date: 2026-11-26. 16 models from 6 vendors, 30 of 30 prompts, 5 answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).

Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.

| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |
|---|---|---|---|---|---|---|
| 1 | claude-haiku-4-5 | Anthropic | 90.9 (87.3-93.9) | 88% | 0.870 | 0.817 |
| 2 | llama3.2:3b | Meta | 89.8 (86.4-92.7) | 86% | 0.862 | 0.818 |
| 3 | claude-sonnet-5-5 | Anthropic | 88.8 (84.6-92.6) | 84% | 0.864 | 0.814 |
| 4 | gemini-3.8-flash | Google | 88.6 (84.1-92.6) | 86% | 0.861 | 0.813 |
| 5 | gemini-3.6-flash | Google | 88.2 (83.5-92.1) | 84% | 0.861 | 0.813 |
| 6 | claude-haiku-5-5 | Anthropic | 88.1 (83.9-92.1) | 85% | 0.864 | 0.808 |
| 7 | qwen3:4b | Alibaba | 87.9 (83.6-91.7) | 84% | 0.858 | 0.812 |
| 8 | claude-fable-5-1 | Anthropic | 87.5 (82.6-91.8) | 83% | 0.865 | 0.809 |
| 9 | claude-opus-5-5 | Anthropic | 87.1 (82.5-91.2) | 83% | 0.862 | 0.805 |
| 10 | gemini-3.5-flash-lite | Google | 86.9 (81.4-91.8) | 83% | 0.861 | 0.807 |
| 11 | mistral:7b | Mistral | 86.4 (82.4-89.8) | 82% | 0.858 | 0.804 |
| 12 | GigaChat-2-Max | Sber | 86.2 (81.9-89.9) | 82% | 0.862 | 0.798 |
| 13 | gemma-4-26b-a4b-it | Google | 86.1 (80.9-90.7) | 82% | 0.863 | 0.806 |
| 14 | GigaChat-2-Pro | Sber | 85.8 (81.1-90.2) | 82% | 0.858 | 0.804 |
| 15 | gemma-4-31b-it | Google | 85.4 (79.6-90.5) | 81% | 0.863 | 0.807 |
| 16 | GigaChat-2 | Sber | 84.2 (77.5-89.4) | 79% | 0.858 | 0.802 |

Nearest similarity: mean cosine between an answer and the closest answer of another vendor's model. Self-repetition: mean cosine between a model's own 5 answers to one prompt (higher = the answers are variations of one idea). Intervals: bootstrap over prompts.

## Second view: shared ideas, judged by LLMs

No embeddings here. For each of 30 prompts all 80 answers were anonymised, shuffled and grouped into ideas by two judges (claude-opus-5-5 and gemini-3.5-flash-lite). **Shared** = share of a model's answers whose idea at least one model from another vendor also gave. Mean of both judges, 95% bootstrap interval over prompts.

| # | model | vendor | shared (95% CI) | claude-opus-5-5 | gemini-3.5-flash-lite |
|---|---|---|---|---|---|
| 1 | gemma-4-26b-a4b-it | Google | 84% (75%-91%) | 83% | 85% |
| 2 | gemma-4-31b-it | Google | 84% (75%-91%) | 83% | 84% |
| 3 | claude-fable-5-1 | Anthropic | 83% (73%-92%) | 82% | 84% |
| 4 | claude-haiku-5-5 | Anthropic | 83% (73%-91%) | 81% | 85% |
| 5 | claude-sonnet-5-5 | Anthropic | 83% (73%-91%) | 81% | 84% |
| 6 | claude-haiku-4-5 | Anthropic | 81% (72%-89%) | 81% | 82% |
| 7 | claude-opus-5-5 | Anthropic | 81% (72%-89%) | 79% | 83% |
| 8 | GigaChat-2-Max | Sber | 78% (68%-86%) | 75% | 80% |
| 9 | gemini-3.8-flash | Google | 77% (68%-85%) | 75% | 79% |
| 10 | gemini-3.6-flash | Google | 74% (65%-82%) | 68% | 79% |
| 11 | gemini-3.5-flash-lite | Google | 74% (63%-83%) | 71% | 77% |
| 12 | GigaChat-2-Pro | Sber | 70% (61%-79%) | 69% | 72% |
| 13 | llama3.2:3b | Meta | 68% (58%-77%) | 63% | 73% |
| 14 | GigaChat-2 | Sber | 67% (56%-77%) | 65% | 69% |
| 15 | mistral:7b | Mistral | 65% (56%-74%) | 63% | 68% |
| 16 | qwen3:4b | Alibaba | 64% (54%-73%) | 65% | 63% |

The two judges agree on the model order at Spearman 0.90.

## Notes (written by hand, not regenerated)

2026-11-26, small local models: llama3.2:3b (Meta), qwen3:4b (Alibaba) and mistral:7b (Mistral), run on a laptop through Ollama's OpenAI-compatible endpoint (`LB_COMPAT_URL=http://127.0.0.1:11434/v1`), default Ollama builds, Q4_K_M quantization. Small local, Q4: these are not the full-size Llama, Qwen or Mistral, which still need an OpenRouter key. 16 models from 6 vendors, 2400 answers, both judges re-ran on all 80 answers per prompt.

- The two views disagree about small models, and that is the finding. By embeddings llama3.2:3b is the second most banal model on the board (89.8), qwen3:4b sits in the Claude/Gemini band (87.9), mistral:7b in the middle (86.4). By LLM judges they share the fewest ideas with other vendors (64-68%, with the smallest GigaChat). Small models say the same kind of thing in the same words, but less often the exact same idea: "Midnight's Kiss" and "Midnight Mews" instead of Midnight, "Stealthy Sable" instead of Sable. An embedder sees that as the cloud, a judge grouping ideas does not.
- So "less shared" here is not "more creative". It is closer to noise around the cliché than to a step away from it, the same caveat as for GigaChat.
- Everyone else moved by 1-3 points because every reference cloud now averages 5 other vendors instead of 2: banality 84.2-90.9, judged 74-84% for Claude, Gemini and Gemma. The order inside that band reshuffled, the intervals still overlap.
- The judges agree at Spearman 0.88 on 16 models (0.87 on 13).
- Fixed on the way: a judge grouping made before a model joined no longer counts for that prompt (`covers` in bench/leaderboard.ts); a failed judge run would otherwise have scored the new models as sharing nothing. On Windows `LB_CLAUDE_CMD` has to start with `bash` to run a .sh wrapper.

2026-11-17, open weights: Gemma 4 (gemma-4-31b-it, gemma-4-26b-a4b-it) added through Gemini's OpenAI-compatible endpoint, i.e. through the same `compatProvider` that v0.4 uses for OpenRouter and Ollama. 13 models, 1950 answers, both judges re-ran on all 65 answers per prompt.

- Open weights are not less banal. Gemma 4 31b scores 90.8 and 26b-a4b 91.5 by embeddings, inside the Claude/Gemini band, and in the judged view gemma-4-26b-a4b shares the most ideas with other vendors of all 13 models (80%). Gemma counts as Google, so it is scored against Anthropic and Sber only.
- Black cat: 11 of 13 models now say Midnight; both Gemmas do.
- The rest barely moved (Google's reference clouds now include Gemma, and judges group 65 answers instead of 55): banality 86.7-93.4, judged 70-79% for Claude, Gemini and Gemma, 55-65% for GigaChat. The judges agree at Spearman 0.87 (0.75 before).
- The Claude judge ran through the Claude Code CLI this time (`LB_CLAUDE_CMD`, JSON parsed leniently) instead of the API with structured outputs; the Gemini judge is unchanged.
- Gemma 4 on that endpoint returns its reasoning inside `<thought>...</thought>` in the message content. The first run took drafts like "(20 words) - Good." as answers; `stripThinking` in src/llm.ts now removes such blocks and the Gemma answers were collected again.
- Llama, DeepSeek, Qwen and Mistral need an OpenRouter key: `OPENROUTER_API_KEY` + `LB_COMPAT_URL=https://openrouter.ai/api/v1 LB_COMPAT_MODELS="meta-llama/llama-4-maverick=Meta,deepseek/deepseek-chat=DeepSeek"`.

Day 7 (2026-11-02), full run: 11 models, 30 of 30 prompts, 1650 answers. gemini-3.8-flash and gemini-3.6-flash were filled in on the paid Gemini tier the same day (the free tier allows them 20 requests a day).

- Every model is banal: 86-94 out of 100, and 81-92% of all answers are at 70+, i.e. a model from another vendor gave practically the same answer. The intervals overlap almost completely: there is no single "most banal model", the honest headline is "they all say the same thing".
- The two views agree on one end only. By embeddings and by LLM judges (no embeddings, two judges from different vendors, Spearman 0.75 between them) GigaChat is the least banal. Among Claude and Gemini the order differs between the views (haiku-4-5 tops the embedding table, opus and fable the judged one), which is what overlapping intervals look like. In the judged view 70-76% of a Claude or Gemini answer's ideas also come from another vendor, 55-65% for GigaChat.
- Bigger is not less banal. claude-opus-5-5 and claude-fable-5-1 score 91.8 and 92.4 against 93.5 for haiku-4-5 by embeddings, and share the most ideas with other vendors in the judged view. The newest Gemini (3.8-flash) is as banal as the oldest Claude here.
- GigaChat being "less banal" is not the same as more creative: it was trained on a different (largely Russian) corpus, so its answers drift from what US models say. Not Obvious measures distance from the cloud; usefulness is a separate axis (the critic in `score`).
- Example, "Suggest a name for a black cat" (5 names from each of 11 models): Midnight is in 9 lists, Shadow and Onyx in 8, Salem in 6. Claude, Gemini and GigaChat alike.
- The Cliché Score saturates here: a reference cloud of 5 answers is tight, and answers from other vendors sit closer to it than its own answers sit to each other. Nearest similarity (raw cosine) and the judged view are reported next to it for that reason.
- All models get "Answer in English" appended: without it GigaChat answered one prompt in Russian, which would have made it look original to the embedder.
- What does help: the asker's own context. Two sentences about the person cut banality by 12-25 points, though models given the same context converge again ([context.md](context.md)).
