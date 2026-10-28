import { dollarsToCents } from "../engine/money";
import { parseFrequency } from "../commands/parse";
import { FREQUENCY_LABELS } from "../engine/frequency";

/**
 * Deterministic extraction from proposal text. Every item carries verbatim
 * evidence and a confidence level; nothing is saved as confirmed until the
 * user reviews it.
 */

export type Confidence = "high" | "medium" | "low";

export interface ExtractedItem<T = string> {
  id: string;
  value: T;
  evidence: string;
  confidence: Confidence;
  confirmed: boolean;
}

export interface ExtractedCharge {
  label: string;
  kind: "initial" | "recurring" | "equipment" | "specialty" | "other";
  cents: number | null;
  basis: string;
}

export interface Extraction {
  method: "pdf_text" | "docx" | "plain_text" | "ai_text" | "ai_ocr";
  customer: ExtractedItem | null;
  propertyName: ExtractedItem | null;
  address: ExtractedItem | null;
  contact: ExtractedItem | null;
  frequencies: ExtractedItem[];
  equipment: ExtractedItem<{ name: string; quantity: number | null; unitCents: number | null }>[];
  charges: ExtractedItem<ExtractedCharge>[];
  scope: ExtractedItem[];
  exclusions: ExtractedItem[];
  guarantees: ExtractedItem[];
  responsibilities: ExtractedItem[];
  duration: ExtractedItem | null;
  warnings: string[];
}

let n = 0;
const item = <T,>(value: T, evidence: string, confidence: Confidence): ExtractedItem<T> => ({ id: `x${++n}`, value, evidence: evidence.trim().slice(0, 240), confidence, confirmed: false });

function lines(text: string) {
  return text
    .split(/\r?\n|(?<=[.;])\s{2,}/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
}

export function extractFromText(text: string, method: Extraction["method"]): Extraction {
  const L = lines(text);
  const warnings: string[] = [];
  const addr = text.match(/\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Court|Ct|Highway|Hwy|Place|Pl)\.?,?\s+[A-Za-z .]+,\s*[A-Z]{2}\s+\d{5}/);
  const prepared = text.match(/(?:prepared for|proposal for|customer)[:\s]+([A-Z][^\n]{2,60})/i);
  const attn = text.match(/(?:attention|attn|contact)[:\s]+([A-Z][^\n]{2,60})/i);
  const freqs: ExtractedItem[] = [];
  for (const l of L) {
    const f = parseFrequency(l);
    if (f && /service|visit|program|schedule|frequency|billed|monthly|weekly|quarterly/i.test(l) && freqs.length < 8 && !freqs.some((x) => x.value === FREQUENCY_LABELS[f.kind])) freqs.push(item(FREQUENCY_LABELS[f.kind], l, "medium"));
  }
  const equipment: Extraction["equipment"] = [];
  const eqRe = /(\d[\d,]*)\s+((?:interior\s+|exterior\s+)?(?:tin\s*cats?|bait\s*stations?|rodent\s*(?:control\s*)?(?:devices?|stations?)|snap\s*traps?|glue\s*boards?|fly\s*lights?|insect\s*(?:light\s*traps?|monitors?)|multi-?catch\s*traps?))/gi;
  for (const l of L) for (const m of l.matchAll(eqRe)) {
    const unit = l.slice((m.index ?? 0) + m[0].length).match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:each|ea|\/\s*(?:unit|each))/i);
    equipment.push(item({ name: m[2].replace(/\s+/g, " "), quantity: Number(m[1].replace(/,/g, "")), unitCents: unit ? dollarsToCents(unit[1]) : null }, l, "medium"));
  }
  const charges: Extraction["charges"] = [];
  for (const l of L) {
    for (const m of l.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)(?:\s*[–-]\s*\$\s?([\d,]+(?:\.\d{2})?))?\s*([^$]{0,40})/g)) {
      const cents = dollarsToCents(m[1]);
      const ctx = l.toLowerCase();
      const kind: ExtractedCharge["kind"] = /initial|start-?up|first service/.test(ctx) ? "initial" : /each|per device|equipment|station|tin cat/.test(ctx) ? "equipment" : /per (visit|service|month)|monthly|weekly|recurring|per completed/.test(ctx) ? "recurring" : /per (unit|nest|apartment|inspection|bedroom)|cleanout|bed bug|flea|nest/.test(ctx) ? "specialty" : "other";
      const basis = (m[3] || "").trim().replace(/[.,;]$/, "");
      charges.push(item({ label: l.replace(m[0], "").replace(/\s{2,}/g, " ").trim().slice(0, 80) || basis || "Charge", kind, cents, basis: m[2] ? `range to $${m[2]} ${basis}` : basis }, l, kind === "other" ? "low" : "medium"));
      if (charges.length > 60) break;
    }
  }
  const pick = (re: RegExp, max = 12) => L.filter((l) => re.test(l) && l.length > 25).slice(0, max).map((l) => item(l, l, "medium"));
  const exclusions = pick(/exclud|not included|quoted separately|out[- ]of[- ]scope|separately authorized/i);
  const guarantees = pick(/guarantee/i, 8);
  const responsibilities = pick(/customer (shall|will|is responsible|responsibilit)|management (coordinates|will)|responsib/i, 10);
  const scope = pick(/inspect|treat|monitor|bait|trap|service (includes|areas)|integrated pest/i, 10);
  const dur = text.match(/(\d{1,2})[\s-]*(?:month|year)s?\s+(?:agreement|term|contract)|term of\s+(\d{1,2})\s*(?:months|years)/i);
  if (method === "pdf_text" && text.replace(/\s/g, "").length < 400) warnings.push("Very little text was found — this may be a scanned document. Use AI OCR if available.");
  if (!charges.length) warnings.push("No prices were detected.");
  return {
    method,
    customer: prepared ? item(prepared[1].trim(), prepared[0], "low") : null,
    propertyName: null,
    address: addr ? item(addr[0], addr[0], "medium") : null,
    contact: attn ? item(attn[1].trim(), attn[0], "low") : null,
    frequencies: freqs,
    equipment,
    charges,
    scope,
    exclusions,
    guarantees,
    responsibilities,
    duration: dur ? item(dur[0], dur[0], "low") : null,
    warnings,
  };
}

/** Map the AI extraction response into the same reviewable structure (still unconfirmed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromAI(x: any, method: "ai_text" | "ai_ocr"): Extraction {
  const f = (v: { value: string | null; confidence: Confidence; evidence: string } | undefined) => (v && v.value ? item(v.value, v.evidence, v.confidence) : null);
  return {
    method,
    customer: f(x.customer),
    propertyName: f(x.propertyName),
    address: f(x.address),
    contact: f(x.contact),
    frequencies: (x.frequencies ?? []).map((q: { program: string; frequency: string; evidence: string }) => item(`${q.frequency}${q.program ? ` — ${q.program}` : ""}`, q.evidence, "medium")),
    equipment: (x.equipment ?? []).map((e: { name: string; quantity: number | null; unitPrice: string | null; evidence: string; confidence: Confidence }) => item({ name: e.name, quantity: e.quantity, unitCents: e.unitPrice ? dollarsToCents(e.unitPrice.replace(/[^\d.,$]/g, "")) : null }, e.evidence, e.confidence)),
    charges: (x.charges ?? []).map((c: { label: string; kind: ExtractedCharge["kind"]; amount: string; basis: string; evidence: string; confidence: Confidence }) => item({ label: c.label, kind: c.kind, cents: dollarsToCents((c.amount.match(/[\d,]+(?:\.\d{2})?/) ?? [""])[0]), basis: c.basis }, c.evidence, c.confidence)),
    scope: (x.serviceScope ?? []).map((s: string) => item(s, s, "medium")),
    exclusions: (x.exclusions ?? []).map((s: string) => item(s, s, "medium")),
    guarantees: (x.guarantees ?? []).map((s: string) => item(s, s, "medium")),
    responsibilities: (x.customerResponsibilities ?? []).map((s: string) => item(s, s, "medium")),
    duration: f(x.contractDuration),
    warnings: x.notes ?? [],
  };
}
