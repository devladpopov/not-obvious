# A session, step by step

Real output from 17 November 2026, CLI, two Gemini models through the OpenAI-compatible endpoint (`NOT_OBVIOUS_OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, models `gemini-flash-lite-latest,gemini-flash-latest`), local embeddings, web check off. In an MCP client, the `not-obvious` prompt runs the same steps for you: pick it from the prompt list (in Claude Code, `/not-obvious:not-obvious`) and give it the task.

## 1. map: what every AI would say

```
$ not-obvious map "Suggest a name for a small bakery in Lisbon"
Cliché map: 20 answers from 2 model(s), 3 themes (embedder local-multilingual-e5-small)
 50%  Evocative Portuguese Narrative Names  [1/2 models]
       assumes: Names should tell a cultural story rooted in Lisbon's geography and traditions.
       e.g. Farinha do Bairro: A friendly community spot crafting authentic Portuguese breads with slow fermentation and local ingredients.
 45%  Modern Bilingual Blend Names  [1/2 models]
       assumes: Names should mix English and Portuguese words for global appeal and clarity.
       e.g. Alfama Oven
  5%  Direct Descriptive Simplicity  [1/2 models]
       assumes: Names should simply state the core product offering without elaborate storytelling.
       e.g. Pastel Doce
```

Note the `[1/2 models]`: one model answered with name plus pitch, the other with bare names, and embeddings noticed the form as well as the meaning. See [docs/providers.md](../docs/providers.md#a-note-on-themes-from-mixed-providers).

## 2. score: are my own ideas clichés?

```
$ not-obvious score "Suggest a name for a small bakery in Lisbon" "Pão Quente" "A Padaria do Bairro"
100% cliché  Pão Quente
       nearest: Pastel Doce  | embedding 100%, overlap 10/10  | useful 10/10
100% cliché  A Padaria do Bairro
       nearest: Farinha do Bairro: A friendly community spot ...  | embedding 100%, overlap 10/10  | useful 9/10
```

Both are what the models already say.

## 3. diverge: flip an assumption the clichés share

```
$ not-obvious diverge "Suggest a name for a small bakery in Lisbon" constraint-flip
Constraint flip via gemini-flash-lite-latest (kept Cliché < 50, useful >= 6):
  Constraint flip: 1 kept, 11 rejected, 2 round(s)
 34% cliché  [Constraint flip] A savory-only bakery that bans all sweet pastries and sugar, specializing instead in intense garlic-crusted sourdough and bold salt-cod brioche loaves.
       move: Flip flavor profile assumption  | useful 9/10
Closest misses:
  0% [Constraint flip] A shop selling only the empty, hollow air bubbles trapped inside sourdough loaves, packaged in pressurized glass jars.
       not useful enough: Sells literal empty air in glass jars.
  13% [Constraint flip] A floating river bakery mounted on a slow-moving electric raft that drifts along the Lisbon waterfront ...
       not useful enough: Watercraft regulations in Lisbon are restrictive.
```

Eleven of twelve ideas were rejected, almost all for usefulness, not for being clichés: far away is easy, far away and workable is not. The usefulness critic is what keeps "air bubbles in jars" out. The technique also drifted from naming to the concept of the bakery; a name built on the surviving concept ("Sal & Alho", a savoury-only padaria) is the next step: score it, then `explain` it.
