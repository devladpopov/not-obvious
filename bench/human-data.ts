/** Organisciak et al. (2023) AUT test split, parsed from research/human-data/raw/evaluation.zip (see bench/human.ts). */
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const ZIP = "research/human-data/raw/evaluation.zip";

/** Minimal zip reader (central directory, deflate or stored). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(lStart, lStart + size);
    if (!name.endsWith("/")) out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

const files = unzip(await readFile(ZIP));
const csv = (name: string) => parseCsv(files.get(`evaluation/gt_main2/${name}.csv`)!.toString("utf8"));
const semdis = csv("SemDis_MEAN");
// Ocsai = the paper's best model (GPT-3 davinci fine-tuned on human ratings); ocs-main is the earlier semantic-distance system.
const ocsai = new Map(csv("gpt-ft-davinci-1").filter((r) => r.predicted !== "").map((r) => [r.id, Number(r.predicted)]));
const withText = new Map(csv("SemDis_TASA_nf_m").map((r) => [r.id, r.response]));


export type Row = { id: string; object: string; text: string; human: number; semdis: number; ocsai?: number; cliche?: number };

/** Rows grouped by object, largest first. */
export function rowsByObject(): [string, Row[]][] {
  const byObject = new Map<string, Row[]>();
  for (const r of semdis) {
    const text = (r.response || withText.get(r.id!) || "").trim();
    if (!text) continue;
    const list = byObject.get(r.prompt!) ?? [];
    list.push({ id: r.id!, object: r.prompt!, text, human: Number(r.target), semdis: Number(r.predicted), ocsai: ocsai.get(r.id!) });
    byObject.set(r.prompt!, list);
  }
  return [...byObject].sort((a, b) => b[1].length - a[1].length);
}
