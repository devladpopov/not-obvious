# Which model is the most banal?

Date: 2026-10-31. 9 models from 3 vendors, 11 of 30 prompts, 5 answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).

Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.

| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |
|---|---|---|---|---|---|---|
| 1 | claude-haiku-5-5 | Anthropic | 93.3 (88.2-97.3) | 91% | 0.879 | 0.811 |
| 2 | claude-haiku-4-5 | Anthropic | 93.0 (86.5-98.9) | 90% | 0.878 | 0.820 |
| 3 | gemini-3.5-flash-lite | Google | 92.6 (86.8-97.0) | 90% | 0.873 | 0.809 |
| 4 | GigaChat-2-Pro | Sber | 91.4 (84.7-95.7) | 89% | 0.868 | 0.802 |
| 5 | claude-fable-5-1 | Anthropic | 91.1 (83.6-97.6) | 89% | 0.877 | 0.811 |
| 6 | claude-sonnet-5-5 | Anthropic | 91.1 (83.2-97.2) | 87% | 0.874 | 0.814 |
| 7 | claude-opus-5-5 | Anthropic | 90.3 (83.1-96.3) | 87% | 0.871 | 0.808 |
| 8 | GigaChat-2-Max | Sber | 89.6 (83.2-95.4) | 89% | 0.866 | 0.804 |
| 9 | GigaChat-2 | Sber | 83.3 (65.9-94.6) | 79% | 0.861 | 0.801 |

Nearest similarity: mean cosine between an answer and the closest answer of another vendor's model. Self-repetition: mean cosine between a model's own 5 answers to one prompt (higher = the answers are variations of one idea). Intervals: bootstrap over prompts.

## Second view: shared ideas, judged by LLMs

No embeddings here. For each of 30 prompts all 45 answers were anonymised, shuffled and grouped into ideas by two judges (claude-opus-5-5 and gemini-3.5-flash-lite). **Shared** = share of a model's answers whose idea at least one model from another vendor also gave. Mean of both judges, 95% bootstrap interval over prompts.

| # | model | vendor | shared (95% CI) | claude-opus-5-5 | gemini-3.5-flash-lite |
|---|---|---|---|---|---|
| 1 | gemini-3.5-flash-lite | Google | 71% (61%-81%) | 69% | 73% |
| 2 | claude-haiku-4-5 | Anthropic | 66% (55%-77%) | 65% | 68% |
| 3 | claude-haiku-5-5 | Anthropic | 64% (51%-76%) | 63% | 65% |
| 4 | claude-opus-5-5 | Anthropic | 64% (51%-76%) | 61% | 66% |
| 5 | claude-fable-5-1 | Anthropic | 63% (51%-74%) | 59% | 66% |
| 6 | claude-sonnet-5-5 | Anthropic | 62% (50%-74%) | 59% | 66% |
| 7 | GigaChat-2-Max | Sber | 59% (49%-69%) | 56% | 62% |
| 8 | GigaChat-2-Pro | Sber | 52% (42%-62%) | 50% | 53% |
| 9 | GigaChat-2 | Sber | 51% (41%-61%) | 49% | 54% |

The two judges agree on the model order at Spearman 0.82.

## Notes (written by hand, not regenerated)

Day 7 (2026-10-31), interim run: 9 of 11 models, 11 of 30 prompts (the free embedding quota ran out; gemini-3.8-flash and gemini-3.6-flash have 20 free requests a day and are still collecting answers).

- Every model is banal: 83-93 out of 100, and 79-91% of all answers are at 70+, i.e. another vendor's model gave practically the same answer. The bootstrap intervals overlap almost completely, so on 11 prompts there is no honest "most banal model" yet, only "they all say the same thing".
- Example, "Suggest a name for a black cat" (5 names from each of 9 models): Midnight is in 9 of 9 lists, Shadow and Onyx in 8, Salem in 6. Claude, Gemini and GigaChat alike.
- The Cliché Score saturates here: a reference cloud of 5 answers is tight, and answers from other vendors sit closer to it than its own answers sit to each other. Nearest similarity (raw cosine) is reported next to it for that reason.
- All models get "Answer in English" appended: without it GigaChat answered one prompt in Russian, which would have made it look original to the embedder.
