# Cliché Score calibration

Date: 2026-10-31. Embedder: gemini-embedding-001. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 30 prompt rows, 270 ideas, see bench/prompts.json + bench/set20.json. Bands: cloud-checked hand labels (prompts.json) and Bands from blind judge ratings (originality 1-7: <= 2.5 cliché, >= 4.5 far). Targets: cliché >= 70, mid 30-70, far <= 35.

rho = mean per-prompt Spearman between the Cliché Score and the judges' originality (sign flipped, 1 = same order).

Web check: claude, 270 of 270 anchors rated.

| params (k = spread, w = nearest weight, j = judge weight, web = web prevalence weight) | band accuracy | pair order | rho | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|---|
| embedding only k=0.4 w=1 j=0 web=0 | 54% | 78% | 0.60 | 84 | 60 | 39 |
| judge only k=0.4 w=1 j=1 web=0 | 59% | 76% | 0.51 | 76 | 61 | 43 |
| web only k=0.4 w=1 j=0 web=1 | 56% | 83% | 0.68 | 90 | 69 | 62 |
| current default k=0.4 w=1 j=0 web=0.4 | 61% | 86% | 0.73 | 86 | 64 | 48 |
| current + web 0.1 k=0.4 w=1 j=0 web=0.1 | 58% | 84% | 0.68 | 85 | 61 | 42 |
| current + web 0.2 k=0.4 w=1 j=0 web=0.2 | 60% | 85% | 0.69 | 85 | 62 | 44 |
| current + web 0.3 k=0.4 w=1 j=0 web=0.3 | 60% | 85% | 0.70 | 86 | 63 | 46 |
| current + web 0.5 k=0.4 w=1 j=0 web=0.5 | 59% | 87% | 0.73 | 87 | 65 | 51 |
| best k=0.4 w=1 j=0 web=0.4 | 61% | 86% | 0.73 | 86 | 64 | 48 |
| best without web k=0.4 w=1 j=0 web=0 | 54% | 78% | 0.60 | 84 | 60 | 39 |
| #2 k=0.3 w=1 j=0 web=0.4 | 61% | 86% | 0.72 | 86 | 64 | 48 |
| #3 k=0.4 w=0.9 j=0 web=0.4 | 60% | 87% | 0.73 | 86 | 64 | 49 |
| #4 k=0.3 w=0.9 j=0 web=0.4 | 60% | 86% | 0.73 | 86 | 64 | 49 |
| #5 k=0.5 w=1 j=0 web=0.4 | 59% | 87% | 0.73 | 88 | 66 | 51 |
| original labels, embedding only k=0.4 w=1 j=0 web=0 | 53% | 76% | 0.60 | 85 | 62 | 41 |
| original labels, current default k=0.4 w=1 j=0 web=0 | 53% | 76% | 0.60 | 85 | 62 | 41 |
| original labels, judge only k=0.4 w=1 j=1 web=0 | 55% | 73% | 0.51 | 75 | 63 | 45 |

Leave-one-prompt-out cross-validation (parameters picked on the other prompts, scored on the held-out one):

| components | band accuracy | pair order | rho |
|---|---|---|---|
| embedding | 53% | 82% | 0.63 |
| embedding + judge | 53% | 81% | 0.60 |
| embedding + judge + web | 61% | 86% | 0.73 |

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
| Suggest a side business for a software developer | 0.884 | 100 / 100 / 96 | 49 / 68 / 50 | 32 / 63 / 36 / 32 |
| How can a small coffee shop attract more customers? | 0.893 | 100 / 88 / 88 | 89 / 67 / 43 / 70 / 32 | 32 / 38 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.871 | 92 / 48 / 87 / 88 | 96 / 96 / 65 | 61 / 82 / 59 |
| Name ideas for a new productivity app | 0.842 | 100 / 100 / 96 | 92 / 64 | 62 / 58 / 42 / 87 / 73 |
| How can a city reduce traffic congestion? | 0.910 | 100 / 96 / 100 | 16 / 49 / 92 / 48 / 92 | 28 / 32 |
| Suggest a marketing campaign for a new running shoe | 0.869 | 83 / 96 / 96 | 55 / 92 / 88 | 76 / 72 / 76 / 58 |
| Ideas to improve employee engagement in a remote team | 0.870 | 100 / 100 / 96 | 48 / 69 / 88 / 69 | 20 / 24 / 84 |
| What could a museum do to attract teenagers? | 0.891 | 96 / 96 / 96 | 92 / 71 / 65 / 27 | 20 / 48 / 38 |
| How can a non-profit raise money without asking for donations? | 0.888 | 96 / 100 / 100 / 96 | 81 / 78 / 96 / 65 / 66 | 29 |
| Suggest a new feature for a note-taking app | 0.875 | 96 / 100 / 96 | 71 / 87 / 37 / 92 / 92 | 28 / 61 |
| Suggest a weekend project to teach kids about money | 0.885 | 96 / 96 / 92 | 80 / 63 / 88 / 92 / 90 / 54 | 92 |
| How can a public library stay relevant? | 0.875 | 100 / 100 / 100 | 90 / 61 / 75 / 53 | 92 / 54 / 57 |
| Ideas for a team-building activity for software engineers | 0.865 | 96 / 96 / 83 | 80 / 92 / 44 | 80 / 63 / 42 / 60 |
| How can a restaurant reduce food waste? | 0.914 | 96 / 90 / 96 / 65 / 77 / 40 | 47 / 28 | 32 / 32 |
| Suggest a gift for a grandmother who has everything | 0.872 | 96 / 42 / 46 | 67 / 92 / 33 / 63 | 92 / 32 / 43 |
| How can a university improve student retention? | 0.890 | 100 / 96 / 96 | 24 / 43 / 84 / 37 | 26 / 24 / 28 |
| Ideas for a podcast about history | 0.849 | 92 / 80 / 91 | 88 / 52 / 60 / 92 | 80 / 75 / 53 |
| How can a small town attract young residents? | 0.903 | 96 / 92 / 62 | 55 / 48 / 20 / 37 / 24 | 33 / 28 |
| How can a city get more people to commute by bike? | 0.904 | 96 / 96 / 96 | 92 / 63 / 92 | 70 / 37 / 20 / 49 |
| Ideas for a mobile game to play during a commute | 0.867 | 100 / 96 / 96 | 80 / 63 | 62 / 55 / 80 / 88 / 81 |
