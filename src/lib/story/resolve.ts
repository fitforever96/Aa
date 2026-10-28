import type { DocLength, PriceRef, Proposal, ProposalSection, Story, StoryBlock } from "../types";
import { priceProposal } from "../engine/pricing";
import { formatMoney } from "../engine/money";
import { buildPdfModel, formatDateLong, type PdfModel } from "../pdf/model";
import { firstSentences } from "../pdf/condense";
import { composeStory } from "./compose";

/** Everything the portrait story PDF needs. Prices are resolved here, from the pricing engine only. */
export interface StoryModel {
  hero: Story["hero"];
  blocks: StoryBlock[];
  price: (ref: PriceRef | null) => string | null;
  customer: string;
  site: string;
  address: string;
  programTitle: string;
  dateLabel: string;
  preparedBy: { name: string; title: string; phone: string; email: string }[];
  length: DocLength;
  coverImage: string | null;
  schedules: PdfModel["schedules"];
}

/** Whole-dollar amounts drop the cents ("$885"); others keep them ("$885.50"). */
export function storyMoney(cents: number): string {
  const s = formatMoney(cents);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

export function buildStoryModel(p: Proposal, coverImage: string | null = null): StoryModel {
  const sections: ProposalSection[] = p.document.sections.filter((s) => s.enabled);
  const story = p.story ?? composeStory(p, sections);
  const results = priceProposal(p);
  const price = (ref: PriceRef | null): string | null => {
    if (!ref) return null;
    if ("specialty" in ref) {
      const s = p.specialtyItems.find((x) => x.name === ref.specialty && x.approved);
      return s?.priceCents != null ? `${s.qualifier ? `${s.qualifier} ` : ""}${storyMoney(s.priceCents)}${s.priceHighCents ? `–${storyMoney(s.priceHighCents)}` : ""}` : null;
    }
    const r = results[ref.program];
    if (!r) return null;
    if ("line" in ref) {
      const pr = p.programs[ref.program];
      const l = (ref.phase === "initial" ? pr.pricing.additionalInitial : pr.pricing.additionalRecurring).find((x) => x.label === ref.line && x.approved);
      return l ? storyMoney(l.amountCents) : null;
    }
    if (ref.part === "initial") return r.initial.finalCents > 0 ? storyMoney(r.initial.finalCents) : null;
    if (ref.part === "equipment") return r.equipment.lines.length && !r.equipment.unpriced.length ? storyMoney(r.equipment.totalCents) : null;
    if (!r.recurring) return null;
    const monthly = r.billing?.method === "fixed_monthly" ? r.billing.fixedMonthlyCents : null;
    return storyMoney(monthly ?? r.recurring.finalCents);
  };
  const a = p.property.address;
  return {
    hero: story.hero,
    blocks: story.blocks,
    price,
    customer: p.customer.name || p.property.name,
    site: story.hero.title || p.property.name || p.customer.name,
    address: [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" "),
    programTitle: p.title,
    dateLabel: formatDateLong(p.document.date),
    preparedBy: p.document.preparedBy,
    length: p.document.options.length ?? "full",
    coverImage,
    schedules: buildPdfModel(p, []).schedules,
  };
}

/** Condense a story for shorter lengths. Prices, scope cards, terms and the price strip are never dropped. */
/** A fitting step: text tightness level plus the indexes of optional blocks left out. */
export interface StoryPlan {
  level: number;
  drop: number[];
}

/** Least valuable optional blocks go first; essential (priority 1) blocks are never dropped. */
const DROP_ORDER: StoryBlock["kind"][] = ["sources", "note", "paragraph", "darkColumns", "steps", "checks", "stats", "bigNumber", "callout", "heading"];

/**
 * Fitting sequence for a page budget: full story, then optional blocks removed one at a
 * time (depth first, then supporting argument, least valuable first), then tighter text.
 * The first plan that fits is used, so pages stay as full as the budget allows.
 */
export function storyPlans(blocks: StoryBlock[], length: DocLength): StoryPlan[] {
  if (length === "full") return [{ level: 0, drop: [] }];
  const optional = (pri: number) =>
    blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.priority === pri && b.kind !== "label")
      .sort((a, b) => DROP_ORDER.indexOf(a.b.kind) - DROP_ORDER.indexOf(b.b.kind) || b.i - a.i)
      .map(({ i }) => i);
  const plans: StoryPlan[] = [{ level: 0, drop: [] }];
  const drop: number[] = [];
  for (const i of optional(3)) {
    drop.push(i);
    plans.push({ level: 0, drop: [...drop] });
  }
  plans.push({ level: 2, drop: [...drop] });
  if (length === "short") return plans;
  for (const i of optional(2)) {
    drop.push(i);
    plans.push({ level: 2, drop: [...drop] });
  }
  plans.push({ level: 3, drop: [...drop] }, { level: 4, drop: [...drop] });
  return plans;
}

/** Apply a plan; a label whose content block was dropped goes with it. */
export function applyPlan(blocks: StoryBlock[], plan: StoryPlan): StoryBlock[] {
  const gone = new Set(plan.drop);
  const kept = blocks.filter((_, i) => !gone.has(i));
  const out = kept.filter((b, i) => !(b.kind === "label" && (!kept[i + 1] || kept[i + 1].kind === "label" || kept[i + 1].kind === "heading")));
  return condenseStory(out, plan.level);
}

/** Tighten text for shorter lengths. Prices, scope cards, terms and the price summary are never dropped. */
export function condenseStory(blocks: StoryBlock[], level: number): StoryBlock[] {
  if (level <= 0) return blocks;
  const maxPriority = 3;
  const sent = level >= 3 ? 1 : 2;
  const out: StoryBlock[] = [];
  // Prices already shown on scope cards or charges, so a summary strip would only repeat them.
  const key = (r: unknown) => JSON.stringify(r);
  const shown = new Set(blocks.flatMap((b) => (b.kind === "scope" ? b.cards.map((c) => key(c.price)) : b.kind === "charge" ? [key(b.price)] : [])));
  for (const b of blocks) {
    if (b.priority > maxPriority) continue;
    if (level >= 3 && b.kind === "stats") continue; // device counts are already in the scope bullets
    if (level >= 3 && b.kind === "priceStrip" && b.items.every((i) => shown.has(key(i.price)))) continue;
    switch (b.kind) {
      case "paragraph":
        out.push(level >= 2 ? { ...b, text: firstSentences(b.text, sent) } : b);
        break;
      case "callout":
        out.push(level >= 2 ? { ...b, text: firstSentences(b.text, sent) } : b);
        break;
      case "heading":
        out.push(level >= 2 ? { ...b, lead: "" } : b);
        break;
      case "checks":
        out.push(level >= 2 ? { ...b, items: b.items.map((i) => ({ ...i, body: firstSentences(i.body, 1) })) } : b);
        break;
      case "scope":
        out.push(level >= 2 ? { ...b, cards: b.cards.map((c) => ({ ...c, bullets: c.bullets.slice(0, level >= 4 ? 2 : level >= 3 ? 3 : 4).map((x) => firstSentences(x, 1)) })) } : b);
        break;
      case "bigNumber":
        out.push(level >= 2 ? { ...b, text: firstSentences(b.text, sent) } : b);
        break;
      case "charge":
        out.push(level >= 3 ? { ...b, text: firstSentences(b.text, 1) } : b);
        break;
      default:
        out.push(b);
    }
  }
  return out;
}

/** Type scale per condense level (the last level tightens type slightly). */
export const STORY_SCALE = [1, 1, 0.97, 0.94, 0.9];
/** Extra tightening tried when it saves a nearly empty last page. */
export const STORY_SQUEEZE = [1, 0.96, 0.92];
