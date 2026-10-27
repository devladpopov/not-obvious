#!/usr/bin/env node
/** Tiny CLI for demos and debugging: not-obvious <baseline|score|diverge> "prompt" [...] */
import { baseline, diverge, score } from "./engine.js";

const [cmd, prompt, ...rest] = process.argv.slice(2);

async function main() {
  if (!cmd || !prompt) {
    console.log('Usage:\n  not-obvious baseline "prompt"\n  not-obvious score "prompt" "idea" ["idea" ...]\n  not-obvious diverge "prompt" <scamper|triz|morphological|far-analogy|constraint-flip>');
    process.exit(1);
  }
  if (cmd === "baseline") {
    const c = await baseline(prompt, { refresh: rest.includes("--refresh") });
    console.log(`Cliché cloud (${c.cliches.length}, embedder ${c.embedder}):`);
    for (const x of c.cliches) console.log(`  [${x.model}] ${x.text}`);
  } else if (cmd === "score") {
    for (const s of await score(prompt, rest)) {
      console.log(`${String(s.cliche).padStart(3)}% cliché  ${s.idea}`);
      console.log(`       nearest: ${s.nearest}${s.usefulness ? `  | useful ${s.usefulness.score}/10` : ""}`);
    }
  } else if (cmd === "diverge") {
    const r = await diverge(prompt, rest[0] ?? "constraint-flip");
    console.log(`${r.technique} via ${r.model}:`);
    for (const s of r.ideas) console.log(`${String(s.cliche).padStart(3)}% cliché  ${s.idea}\n       move: ${s.move}`);
  } else {
    throw new Error(`Unknown command ${cmd}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
