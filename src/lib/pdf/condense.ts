import type { DocLength, ProposalSection, SectionType } from "../types";

/**
 * Length options for the customer PDF. Every length carries the same topics (site,
 * issue, services, method, devices, frequency, price, responsibilities, exclusions,
 * next step); shorter lengths condense wording rather than dropping sections.
 * Prices and scope numbers come from the view model and are never condensed.
 */

export const LENGTH_OPTIONS: { value: DocLength; label: string; hint: string }[] = [
  { value: "one_page", label: "1 page", hint: "Everything on a single page" },
  { value: "two_page", label: "2 pages", hint: "Summary page plus details" },
  { value: "short", label: "Short", hint: "Cover plus about 3 pages" },
  { value: "full", label: "Full", hint: "Full designed proposal" },
];

/** Page budget (including the cover where there is one). null = no limit. */
export const PAGE_TARGET: Record<DocLength, number | null> = { one_page: 1, two_page: 2, short: 4, full: null };

/** Condense levels tried in order until the document fits its page budget. */
export const FIT_LEVELS: Record<DocLength, number[]> = { one_page: [1, 2, 3, 4, 5], two_page: [0, 1, 2, 3, 4], short: [0, 1, 2, 3], full: [0] };

/** Contractual wording is never shortened below its first full paragraph, and items keep every title. */
const CONTRACTUAL: SectionType[] = ["exclusions", "customer_responsibilities", "triple_guarantee", "investment", "specialty_services"];

/** Sentence split that keeps abbreviations and initialisms ("A.I.M.®", "e.g.", "St.") intact. */
export function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/);
  const out: string[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && /(?:\b[A-Z]\.|\b(?:e\.g|i\.e|etc|vs|No|St|Dr|Mr|Ms|Inc|approx)\.)$/.test(prev)) out[out.length - 1] = `${prev} ${part}`;
    else if (part) out.push(part);
  }
  return out;
}

export function firstSentences(text: string, n: number): string {
  if (!text) return "";
  const s = sentences(text);
  return s.length <= n ? s.join(" ") : s.slice(0, n).join(" ");
}

/** Paragraph text without bullet lines (bullets usually duplicate the item cards). */
function prose(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .filter((b) => !b.split("\n").every((l) => /^\s*[-•]\s/.test(l)))
    .map((b) => b.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

function bullets(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => /^\s*[-•]\s/.test(l))
    .map((l) => l.replace(/^\s*[-•]\s+/, "").trim());
}

/**
 * Condense one section. Level 0 = full text; 1 = first paragraph, item lead sentences;
 * 2 = two sentences, short items; 3 = one sentence, titles; 4 = one sentence, titles only, no callouts.
 */
export function condenseSection(s: ProposalSection, level: number): ProposalSection {
  if (level <= 0) return s;
  const contractual = CONTRACTUAL.includes(s.type);
  const paras = prose(s.body);
  const bodySentences = level === 1 ? 99 : level === 2 ? 2 : 1;
  let body = level === 1 ? (paras[0] ?? "") : firstSentences(paras.join(" "), bodySentences);
  if (contractual) body = level <= 2 ? paras.join("\n\n") : (paras[0] ?? "");
  // Bullet lists that carry their own content (e.g. exclusions) become items so they survive condensing.
  const extra = bullets(s.body).map((b) => ({ title: b, body: "" }));
  const items = [...s.items, ...extra.filter((e) => !s.items.some((it) => it.title === e.title))].map((it) => ({
    title: it.title,
    body: contractual ? (level <= 2 ? it.body : firstSentences(it.body, 1)) : level === 1 ? firstSentences(it.body, 2) : level === 2 ? firstSentences(it.body, 1) : "",
  }));
  const callout = level >= 4 && !contractual ? "" : level >= 2 ? firstSentences(s.callout, 1) : s.callout;
  return { ...s, body, items, callout };
}

export function condenseAll(sections: ProposalSection[], level: number): ProposalSection[] {
  return sections.map((s) => condenseSection(s, level));
}
