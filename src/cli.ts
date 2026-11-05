#!/usr/bin/env node
/** Tiny CLI for demos and debugging: not-obvious <baseline|score|diverge|remix|explain> "prompt" [...] */
import { baseline, diverge, explain, remix, score, withContext } from "./engine.js";

const argv = process.argv.slice(2);
// --context "about me" anywhere in the arguments is put in front of the prompt.
const ci = argv.indexOf("--context");
const context = ci >= 0 ? argv.splice(ci, 2)[1] : undefined;
const [cmd, rawPrompt, ...rest] = argv;
const prompt = rawPrompt && withContext(rawPrompt, context);

async function main() {
  if (!cmd || !prompt) {
    console.log('Usage:\n  not-obvious baseline "prompt"\n  not-obvious score "prompt" "idea" ["idea" ...] [--no-web]\n  not-obvious diverge "prompt" [all|scamper|triz|morphological|far-analogy|constraint-flip]\n  not-obvious remix "prompt" "idea A" "idea B"\n  not-obvious explain "prompt" "idea"\n\nAny command: --context "a few sentences about you" builds the cloud for the prompt with that context.');
    process.exit(1);
  }
  if (cmd === "baseline") {
    const c = await baseline(prompt, { refresh: rest.includes("--refresh") });
    console.log(`Cliché cloud (${c.cliches.length}, embedder ${c.embedder}):`);
    for (const x of c.cliches) console.log(`  [${x.model}] ${x.text}`);
  } else if (cmd === "score") {
    const web = !rest.includes("--no-web");
    for (const s of await score(prompt, rest.filter((x) => x !== "--web" && x !== "--no-web"), { web })) {
      console.log(`${String(s.cliche).padStart(3)}% cliché  ${s.idea}`);
      console.log(`       nearest: ${s.nearest}  | embedding ${s.embedding}%${s.judge ? `, overlap ${s.judge.overlap}/10` : ""}${s.usefulness ? `  | useful ${s.usefulness.score}/10` : ""}`);
      if (s.web) console.log(`       web ${s.web.prevalence}/10: ${s.web.why}${s.web.sources[0] ? `  (${s.web.sources[0].url})` : ""}`);
    }
  } else if (cmd === "diverge") {
    const r = await diverge(prompt, rest[0] ?? "all");
    console.log(`${r.technique} via ${r.model} (kept Cliché < ${r.thresholds.maxCliche}, useful >= ${r.thresholds.minUseful}):`);
    for (const t of r.techniques) console.log(`  ${t.technique}: ${t.kept} kept, ${t.rejected} rejected, ${t.rounds} round(s)`);
    for (const e of r.errors) console.log(`  error ${e}`);
    for (const s of r.ideas)
      console.log(`${String(s.cliche).padStart(3)}% cliché  [${s.technique}] ${s.idea}\n       move: ${s.move}${s.usefulness ? `  | useful ${s.usefulness.score}/10` : ""}${s.web ? `  | web ${s.web.prevalence}/10${s.existsOnline ? " EXISTS" : ""}` : ""}`);
    if (r.rejected.length) console.log("Closest misses:");
    for (const x of r.rejected) console.log(`  ${x.cliche}% [${x.technique}] ${x.idea}\n       ${x.reason}`);
  } else if (cmd === "remix") {
    const r = await remix(prompt, rest[0] ?? "", rest[1] ?? "");
    console.log(`Remix via ${r.model}:`);
    for (const p of r.parents) console.log(`  parent ${p.cliche}% cliché  ${p.idea}`);
    for (const h of r.hybrids)
      console.log(`${String(h.cliche).padStart(3)}% cliché ${h.escaped ? "+" : "-"} ${h.idea}\n       A: ${h.from_a} | B: ${h.from_b}${h.usefulness ? `  | useful ${h.usefulness.score}/10` : ""}`);
  } else if (cmd === "explain") {
    const r = await explain(prompt, rest[0] ?? "");
    console.log(`${r.cliche}% cliché (embedding ${r.embedding}%${r.judge ? `, overlap ${r.judge.overlap}/10` : ""})  nearest: ${r.nearest}`);
    console.log(`  clichéd:   ${r.explanation.cliched}\n  different: ${r.explanation.different}\n  move (${r.explanation.technique}): ${r.explanation.move}`);
    if (r.web) console.log(`  web ${r.web.prevalence}/10: ${r.web.why}`);
    console.log(`  rewrite ${r.rewrite.cliche}% (${r.rewrite.delta >= 0 ? "+" : ""}${r.rewrite.delta}${r.rewrite.web ? `, web ${r.rewrite.web.prevalence}/10` : ""}): ${r.rewrite.idea}`);
  } else {
    throw new Error(`Unknown command ${cmd}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
