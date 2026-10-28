import type { EquipmentAllocation, EquipmentItem, FrequencySpec, LineItem, PriceRef, Proposal, ProposalSection, ServiceProgram, Story, StoryBlock } from "../types";
import type { ComposeSpecT } from "../ai/tasks/compose";
import type { StoryOutput } from "../ai/tasks/story";
import type { BuildDeps } from "../quick/brief";
import { normalizeNumberWords } from "../commands/parse";
import { dollarsToCents, formatMoney } from "../engine/money";
import { frequencyLabel } from "../engine/frequency";
import { priceProposal } from "../engine/pricing";
import { SERVICE_LABELS } from "../engine/assumptions";
import { CONFIRMED_DEVICE_IDS } from "../engine/catalogIds";
import { allocationFromCatalog, kindForModel, newProgram, newProposal, suggestZones } from "../factories";
import { STARTER_TEMPLATES, applyTemplate } from "../templates";
import { generateDocument } from "../writer/generate";
import { frequencyRationale } from "../writer/rationale";
import { composeStory } from "../story/compose";
import { finalizeAIStory, priceKeys } from "../story/ai";
import { LENGTH_OPTIONS } from "../pdf/condense";
import { nowISO, uid } from "../ids";

/**
 * Turns the proposal engine's output into a real proposal, with the guardrails:
 * - an amount is used only if Anthony stated it in the conversation or it is already in the proposal;
 * - a monthly price is never silently converted to per-visit;
 * - terms, responsibilities, exclusions and the price summary come from approved wording;
 * - every core item is checked, and a missing frequency justification is added from the rules writer.
 */

// ───────────────────────── Stated amounts ─────────────────────────

/** Every dollar amount Anthony typed (e.g. "$350", "350 a visit", "three hundred fifty dollars"). */
export function statedAmounts(texts: string[]): Set<number> {
  const out = new Set<number>();
  for (const raw of texts) {
    const t = normalizeNumberWords(raw);
    const add = (s: string) => {
      const c = dollarsToCents(s.replace(/,/g, ""));
      if (c != null && c > 0) out.add(c);
    };
    for (const m of t.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/gi)) add(m[2] ? String(Number(m[1].replace(/,/g, "")) * 1000) : m[1]);
    for (const m of t.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b/gi)) add(m[1]);
    for (const m of t.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:\/|per|a|an|each)\s*(?:visit|service|month|treatment|week|time)\b/gi)) add(m[1]);
  }
  return out;
}

/** Amounts already in the proposal (prices Anthony set earlier, by chat or in the editor). */
export function proposalAmounts(p: Proposal): Set<number> {
  const out = new Set<number>();
  for (const pr of p.programs) {
    if (pr.pricing.recurringOverride) out.add(pr.pricing.recurringOverride.cents);
    if (pr.pricing.initialOverride) out.add(pr.pricing.initialOverride.cents);
    for (const l of [...pr.pricing.additionalInitial, ...pr.pricing.additionalRecurring]) out.add(l.amountCents);
  }
  for (const s of p.specialtyItems) if (s.priceCents != null) out.add(s.priceCents);
  return out;
}

// ───────────────────────── Proposal → engine state ─────────────────────────

const FREQ_KINDS = ["one_time", "weekly", "biweekly", "twice_monthly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "five_day_weekly", "custom"] as const;

/** The current proposal as the engine sees it (revisions edit this). */
export type EngineState = Omit<ComposeSpecT, "reply" | "assumptions" | "questions">;

export function toEngineState(p: Proposal, sections: ProposalSection[]): EngineState {
  const keys = priceKeys(p);
  const keyOf = (ref: PriceRef | null) => (ref ? keys.find((k) => JSON.stringify(k.ref) === JSON.stringify(ref))?.key ?? "" : "");
  const charges = p.programs[0] ? [...p.programs[0].pricing.additionalInitial.map((l) => ({ l, phase: "initial" as const })), ...p.programs[0].pricing.additionalRecurring.map((l) => ({ l, phase: "recurring" as const }))] : [];
  const chargeKey = (ref: PriceRef | null) => {
    if (!ref || !("line" in ref) || ref.program !== 0) return keyOf(ref);
    const k = charges.findIndex((c) => c.l.label === ref.line && c.phase === ref.phase);
    return k >= 0 ? `charge_${k}` : keyOf(ref);
  };
  const story = p.story ?? composeStory(p, sections);
  const blocks = story.blocks
    .filter((b) => !["twoLists", "priceStrip", "schedules", "sources"].includes(b.kind))
    .map((b) => (b.kind === "scope" ? { ...b, cards: b.cards.map(({ price, ...c }) => ({ ...c, priceKey: chargeKey(price) })) } : b.kind === "charge" ? (({ price, ...rest }) => ({ ...rest, priceKey: chargeKey(price) }))(b) : b));
  return {
    customer: { name: p.customer.name || null, contactName: p.customer.contactName || null, contactTitle: p.customer.contactTitle || null },
    site: {
      name: p.property.name || null,
      address: p.property.address.line1 ? p.property.address : null,
      propertyType: p.property.propertyType || null,
      model: p.property.model,
      squareFeet: p.property.squareFeet,
      buildings: p.property.buildingCount,
      floors: p.property.floorCount,
      apartments: p.property.apartmentCount,
      activityLevel: p.property.activityLevel,
      findings: Object.values(p.property.conditions).filter((v): v is string => typeof v === "string" && !!v.trim()),
    },
    programs: p.programs.map((pr) => ({
      name: pr.name,
      services: pr.services,
      frequency: (FREQ_KINDS as readonly string[]).includes(pr.frequency.kind) ? pr.frequency.kind : "custom",
      customVisitsPerYear: pr.frequency.customVisitsPerYear ?? null,
      customLabel: pr.frequency.customLabel ?? null,
      apartmentsPerVisit: pr.apartmentsPerVisit,
      technicians: pr.technicians,
      devices: pr.equipment.filter((e) => e.quantity > 0).map((e) => ({ kind: e.catalogItemId === CONFIRMED_DEVICE_IDS.tinCat ? "tin_cat" : e.catalogItemId === CONFIRMED_DEVICE_IDS.baitStation ? "exterior_bait_station" : "other", name: e.name, quantity: e.quantity, location: e.location })),
      initialPrice: pr.pricing.initialOverride ? pr.pricing.initialOverride.cents / 100 : null,
      recurringPrice: pr.pricing.recurringOverride ? pr.pricing.recurringOverride.cents / 100 : null,
      recurringBasis: "per_visit",
    })),
    charges: charges.map((c) => ({ label: c.l.label, description: c.l.description, amount: c.l.amountCents / 100, phase: c.phase })),
    document: { title: p.title, length: p.document.options.length ?? "full", includeGuarantee: p.document.sections.some((s) => s.type === "triple_guarantee" && s.enabled) },
    story: { hero: story.hero, blocks: blocks as EngineState["story"]["blocks"] },
  } as EngineState;
}

// ───────────────────────── Engine state → proposal ─────────────────────────

function frequencyFrom(sp: ComposeSpecT["programs"][number]): FrequencySpec {
  if (sp.frequency === "custom") return { kind: "custom", customVisitsPerYear: sp.customVisitsPerYear ?? 12, customLabel: sp.customLabel ?? `${sp.customVisitsPerYear ?? 12} visits per year` };
  return { kind: sp.frequency };
}

function deviceFrom(d: ComposeSpecT["programs"][number]["devices"][number], catalog: EquipmentItem[], existing: EquipmentAllocation[]): EquipmentAllocation | null {
  if (d.quantity <= 0) return null;
  const id = d.kind === "tin_cat" ? CONFIRMED_DEVICE_IDS.tinCat : d.kind === "exterior_bait_station" ? CONFIRMED_DEVICE_IDS.baitStation : null;
  const lower = d.name.toLowerCase();
  const item = id ? catalog.find((c) => c.id === id) : catalog.find((c) => lower.includes(c.name.toLowerCase().split(" (")[0]) || c.name.toLowerCase().includes(lower));
  const prev = existing.find((e) => (item ? e.catalogItemId === item.id : e.name.toLowerCase() === lower));
  if (prev) return { ...prev, quantity: d.quantity, location: item ? prev.location : d.location };
  if (item) return { ...allocationFromCatalog(item, d.quantity), location: d.location };
  return { id: uid("eqa"), catalogItemId: null, name: d.name, category: "Other", quantity: d.quantity, reserveQuantity: 0, location: d.location, serviceMinutesEach: 1, serviceTimeSource: "estimate", installMinutesEach: 2, installTimeSource: "estimate", servicedFraction: 1, billable: false, unitPriceCents: null, priceSource: "not_set" };
}

export interface ApplyResult {
  proposal: Proposal;
  changes: string[];
  dropped: string[];
}

/** Apply the engine's complete state to a new or existing proposal. Pure. */
export function applySpec(spec: ComposeSpecT, base: Proposal | null, deps: BuildDeps, allowed: Set<number>): ApplyResult {
  const p: Proposal = base ? structuredClone(base) : newProposal(deps.settings, deps.version);
  if (!base) {
    applyTemplate(p, STARTER_TEMPLATES[0], deps.catalog);
    p.templateUsed = "proposal_engine";
    p.document.options.length = deps.settings.defaults.docLength ?? "two_page";
  }
  const dropped: string[] = [];
  const ok = (dollars: number | null, what: string): number | null => {
    if (dollars == null) return null;
    const cents = Math.round(dollars * 100);
    if (allowed.has(cents)) return cents;
    dropped.push(`${what}: ${formatMoney(cents)} was not in your messages, so the calculated price is used instead.`);
    return null;
  };

  // Customer and site (contact details only as given).
  if (spec.customer.name) p.customer.name = spec.customer.name;
  if (spec.customer.contactName) p.customer.contactName = spec.customer.contactName;
  if (spec.customer.contactTitle) p.customer.contactTitle = spec.customer.contactTitle;
  const s = spec.site;
  if (s.name) p.property.name = s.name;
  else if (!p.property.name && spec.customer.name) p.property.name = spec.customer.name;
  if (s.address) p.property.address = { ...p.property.address, ...s.address };
  if (s.propertyType) p.property.propertyType = s.propertyType;
  if (s.model) {
    p.property.model = s.model;
    p.kind = kindForModel(s.model);
  }
  if (s.squareFeet != null) p.property.squareFeet = s.squareFeet;
  if (s.buildings != null) p.property.buildingCount = s.buildings;
  if (s.floors != null) p.property.floorCount = s.floors;
  if (s.apartments != null) p.property.apartmentCount = s.apartments;
  if (s.activityLevel) p.property.activityLevel = s.activityLevel;
  if (s.findings.length) {
    for (const k of Object.keys(p.property.conditions)) if (k.startsWith("finding_")) delete p.property.conditions[k];
    s.findings.forEach((f, i) => (p.property.conditions[`finding_${i + 1}`] = f));
  }

  // Programs.
  const servicesBefore = JSON.stringify(p.programs.map((x) => x.services));
  p.programs = spec.programs.map((sp, i) => {
    const prev: ServiceProgram | undefined = base?.programs[i];
    const pr: ServiceProgram = prev ? structuredClone(prev) : newProgram(sp.services, frequencyFrom(sp), sp.technicians ?? deps.settings.defaults.technicians);
    pr.name = sp.name || (sp.services.length === 1 ? SERVICE_LABELS[sp.services[0]] : "Recurring service program");
    pr.services = [...new Set(sp.services)];
    pr.frequency = frequencyFrom(sp);
    pr.chargeType = sp.frequency === "one_time" ? "one_time" : "recurring";
    // A monthly price Anthony stated for monthly service is billed per month (identical amount, his wording).
    const monthly = sp.recurringBasis === "per_month" && sp.frequency === "monthly" && sp.recurringPrice != null;
    if (monthly) pr.billing = { ...pr.billing, method: "fixed_monthly", fixedMonthlyApproved: true };
    else if (pr.billing.method !== "fixed_monthly" || sp.frequency !== "monthly") pr.billing = { ...pr.billing, method: sp.frequency === "one_time" ? "one_time" : "per_visit" };
    if (sp.technicians) pr.technicians = sp.technicians;
    pr.apartmentsPerVisit = sp.apartmentsPerVisit ?? pr.apartmentsPerVisit;
    pr.equipment = sp.devices.map((d) => deviceFrom(d, deps.catalog, prev?.equipment ?? [])).filter((x): x is EquipmentAllocation => !!x);
    if (!prev) pr.zones = suggestZones(p.property, pr.services);
    // Prices: only stated amounts, locked exactly.
    const recurring = sp.recurringBasis === "per_month" && sp.frequency !== "monthly" && sp.recurringPrice != null ? (dropped.push(`${pr.name}: a monthly price was given for ${frequencyLabel(pr.frequency).toLowerCase()} service. Per-visit pricing was left calculated so nothing is converted without you; tell me the per-visit price.`), null) : ok(sp.recurringPrice, `${pr.name} recurring`);
    const initial = ok(sp.initialPrice, `${pr.name} initial`);
    const lock = (cents: number | null, prevOv: ServiceProgram["pricing"]["recurringOverride"]) => (cents == null ? null : prevOv && prevOv.cents === cents ? prevOv : { cents, locked: true, lockedAt: nowISO(), note: "Set from the proposal conversation." });
    if (pr.chargeType === "one_time") {
      pr.pricing.initialOverride = lock(initial ?? recurring, prev?.pricing.initialOverride ?? null);
      pr.pricing.recurringOverride = null;
    } else {
      pr.pricing.recurringOverride = lock(recurring, prev?.pricing.recurringOverride ?? null);
      // Add-on services have no separate initial charge unless one was stated (never a surprise calculated one).
      pr.pricing.initialOverride = initial == null && i > 0 ? { cents: 0, locked: true, lockedAt: nowISO(), note: "No separate initial charge." } : lock(initial, prev?.pricing.initialOverride ?? null);
    }
    return pr;
  });

  // Separately priced charges live on the first program.
  const line = (c: ComposeSpecT["charges"][number]): LineItem | null => {
    const cents = ok(c.amount, c.label);
    return cents == null ? null : { id: uid("li"), label: c.label, description: c.description, amountCents: cents, approved: true };
  };
  const p0 = p.programs[0];
  p0.pricing.additionalInitial = spec.charges.filter((c) => c.phase === "initial").map(line).filter((x): x is LineItem => !!x);
  p0.pricing.additionalRecurring = spec.charges.filter((c) => c.phase === "recurring").map(line).filter((x): x is LineItem => !!x);
  for (const pr of p.programs.slice(1)) {
    pr.pricing.additionalInitial = [];
    pr.pricing.additionalRecurring = [];
  }

  // Document.
  if (spec.document.title) p.title = spec.document.title;
  if (spec.document.length) p.document.options.length = spec.document.length;
  p.document.options.layout = "story";
  const wantGuarantee = spec.document.includeGuarantee ?? (base ? base.document.sections.some((x) => x.type === "triple_guarantee" && x.enabled) : deps.settings.guarantee.includeByDefault);
  const servicesChanged = servicesBefore !== JSON.stringify(p.programs.map((x) => x.services));
  if (!base || servicesChanged || !p.document.sections.length || wantGuarantee !== p.document.sections.some((x) => x.type === "triple_guarantee" && x.enabled))
    p.document.sections = generateDocument(p, { settings: deps.settings, capabilities: deps.capabilities, includeGuarantee: wantGuarantee, includeReporting: false });

  // Story: map charge_k keys to the lines they became, then finalize with approved wording.
  const charges = [...p0.pricing.additionalInitial.map((l, j) => ({ l, key: `p0_add_initial_${j}` })), ...p0.pricing.additionalRecurring.map((l, j) => ({ l, key: `p0_add_recurring_${j}` }))];
  const chargeKeys = new Map<string, string>();
  spec.charges.forEach((c, k) => {
    const hit = charges.find((x) => x.l.label === c.label);
    if (hit) chargeKeys.set(`charge_${k}`, hit.key);
  });
  const out: StoryOutput = {
    hero: spec.story.hero,
    blocks: spec.story.blocks.map((b) =>
      b.kind === "scope" ? { ...b, cards: b.cards.map((c) => ({ ...c, priceKey: chargeKeys.get(c.priceKey) ?? c.priceKey })) } : b.kind === "charge" ? { ...b, priceKey: chargeKeys.get(b.priceKey) ?? b.priceKey } : b,
    ),
  };
  const sections = p.document.sections.filter((x) => x.enabled);
  p.story = ensureFrequencyWhy(finalizeAIStory(out, p, sections, allowed), p);
  p.updatedAt = nowISO();
  return { proposal: p, changes: base ? diff(base, p) : [], dropped };
}

/** Everyday ways a frequency is written ("twice a year" for semiannual, and so on). */
const FREQ_WORDS: Partial<Record<FrequencySpec["kind"], string[]>> = {
  weekly: ["weekly", "every week", "each week"],
  biweekly: ["every two weeks", "every other week", "biweekly", "bi-weekly"],
  twice_monthly: ["twice monthly", "twice a month", "twice per month"],
  monthly: ["monthly", "every month", "each month"],
  bimonthly: ["every other month", "every two months", "bimonthly", "bi-monthly"],
  quarterly: ["quarterly", "every three months", "four times a year"],
  semiannual: ["semiannual", "semi-annual", "twice a year", "twice per year", "twice-yearly", "twice yearly", "every six months"],
  annual: ["annual", "once a year", "yearly", "every year"],
  five_day_weekly: ["five days a week", "five days per week"],
};
const WHY = /\bwhy\b|\bbecause\b|\brequire|\bneeded\b|\bnecessary\b|\bkeeps?\b|\bfits?\b|\bdue to\b/;

/** Make sure the story explains why each recurring frequency fits; add the rules rationale if not. */
export function ensureFrequencyWhy(story: Story, p: Proposal): Story {
  const texts = story.blocks.filter((b) => b.kind === "callout" || b.kind === "paragraph" || b.kind === "heading" || b.kind === "bigNumber" || b.kind === "checks" || b.kind === "darkColumns").map((b) => JSON.stringify(b).toLowerCase());
  const words = (pr: ServiceProgram) => [frequencyLabel(pr.frequency).toLowerCase(), ...(FREQ_WORDS[pr.frequency.kind] ?? [])];
  // Explained = a block names this cadence (or this program) and gives a reason.
  const explained = (pr: ServiceProgram) => texts.some((t) => WHY.test(t) && (words(pr).some((w) => t.includes(w)) || (p.programs.length > 1 && t.includes(pr.name.toLowerCase()))));
  const missing = p.programs.filter((pr) => pr.chargeType === "recurring" && !explained(pr));
  if (!missing.length) return story;
  const add: StoryBlock[] = missing.map((pr) => ({ kind: "callout", priority: 1, title: p.programs.length > 1 ? `Why ${pr.name} is ${frequencyLabel(pr.frequency).toLowerCase()}` : `Why ${frequencyLabel(pr.frequency).toLowerCase()} service`, text: frequencyRationale(p.property, pr), emphasis: "" }));
  // Next to the existing frequency reasoning when there is some; otherwise before the scope.
  const lastCallout = story.blocks.map((b) => b.kind).lastIndexOf("callout");
  const scope = story.blocks.findIndex((b) => b.kind === "heading" || b.kind === "scope");
  const at = lastCallout >= 0 ? lastCallout + 1 : scope >= 0 ? scope : Math.max(0, story.blocks.findIndex((b) => b.kind === "paragraph") + 1);
  return { ...story, blocks: [...story.blocks.slice(0, at), ...add, ...story.blocks.slice(at)] };
}

// ───────────────────────── Change summary ─────────────────────────

function priceLines(p: Proposal): Map<string, string> {
  const m = new Map<string, string>();
  priceProposal(p).forEach((r, i) => {
    const n = p.programs[i].name;
    if (r.recurring) m.set(`${n} · recurring price`, formatMoney(r.recurring.finalCents));
    if (r.initial.finalCents > 0) m.set(`${n} · initial`, formatMoney(r.initial.finalCents));
  });
  for (const l of p.programs[0]?.pricing.additionalInitial ?? []) m.set(l.label, formatMoney(l.amountCents));
  for (const l of p.programs[0]?.pricing.additionalRecurring ?? []) m.set(`${l.label} / visit`, formatMoney(l.amountCents));
  return m;
}

export function diff(a: Proposal, b: Proposal): string[] {
  const out: string[] = [];
  const ch = (label: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${label}: ${x || "—"} → ${y || "—"}`);
  };
  ch("Customer", a.customer.name, b.customer.name);
  ch("Address", a.property.address.line1, b.property.address.line1);
  ch("Programs", a.programs.map((x) => x.name).join(", "), b.programs.map((x) => x.name).join(", "));
  b.programs.forEach((pr, i) => {
    const prev = a.programs[i];
    if (prev) ch(`${pr.name} frequency`, frequencyLabel(prev.frequency), frequencyLabel(pr.frequency));
    const devs = (x?: ServiceProgram) => (x ? x.equipment.filter((e) => e.quantity > 0).map((e) => `${e.quantity} ${e.name}`).join(", ") : "");
    if (prev) ch(`${pr.name} devices`, devs(prev), devs(pr));
  });
  const pa = priceLines(a);
  const pb = priceLines(b);
  for (const k of new Set([...pa.keys(), ...pb.keys()])) ch(k, pa.get(k), pb.get(k));
  const len = (x: Proposal) => LENGTH_OPTIONS.find((o) => o.value === (x.document.options.length ?? "full"))?.label;
  ch("Length", len(a), len(b));
  if (JSON.stringify(a.story?.blocks) !== JSON.stringify(b.story?.blocks)) out.push("Proposal text updated");
  return out;
}

// ───────────────────────── Core information check ─────────────────────────

export interface CoreItem {
  item: string;
  ok: boolean;
  note?: string;
}

export function coreCheck(p: Proposal): CoreItem[] {
  const story = p.story ?? composeStory(p, p.document.sections.filter((s) => s.enabled));
  const has = (k: StoryBlock["kind"]) => story.blocks.some((b) => b.kind === k);
  const refs = new Set(story.blocks.flatMap((b) => (b.kind === "scope" ? b.cards.map((c) => JSON.stringify(c.price)) : b.kind === "charge" ? [JSON.stringify(b.price)] : b.kind === "priceStrip" ? b.items.map((i) => JSON.stringify(i.price)) : [])));
  const keys = priceKeys(p);
  const missingPrices = keys.filter((k) => !refs.has(JSON.stringify(k.ref)));
  const rodent = p.programs.some((x) => x.services.some((s) => s === "rodent" || s === "exterior_baiting" || s === "interior_trapping"));
  const devices = p.programs.reduce((a, x) => a + x.equipment.reduce((s, e) => s + e.quantity, 0), 0);
  const lists = story.blocks.find((b) => b.kind === "twoLists");
  const priced = priceProposal(p);
  return [
    { item: "Customer and site", ok: !!(p.customer.name || p.property.name), note: p.customer.name || p.property.name ? undefined : "No customer or site name yet." },
    { item: "Site address", ok: !!p.property.address.line1, note: p.property.address.line1 ? undefined : "No address yet." },
    { item: "Condition / problem", ok: has("paragraph") || has("callout") },
    { item: "Scope of service", ok: has("scope") },
    { item: "Frequency and why it fits", ok: p.programs.every((x) => x.chargeType === "one_time" || !!x.frequency.kind) && has("callout") },
    { item: "Devices", ok: !rodent || devices > 0, note: rodent && !devices ? "Rodent program without devices." : undefined },
    { item: "Every price shown", ok: !missingPrices.length, note: missingPrices.length ? `Not shown: ${missingPrices.map((k) => k.label).join("; ")}` : undefined },
    { item: "Billing basis", ok: priced.every((r, i) => p.programs[i].chargeType === "one_time" || !!r.recurring), note: priced.some((r, i) => p.programs[i].chargeType !== "one_time" && !r.recurring) ? "A recurring program has no recurring price." : undefined },
    { item: "Customer responsibilities", ok: !!lists && lists.kind === "twoLists" && lists.left.items.length > 0 },
    { item: "Exclusions", ok: !!lists && lists.kind === "twoLists" && lists.right.items.length > 0 },
    { item: "Price summary", ok: has("priceStrip") },
    { item: "Next step", ok: story.blocks.at(-1)?.kind === "paragraph" || story.blocks.some((b) => b.kind === "paragraph" && /next step/i.test(b.text)) },
    { item: "Prepared by", ok: p.document.preparedBy.length > 0 },
  ];
}
