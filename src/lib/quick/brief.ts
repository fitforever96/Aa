import type { Address, AssumptionVersion, EquipmentItem, FrequencySpec, PropertyModel, Proposal, ServiceCategory, Settings, VerifiedCapability } from "../types";
import { normalizeNumberWords, parseIntake } from "../commands/parse";
import { dollarsToCents, formatMoney } from "../engine/money";
import { frequencyLabel } from "../engine/frequency";
import { SERVICE_LABELS } from "../engine/assumptions";
import { CONFIRMED_DEVICE_IDS } from "../engine/catalogIds";
import { allocationFromCatalog, kindForModel, newProposal, suggestZones } from "../factories";
import { STARTER_TEMPLATES, applyTemplate } from "../templates";
import { generateDocument } from "../writer/generate";
import { nowISO, uid } from "../ids";

/**
 * Quick Build: turn a few words (address, pest problem, price) into a complete draft.
 * Everything Anthony did not say is filled in as a labeled estimate or an online finding,
 * never presented as fact, and listed so he can check it before sending.
 */

export type Basis = "stated" | "found_online" | "estimate";

export interface QuickPlan {
  customerName: string | null;
  customerNameBasis: Basis | null;
  customerNameUrl: string | null;
  address: Address | null;
  propertyType: string;
  propertyTypeBasis: Basis;
  model: PropertyModel;
  squareFeet: number | null;
  squareFeetBasis: Basis | null;
  buildings: number;
  floors: number;
  apartments: number | null;
  /** Stated apartments per visit (multifamily rotation); otherwise planned from the unit count. */
  apartmentsPerVisit: number | null;
  services: ServiceCategory[];
  pestsBasis: Basis;
  activityAreas: string[];
  activityLevel: "low" | "moderate" | "high" | "severe";
  frequency: FrequencySpec;
  frequencyBasis: Basis;
  frequencyReason: string;
  tinCats: number;
  exteriorStations: number;
  equipmentBasis: Basis;
  equipmentReason: string;
  priceCents: number | null;
  priceBasis: "per_visit" | "per_month" | "one_time" | null;
  title: string;
  assumptions: string[];
  fieldVerification: string[];
  recommended: string[];
  research: { topic: string; summary: string; relevance: string; sources: { url: string; title: string }[] }[];
  mode: "ai" | "offline";
}

const STREET = "st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pkwy|parkway|hwy|highway|pl|place|cir|circle|ter|terrace|trl|trail|pike|sq|square|mile";

export function parseAddress(text: string): Address | null {
  const re = new RegExp(`\\b(\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?[A-Za-z0-9.'-]+(?:\\s+[A-Za-z0-9.'-]+){0,4}?\\s+(?:${STREET})\\b\\.?)(?:\\s*(?:,|\\s)\\s*(?:(?:suite|ste|unit|#)\\s*[\\w-]+)\\s*)?(?:,?\\s*([A-Za-z][A-Za-z .'-]{1,30}?))?(?:,?\\s*\\b(MI|Michigan|[A-Z]{2})\\b)?(?:,?\\s*(\\d{5}))?(?=[,.;]|\\s|$)`, "i");
  const m = text.match(re);
  if (!m) return null;
  // The pattern is case-insensitive, so a two-letter state must be written in capitals ("in" is not Indiana).
  const state = m[3] && (/^michigan$/i.test(m[3]) || m[3] === m[3].toUpperCase()) ? (/^michigan$/i.test(m[3]) ? "MI" : m[3]) : "";
  let city = (m[2] ?? "").trim();
  // A city must be followed by a state or ZIP; otherwise it is probably the start of the pest description.
  if (!state && !m[4]) city = "";
  return { line1: m[1].replace(/\s+/g, " ").trim(), city, state, zip: m[4] ?? "" };
}

export function parsePrice(text: string): { cents: number; basis: QuickPlan["priceBasis"] } | null {
  const t = normalizeNumberWords(text);
  const m = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:(?:\/|per|a|an|each)\s*(visit|service|month|mo\b|time))?/i) ?? t.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks)\s*(?:(?:\/|per|a|an|each)\s*(visit|service|month|mo\b|time))?/i);
  if (!m) return null;
  const cents = dollarsToCents(m[1]);
  if (cents == null || cents <= 0) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const basis = /month|mo/.test(unit) ? "per_month" : /one[\s-]*time|single/.test(t.toLowerCase()) ? "one_time" : "per_visit";
  return { cents, basis };
}

function parseCustomerName(text: string, address: Address | null): string | null {
  const intake = parseIntake(text);
  if (intake.propertyName) return intake.propertyName;
  if (!address) return null;
  const before = text.slice(0, text.indexOf(address.line1.split(" ")[0])).replace(/\b(at|located at|address|for|on)\s*$/i, "").replace(/[,:\-–]\s*$/, "").trim();
  if (!before || before.length > 60) return null;
  const words = before.split(/\s+/);
  const caps = words.filter((w) => /^[A-Z0-9&'.]/.test(w)).length;
  return caps >= Math.ceil(words.length * 0.6) && !/^(new|the|a|an)$/i.test(before) ? before : null;
}

/** Typical footprint when nothing is known about size (planning estimate only). */
const TYPICAL_SQFT: Record<PropertyModel, number | null> = {
  small_office: 4000,
  medium_commercial: 15000,
  large_industrial: 150000,
  multifamily: null,
  restaurant: 4000,
  warehouse: 100000,
  healthcare: 40000,
  government: 20000,
  campus: 100000,
  exterior_only: 10000,
  specialty: 5000,
};

const TYPE_LABEL: Record<PropertyModel, string> = {
  small_office: "Office",
  medium_commercial: "Commercial facility",
  large_industrial: "Industrial facility",
  multifamily: "Apartment community",
  restaurant: "Restaurant",
  warehouse: "Warehouse / distribution center",
  healthcare: "Healthcare facility",
  government: "Government facility",
  campus: "Campus",
  exterior_only: "Commercial property (exterior)",
  specialty: "Commercial facility",
};

export const isRodentProgram = (s: ServiceCategory[]) => s.some((x) => x === "rodent" || x === "exterior_baiting" || x === "interior_trapping");

/** Rules-of-thumb device layout. Labeled as an estimate; Anthony adjusts after the site walk. */
export function estimateDevices(model: PropertyModel, squareFeet: number | null, buildings: number, floors: number): { tinCats: number; exteriorStations: number; reason: string } {
  const sq = squareFeet ?? TYPICAL_SQFT[model] ?? 0;
  if (model === "multifamily")
    return {
      tinCats: Math.max(12, 3 * Math.max(1, floors) * Math.max(1, buildings)),
      exteriorStations: Math.max(8, (floors >= 6 ? 12 : 8) * Math.max(1, buildings)),
      reason: "Interior devices in common areas, utility rooms and trash rooms on each floor, plus a perimeter station layout per building; adjust after the site walk.",
    };
  const b = Math.max(1, buildings);
  const footprint = sq / b / Math.max(1, floors);
  const perimeter = 4 * Math.sqrt(footprint);
  const evenUp = (n: number) => n + (n % 2);
  const stations = model === "exterior_only" || model === "restaurant" ? Math.max(4, evenUp(Math.ceil(perimeter / 60))) : Math.max(4, evenUp(Math.ceil(perimeter / 75))) * b;
  let tin: number;
  if (model === "exterior_only") tin = 0;
  else if (model === "warehouse" || model === "large_industrial" || model === "campus") tin = Math.ceil(perimeter / 50) * b * Math.max(1, floors);
  else if (model === "restaurant") tin = Math.min(16, Math.max(6, Math.ceil(sq / 500)));
  else tin = Math.max(6, Math.ceil(sq / 1500));
  tin = Math.min(400, tin);
  const stationsCapped = Math.min(300, stations);
  const spacing = model === "restaurant" || model === "exterior_only" ? 60 : 75;
  return {
    tinCats: tin,
    exteriorStations: stationsCapped,
    reason: `Planning layout for about ${Math.round(sq).toLocaleString()} sq ft: exterior stations about every ${spacing} ft of perimeter${tin ? ", Tin Cats along interior walls, entries and activity areas" : ""}. Confirm on the site walk.`,
  };
}

export function defaultFrequency(model: PropertyModel, services: ServiceCategory[], activity: QuickPlan["activityLevel"]): { frequency: FrequencySpec; reason: string } {
  if (services.includes("bed_bug") || services.includes("bed_bug_heat") || services.includes("canine_bed_bug")) return { frequency: { kind: "one_time" }, reason: "Bed bug work is quoted as a treatment project." };
  if (services.includes("german_cockroach") && (activity === "high" || activity === "severe")) return { frequency: { kind: "biweekly" }, reason: "Active cockroach pressure needs follow-up every two weeks until activity is down." };
  if (isRodentProgram(services) && (activity === "high" || activity === "severe")) return { frequency: { kind: "weekly" }, reason: "Active rodent pressure needs weekly device checks until captures fall." };
  if (model === "restaurant" || model === "healthcare") return { frequency: { kind: "twice_monthly" }, reason: "Food-handling and sensitive environments are typically serviced twice monthly." };
  if ((model === "warehouse" || model === "large_industrial") && isRodentProgram(services)) return { frequency: { kind: "twice_monthly" }, reason: "Large dock-heavy facilities need device checks more often than monthly." };
  return { frequency: { kind: "monthly" }, reason: "Monthly service fits routine commercial prevention with this level of activity." };
}

function titleFor(model: PropertyModel, services: ServiceCategory[], customer: string | null): string {
  const main = services.length ? SERVICE_LABELS[services[0]].replace(/ (control|management|program|service)$/i, "") : "Pest";
  const site = model === "medium_commercial" || model === "specialty" ? "" : `${TYPE_LABEL[model].split(" /")[0]} `;
  return `${customer ? "" : site}${main} Management Program`.replace(/Management Management/, "Management").replace(/^\s+/, "");
}

/** Offline reading of the brief: deterministic, works with no connection or key. */
export function parseBrief(brief: string): QuickPlan {
  const text = brief.trim();
  const intake = parseIntake(text);
  const address = parseAddress(text);
  const price = parsePrice(text);
  const customerName = parseCustomerName(text, address);
  const model: PropertyModel = intake.model ?? "medium_commercial";
  const services: ServiceCategory[] = intake.services.length ? [...intake.services] : ["general_pest"];
  if ((model === "restaurant" || model === "healthcare" || model === "multifamily") && !services.includes("general_pest")) services.push("general_pest");
  const activity = intake.activityLevel ?? (intake.services.length ? "moderate" : "low");
  const sqftKnown = intake.squareFeet;
  const squareFeet = sqftKnown ?? TYPICAL_SQFT[model];
  const buildings = intake.buildings ?? 1;
  const floors = intake.floors ?? 1;
  const freq = intake.frequency ? { frequency: intake.frequency, reason: "As you stated." } : defaultFrequency(model, services, activity);
  const devices = isRodentProgram(services) ? estimateDevices(model, squareFeet, buildings, floors) : { tinCats: 0, exteriorStations: 0, reason: "No rodent devices: the stated issue does not call for them." };
  const tinCats = intake.tinCats ?? devices.tinCats;
  const stations = intake.exteriorStations ?? devices.exteriorStations;
  const statedDevices = intake.tinCats != null || intake.exteriorStations != null;
  const assumptions: string[] = [];
  if (!intake.model) assumptions.push(`Property type not stated; treated as a ${TYPE_LABEL[model].toLowerCase()}.`);
  if (!sqftKnown && squareFeet) assumptions.push(`Size not stated; planning assumes about ${squareFeet.toLocaleString()} sq ft.`);
  if (!intake.frequency) assumptions.push(`Frequency not stated; set to ${frequencyLabel(freq.frequency).toLowerCase()}. ${freq.reason}`);
  if (!statedDevices && (tinCats || stations)) assumptions.push(`Device counts estimated: ${tinCats} Tin Cats and ${stations} exterior bait stations.`);
  if (!intake.services.length) assumptions.push("No specific pest named; set up as general pest prevention.");
  return {
    customerName,
    customerNameBasis: customerName ? "stated" : null,
    customerNameUrl: null,
    address,
    propertyType: intake.propertyType ? intake.propertyType.replace(/^\w/, (c) => c.toUpperCase()) : TYPE_LABEL[model],
    propertyTypeBasis: intake.model ? "stated" : "estimate",
    model,
    squareFeet,
    squareFeetBasis: sqftKnown ? "stated" : squareFeet ? "estimate" : null,
    buildings,
    floors,
    apartments: intake.apartments,
    apartmentsPerVisit: intake.apartmentsPerVisit,
    services,
    pestsBasis: intake.services.length ? "stated" : "estimate",
    activityAreas: intake.activityAreas,
    activityLevel: activity === "severe" || activity === "high" || activity === "moderate" ? activity : "low",
    frequency: freq.frequency,
    frequencyBasis: intake.frequency ? "stated" : "estimate",
    frequencyReason: freq.reason,
    tinCats,
    exteriorStations: stations,
    equipmentBasis: statedDevices ? "stated" : "estimate",
    equipmentReason: statedDevices ? "As you stated." : devices.reason,
    priceCents: price?.cents ?? null,
    priceBasis: price?.basis ?? null,
    title: titleFor(model, services, customerName),
    assumptions,
    fieldVerification: [
      "Confirm the decision-maker's name, title, email and phone (not filled in automatically).",
      ...(statedDevices || !(tinCats || stations) ? [] : ["Walk the site and confirm device counts and placement."]),
      ...(sqftKnown ? [] : ["Confirm building size."]),
    ],
    recommended: [],
    research: [],
    mode: "offline",
  };
}

export interface BuildDeps {
  settings: Settings;
  version: AssumptionVersion;
  catalog: EquipmentItem[];
  capabilities: VerifiedCapability[];
}

/** Price handling: Anthony's stated price is locked exactly as given. No conversion, rounding or markup. */
export function priceDecision(plan: QuickPlan): { lockCents: number | null; note: string | null } {
  if (plan.priceCents == null) return { lockCents: null, note: "No price stated: the proposal shows the calculated price at your labor rate. Lock your own price in Pricing." };
  if (plan.priceBasis === "per_month" && plan.frequency.kind !== "monthly")
    return { lockCents: null, note: `You said ${formatMoney(plan.priceCents)} per month with ${frequencyLabel(plan.frequency).toLowerCase()} service. Per-visit price was left at the calculated amount so nothing is converted without you. Set it in Pricing.` };
  return { lockCents: plan.priceCents, note: null };
}

/** Builds a complete proposal (customer, property, scope, devices, frequency, price, document) from a plan. Pure. */
export function buildQuickProposal(plan: QuickPlan, deps: BuildDeps): { proposal: Proposal; priceNote: string | null; plan: QuickPlan } {
  const p = newProposal(deps.settings, deps.version);
  applyTemplate(p, STARTER_TEMPLATES[0], deps.catalog);
  p.templateUsed = "quick_build";
  p.title = plan.title;
  p.kind = kindForModel(plan.model);
  if (plan.customerName) {
    p.customer.name = plan.customerName;
    p.property.name = plan.customerName;
  }
  if (plan.address) p.property.address = { ...plan.address };
  p.property.model = plan.model;
  p.property.propertyType = plan.propertyType;
  p.property.squareFeet = plan.squareFeet;
  p.property.buildingCount = plan.buildings;
  p.property.floorCount = plan.floors;
  p.property.apartmentCount = plan.apartments;
  p.property.activityLevel = plan.activityLevel;
  if (plan.activityAreas.length) p.property.conditions["activity_areas"] = `Reported activity: ${plan.activityAreas.join(", ")}.`;

  const prog = p.programs[0];
  prog.services = [...new Set(plan.services)];
  prog.name = prog.services.length === 1 ? SERVICE_LABELS[prog.services[0]] : "Recurring service program";
  prog.frequency = plan.frequency;
  prog.chargeType = plan.frequency.kind === "one_time" ? "one_time" : "recurring";
  prog.billing.method = plan.frequency.kind === "one_time" ? "one_time" : "per_visit";
  if (plan.apartmentsPerVisit) prog.apartmentsPerVisit = plan.apartmentsPerVisit;
  else if (plan.model === "multifamily" && plan.apartments) prog.apartmentsPerVisit = Math.max(1, Math.min(plan.apartments, Math.ceil(plan.apartments / 12)));
  let unpricedDevices = false;
  const put = (id: string, qty: number) => {
    if (qty <= 0) return;
    const item = deps.catalog.find((c) => c.id === id);
    if (!item) return;
    const a = allocationFromCatalog(item, qty);
    // With no approved device price, devices are shown as included in service rather than as an unpriced charge.
    if (a.unitPriceCents == null) {
      a.billable = false;
      unpricedDevices = true;
    }
    prog.equipment.push(a);
  };
  put(CONFIRMED_DEVICE_IDS.tinCat, plan.tinCats);
  put(CONFIRMED_DEVICE_IDS.baitStation, plan.exteriorStations);
  prog.zones = suggestZones(p.property, prog.services);

  const price = priceDecision(plan);
  if (price.lockCents != null) {
    const ov = { cents: price.lockCents, locked: true, lockedAt: nowISO(), note: "Price stated by Anthony in Quick Build." };
    if (prog.chargeType === "one_time") prog.pricing.initialOverride = ov;
    else prog.pricing.recurringOverride = ov;
  }

  const verify = unpricedDevices ? [...plan.fieldVerification, "Devices are shown as included in the service price. If you charge for them separately, set the device price in Equipment."] : plan.fieldVerification;
  plan = { ...plan, fieldVerification: verify };
  p.recommendation = { confirmed: confirmedFacts(plan), assumptions: plan.assumptions, recommended: plan.recommended, fieldVerification: plan.fieldVerification, generatedBy: plan.mode === "ai" ? "ai" : "rules", createdAt: nowISO() };
  p.research = plan.research.filter((r) => r.sources.length).map((r) => ({ id: uid("res"), topic: r.topic, summary: r.summary, relevance: r.relevance, sources: r.sources.map((s) => ({ ...s, retrievedAt: nowISO() })), status: "accepted", createdAt: nowISO() }));
  p.internalNotes = quickNotes(plan, price.note);
  p.wizardStep = 7;
  p.document.sections = generateDocument(p, { settings: deps.settings, capabilities: deps.capabilities, includeGuarantee: deps.settings.guarantee.includeByDefault, includeReporting: false });
  return { proposal: p, priceNote: price.note, plan };
}

function confirmedFacts(plan: QuickPlan): string[] {
  const out: string[] = [];
  if (plan.address) out.push(`Address: ${[plan.address.line1, plan.address.city, plan.address.state, plan.address.zip].filter(Boolean).join(", ")}`);
  if (plan.customerNameBasis === "stated" && plan.customerName) out.push(`Customer: ${plan.customerName}`);
  if (plan.pestsBasis === "stated") out.push(`Issue: ${plan.services.map((s) => SERVICE_LABELS[s]).join(", ")}`);
  if (plan.priceCents != null) out.push(`Price: ${formatMoney(plan.priceCents)}${plan.priceBasis === "per_month" ? " per month" : plan.priceBasis === "one_time" ? " one time" : " per visit"}`);
  return out;
}

function quickNotes(plan: QuickPlan, priceNote: string | null): string {
  const lines = [`Built with Quick Build (${plan.mode === "ai" ? "Claude" : "offline rules"}). Items marked estimate or found online need your check before sending.`];
  if (plan.customerName && plan.customerNameBasis === "found_online") lines.push(`Customer name found online${plan.customerNameUrl ? ` (${plan.customerNameUrl})` : ""}: verify.`);
  if (priceNote) lines.push(priceNote);
  lines.push(`Frequency: ${plan.frequencyReason}`, `Equipment: ${plan.equipmentReason}`);
  return lines.join("\n");
}

export const BASIS_LABEL: Record<Basis, string> = { stated: "You said", found_online: "Found online", estimate: "Estimate" };

/** Rows for the "what I filled in" summary. */
export function planRows(plan: QuickPlan): { label: string; value: string; basis: Basis }[] {
  const rows: { label: string; value: string; basis: Basis }[] = [];
  if (plan.customerName && plan.customerNameBasis) rows.push({ label: "Customer", value: plan.customerName, basis: plan.customerNameBasis });
  if (plan.address) rows.push({ label: "Address", value: [plan.address.line1, plan.address.city, plan.address.state, plan.address.zip].filter(Boolean).join(", "), basis: "stated" });
  rows.push({ label: "Property", value: plan.propertyType, basis: plan.propertyTypeBasis });
  if (plan.squareFeet && plan.squareFeetBasis) rows.push({ label: "Size", value: `${plan.squareFeet.toLocaleString()} sq ft${plan.buildings > 1 ? ` · ${plan.buildings} buildings` : ""}`, basis: plan.squareFeetBasis });
  rows.push({ label: "Services", value: plan.services.map((s) => SERVICE_LABELS[s]).join(", "), basis: plan.pestsBasis });
  rows.push({ label: "Frequency", value: frequencyLabel(plan.frequency), basis: plan.frequencyBasis });
  if (plan.tinCats || plan.exteriorStations) rows.push({ label: "Devices", value: [plan.tinCats ? `${plan.tinCats} Tin Cats` : "", plan.exteriorStations ? `${plan.exteriorStations} exterior stations` : ""].filter(Boolean).join(" · "), basis: plan.equipmentBasis });
  return rows;
}


/** Shape of Claude's Quick Build plan (mirrors ai/tasks/draft DraftOut; kept here so this module stays SDK-free). */
export interface AIDraft {
  customerName: string | null;
  customerNameBasis: Basis | "none";
  customerNameUrl: string | null;
  address: Address | null;
  propertyType: string;
  propertyTypeBasis: Basis;
  model: PropertyModel;
  squareFeet: number | null;
  squareFeetBasis: Basis | "unknown";
  buildings: number;
  floors: number;
  apartments: number | null;
  services: ServiceCategory[];
  pestsBasis: Basis;
  activityAreas: string[];
  activityLevel: QuickPlan["activityLevel"];
  frequency: "one_time" | "weekly" | "biweekly" | "twice_monthly" | "monthly" | "bimonthly" | "quarterly";
  frequencyBasis: Basis;
  frequencyReason: string;
  rodentDevicesNeeded: boolean;
  tinCats: number | null;
  exteriorStations: number | null;
  equipmentBasis: Basis;
  equipmentReason: string;
  title: string;
  assumptions: string[];
  fieldVerification: string[];
  recommended: string[];
  research: { topic: string; summary: string; relevance: string; sourceUrls: string[] }[];
  sources: { url: string; title: string }[];
}

/**
 * Merge Claude's plan over the offline reading. What Anthony stated always wins
 * (price, address, frequency, device counts); Claude fills only the gaps.
 */
export function mergeDraft(local: QuickPlan, ai: AIDraft): QuickPlan {
  const titles = new Map(ai.sources.map((s) => [s.url, s.title]));
  const statedFreq = local.frequencyBasis === "stated";
  const statedDevices = local.equipmentBasis === "stated";
  const services = ai.services.length ? ai.services : local.services;
  const sqft = ai.squareFeetBasis === "unknown" ? local.squareFeet : ai.squareFeet;
  const sqftBasis: Basis | null = ai.squareFeetBasis === "unknown" ? local.squareFeetBasis : ai.squareFeetBasis;
  const model = ai.model;
  const rodent = ai.rodentDevicesNeeded || isRodentProgram(services);
  const fallback = estimateDevices(model, sqft, ai.buildings, ai.floors);
  const tinCats = statedDevices ? local.tinCats : rodent ? ai.tinCats ?? fallback.tinCats : 0;
  const stations = statedDevices ? local.exteriorStations : rodent ? ai.exteriorStations ?? fallback.exteriorStations : 0;
  const customerName = local.customerName ?? (ai.customerNameBasis === "none" ? null : ai.customerName);
  return {
    ...local,
    customerName,
    customerNameBasis: local.customerName ? "stated" : customerName ? (ai.customerNameBasis as Basis) : null,
    customerNameUrl: local.customerName ? null : ai.customerNameUrl,
    address: local.address ? { ...local.address, city: local.address.city || ai.address?.city || "", state: local.address.state || ai.address?.state || "", zip: local.address.zip || ai.address?.zip || "" } : ai.address,
    propertyType: ai.propertyType || local.propertyType,
    propertyTypeBasis: ai.propertyTypeBasis,
    model,
    squareFeet: sqft,
    squareFeetBasis: sqft ? sqftBasis : null,
    buildings: ai.buildings,
    floors: ai.floors,
    apartments: ai.apartments ?? local.apartments,
    services,
    pestsBasis: local.pestsBasis === "stated" ? "stated" : ai.pestsBasis,
    activityAreas: ai.activityAreas.length ? ai.activityAreas : local.activityAreas,
    activityLevel: ai.activityLevel,
    frequency: statedFreq ? local.frequency : { kind: ai.frequency },
    frequencyBasis: statedFreq ? "stated" : ai.frequencyBasis,
    frequencyReason: statedFreq ? local.frequencyReason : ai.frequencyReason,
    tinCats,
    exteriorStations: stations,
    equipmentBasis: statedDevices ? "stated" : ai.equipmentBasis,
    equipmentReason: statedDevices ? local.equipmentReason : ai.tinCats != null || ai.exteriorStations != null ? ai.equipmentReason : fallback.reason,
    title: ai.title || local.title,
    assumptions: ai.assumptions,
    fieldVerification: ai.fieldVerification.length ? ai.fieldVerification : local.fieldVerification,
    recommended: ai.recommended,
    research: ai.research.map((r) => ({ topic: r.topic, summary: r.summary, relevance: r.relevance, sources: r.sourceUrls.map((u) => ({ url: u, title: titles.get(u) ?? u })) })),
    mode: "ai",
  };
}
