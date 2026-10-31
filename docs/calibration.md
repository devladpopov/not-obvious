# Cliché Score calibration

Date: 2026-10-31. Embedder: gemini-embedding-001. Cloud models: claude-haiku-5-5, gemini-flash-lite-latest, gemini-flash-latest.
Set: 10 prompts x 7 hand-written anchors (3 cliché, 2 mid, 2 far), see bench/prompts.json. Targets: cliché >= 70, mid 30-70, far <= 35.

Labels: cloud-checked (anchors the cloud already contains count as clichés, see "relabel" in prompts.json); the last three rows use the labels as originally written.

| params (k = spread, w = nearest weight, j = judge weight) | band accuracy | pair order | mean cliché | mean mid | mean far |
|---|---|---|---|---|---|
| embedding only k=0.8 w=0.7 j=0 | 68% | 84% | 82 | 64 | 37 |
| judge only k=0.8 w=0.7 j=1 | 62% | 85% | 74 | 50 | 27 |
| current default k=0.8 w=0.7 j=0.6 | 70% | 90% | 77 | 56 | 31 |
| best k=0.8 w=0.7 j=0.6 | 70% | 90% | 77 | 56 | 31 |
| #2 k=0.8 w=0.8 j=0.6 | 70% | 90% | 78 | 56 | 31 |
| #3 k=0.9 w=0.5 j=0.5 | 70% | 90% | 79 | 58 | 37 |
| #4 k=0.9 w=0.6 j=0.5 | 70% | 90% | 79 | 59 | 36 |
| #5 k=0.9 w=1 j=0.6 | 70% | 90% | 79 | 57 | 32 |
| original labels, embedding only k=0.8 w=0.7 j=0 | 53% | 74% | 82 | 70 | 50 |
| original labels, current default k=0.8 w=0.7 j=0.6 | 51% | 77% | 75 | 66 | 45 |
| original labels, judge only k=0.8 w=0.7 j=1 | 47% | 70% | 69 | 64 | 42 |

## Per prompt (current default)

| prompt | density | cliché | mid | far |
|---|---|---|---|---|
| Suggest a side business for a software developer | 0.884 | 88 / 58 / 100 | 53 / 37 / 52 | 25 |
| How can a small coffee shop attract more customers? | 0.893 | 100 / 76 / 100 / 63 / 73 |  | 35 / 5 |
| Give me a fresh idea for a birthday party for a 10-year-old | 0.871 | 37 / 38 / 93 / 71 / 89 |  | 61 |
| Name ideas for a new productivity app | 0.842 | 99 / 49 / 25 | 34 / 25 | 24 / 12 |
| How can a city reduce traffic congestion? | 0.910 | 100 / 100 / 90 / 97 | 48 | 24 / 46 |
| Suggest a marketing campaign for a new running shoe | 0.869 | 50 / 57 / 26 / 72 / 88 | 91 | 47 |
| Ideas to improve employee engagement in a remote team | 0.870 | 94 / 94 / 98 / 90 | 77 / 83 | 18 |
| What could a museum do to attract teenagers? | 0.891 | 70 / 55 / 95 / 81 / 52 |  | 28 / 47 |
| How can a non-profit raise money without asking for donations? | 0.888 | 100 / 42 / 97 / 94 / 72 | 68 | 56 |
| Suggest a new feature for a note-taking app | 0.875 | 94 / 90 / 93 / 75 | 38 / 60 | 9 |

## Findings (written by hand, not regenerated)

Day 3 (2026-10-31), mechanism judge added:

- The biggest error source was the labels, not the formula. 14 of 70 anchors written as "mid" or "far" turned out to be already in the cloud and 4 "far" ones sit close to a cloud answer (now "mid") (birthday escape room and detective party, running-shoe trade-in and night-shift runners, staggered start times, teens curating a room). For this metric an idea the cloud contains is a cliché, whatever its author believed; those anchors are relabelled in prompts.json ("relabel"), one cliché anchor the cloud avoided (trampoline park) is dropped. Caveat: the relabelling was done after seeing the scores, so the cloud-checked numbers are optimistic until the day-6 set is labelled blind.
- With cloud-checked labels: embedding only 84% pair order, judge only 85%, blend 40/60 90%, band accuracy 70%. The two signals make different mistakes, so the blend beats both. Defaults: spreadK 0.8, judge weight 0.6.
- With the original labels the judge alone is worse (70%) because it correctly calls those "creative" anchors clichés. That is a feature to show users: "your idea is already in the cloud".
- Judge: claude-haiku-5-5, one call per batch, cached in judge.json next to the clouds.

Day 2:

- Tuning spreadK 0.7 -> 0.6 lifted band accuracy 53% -> 60% on the original labels; ordering stayed at 74% for any parameters, it is set by the embedding geometry.
- Free Gemini tier: gemini-flash-latest often hangs for the full timeout; the provider falls back to gemini-flash-lite-latest per request. Cloud build takes 40-95 s per prompt on the free tier.
