# Which model is the most banal?

Date: 2026-11-02. 9 models from 3 vendors, 30 of 30 prompts, 5 answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).

Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.

| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |
|---|---|---|---|---|---|---|
| 1 | claude-haiku-4-5 | Anthropic | 93.3 (89.9-96.2) | 92% | 0.872 | 0.817 |
| 2 | claude-haiku-5-5 | Anthropic | 92.4 (88.7-95.5) | 89% | 0.870 | 0.808 |
| 3 | claude-sonnet-5-5 | Anthropic | 92.3 (88.5-95.6) | 89% | 0.870 | 0.814 |
| 4 | claude-fable-5-1 | Anthropic | 92.2 (88.2-95.7) | 90% | 0.872 | 0.809 |
| 5 | gemini-3.5-flash-lite | Google | 92.1 (88.8-95.0) | 89% | 0.868 | 0.807 |
| 6 | claude-opus-5-5 | Anthropic | 91.8 (87.9-95.1) | 89% | 0.869 | 0.805 |
| 7 | GigaChat-2-Max | Sber | 90.1 (86.1-93.8) | 88% | 0.863 | 0.798 |
| 8 | GigaChat-2-Pro | Sber | 89.8 (86.1-92.8) | 86% | 0.859 | 0.804 |
| 9 | GigaChat-2 | Sber | 87.0 (79.8-92.3) | 82% | 0.857 | 0.802 |

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


Day 7 (2026-11-02), full run: 9 models, 30 of 30 prompts, 1350 answers. gemini-3.8-flash and gemini-3.6-flash are left out for now (LB_SKIP): on the free tier they allow 20 requests a day and the newest one mostly returns 503, so they have 1 and 26 of 30 prompts. They join the table once complete; the script only fills gaps.

- Every model is banal: 87-93 out of 100, and 82-92% of all answers are at 70+, i.e. a model from another vendor gave practically the same answer. The intervals overlap almost completely: there is no single "most banal model", the honest headline is "they all say the same thing".
- Two independent views agree on the ends of the table. By embeddings and by LLM judges (no embeddings, two judges from different vendors, Spearman 0.82 between them) the small fast models are the most banal (claude-haiku-4-5, gemini-3.5-flash-lite, claude-haiku-5-5) and GigaChat is the least banal. In the judged view about two thirds of a Claude or Gemini answer's ideas also come from another vendor, about half for GigaChat-2 and GigaChat-2-Pro.
- Bigger is barely less banal. Within Claude, opus and fable score 91.8 and 92.2 against 93.3 for haiku-4-5; shared ideas 63-64% against 66%. The difference is inside the noise.
- GigaChat being "less banal" is not the same as more creative: it was trained on a different (largely Russian) corpus, so its answers drift from what US models say. Not Obvious measures distance from the cloud; usefulness is a separate axis (the critic in `score`).
- Example, "Suggest a name for a black cat" (5 names from each of 9 models): Midnight is in 9 of 9 lists, Shadow and Onyx in 8, Salem in 6. Claude, Gemini and GigaChat alike.
- The Cliché Score saturates here: a reference cloud of 5 answers is tight, and answers from other vendors sit closer to it than its own answers sit to each other. Nearest similarity (raw cosine) and the judged view are reported next to it for that reason.
- All models get "Answer in English" appended: without it GigaChat answered one prompt in Russian, which would have made it look original to the embedder.
