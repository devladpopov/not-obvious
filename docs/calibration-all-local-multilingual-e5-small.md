# Cliché Score calibration

Date: 2026-11-06. Embedder: local-multilingual-e5-small. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 30 prompt rows, 270 ideas, see bench/prompts.json + bench/set20.json. Bands: cloud-checked hand labels (prompts.json) and Bands from blind judge ratings (originality 1-7: <= 2.5 cliché, >= 4.5 far). Targets: cliché >= 70, mid 30-70, far <= 35.

rho = mean per-prompt Spearman between the Cliché Score and the judges' originality (sign flipped, 1 = same order).

Web check: claude, 270 of 270 anchors rated.

| params (k = spread, w = nearest weight, j = judge weight, web = web prevalence weight) | band accuracy | pair order | rho | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|---|
| embedding only k=0.4 w=1 j=0 web=0 | 61% | 80% | 0.65 | 78 | 47 | 30 |
| judge only k=0.4 w=1 j=1 web=0 | 59% | 74% | 0.49 | 76 | 61 | 44 |
| web only k=0.4 w=1 j=0 web=1 | 56% | 83% | 0.68 | 90 | 69 | 62 |
| current default k=0.4 w=1 j=0 web=0.4 | 64% | 86% | 0.74 | 83 | 56 | 43 |
| current + web 0.1 k=0.4 w=1 j=0 web=0.1 | 60% | 85% | 0.70 | 79 | 49 | 33 |
| current + web 0.2 k=0.4 w=1 j=0 web=0.2 | 60% | 86% | 0.72 | 81 | 52 | 36 |
| current + web 0.3 k=0.4 w=1 j=0 web=0.3 | 61% | 86% | 0.73 | 82 | 54 | 39 |
| current + web 0.5 k=0.4 w=1 j=0 web=0.5 | 62% | 87% | 0.75 | 84 | 58 | 46 |
| best k=0.3 w=1 j=0.25 web=0.4 | 65% | 87% | 0.75 | 83 | 58 | 45 |
| best without web k=0.3 w=1 j=0.25 web=0 | 61% | 82% | 0.66 | 78 | 51 | 33 |
| #2 k=0.4 w=1 j=0.25 web=0.4 | 65% | 87% | 0.75 | 83 | 58 | 45 |
| #3 k=0.3 w=0.8 j=0.4 web=0.4 | 65% | 87% | 0.74 | 81 | 59 | 46 |
| #4 k=0.4 w=0.8 j=0.4 web=0.4 | 65% | 87% | 0.74 | 81 | 59 | 46 |
| #5 k=0.4 w=0.8 j=0.25 web=0.3 | 65% | 86% | 0.73 | 80 | 56 | 42 |
| original labels, embedding only k=0.4 w=1 j=0 web=0 | 60% | 79% | 0.65 | 80 | 48 | 33 |
| original labels, current default k=0.4 w=1 j=0 web=0 | 60% | 79% | 0.65 | 80 | 48 | 33 |
| original labels, judge only k=0.4 w=1 j=1 web=0 | 55% | 72% | 0.49 | 75 | 63 | 46 |

Leave-one-prompt-out cross-validation (parameters picked on the other prompts, scored on the held-out one):

| components | band accuracy | pair order | rho |
|---|---|---|---|
| embedding | 61% | 80% | 0.65 |
| embedding + judge | 61% | 82% | 0.66 |
| embedding + judge + web | 61% | 86% | 0.73 |

## Per prompt (current default)

| prompt | density | cliché | mid | far |
|---|---|---|---|---|
| Suggest a side business for a software developer | 0.889 | 100 / 62 / 100 | 83 / 52 / 28 | 32 |
| How can a small coffee shop attract more customers? | 0.890 | 86 / 87 / 96 / 36 / 92 |  | 47 / 38 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.870 | 70 / 40 / 96 / 72 / 96 |  | 75 |
| Name ideas for a new productivity app | 0.889 | 79 / 61 / 32 | 32 / 28 | 32 / 12 |
| How can a city reduce traffic congestion? | 0.909 | 90 / 92 / 64 / 46 | 20 | 20 / 45 |
| Suggest a marketing campaign for a new running shoe | 0.873 | 69 / 85 / 36 / 59 / 88 | 80 | 32 |
| Ideas to improve employee engagement in a remote team | 0.888 | 100 / 96 / 100 / 61 | 69 / 66 | 34 |
| What could a museum do to attract teenagers? | 0.891 | 84 / 48 / 96 / 45 / 28 |  | 60 / 34 |
| How can a non-profit raise money without asking for donations? | 0.891 | 96 / 52 / 78 / 74 / 58 | 62 | 30 |
| Suggest a new feature for a note-taking app | 0.897 | 96 / 70 / 92 / 61 | 53 / 46 | 35 |
| Suggest a side business for a software developer | 0.889 | 80 / 100 / 96 | 36 / 72 / 62 | 42 / 70 / 50 / 32 |
| How can a small coffee shop attract more customers? | 0.890 | 100 / 88 / 88 | 69 / 44 / 40 / 27 / 48 | 79 / 37 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.870 | 82 / 68 / 79 / 96 | 96 / 96 / 56 | 80 / 58 / 70 |
| Name ideas for a new productivity app | 0.889 | 40 / 62 / 82 | 69 / 51 | 14 / 33 / 44 / 32 / 26 |
| How can a city reduce traffic congestion? | 0.909 | 100 / 96 / 100 | 16 / 70 / 79 / 56 / 51 | 42 / 32 |
| Suggest a marketing campaign for a new running shoe | 0.873 | 96 / 96 / 96 | 65 / 92 / 88 | 76 / 72 / 76 / 65 |
| Ideas to improve employee engagement in a remote team | 0.888 | 90 / 100 / 96 | 52 / 64 / 65 / 38 | 20 / 25 / 27 |
| What could a museum do to attract teenagers? | 0.891 | 96 / 96 / 96 | 69 / 45 / 48 / 20 | 30 / 20 / 20 |
| How can a non-profit raise money without asking for donations? | 0.891 | 96 / 100 / 100 / 96 | 66 / 92 / 83 / 37 / 64 | 20 |
| Suggest a new feature for a note-taking app | 0.897 | 96 / 100 / 82 | 53 / 32 / 41 / 92 / 74 | 32 / 20 |
| Suggest a weekend project to teach kids about money | 0.896 | 96 / 96 / 92 | 78 / 73 / 88 / 92 / 92 / 58 | 92 |
| How can a public library stay relevant? | 0.888 | 100 / 100 / 100 | 39 / 49 / 61 / 74 | 70 / 32 / 49 |
| Ideas for a team-building activity for software engineers | 0.876 | 96 / 96 / 96 | 80 / 92 / 56 | 66 / 44 / 42 / 50 |
| How can a restaurant reduce food waste? | 0.900 | 96 / 89 / 96 / 73 / 65 / 62 | 36 / 31 | 32 / 54 |
| Suggest a gift for a grandmother who has everything | 0.895 | 96 / 50 / 39 | 34 / 92 / 28 / 28 | 92 / 32 / 51 |
| How can a university improve student retention? | 0.902 | 100 / 96 / 84 | 26 / 32 / 46 / 24 | 29 / 24 / 28 |
| Ideas for a podcast about history | 0.879 | 92 / 82 / 85 | 55 / 43 / 50 / 66 | 49 / 23 / 16 |
| How can a small town attract young residents? | 0.915 | 96 / 92 / 41 | 36 / 55 / 20 / 36 / 24 | 20 / 28 |
| How can a city get more people to commute by bike? | 0.910 | 96 / 96 / 94 | 32 / 57 / 92 | 51 / 28 / 21 / 37 |
| Ideas for a mobile game to play during a commute | 0.887 | 100 / 96 / 96 | 43 / 76 | 59 / 55 / 53 / 64 / 58 |
