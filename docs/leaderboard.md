# Which model is the most banal?

Date: 2026-11-17. 13 models from 3 vendors, 30 of 30 prompts, 5 answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).

Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.

| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |
|---|---|---|---|---|---|---|
| 1 | claude-haiku-4-5 | Anthropic | 93.4 (90.3-96.0) | 92% | 0.874 | 0.817 |
| 2 | gemini-3.8-flash | Google | 93.2 (89.3-96.3) | 92% | 0.868 | 0.813 |
| 3 | claude-sonnet-5-5 | Anthropic | 92.6 (88.8-95.6) | 90% | 0.871 | 0.814 |
| 4 | gemini-3.6-flash | Google | 92.4 (88.0-95.8) | 91% | 0.868 | 0.813 |
| 5 | claude-fable-5-1 | Anthropic | 92.3 (88.5-95.6) | 89% | 0.873 | 0.809 |
| 6 | claude-haiku-5-5 | Anthropic | 92.1 (88.5-95.1) | 89% | 0.870 | 0.808 |
| 7 | gemini-3.5-flash-lite | Google | 92.1 (88.8-95.0) | 89% | 0.868 | 0.807 |
| 8 | claude-opus-5-5 | Anthropic | 91.7 (87.6-95.0) | 89% | 0.870 | 0.805 |
| 9 | gemma-4-26b-a4b-it | Google | 91.5 (87.0-95.0) | 89% | 0.871 | 0.806 |
| 10 | gemma-4-31b-it | Google | 90.8 (86.4-94.4) | 88% | 0.872 | 0.807 |
| 11 | GigaChat-2-Max | Sber | 89.8 (86.1-93.0) | 87% | 0.864 | 0.798 |
| 12 | GigaChat-2-Pro | Sber | 89.2 (86.0-92.1) | 85% | 0.860 | 0.804 |
| 13 | GigaChat-2 | Sber | 86.7 (80.5-91.3) | 82% | 0.857 | 0.802 |

Nearest similarity: mean cosine between an answer and the closest answer of another vendor's model. Self-repetition: mean cosine between a model's own 5 answers to one prompt (higher = the answers are variations of one idea). Intervals: bootstrap over prompts.

## Second view: shared ideas, judged by LLMs

No embeddings here. For each of 30 prompts all 65 answers were anonymised, shuffled and grouped into ideas by two judges (claude-opus-5-5 and gemini-3.5-flash-lite). **Shared** = share of a model's answers whose idea at least one model from another vendor also gave. Mean of both judges, 95% bootstrap interval over prompts.

| # | model | vendor | shared (95% CI) | claude-opus-5-5 | gemini-3.5-flash-lite |
|---|---|---|---|---|---|
| 1 | gemma-4-26b-a4b-it | Google | 80% (70%-88%) | 83% | 76% |
| 2 | claude-opus-5-5 | Anthropic | 79% (69%-88%) | 79% | 79% |
| 3 | claude-fable-5-1 | Anthropic | 77% (66%-86%) | 77% | 77% |
| 4 | claude-haiku-5-5 | Anthropic | 77% (65%-88%) | 77% | 77% |
| 5 | gemma-4-31b-it | Google | 76% (68%-84%) | 78% | 74% |
| 6 | claude-haiku-4-5 | Anthropic | 76% (66%-85%) | 75% | 77% |
| 7 | claude-sonnet-5-5 | Anthropic | 74% (63%-84%) | 75% | 73% |
| 8 | gemini-3.5-flash-lite | Google | 72% (61%-82%) | 71% | 73% |
| 9 | gemini-3.8-flash | Google | 71% (61%-81%) | 70% | 72% |
| 10 | gemini-3.6-flash | Google | 70% (60%-79%) | 67% | 72% |
| 11 | GigaChat-2-Max | Sber | 65% (54%-75%) | 65% | 65% |
| 12 | GigaChat-2-Pro | Sber | 62% (52%-72%) | 65% | 59% |
| 13 | GigaChat-2 | Sber | 55% (44%-66%) | 57% | 53% |

The two judges agree on the model order at Spearman 0.87.

## Notes (written by hand, not regenerated)

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
