# Cliché Score: how it is computed and how well it works

The Cliché Score (0-100) answers one question: how close is this idea to what every AI would say, and to what already exists? 0 = far from both, 100 = the typical answer. The code is in `src/math.ts` (`clicheScore`, `combineScores`) and `src/engine.ts` (`score`).

## Formula (v0.3, day 6)

1. **Cloud.** Several models (Claude and Gemini by default) answer the plain prompt; the answers are embedded (gemini-embedding-001) and near-duplicates merged. Typically 18-20 clichés per prompt.
2. **Embedding part.** For an idea: `nearest` = max cosine to any cliché, `density` = mean cosine between clichés (how tight the cloud is), `spread = max(0.05, 0.4 * (1 - density))`, and
   `embedding = 100 * clamp(1 - (density - nearest) / spread, 0, 1)`.
   An idea as close to its nearest cliché as clichés are to each other scores 100; one `spread` further away it scores 0. The scale adapts to the prompt: tight clouds ("reduce traffic congestion") get a narrow scale, loose ones ("podcast about history") a wide one. The centroid term from v0.2 is still in the code (`nearestWeight`), calibration puts its weight at 0.
3. **Web part.** The idea is searched on the web (Claude web search with up to 2 queries, or Brave Search) and rated 0-10 for prevalence: how much of the mechanism already exists as a product, service or common advice, with sources.
4. **Final score.** `cliche = 0.6 * embedding + 0.4 * 10 * web`. Without a web check (`web: false`, no web mode, or a failed search) the score is the embedding part alone.
5. **Explanations, not blended.** A mechanism judge (claude-haiku-5-5) names the closest cliché and rates mechanism overlap 0-10 with a reason; a critic rates usefulness 1-10. Both are returned next to the score. `diverge` filters candidates on the embedding part (< 50) and usefulness (>= 6), then web-checks only the survivors.

Constants in `src/math.ts`: `DEFAULT_PARAMS = { spreadK: 0.4, nearestWeight: 1 }`, `JUDGE_WEIGHT = 0`, `WEB_WEIGHT = 0.4`.

## Calibration data

| set | prompts | ideas | labels |
|---|---|---|---|
| `bench/prompts.json` | 10 | 69 | Hand-written anchors (cliché / mid / far), then cloud-checked: anchors the cloud already contains were relabelled cliché. The relabelling was done after seeing scores, so these numbers are optimistic. |
| `bench/set20.json` | 20 (the 10 above + 10 new) | 200 | claude-sonnet-5-5 wrote 10 answers per prompt (3 obvious, 4 twist, 3 rare); claude-opus-5-5, claude-sonnet-5-5 and gemini-flash-lite rated originality 1-7 blind (shuffled, no cloud, no scores). Bands from the mean: <= 2.5 cliché, >= 4.5 far. Each judge vs the other two: Spearman 0.89-0.94. |

Metrics: **band accuracy** (cliché >= 70, mid 30-70, far <= 35), **pair order** (share of cliché > mid > far pairs within a prompt in the right order, threshold-free), **rho** (mean per-prompt Spearman against the judges' 1-7 ratings, blind set only).

Parameters are picked by grid search (spread 0.3-1.6, nearest weight 0.4-1, judge weight 0-1, web weight 0-0.4) on band accuracy + pair order. A few hundred labels and a 3,000-point grid overfit easily, so every component is judged by **leave-one-prompt-out cross-validation**: parameters picked on the other prompts, scored on the held-out one. In the pooled run a prompt is held out from both sets at once.

## Results

Cross-validated (held-out) accuracy, band / pair order / rho:

| components | hand-written (10 prompts) | blind set (20 prompts) | pooled (270 ideas) |
|---|---|---|---|
| embedding | 64% / 85% | 55% / 81% / 0.63 | 53% / 82% / 0.63 |
| embedding + judge | 67% / 89% | 55% / 81% / 0.63 | 53% / 81% / 0.60 |
| embedding + judge + web | 65% / 89% | 56% / 85% / 0.72 | 61% / 86% / 0.73 |

On the pooled set all 20 folds picked the same parameters (spread 0.4, nearest weight 1, judge 0, web 0.4). They became the defaults.

In-sample, v0.2 defaults (spread 0.8, nearest 0.7, judge 0.6, web 0) against v0.3:

| set | v0.2 | v0.3 with web | v0.3 without web |
|---|---|---|---|
| hand-written | 70% / 90% | 72% / 90% | 62% / 83% |
| blind set | 49% / 77% / 0.56 | 57% / 86% / 0.73 | 52% / 78% / 0.60 |
| pooled | 54% / 79% / 0.56 | 61% / 86% / 0.73 | 54% / 78% / 0.60 |

That is why `score` checks the web by default: without it the new formula is no better than v0.2 on the pool, and worse on the hand-written set, where the judge helped.

Full tables: `docs/calibration.md`, `docs/calibration-set20.md`, `docs/calibration-all.md`. Regenerate with `bun run bench/calibrate.ts [set20|all]`; clouds, judge verdicts and web checks are cached in `research/clouds`, so a re-run costs nothing.

## Limitations

- **Labels come from models.** The blind set was written by claude-sonnet-5-5 and rated by three models, sonnet among them; web prevalence is rated by claude-haiku-5-5. Part of the web component's gain may be shared model taste rather than ground truth. On the hand-written set, the only one not labelled by models, adding web was neutral in cross-validation (65% / 89% against 67% / 89%). A human-rated set (`bench/set20-blind.csv`) is the next step.
- **Band accuracy is low on the blind set** (57%): ideas the judges call original still sit near the cloud in embedding space (far ideas average 46 on the embedding part) and often exist online (web prevalence 6.3 of 10). The thresholds were set for the hand-written anchors; the ordering (pair order, rho) is the more reliable signal.
- **20 prompts, all English, all "give me ideas for X" business and everyday tasks.** Not tested on technical, artistic or non-English prompts.
- **Clouds depend on the models used.** These were built from claude-haiku-5-5, gemini-flash-lite-latest and gemini-flash-latest. A different model mix gives a different cloud and different scores.
- **The web part costs about $0.01 per idea** with Claude web search (cached per idea). `web: false` or `NOT_OBVIOUS_WEB=off` turns it off.

## Related work

The score is not a new metric. It packages known ideas: cross-model homogeneity ([Artificial Hivemind](https://arxiv.org/abs/2510.22954)), within-model diversity ([NoveltyBench](https://novelty-bench.github.io)), novelty against web text ([Creativity Index](https://arxiv.org/abs/2410.04265)) and novelty as distance from reference ideas ([arXiv 2504.09389](https://arxiv.org/abs/2504.09389)).
