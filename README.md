# Not Obvious

**See what every AI would say. Then go somewhere else.**

Not Obvious is an open-source MCP server against banality. Before it gives you ideas, it shows you the *cliché cloud*: the answers that every large language model gives to your exact question. Then it pushes away from that cloud with real creativity techniques (SCAMPER, TRIZ, morphological matrix, far analogies, constraint flips), crosses ideas (remix A x B), and **measures** how far each idea actually got with a Cliché Score.

> "Your idea is 82% cliché. Here's the AI answer it's closest to."

<!-- demo.gif: plain AI vs Not Obvious (coming in v0.1) -->

## Why

LLMs converge. Ask five models for a side business and you get five versions of "start a SaaS, freelance, make a course". Research calls this the [Artificial Hivemind](https://arxiv.org/abs/2510.22954). Existing creativity MCP servers wrap techniques in prompts and let the model grade itself. Not Obvious builds the cloud of typical answers per prompt and scores ideas by semantic distance from it, so originality is measured, not self-reported.

## Tools

| Tool | What it does |
|---|---|
| `baseline` | Asks every configured model the plain question and returns the cliché cloud (cached per prompt). |
| `diverge` | Generates ideas away from the cloud with a named technique (`scamper`, `triz`, `morphological`, `far-analogy`, `constraint-flip`) or `all` five in parallel. Keeps only ideas with Cliché Score below 50 and usefulness 6+; if too few survive, it regenerates with the rejection reasons. Returns the survivors and the closest misses. |
| `remix` | Crosses idea A and idea B into hybrids that neither parent nor the cloud contains. |
| `score` | Cliché Score 0-100 for any list of ideas (0 = far from the AI consensus), with the embedding part and the mechanism judge verdict, plus a usefulness critic 1-10. |
| `explain` | Why an idea scored the way it did and one concrete move to push it further. |

## Cliché Score (v0.2)

1. Build the cloud: each model answers the plain prompt; answers are embedded and near-duplicates merged.
2. Embed the idea and find its nearest cliché and its similarity to the cloud centroid ("the average AI answer").
3. Normalise against the cloud's own density: an idea as close to the cloud as clichés are to each other scores about 100; the scale adapts to how tight the cloud is (spread = 0.8 x (1 - density)). Blend: 70% nearest cliché, 30% centroid.
4. Embeddings see wording, not ideas. A mechanism judge (a fast LLM) rates 0-10 whether the idea does the same thing, for the same people, in the same way as some cliché. Final score: 40% embedding distance + 60% judge.
5. A separate critic rates usefulness so that "far away" never means "nonsense".

Calibration on 10 prompts x 7 hand-labelled anchors ([`docs/calibration.md`](docs/calibration.md)): a cliché outranks a mid idea and a mid idea outranks a far one in 90% of pairs (84% with embeddings alone). Distance from what the web already has (search-based novelty) and human ratings are on the roadmap. The formula lives in [`src/math.ts`](src/math.ts).

## Quick start

```json
{
  "mcpServers": {
    "not-obvious": {
      "command": "npx",
      "args": ["-y", "not-obvious-mcp"],
      "env": { "ANTHROPIC_API_KEY": "...", "GEMINI_API_KEY": "..." }
    }
  }
}
```

One key is enough; two model families give a better cloud. Without a Gemini key, embeddings fall back to an offline lexical mode (works, but less semantic).

CLI for quick checks:

```bash
npx -p not-obvious-mcp not-obvious baseline "Suggest a side business for a software developer"
npx -p not-obvious-mcp not-obvious score "Suggest a side business for a software developer" "Build a SaaS for small businesses"
npx -p not-obvious-mcp not-obvious diverge "Suggest a side business for a software developer" all
```

## Roadmap

- [ ] Web novelty: distance from top search results, not just from models
- [ ] More models in the cloud (OpenRouter), local embeddings
- [ ] Public leaderboard: which model is the most banal
- [ ] Calibration set with human originality ratings

## Prior work

[Artificial Hivemind](https://arxiv.org/abs/2510.22954) (cross-model homogeneity), [NoveltyBench](https://novelty-bench.github.io) (within-model diversity), [Creativity Index](https://arxiv.org/abs/2410.04265) (novelty vs. web text), [novelty as distance from reference ideas](https://arxiv.org/abs/2504.09389). Not Obvious packages these ideas into a per-prompt, interactive tool.

## License

MIT
