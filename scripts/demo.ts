/**
 * Terminal demo for the README, from a real run of the CLI.
 *   bun run scripts/demo.ts record   runs the scenes below, writes docs/demo.cast (asciinema v2)
 *   bun run scripts/demo.ts render   docs/demo.cast -> docs/demo.svg (animated, no dependencies)
 * Recording needs the same keys as the CLI. Output is real; only the pacing is edited: commands are typed at a steady
 * speed, waits for the models are cut to WAIT seconds, output lines are revealed one by one, long output is cut.
 */
import { readFile, writeFile } from "node:fs/promises";

const COLS = 100;
const ROWS = 30;
const WAIT = 1.2;
const CAST = new URL("../docs/demo.cast", import.meta.url);
const SVG = new URL("../docs/demo.svg", import.meta.url);

const PROMPT = "Suggest a side business for a software developer";
const IDEA = "Write a programming course for beginners";
const SCENES = [
  { caption: "# What would every AI say? The cliché cloud: 2 models x 10 answers", args: ["baseline", PROMPT] },
  { caption: "# The answer you would get anyway, measured", args: ["score", PROMPT, IDEA] },
  { caption: "# Why it is a cliché, one move away from the cloud, and the re-scored rewrite", args: ["explain", PROMPT, IDEA] },
];

const ESC = "\x1b[";
const color = (code: string, s: string) => `${ESC}${code}m${s}${ESC}0m`;
const scoreColor = (n: number) => (n >= 70 ? "31" : n >= 40 ? "33" : "32");
const quote = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** Word-wrap at COLS; continuation rows keep the line's indent plus two spaces. */
function wrap(line: string): string[] {
  const indent = " ".repeat(Math.min(12, (/^\s*/.exec(line)?.[0].length ?? 0) + 2));
  const rows: string[] = [];
  let row = "";
  for (const word of line.split(/(?<=\S) (?=\S)/)) {
    if (row && (row + " " + word).length > COLS) {
      rows.push(row);
      row = indent + word.trimStart();
    } else row = row ? `${row} ${word}` : word;
  }
  return [...rows, row];
}

/** Colour the numbers a reader looks for: scores red/yellow/green, model labels dim. */
function paint(line: string): string {
  return line
    .replace(/^(\s*)(\d+)% cliché/, (_, sp: string, n: string) => sp + color(`1;${scoreColor(Number(n))}`, `${n}% cliché`))
    .replace(/^(\s*rewrite )(\d+)%/, (_, pre: string, n: string) => pre + color(`1;${scoreColor(Number(n))}`, `${n}%`))
    .replace(/^(\s*)\[([^\]]+)\]/, (_, sp: string, m: string) => sp + color("90", `[${m}]`));
}

async function record() {
  const events: [number, "o", string][] = [];
  let t = 0.5;
  const out = (s: string, dt = 0) => {
    t += dt;
    events.push([Math.round(t * 1000) / 1000, "o", s]);
  };
  // DEMO_ONLY=baseline,score records a subset (e.g. while the embedding quota is out).
  const only = process.env.DEMO_ONLY?.split(",");
  for (const [i, sc] of SCENES.filter((x) => !only || only.includes(x.args[0]!)).entries()) {
    if (i > 0) out(`${ESC}2J${ESC}H`, 0.01);
    out(color("1;33", sc.caption) + "\r\n", 0.3);
    out(color("1;32", "$ "), 0.4);
    for (const ch of `not-obvious ${sc.args.map(quote).join(" ")}`) out(ch, 0.03);
    out("\r\n", 0.3);
    const started = Date.now();
    const p = Bun.spawn(["bun", "run", "src/cli.ts", ...sc.args], { stdout: "pipe", stderr: "inherit", env: process.env });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) !== 0) throw new Error(`${sc.args[0]} failed`);
    console.error(`${sc.args[0]}: ${((Date.now() - started) / 1000).toFixed(1)}s real, shown as ${WAIT}s`);
    t += WAIT;
    const lines = text.trimEnd().split("\n");
    let budget = ROWS - 4;
    for (const [k, line] of lines.entries()) {
      const need = rowsOf(line);
      if (need > budget - (k < lines.length - 1 ? 1 : 0)) {
        out(color("90", `  ... ${lines.length - k} more lines`) + "\r\n", 0.08);
        break;
      }
      budget -= need;
      out(paint(line) + "\r\n", 0.08);
    }
    t += 4.5;
  }
  out("", 0);
  const header = { version: 2, width: COLS, height: ROWS, timestamp: Math.floor(Date.now() / 1000), title: "Not Obvious: plain AI vs Not Obvious" };
  await writeFile(CAST, [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join("\n") + "\n");
  console.error(`wrote ${CAST.pathname} (${t.toFixed(1)}s)`);
}

// ---- render ----

type Seg = { text: string; t: number; cls: string };
type Scene = { rows: Seg[][]; start: number; end: number };

const SGR: Record<string, string> = { "1;33": "cap", "1;32": "ps", "1;31": "hi", "90": "dim" };

function parse(cast: string): { scenes: Scene[]; total: number } {
  const [, ...lines] = cast.trim().split("\n");
  const events = lines.map((l) => JSON.parse(l) as [number, string, string]);
  const total = events.at(-1)![0] + 0.5;
  const scenes: Scene[] = [];
  let sc: Scene = { rows: [[]], start: 0, end: total };
  let cls = "";
  let col = 0;
  const push = (text: string, t: number) => {
    const row = sc.rows.at(-1)!;
    const last = row.at(-1);
    if (last && last.t === t && last.cls === cls) last.text += text;
    else row.push({ text, t, cls });
  };
  for (const [t, , data] of events) {
    let s = data;
    if (s.startsWith(`${ESC}2J`)) {
      sc.end = t;
      scenes.push(sc);
      sc = { rows: [[]], start: t, end: total };
      s = s.replace(/^\x1b\[2J\x1b\[H/, "");
      col = 0;
    }
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "\x1b") {
        const m = /^\x1b\[([\d;]*)m/.exec(s.slice(i));
        if (m) {
          const code = m[1]!;
          cls = code === "0" || code === "" ? "" : (SGR[code] ?? (code.endsWith("32") ? "lo" : code.endsWith("33") ? "mid" : code.endsWith("31") ? "hi" : ""));
          i += m[0].length - 1;
          continue;
        }
      }
      if (ch === "\r") continue;
      if (ch === "\n" || col >= COLS) {
        sc.rows.push([]);
        col = 0;
        if (ch === "\n") continue;
      }
      push(ch, t);
      col++;
    }
  }
  scenes.push(sc);
  return { scenes, total };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(cast: string): string {
  const { scenes, total } = parse(cast);
  const charW = 8.4;
  const lineH = 19;
  const pad = 16;
  const top = 40;
  const W = Math.ceil(COLS * charW + pad * 2);
  const H = top + ROWS * lineH + pad;
  const frames = new Map<string, string>();
  const pct = (t: number) => ((t / total) * 100).toFixed(3);
  /** One keyframe set per (appear, disappear) pair: hidden, then shown from t until the scene ends. */
  const anim = (t: number, end: number) => {
    const key = `${pct(t)}_${pct(end)}`;
    if (!frames.has(key)) {
      const a = pct(t);
      const b = (Number(a) + 0.001).toFixed(3);
      const stops = [`0%,${a}%{opacity:0}`, `${b}%{opacity:1}`];
      if (end < total) stops.push(`${(Number(pct(end)) - 0.001).toFixed(3)}%{opacity:1}`, `${pct(end)}%,100%{opacity:0}`);
      else stops.push(`100%{opacity:1}`);
      frames.set(key, `@keyframes k${frames.size}{${stops.join("")}}`);
    }
    return `k${[...frames.keys()].indexOf(key)}`;
  };
  const body: string[] = [];
  for (const sc of scenes) {
    sc.rows.forEach((row, r) => {
      if (!row.length || r >= ROWS) return;
      const spans = row.map((s) => `<tspan class="${[s.cls, anim(s.t, sc.end)].filter(Boolean).join(" ")}">${xml(s.text)}</tspan>`).join("");
      body.push(`<text x="${pad}" y="${top + (r + 1) * lineH - 5}">${spans}</text>`);
    });
  }
  const css = [
    `text{font:14px ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;fill:#c9d1d9;white-space:pre}`,
    `tspan{opacity:0;animation-duration:${total.toFixed(2)}s;animation-iteration-count:infinite;animation-timing-function:linear}`,
    `.cap{fill:#e3b341;font-weight:bold}.ps{fill:#3fb950;font-weight:bold}.dim{fill:#8b949e}`,
    `.hi{fill:#f85149;font-weight:bold}.mid{fill:#e3b341;font-weight:bold}.lo{fill:#3fb950;font-weight:bold}`,
    ...[...frames.values()],
    ...[...frames.keys()].map((_, i) => `.k${i}{animation-name:k${i}}`),
  ].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Terminal demo: the cliché cloud for a prompt, the Cliché Score of the usual answer, and explain rewriting it away from the cloud">
<style>
${css}
</style>
<rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
<circle cx="20" cy="18" r="6" fill="#ff5f56"/><circle cx="40" cy="18" r="6" fill="#ffbd2e"/><circle cx="60" cy="18" r="6" fill="#27c93f"/>
<text x="${W / 2}" y="22" text-anchor="middle" style="fill:#8b949e;font-size:12px">not-obvious</text>
${body.join("\n")}
</svg>
`;
}

const mode = process.argv[2];
if (mode === "record") await record();
else if (mode === "render") {
  await writeFile(SVG, render(await readFile(CAST, "utf8")));
  console.error(`wrote ${SVG.pathname}`);
} else {
  console.error("usage: bun run scripts/demo.ts record|render");
  process.exit(1);
}
