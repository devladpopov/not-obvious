# Cliché Score calibration

Date: 2026-10-31. Embedder: gemini-embedding-001. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 10 prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.

Labels: cloud-checked (anchors the cloud already contains count as clichés, see "relabel" in prompts.json); the last three rows use the labels as originally written.

Web check: claude, 70 of 70 anchors rated.

| params (k = spread, w = nearest weight, j = judge weight, web = web prevalence weight) | band accuracy | pair order | rho | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|---|
| embedding only k=0.4 w=1 j=0 web=0 | 62% | 83% | - | 74 | 40 | 13 |
| judge only k=0.4 w=1 j=1 web=0 | 62% | 85% | - | 74 | 50 | 27 |
| web only k=0.4 w=1 j=0 web=1 | 68% | 88% | - | 87 | 62 | 58 |
| current default k=0.4 w=1 j=0 web=0.4 | 72% | 90% | - | 79 | 49 | 31 |
| current + web 0.1 k=0.4 w=1 j=0 web=0.1 | 65% | 86% | - | 76 | 42 | 17 |
| current + web 0.2 k=0.4 w=1 j=0 web=0.2 | 68% | 87% | - | 77 | 44 | 22 |
| current + web 0.3 k=0.4 w=1 j=0 web=0.3 | 70% | 88% | - | 78 | 47 | 26 |
| current + web 0.5 k=0.4 w=1 j=0 web=0.5 | 72% | 91% | - | 81 | 51 | 35 |
| best k=0.5 w=1 j=0.25 web=0.4 | 74% | 93% | - | 81 | 54 | 34 |
| best without web k=0.5 w=1 j=0.25 web=0 | 62% | 85% | - | 77 | 49 | 18 |
| #2 k=0.6 w=1 j=0 web=0.3 | 75% | 91% | - | 82 | 57 | 32 |
| #3 k=0.5 w=0.6 j=0.25 web=0.4 | 74% | 92% | - | 78 | 53 | 36 |
| #4 k=0.5 w=0.8 j=0.25 web=0.4 | 72% | 93% | - | 79 | 53 | 35 |
| #5 k=0.6 w=0.8 j=0.25 web=0.4 | 72% | 93% | - | 81 | 57 | 38 |
| original labels, embedding only k=0.4 w=1 j=0 web=0 | 56% | 72% | - | 74 | 53 | 29 |
| original labels, current default k=0.4 w=1 j=0 web=0 | 56% | 72% | - | 74 | 53 | 29 |
| original labels, judge only k=0.4 w=1 j=1 web=0 | 47% | 70% | - | 69 | 64 | 42 |

Leave-one-prompt-out cross-validation (parameters picked on the other prompts, scored on the held-out one):

| components | band accuracy | pair order | rho |
|---|---|---|---|
| embedding | 64% | 85% | - |
| embedding + judge | 67% | 89% | - |
| embedding + judge + web | 65% | 89% | - |

## Per prompt (current default)

| prompt | density | cliché | mid | far |
|---|---|---|---|---|
| Suggest a side business for a software developer | 0.884 | 100 / 64 / 100 | 55 / 43 / 55 | 32 |
| How can a small coffee shop attract more customers? | 0.893 | 100 / 72 / 96 / 49 / 92 |  | 28 / 16 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.871 | 74 / 54 / 96 / 36 / 92 |  | 70 |
| Name ideas for a new productivity app | 0.842 | 96 / 70 / 32 | 40 / 28 | 32 / 12 |
| How can a city reduce traffic congestion? | 0.910 | 100 / 92 / 96 / 92 | 20 | 20 / 44 |
| Suggest a marketing campaign for a new running shoe | 0.869 | 80 / 83 / 30 / 55 / 88 | 80 | 61 |
| Ideas to improve employee engagement in a remote team | 0.870 | 100 / 96 / 100 / 96 | 73 / 60 | 24 |
| What could a museum do to attract teenagers? | 0.891 | 96 / 50 / 96 / 71 / 28 |  | 20 / 18 |
| How can a non-profit raise money without asking for donations? | 0.888 | 96 / 36 / 100 / 92 / 54 | 42 | 28 |
| Suggest a new feature for a note-taking app | 0.875 | 96 / 100 / 100 / 61 | 33 / 55 | 24 |

## Findings (written by hand, not regenerated)

Day 5 (2026-10-31), web check added (src/web.ts):

- Each anchor is searched with Claude web search (claude-haiku-5-5, web_search_20250305, up to 2 queries) and rated 0-10 for prevalence: how much of the mechanism already exists as products, services or common advice. 70 of 70 anchors rated, about $0.01 each, cached in research/clouds/web.json.
- Mean prevalence: clichés 8.7, mid 6.2, far 5.8. Web prevalence alone orders pairs well (88%), but it squeezes "mid" and "far" together: the web finds a partial match for almost anything (rare-shrimp auctions exist on AquaBid, 8/10), and names collide with existing products ("Mudroom" 8/10) even when no model would suggest them.
- On the full set the grid prefers web weight 0.4 (93% pair order, 74% band accuracy) but with spread and judge weight moved far from the day-3 values. Leave-one-prompt-out cross-validation shows it does not generalise: embedding 64% / 85%, + judge 67% / 89%, + judge + web 65% / 89% (band / pair). So WEB_WEIGHT stays 0: the Cliché Score keeps meaning "distance from what models say", and web prevalence is reported next to it as a second axis ("already exists online", flagged at 8+).
- Product use: `score` with web: true, `explain` (always), `diverge` checks survivors only (one search per kept idea, not per candidate) and sorts ideas that already exist online last.

Day 3 (2026-10-31), mechanism judge added:

- The biggest error source was the labels, not the formula. 14 of 70 anchors written as "mid" or "far" turned out to be already in the cloud and 4 "far" ones sit close to a cloud answer (now "mid") (birthday escape room and detective party, running-shoe trade-in and night-shift runners, staggered start times, teens curating a room). For this metric an idea the cloud contains is a cliché, whatever its author believed; those anchors are relabelled in prompts.json ("relabel"), one cliché anchor the cloud avoided (trampoline park) is dropped. Caveat: the relabelling was done after seeing the scores, so the cloud-checked numbers are optimistic until the day-6 set is labelled blind.
- With cloud-checked labels: embedding only 84% pair order, judge only 85%, blend 40/60 90%, band accuracy 70%. The two signals make different mistakes, so the blend beats both. Defaults: spreadK 0.8, judge weight 0.6.
- With the original labels the judge alone is worse (70%) because it correctly calls those "creative" anchors clichés. That is a feature to show users: "your idea is already in the cloud".
- Judge: claude-haiku-5-5, one call per batch, cached in judge.json next to the clouds.

Day 2:

- Tuning spreadK 0.7 -> 0.6 lifted band accuracy 53% -> 60% on the original labels; ordering stayed at 74% for any parameters, it is set by the embedding geometry.
- Free Gemini tier: gemini-flash-latest often hangs for the full timeout; the provider falls back to gemini-flash-lite-latest per request. Cloud build takes 40-95 s per prompt on the free tier.
