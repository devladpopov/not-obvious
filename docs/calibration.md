# Cliché Score calibration (day 2)

Date: 2026-10-31. Embedder: gemini-embedding-001. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 10 prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.

| params | band accuracy | pair order | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|
| v0 (Day 1) k=0.7 w=0.7 | 53% | 74% | 80 | 66 | 44 |
| best k=0.6 w=0.6 | 60% | 74% | 76 | 62 | 39 |
| #2 k=0.6 w=0.7 | 60% | 74% | 77 | 62 | 39 |
| #3 k=0.5 w=0.9 | 60% | 74% | 76 | 58 | 32 |
| #4 k=0.6 w=0.8 | 60% | 74% | 78 | 63 | 38 |
| #5 k=0.5 w=1 | 60% | 73% | 77 | 59 | 32 |

## Per prompt (best params)

| prompt | density | cliché | mid | far |
|---|---|---|---|---|
| Suggest a side business for a software developer | 0.884 | 100 / 60 / 100 | 40 / 52 | 55 / 31 |
| How can a small coffee shop attract more customers? | 0.893 | 98 / 59 / 100 | 58 / 87 | 52 / 9 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.871 | 71 / 52 / 6 | 96 / 43 | 89 / 79 |
| Name ideas for a new productivity app | 0.842 | 94 / 71 / 30 | 39 / 30 | 9 / 0 |
| How can a city reduce traffic congestion? | 0.910 | 100 / 100 / 83 | 88 / 0 | 0 / 43 |
| Suggest a marketing campaign for a new running shoe | 0.869 | 71 / 74 / 28 | 68 / 100 | 85 / 59 |
| Ideas to improve employee engagement in a remote team | 0.870 | 100 / 74 / 92 | 82 / 86 | 84 / 29 |
| What could a museum do to attract teenagers? | 0.891 | 100 / 50 / 79 | 78 / 0 | 6 / 23 |
| How can a non-profit raise money without asking for donations? | 0.888 | 99 / 13 / 88 | 100 / 66 | 54 / 22 |
| Suggest a new feature for a note-taking app | 0.875 | 100 / 83 / 95 | 54 / 65 | 52 / 0 |
## Findings (written by hand, not regenerated)

- Ordering cliché > mid > far holds in 74% of anchor pairs for every parameter set: it is set by the embedding geometry, the parameters only move the bands. Tuning k from 0.7 to 0.6 lifts band accuracy from 53% to 60%; that is the new default.
- Embedding distance alone confuses "different wording" with "different idea": a far idea phrased with the cloud's vocabulary (birthday "detective agency" 79, running shoe "route as logo" 85) scores high, a stock answer the cloud happened to miss (birthday "trampoline park" 6) scores low.
- Next signals to add: web novelty (day 5) and an LLM judge of "same underlying mechanism" against the nearest cliché, then re-run this set and the day-6 human-rated set.
- Free Gemini tier: gemini-flash-latest often hangs for the full timeout; the provider now falls back to gemini-flash-lite-latest per request. Cloud build takes 40-95 s per prompt on the free tier.
