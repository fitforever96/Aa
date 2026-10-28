import type { KnowledgeChunk, KnowledgeDoc } from "./types";
import { uid } from "./ids";

/** Local document retrieval (BM25) over the knowledge library — works offline, nothing leaves the device. */

const STOP = new Set("the a an and or of to in for on with by is are be as at from that this it its will we our your their which any all not can may per".split(" "));
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function chunkText(text: string, size = 900): KnowledgeChunk[] {
  const paras = text.split(/\n\s*\n|(?<=\.)\s{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: KnowledgeChunk[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + " " + p).length > size && cur) {
      out.push({ id: uid("chk"), text: cur });
      cur = p;
    } else cur = (cur + " " + p).trim();
  }
  if (cur) out.push({ id: uid("chk"), text: cur });
  return out;
}

export interface Hit {
  docId: string;
  docName: string;
  chunk: KnowledgeChunk;
  score: number;
}

export function search(docs: KnowledgeDoc[], query: string, k = 5): Hit[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const all = docs.flatMap((d) => d.chunks.map((c) => ({ d, c, toks: tokenize(c.text) })));
  const N = all.length || 1;
  const avg = all.reduce((s, x) => s + x.toks.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const x of all) for (const t of new Set(x.toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.4,
    b = 0.75;
  return all
    .map((x) => {
      const tf = new Map<string, number>();
      for (const t of x.toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * x.toks.length) / avg)));
      }
      return { docId: x.d.id, docName: x.d.name, chunk: x.c, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
