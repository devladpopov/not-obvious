# Cliché Score calibration

Date: 2026-10-31. Embedder: gemini-embedding-001. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 20 prompt rows, 200 ideas, see bench/set20.json. Bands from blind judge ratings (originality 1-7: <= 2.5 cliché, >= 4.5 far). Targets: cliché >= 70, mid 30-70, far <= 35.

rho = mean per-prompt Spearman between the Cliché Score and the judges' originality (sign flipped, 1 = same order).

Web check: claude, 200 of 200 anchors rated.

| params (k = spread, w = nearest weight, j = judge weight, web = web prevalence weight) | band accuracy | pair order | rho | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|---|
| embedding only k=0.4 w=1 j=0 web=0 | 52% | 78% | 0.60 | 90 | 64 | 46 |
| judge only k=0.4 w=1 j=1 web=0 | 57% | 74% | 0.51 | 78 | 63 | 47 |
| web only k=0.4 w=1 j=0 web=1 | 52% | 82% | 0.68 | 92 | 71 | 63 |
| current default k=0.4 w=1 j=0 web=0.4 | 57% | 86% | 0.73 | 91 | 66 | 53 |
| current + web 0.1 k=0.4 w=1 j=0 web=0.1 | 55% | 84% | 0.68 | 91 | 64 | 48 |
| current + web 0.2 k=0.4 w=1 j=0 web=0.2 | 57% | 85% | 0.69 | 91 | 65 | 49 |
| current + web 0.3 k=0.4 w=1 j=0 web=0.3 | 57% | 85% | 0.70 | 91 | 66 | 51 |
| current + web 0.5 k=0.4 w=1 j=0 web=0.5 | 55% | 86% | 0.73 | 91 | 67 | 55 |
| best k=0.3 w=1 j=0 web=0.4 | 58% | 85% | 0.72 | 91 | 66 | 52 |
| best without web k=0.3 w=1 j=0 web=0 | 51% | 78% | 0.60 | 90 | 63 | 45 |
| #2 k=0.4 w=1 j=0 web=0.4 | 57% | 86% | 0.73 | 91 | 66 | 53 |
| #3 k=0.3 w=1 j=0 web=0.3 | 58% | 85% | 0.70 | 91 | 65 | 50 |
| #4 k=0.4 w=0.9 j=0.25 web=0.3 | 58% | 84% | 0.69 | 88 | 66 | 52 |
| #5 k=0.4 w=1 j=0 web=0.2 | 57% | 85% | 0.69 | 91 | 65 | 49 |

Leave-one-prompt-out cross-validation (parameters picked on the other prompts, scored on the held-out one):

| components | band accuracy | pair order | rho |
|---|---|---|---|
| embedding | 55% | 81% | 0.63 |
| embedding + judge | 55% | 81% | 0.63 |
| embedding + judge + web | 56% | 85% | 0.72 |

## Per prompt (current default)

| prompt | density | cliché | mid | far |
|---|---|---|---|---|
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

## Findings (written by hand, not regenerated)

Day 6 (2026-10-31), first run on the blind-labelled set:

- Bands from the three judges: 65 cliché, 76 mid, 59 far out of 200. The generator's "rare" ideas average 4.9 originality, so "far" here means "a judge finds it original", not "nothing like it exists": mean web prevalence is 9.2 / 7.1 / 6.3 for cliché / mid / far.
- With the day-5 defaults (spread 0.8, nearest 0.7, judge 0.6, no web) the score is compressed upwards: far ideas average 56, band accuracy 49%, pair order 77%, rho 0.56. Embeddings alone order better (81%, rho 0.64) but put far ideas at 69.
- The mechanism judge, which helped on the hand-written set, does not help here: judge alone 74% pair order (rho 0.51), and cross-validation lands on judge weight 0 (embedding 55% / 81%, + judge 55% / 81%). Generated "twist" ideas often keep a cliché's core mechanism with a new audience or channel; the judge rates those 6+ overlap (mid mean 6.3, far 4.7) while the raters call them moderately original.
- Web prevalence is the strongest single signal on this set (82% pair order, rho 0.68), and the blend generalises: cross-validated 56% / 85%, rho 0.72 with web, against 55% / 81%, rho 0.63 without.
- Defaults were re-picked on both sets pooled: see docs/scoring.md and docs/calibration-all.md. The tables above are regenerated with the new defaults.
