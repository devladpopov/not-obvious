# Which model is the most banal?

Date: 2026-11-02. 11 models from 3 vendors, 30 of 30 prompts, 5 answers each (bench/leaderboard.ts, answers in bench/leaderboard.json).

Each model got the same open prompts ("How can a public library stay relevant?", "Suggest a name for a black cat") as plain text with provider defaults. **Banality** = mean Cliché Score (embedding part, gemini-embedding-001) of its answers against the answers of each model from another vendor, averaged per vendor. 100 = says what the other vendors say, 0 = far from all of them. Same-vendor models are not compared with each other.

| # | model | vendor | banality (95% CI) | answers at 70+ | nearest similarity | self-repetition |
|---|---|---|---|---|---|---|
| 1 | claude-haiku-4-5 | Anthropic | 93.5 (90.4-96.2) | 92% | 0.873 | 0.817 |
| 2 | gemini-3.8-flash | Google | 93.2 (89.3-96.3) | 92% | 0.868 | 0.813 |
| 3 | claude-sonnet-5-5 | Anthropic | 92.7 (89.1-95.6) | 90% | 0.871 | 0.814 |
| 4 | gemini-3.6-flash | Google | 92.4 (88.0-95.8) | 91% | 0.868 | 0.813 |
| 5 | claude-fable-5-1 | Anthropic | 92.4 (88.6-95.6) | 90% | 0.873 | 0.809 |
| 6 | gemini-3.5-flash-lite | Google | 92.1 (88.8-95.0) | 89% | 0.868 | 0.807 |
| 7 | claude-opus-5-5 | Anthropic | 91.8 (87.9-95.1) | 89% | 0.871 | 0.805 |
| 8 | claude-haiku-5-5 | Anthropic | 91.7 (87.7-94.9) | 89% | 0.869 | 0.808 |
| 9 | GigaChat-2-Max | Sber | 89.0 (84.8-92.7) | 86% | 0.862 | 0.798 |
| 10 | GigaChat-2-Pro | Sber | 88.8 (84.8-92.2) | 85% | 0.858 | 0.804 |
| 11 | GigaChat-2 | Sber | 86.0 (79.2-90.9) | 81% | 0.855 | 0.802 |

Nearest similarity: mean cosine between an answer and the closest answer of another vendor's model. Self-repetition: mean cosine between a model's own 5 answers to one prompt (higher = the answers are variations of one idea). Intervals: bootstrap over prompts.

## Second view: shared ideas, judged by LLMs

No embeddings here. For each of 30 prompts all 55 answers were anonymised, shuffled and grouped into ideas by two judges (claude-opus-5-5 and gemini-3.5-flash-lite). **Shared** = share of a model's answers whose idea at least one model from another vendor also gave. Mean of both judges, 95% bootstrap interval over prompts.

| # | model | vendor | shared (95% CI) | claude-opus-5-5 | gemini-3.5-flash-lite |
|---|---|---|---|---|---|
| 1 | claude-opus-5-5 | Anthropic | 76% (66%-85%) | 75% | 77% |
| 2 | claude-fable-5-1 | Anthropic | 75% (65%-85%) | 73% | 77% |
| 3 | claude-haiku-5-5 | Anthropic | 73% (61%-84%) | 70% | 76% |
| 4 | gemini-3.8-flash | Google | 73% (63%-81%) | 70% | 75% |
| 5 | claude-sonnet-5-5 | Anthropic | 72% (61%-82%) | 71% | 73% |
| 6 | gemini-3.6-flash | Google | 72% (63%-81%) | 72% | 71% |
| 7 | gemini-3.5-flash-lite | Google | 71% (60%-81%) | 69% | 72% |
| 8 | claude-haiku-4-5 | Anthropic | 70% (60%-81%) | 71% | 70% |
| 9 | GigaChat-2-Max | Sber | 65% (54%-75%) | 60% | 70% |
| 10 | GigaChat-2-Pro | Sber | 56% (46%-66%) | 55% | 57% |
| 11 | GigaChat-2 | Sber | 55% (45%-65%) | 51% | 58% |

The two judges agree on the model order at Spearman 0.75.

## Notes (written by hand, not regenerated)

Day 7 (2026-11-02), full run: 11 models, 30 of 30 prompts, 1650 answers. gemini-3.8-flash and gemini-3.6-flash were filled in on the paid Gemini tier the same day (the free tier allows them 20 requests a day).

- Every model is banal: 86-94 out of 100, and 81-92% of all answers are at 70+, i.e. a model from another vendor gave practically the same answer. The intervals overlap almost completely: there is no single "most banal model", the honest headline is "they all say the same thing".
- The two views agree on one end only. By embeddings and by LLM judges (no embeddings, two judges from different vendors, Spearman 0.75 between them) GigaChat is the least banal. Among Claude and Gemini the order differs between the views (haiku-4-5 tops the embedding table, opus and fable the judged one), which is what overlapping intervals look like. In the judged view 70-76% of a Claude or Gemini answer's ideas also come from another vendor, 55-65% for GigaChat.
- Bigger is not less banal. claude-opus-5-5 and claude-fable-5-1 score 91.8 and 92.4 against 93.5 for haiku-4-5 by embeddings, and share the most ideas with other vendors in the judged view. The newest Gemini (3.8-flash) is as banal as the oldest Claude here.
- GigaChat being "less banal" is not the same as more creative: it was trained on a different (largely Russian) corpus, so its answers drift from what US models say. Not Obvious measures distance from the cloud; usefulness is a separate axis (the critic in `score`).
- Example, "Suggest a name for a black cat" (5 names from each of 11 models): Midnight is in 9 lists, Shadow and Onyx in 8, Salem in 6. Claude, Gemini and GigaChat alike.
- The Cliché Score saturates here: a reference cloud of 5 answers is tight, and answers from other vendors sit closer to it than its own answers sit to each other. Nearest similarity (raw cosine) and the judged view are reported next to it for that reason.
- All models get "Answer in English" appended: without it GigaChat answered one prompt in Russian, which would have made it look original to the embedder.
- What does help: the asker's own context. Two sentences about the person cut banality by 12-25 points, though models given the same context converge again ([context.md](context.md)).
