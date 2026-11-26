# External check: human originality ratings

**Short version.** On 3030 human answers to the Alternate Uses Task, embedding-only Cliché Score agrees with human originality ratings only weakly: Spearman 0.13 within a prompt, 0.06 pooled. That is a little above the classic semantic-distance baseline (SemDis, 0.09 / 0.07) and far below Ocsai, a model fine-tuned on these very ratings (0.72 / 0.81). If the cloud is built from creative AI answers instead of plain ones, the sign flips. We publish this as is: "far from what AI says" and "rated original by people" are related but not the same thing.

## Data

Organisciak, Acar, Dumas and Berthiaume (2023), *Beyond Semantic Distance: Automated Scoring of Divergent Thinking Greatly Improves with Large Language Models*, Thinking Skills and Creativity. Materials: [github.com/massivetexts/llm_aut_study](https://github.com/massivetexts/llm_aut_study) (MIT), file `results/evaluation.zip`, test split `gt_main2`: 3030 responses for 21 objects (brick, box, knife, rope, ...), each with a human originality rating from 1 to 5. The same rows carry the predictions of SemDis (`SemDis_MEAN`) and Ocsai (`gpt-ft-davinci-1`), so all scores are compared on identical responses.

## Method

Not Obvious never saw these ratings. For each object we build a cliché cloud the usual way (Claude and Gemini, 20 answers each, deduplicated, about 40 per object) and score every human response with the embedding-only Cliché Score: no judge, no critic, no web. Embedder `local-multilingual-e5-small`. Lower Cliché Score should mean higher human originality, so the tables show Spearman of the negated score.

Two cloud prompts:

- **plain**: "List alternative uses for a <object>, a few words each." (the question people answered, answers in the same short format)
- **surprising**: "What is a surprising use for a <object>?" (models asked for unusual uses)

Reproduce: download `evaluation.zip` to `research/human-data/raw/`, then `NOT_OBVIOUS_EMBEDDER=local bun run bench/human.ts 0 plain` (and `... 0 surprising`). Results: `bench/human-plain.json`, `bench/human-surprising.json`.

## Results

Spearman with the human rating:

| | Cliché Score, plain cloud | Cliché Score, surprising cloud | SemDis | Ocsai (trained on ratings) | Response length |
|---|---|---|---|---|---|
| Within prompt, weighted mean | 0.13 | -0.04 | 0.09 | 0.72 | 0.17 |
| Pooled | 0.06 | -0.14 | 0.07 | 0.81 | 0.22 |

Share of responses rated 3+ by people: 23% overall. Plain cloud: 23% among the 20% least clichéd, 18% among the 20% most clichéd. Surprising cloud: 10% and 32%, the wrong way round.

| Object | n | Cliché, plain | Cliché, surprising | SemDis | Ocsai |
|---|---|---|---|---|---|
| brick | 771 | 0.09 | -0.03 | 0.07 | 0.61 |
| box | 431 | 0.24 | -0.11 | 0.05 | 0.74 |
| knife | 347 | 0.21 | -0.04 | -0.01 | 0.83 |
| rope | 295 | 0.17 | -0.00 | 0.12 | 0.60 |
| paperclip | 232 | 0.13 | 0.06 | 0.19 | 0.75 |
| bottle | 115 | 0.10 | -0.06 | -0.03 | 0.82 |
| book | 81 | 0.10 | 0.06 | 0.06 | 0.61 |
| pants | 67 | 0.08 | -0.15 | 0.24 | 0.87 |
| tire | 66 | -0.05 | 0.03 | 0.14 | 0.91 |
| sock | 65 | 0.22 | 0.25 | -0.04 | 0.71 |
| spoon | 64 | 0.20 | -0.19 | 0.32 | 0.75 |
| lightbulb | 60 | 0.10 | -0.26 | 0.33 | 0.80 |
| table | 57 | 0.04 | -0.26 | 0.35 | 0.90 |
| ball | 57 | 0.00 | -0.16 | 0.08 | 0.83 |
| fork | 56 | 0.20 | 0.08 | 0.24 | 0.82 |
| pencil | 54 | -0.13 | -0.04 | 0.10 | 0.77 |
| shoe | 53 | -0.41 | -0.21 | 0.15 | 0.90 |
| shovel | 52 | 0.30 | 0.13 | 0.07 | 0.75 |
| toothbrush | 50 | 0.28 | -0.00 | -0.02 | 0.79 |
| hat | 50 | -0.04 | -0.09 | 0.30 | 0.78 |
| backpack | 7 | 0.39 | -0.13 | -0.16 | 0.88 |

## What we learned

1. **The cloud has to answer the same question.** With "surprising use" the models produce exactly the kind of answers people rate as original (repurposing, elaborated scenarios), so closeness to that cloud predicts *higher* human originality (-0.14 pooled). With the plain question the cloud holds the obvious uses (doorstop, paperweight, build a wall) and the sign is right. In the tool this is automatic: the cloud is built from the user's own prompt.
2. **Length leaks in.** Human AUT answers are 2-4 words; embeddings of longer, more elaborated answers sit closer to any cloud of full sentences. Cliché Score correlates with response length at 0.50 (surprising) and 0.31 (plain), while people reward elaboration (length vs rating 0.22). Asking the models for short answers halved the leak but did not remove it.
3. **Unsupervised distance is a weak proxy for human originality on AUT.** SemDis does no better here, which matches the paper. What works is supervision on human ratings (Ocsai). Cliché Score answers a narrower question, "would other AIs say this", and should not be read as a general originality rating.

## Length experiment

`bench/human-length.ts` tries to keep answer length out of the score (Spearman with the human rating, within prompt, weighted mean / pooled):

| Variant | Plain cloud | Surprising cloud |
|---|---|---|
| Cliché Score as shipped (0-100, clipped) | 0.13 / 0.06 | -0.04 / -0.14 |
| Nearest-cliché similarity, unclipped | 0.14 / 0.04 | 0.02 / -0.10 |
| Minus a length trend fitted on the cloud itself (per idea) | 0.07 / 0.14 | -0.02 / 0.17 |
| Minus the length trend across the scored ideas of one prompt (batch) | 0.19 / 0.06 | 0.13 / 0.02 |
| Response length alone | 0.17 / 0.22 | 0.17 / 0.22 |

Taking the length trend out across a batch of ideas helps most: within a prompt it takes the plain cloud from 0.13 to 0.19 and turns the surprising cloud positive. But it needs dozens of ideas for one prompt, and `score` usually gets a handful, so the shipped formula stays as it is: a correction fitted on the cloud alone, which would work per idea, does worse. Either way the gain is small next to Ocsai (0.72), and length alone predicts these ratings about as well, so the honest summary stands: on AUT, distance from the AI cloud is a weak proxy for what people call original.

## Mechanism judge on a sample

`bench/human-judge.ts` takes 15 evenly spaced responses per object (307 in total), plain cloud, and asks the mechanism judge (the prompt from `src/engine.ts`, Claude Haiku 5.5 through the CLI) how much each response overlaps a cliché, 0-10. Spearman with the human rating, higher = agrees with people:

| Signal | Within prompt | Pooled | Correlation with length |
|---|---|---|---|
| Cliché Score (embeddings only) | 0.07 | -0.08 | -0.36 |
| Judge overlap alone | 0.00 | -0.04 | 0.08 |
| Blend, judge weight 0.25 | 0.06 | -0.08 | -0.30 |
| Blend, judge weight 0.5 | 0.03 | -0.08 | -0.21 |
| Blend, judge weight 0.75 | 0.02 | -0.06 | -0.06 |
| SemDis | -0.02 | 0.04 | 0.28 |
| Ocsai | 0.78 | 0.87 | 0.18 |
| Response length | 0.12 | 0.21 | 1.00 |

The judge is indeed almost free of length (0.08 against -0.36 for embeddings), and agrees with the embedding score at 0.44, but it does not track human AUT originality any better: zero within a prompt. Blending only dilutes the embedding signal. So the length leak is not what separates Cliché Score from human ratings on AUT: "a mechanism other AIs also use" and "what raters call original in two-word object uses" are different questions. The shipped weights stay (judge 0 for Latin-script prompts, 1 for non-Latin, docs/scoring.md). On a 307-row sample one rho step of 0.1 is within noise, so read the table as "no gain", not as a ranking.

## Second dataset: research ideas rated by experts

`bench/human-ideas.ts` uses the ideation study of Si, Yang and Hashimoto ([Can LLMs Generate Novel Research Ideas?](https://arxiv.org/abs/2409.04109), ICLR 2025, [repo](https://github.com/NoviScl/AI-Researcher), MIT): 49 prompting ideas written by NLP experts and 49 written by an LLM agent on 7 topics (bias, coding, safety, multilingual, factuality, math, uncertainty), each blind-reviewed by 2-4 NLP researchers for novelty on a 1-10 scale. The target is the mean novelty per idea. The cloud for each topic is the answer to "Propose a novel prompting-based research idea to <topic>" (20 answers, Gemini Flash Lite on the free tier, local e5-small embeddings); the mechanism judge is Claude Haiku 5.5. The idea is scored by its title, or by title plus the first two sentences of its problem statement.

| Spearman with expert novelty | Title | Title + problem |
|---|---|---|
| Cliché Score, within topic | 0.13 | 0.09 |
| Cliché Score, pooled | 0.06 | 0.10 |
| Judge overlap, within topic | 0.05 | -0.12 |
| Length, within topic | 0.14 | 0.17 |

| By condition (title) | Expert novelty | Cliché Score | Judge overlap |
|---|---|---|---|
| Human experts (49) | 4.86 | 27 | 4.4 |
| LLM agent (49) | 5.62 | 33 | 5.3 |

Two readings. First, as on AUT, the correlation with human novelty is weak and noisy (per-topic rho ranges from -0.44 to 0.61 on 8-22 ideas), so the honest claim does not change: Cliché Score is not a stand-in for expert novelty ratings. Second, the direction on the two conditions is the interesting part: the experts rated the agent's ideas as more novel, as the paper reports, while both Cliché Score and the judge put them closer to what AI models say by default (pairwise within a topic, an AI idea scores higher in 52% of pairs, so the gap is small). That is the gap Not Obvious targets: an idea can look novel to a reviewer and still be the answer every model would give. With the problem statement added, scores jump (27 to 67) because longer text sits closer to a cloud of 25-word answers, the same length effect as on AUT.

Caveats: 98 ideas, a single-model cloud of 20 answers (the free Gemini tier, no Claude credits), reviewers saw full proposals while the score sees a title. Reproduce: download the three zip files linked in the repo README into `research/si-ideas/ex/{human,ai}`, then `NOT_OBVIOUS_EMBEDDER=local HJ_JUDGE=1 bun run bench/human-ideas.ts title`.

## Next

- Product ideas: short ideas rated for originality against a common question (product ideas), with a multi-model cloud.
