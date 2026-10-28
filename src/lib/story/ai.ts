import type { PriceRef, Proposal, ProposalSection, Story, StoryBlock } from "../types";
import type { StoryOutput } from "../ai/tasks/story";
import { writerContext } from "../writer/aiPayload";
import { frequencyRationale, rotationCheck } from "../writer/rationale";
import { priceProposal } from "../engine/pricing";
import { frequencyLabel } from "../engine/frequency";
import { sentences } from "../pdf/condense";
import { composeStory } from "./compose";

/** Price keys Claude may attach (labels only; amounts never leave the pricing engine). */
export function priceKeys(p: Proposal): { key: string; label: string; ref: PriceRef }[] {
  const out: { key: string; label: string; ref: PriceRef }[] = [];
  priceProposal(p).forEach((r, i) => {
    const pr = p.programs[i];
    if (r.initial.finalCents > 0) out.push({ key: `p${i}_initial`, label: `${pr.name}: initial service (one-time)`, ref: { program: i, part: "initial" } });
    if (r.recurring) out.push({ key: `p${i}_recurring`, label: `${pr.name}: ${frequencyLabel(pr.frequency).toLowerCase()} service, per ${r.billing?.method === "fixed_monthly" && r.billing.fixedMonthlyCents != null ? "month" : "visit"}`, ref: { program: i, part: "recurring" } });
    if (r.equipment.lines.length && !r.equipment.unpriced.length && r.equipment.totalCents > 0) out.push({ key: `p${i}_equipment`, label: `${pr.name}: equipment (one-time): ${pr.equipment.filter((e) => e.billable && e.quantity > 0).map((e) => `${e.quantity} ${e.name}`).join(", ")}`, ref: { program: i, part: "equipment" } });
    pr.pricing.additionalInitial.filter((l) => l.approved && l.amountCents > 0).forEach((l, j) => out.push({ key: `p${i}_add_initial_${j}`, label: `${l.label} (one-time)`, ref: { line: l.label, program: i, phase: "initial" } }));
    pr.pricing.additionalRecurring.filter((l) => l.approved && l.amountCents > 0).forEach((l, j) => out.push({ key: `p${i}_add_recurring_${j}`, label: `${l.label} (per visit)`, ref: { line: l.label, program: i, phase: "recurring" } }));
  });
  p.specialtyItems.filter((s) => s.approved && s.priceCents != null).forEach((s, j) => out.push({ key: `specialty_${j}`, label: `${s.name}${s.basis ? ` (${s.basis})` : ""}`, ref: { specialty: s.name } }));
  return out;
}

/** Customer-facing facts for the story writer (no rates, minutes, yields or amounts). */
export function storyFacts(p: Proposal, sections: ProposalSection[]) {
  const prog = p.programs[0];
  const rot = prog ? rotationCheck(p.property, prog) : null;
  const devices = p.programs.flatMap((x) => x.equipment.filter((e) => e.quantity > 0));
  const sec = (t: ProposalSection["type"]) => sections.find((s) => s.type === t && s.enabled);
  return {
    ...writerContext(p),
    address: [p.property.address.line1, p.property.address.city, p.property.address.state].filter(Boolean).join(", "),
    interiorDevices: devices.filter((e) => e.location === "interior").reduce((a, e) => a + e.quantity, 0),
    exteriorStations: devices.filter((e) => e.location === "exterior").reduce((a, e) => a + e.quantity, 0),
    rotationMath: rot ? { apartments: rot.units, apartmentsPerVisit: rot.aptsPerVisit, visitsPerMonth: rot.visitsPerMonth, apartmentServicesPerMonth: rot.monthlyCapacity, monthsToReachEveryApartment: rot.cycleMonths } : null,
    frequencyReasoning: prog ? frequencyRationale(p.property, prog) : "",
    recommendation: p.recommendation ? { assumptions: p.recommendation.assumptions, recommended: p.recommendation.recommended } : null,
    acceptedResearch: p.research.filter((r) => r.status === "accepted").map((r) => ({ topic: r.topic, summary: r.summary })),
    approvedMethodology: sec("service_methodology")?.body ?? "",
    contact: p.customer.contactName || null,
  };
}

const MONEY = /\$\s?\d|\b\d[\d,]*(?:\.\d{2})?\s?(?:dollars|USD)\b/i;
/** Drop any sentence that states an amount: prices come only from the pricing engine. */
const noMoney = (t: string) => (MONEY.test(t) ? sentences(t).filter((s) => !MONEY.test(s)).join(" ") : t);

/**
 * Turn Claude's draft into a safe Story: price keys become engine references, any
 * amount written in prose is removed, and approved scope pricing, terms, guarantee
 * wording, schedules and the price summary come from the rules story.
 */
export function finalizeAIStory(out: StoryOutput, p: Proposal, sections: ProposalSection[]): Story {
  const rules = composeStory(p, sections);
  const keys = new Map(priceKeys(p).map((k) => [k.key, k.ref]));
  const blocks: StoryBlock[] = [];
  const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === "string" ? noMoney(x) : x));
  for (const raw of out.blocks) {
    const b = clean(raw);
    if (b.kind === "scope") blocks.push({ kind: "scope", priority: b.priority, cards: b.cards.map((c) => ({ eyebrow: c.eyebrow, title: c.title, price: keys.get(c.priceKey) ?? null, priceSuffix: c.priceSuffix, bullets: c.bullets })) });
    else if (b.kind === "charge") {
      const ref = keys.get(b.priceKey);
      if (ref) blocks.push({ kind: "charge", priority: b.priority, title: b.title, price: ref, priceLabel: b.priceLabel, text: b.text });
    } else blocks.push(b as StoryBlock);
  }
  // Every price must appear in the body; if Claude's scope missed one, use the approved scope and charges instead.
  const used = new Set(blocks.flatMap((b) => (b.kind === "scope" ? b.cards.map((c) => JSON.stringify(c.price)) : b.kind === "charge" ? [JSON.stringify(b.price)] : [])));
  const missing = [...keys.values()].some((ref) => !used.has(JSON.stringify(ref)));
  let body = blocks;
  if (missing) {
    body = blocks.filter((b) => b.kind !== "scope" && b.kind !== "charge");
    const at = Math.max(0, body.findIndex((b) => b.kind === "heading"));
    const priced = rules.blocks.filter((b) => b.kind === "scope" || b.kind === "charge");
    body.splice(at + 1, 0, ...priced);
  }
  // Approved wording from the rules story: schedules, guarantee, terms, price summary, next step.
  const fromRules = rules.blocks.filter((b) => b.kind === "schedules" || b.kind === "twoLists" || b.kind === "priceStrip" || (b.kind === "callout" && b.priority === 1));
  const next = rules.blocks[rules.blocks.length - 1];
  const research = p.research.filter((r) => r.status === "accepted" && r.sources.length);
  const tail: StoryBlock[] = [...fromRules, ...(next?.kind === "paragraph" ? [next] : [])];
  if (research.length) tail.push({ kind: "sources", priority: 3, items: research.flatMap((r) => r.sources.map((s) => `${s.title}: ${s.url}`)).slice(0, 6) });
  const h = clean(out.hero);
  return {
    hero: { eyebrow: h.eyebrow || rules.hero.eyebrow, title: h.title || rules.hero.title, subtitle: h.subtitle || rules.hero.subtitle, tagline: h.tagline, stats: h.stats.length ? h.stats : rules.hero.stats },
    blocks: [...body, ...tail],
    source: "ai",
    updatedAt: new Date().toISOString(),
  };
}
