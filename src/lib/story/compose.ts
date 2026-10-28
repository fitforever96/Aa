import type { Proposal, ProposalSection, ServiceCategory, Story, StoryBlock } from "../types";
import { MODEL_CONTEXT, SERVICE_COPY } from "../writer/library";
import { frequencyLabel } from "../engine/frequency";
import { SERVICE_LABELS } from "../engine/assumptions";
import { frequencyRationale, rotationCheck } from "../writer/rationale";
import { priceProposal } from "../engine/pricing";
import { firstSentences, sentences } from "../pdf/condense";

/**
 * Rules-based story: turns proposal data and its (editable) sections into the
 * argument-driven portrait layout: situation, why it needs this response, plan at a
 * glance, scope with prices, responsibilities and terms, price summary. Works offline.
 * Prose never carries amounts; prices are PriceRefs resolved from the pricing engine.
 */


const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());
const bulletLines = (body: string) => body.split("\n").filter((l) => /^\s*[-•]\s/.test(l)).map((l) => l.replace(/^\s*[-•]\s+/, "").trim());
const prose = (body: string) => body.split(/\n{2,}/).filter((b) => !b.split("\n").every((l) => /^\s*[-•]\s/.test(l))).map((b) => b.replace(/\n/g, " ").trim()).filter(Boolean);

/** Device names keep brand casing ("Tin Cat"); generic words are lowercased. */
const plural = (name: string, n: number) => {
  const words = name.split(" ").map((w) => (/^[A-Z][a-z]+$/.test(w) && !/^(Tin|Cat|Orkin|InSite)$/.test(w) ? w.toLowerCase() : w)).join(" ");
  return n === 1 || /s$/.test(words) ? words : `${words}s`;
};

const RODENT: ServiceCategory[] = ["rodent", "exterior_baiting", "interior_trapping", "sewer_baiting", "burrow"];

function pestNoun(svc: ServiceCategory[]): string {
  if (svc.some((s) => RODENT.includes(s))) return "rodent";
  if (svc.includes("german_cockroach") || svc.includes("american_cockroach")) return "cockroach";
  if (svc.some((s) => s.startsWith("bed_bug") || s === "canine_bed_bug")) return "bed bug";
  if (svc.includes("fly") || svc.includes("drain")) return "fly";
  if (svc.includes("ant")) return "ant";
  return "pest";
}

const ACTIVITY_WORD: Record<string, string> = { none: "PREVENTIVE", low: "LOW", moderate: "ACTIVE", high: "HIGH", severe: "SEVERE" };

export function composeStory(p: Proposal, sections: ProposalSection[]): Story {
  const sec = (t: ProposalSection["type"]) => sections.find((s) => s.type === t && s.enabled);
  const prog = p.programs[0];
  const svc = [...new Set(p.programs.flatMap((x) => x.services))];
  const pest = pestNoun(svc);
  const site = p.property.name || p.customer.name || "the property";
  const env = MODEL_CONTEXT[p.property.model];
  const priced = priceProposal(p);
  const freq = prog ? frequencyLabel(prog.frequency) : "Scheduled";
  const devices = p.programs.flatMap((x) => x.equipment.filter((e) => e.quantity > 0));
  const interior = devices.filter((e) => e.location === "interior").reduce((a, e) => a + e.quantity, 0);
  const exterior = devices.filter((e) => e.location === "exterior").reduce((a, e) => a + e.quantity, 0);
  const rot = prog ? rotationCheck(p.property, prog) : null;

  // ── Hero ──
  const stats: { value: string; label: string }[] = [];
  if (p.property.apartmentCount) stats.push({ value: p.property.apartmentCount.toLocaleString(), label: "Apartments" });
  else if (p.property.squareFeet) stats.push({ value: p.property.squareFeet.toLocaleString(), label: "Square feet" });
  if (p.property.floorCount > 1) stats.push({ value: String(p.property.floorCount), label: "Stories" });
  else if (p.property.buildingCount > 1) stats.push({ value: String(p.property.buildingCount), label: "Buildings" });
  else if (interior + exterior) stats.push({ value: String(interior + exterior), label: "Control devices" });
  stats.push({ value: ACTIVITY_WORD[p.property.activityLevel] ?? "ACTIVE", label: "Reported activity" });
  stats.push({ value: freq.toUpperCase(), label: "Service frequency" });

  const methods: string[] = [];
  if (interior) methods.push("Interior trapping");
  if (exterior) methods.push("Exterior bait stations");
  if (rot) methods.push("Standardized apartment rotation");
  svc.filter((s) => !RODENT.includes(s)).slice(0, 2).forEach((s) => methods.push(SERVICE_LABELS[s]));
  if (svc.some((s) => RODENT.includes(s))) methods.push("Exclusion");
  methods.push("Documented monitoring");

  const hero = {
    eyebrow: `Commercial ${pest === "pest" ? "pest" : pest} control`.toUpperCase(),
    title: site,
    subtitle: p.title,
    tagline: methods.slice(0, 4).join("  |  "),
    stats: stats.slice(0, 4),
  };

  const blocks: StoryBlock[] = [];
  const push = (b: StoryBlock) => blocks.push(b);

  // ── Situation ──
  const exec = sec("executive_overview");
  const assess = sec("property_assessment");
  const situation = [assess ? prose(assess.body)[0] : "", exec ? prose(exec.body)[0] : ""].filter(Boolean);
  const reported = String(p.property.conditions["activity_areas"] ?? "").trim();
  push({ kind: "label", text: "Assessment summary", priority: 1 });
  push({ kind: "paragraph", text: [situation[0] ?? `Orkin proposes a ${pest} program for ${site}.`, reported].filter(Boolean).join(" "), priority: 1 });

  // ── Why this response ──
  if (prog) {
    const why = frequencyRationale(p.property, prog);
    const ss = sentences(why);
    push({
      kind: "callout",
      title: prog.frequency.kind === "one_time" ? "Why a defined treatment plan" : `Why ${freq.toLowerCase()} service`,
      text: ss.slice(0, -1).join(" ") || why,
      emphasis: ss.length > 1 ? ss[ss.length - 1] : "",
      priority: 2,
    });
  }

  // ── Objectives ──
  const objSec = sec("program_objectives");
  const objectives = (objSec?.items.length ? objSec.items : svc.slice(0, 3).map((s) => ({ title: SERVICE_COPY[s].coverageTitle, body: SERVICE_COPY[s].objective }))).slice(0, 4);
  if (objectives.length < 4) objectives.push({ title: "Maintain a consistent record", body: "Document inspections, device activity, findings and corrective needs every visit so decisions rest on evidence." });
  push({ kind: "checks", title: "Program objectives", items: objectives.slice(0, 4), priority: 2 });

  // ── Risk context ──
  if (env.risks.length >= 3) push({ kind: "darkColumns", title: `Why ${pest} pressure persists in a ${env.environment}`, columns: env.risks.slice(0, 3), priority: 3 });

  // ── Plan at a glance ──
  const glance: { value: string; label: string }[] = [];
  if (interior) glance.push({ value: String(interior), label: "Interior devices" });
  if (exterior) glance.push({ value: String(exterior), label: "Exterior bait stations" });
  if (prog?.apartmentsPerVisit) glance.push({ value: String(prog.apartmentsPerVisit), label: "Apartments / visit" });
  if (prog) glance.push({ value: freq.toUpperCase(), label: "Service frequency" });
  if (glance.length >= 2) push({ kind: "stats", title: "Control plan at a glance", stats: glance.slice(0, 4), priority: 1 });

  // ── Scope ──
  push({ kind: "heading", title: "Scope of service", accent: "", lead: `What Orkin will do at ${site}, and what each charge covers.`, priority: 1 });
  p.programs.forEach((pr, i) => {
    const r = priced[i];
    const meth = sec("service_methodology");
    const recurringBullets = [
      ...(meth?.items.length ? meth.items.map((it) => `${it.title}${it.body ? `: ${firstSentences(it.body, 1)}` : ""}`) : sentences(SERVICE_COPY[pr.services[0] ?? "general_pest"].methodology).filter((x) => x.length > 60).slice(0, 2)),
      ...pr.equipment.filter((e) => e.quantity > 0).map((e) => `Inspect and service ${e.quantity} ${plural(e.name, e.quantity)}; remove captures and record activity.`),
      "Document findings, device activity and corrective needs after every visit.",
    ];
    if (rot) recurringBullets.unshift(`Service up to ${rot.aptsPerVisit} apartments per visit in a standardized rotation, prioritizing active units as conditions require.`);
    const installs = pr.equipment.filter((e) => e.quantity > 0);
    const initialBullets = [
      ...installs.map((e) => `Install ${e.quantity} ${plural(e.name, e.quantity)} at locations selected from inspection findings.`),
      "Inspect accessible high-risk areas and establish the starting device map and activity baseline.",
      ...(installs.length && !installs.some((e) => e.billable && e.unitPriceCents != null) ? ["Equipment and setup are included in the initial service price."] : []),
    ];
    const cards: Extract<StoryBlock, { kind: "scope" }>["cards"] = [];
    if (r.initial.finalCents > 0) cards.push({ eyebrow: "First service", title: "Initial setup", price: { program: i, part: "initial" }, priceSuffix: "", bullets: initialBullets });
    if (r.recurring) cards.push({ eyebrow: cards.length ? "Thereafter" : "Recurring", title: `${frequencyLabel(pr.frequency)} service`, price: { program: i, part: "recurring" }, priceSuffix: r.billing?.method === "fixed_monthly" && r.billing.fixedMonthlyCents != null ? " / MONTH" : " / VISIT", bullets: recurringBullets.slice(0, 5) });
    else if (!cards.length) cards.push({ eyebrow: "Service", title: pr.name, price: { program: i, part: "initial" }, priceSuffix: "", bullets: recurringBullets.slice(0, 5) });
    if (p.programs.length > 1 && cards[0]) cards[0].eyebrow = `${pr.name} · ${cards[0].eyebrow}`;
    push({ kind: "scope", cards, priority: 1 });
  });

  if (p.portfolioSchedules.length && sec("portfolio_schedules")) push({ kind: "schedules", priority: 1 });

  // ── Rotation capacity ──
  if (rot)
    push({
      kind: "bigNumber",
      title: "Standardized apartment rotation",
      value: String(rot.aptsPerVisit),
      caption: `Up to ${rot.aptsPerVisit} units / visit`,
      text: `At the stated capacity, reaching all ${rot.units.toLocaleString()} apartments takes about ${rot.cycleMonths} month${rot.cycleMonths === 1 ? "" : "s"} (${rot.monthlyCapacity.toLocaleString()} apartment services per month), assuming access is provided. High-activity apartments may be revisited, but those follow-ups do not replace the underlying rotation. This finds unreported activity and keeps response consistent across the property.`,
      priority: 2,
    });

  // ── Separately priced items ──
  p.programs.forEach((pr, i) => {
    const priced = pr.equipment.filter((e) => e.billable && e.unitPriceCents != null && e.quantity > 0);
    if (priced.length && priced.length <= 3)
      push({ kind: "charge", title: priced.map((e) => `${e.quantity} ${e.name}`).join(", "), price: { program: i, part: "equipment" }, priceLabel: " equipment charge", text: "One-time equipment charge, billed separately from service.", priority: 1 });
    pr.pricing.additionalInitial.filter((l) => l.approved && l.amountCents > 0).forEach((l) => push({ kind: "charge", title: l.label, price: { line: l.label, program: i, phase: "initial" }, priceLabel: " one-time", text: "", priority: 1 }));
    pr.pricing.additionalRecurring.filter((l) => l.approved && l.amountCents > 0).forEach((l) => push({ kind: "charge", title: l.label, price: { line: l.label, program: i, phase: "recurring" }, priceLabel: " / visit", text: "", priority: 1 }));
  });
  p.specialtyItems.filter((s) => s.approved && s.priceCents != null).forEach((s) => push({ kind: "charge", title: s.name, price: { specialty: s.name }, priceLabel: s.basis ? ` / ${s.basis.replace(/^per /, "")}` : "", text: s.description, priority: 1 }));
  if (svc.some((s) => RODENT.includes(s))) push({ kind: "note", text: "Entry points and structural gaps found during service are documented with recommended corrections. Exclusion and structural repair work is quoted separately unless expressly included.", priority: 3 });

  // ── Reporting and guarantee (contractual wording kept as written) ──
  const docs = sec("documentation") ?? sec("reporting_capability");
  if (docs) push({ kind: "note", text: prose(docs.body)[0] || docs.items.map((i) => i.title).join(", "), priority: 2 });
  const guarantee = sec("triple_guarantee");
  if (guarantee) push({ kind: "callout", title: guarantee.eyebrow || "Orkin commercial guarantee", text: [prose(guarantee.body).join(" "), guarantee.items.map((i) => i.title).join(", ")].filter(Boolean).join(" "), emphasis: guarantee.callout, priority: 1 });

  // ── Program evaluation ──
  const review = sec("review_milestones");
  push({
    kind: "paragraph",
    text: review ? prose(review.body)[0] || "" : `Program evaluation: service frequency and scope may be adjusted over time when documented captures, device activity and inspection findings show that conditions support a change.`,
    priority: 3,
  });

  // Library wording written for apartment buildings reads oddly elsewhere.
  const fitSite = (t: string) => (p.property.model === "multifamily" ? t : t.replace(/resident or occupant/gi, "occupant").replace(/units or areas/gi, "areas"));
  // ── Responsibilities and exclusions ──
  const resp = sec("customer_responsibilities");
  const excl = sec("exclusions");
  push({
    kind: "twoLists",
    left: { title: "Customer responsibilities", items: distinct(resp ? [...bulletLines(resp.body), ...resp.items.map((i) => i.title)].map(fitSite) : ["Provide access to scheduled service areas and a point of contact for each visit."]) },
    right: { title: "Not included", items: distinct(excl ? [...bulletLines(excl.body), ...excl.items.map((i) => i.title)] : []) },
    priority: 1,
  });

  // ── Price summary ──
  const strip: Extract<StoryBlock, { kind: "priceStrip" }>["items"] = [];
  p.programs.forEach((pr, i) => {
    const r = priced[i];
    const tag = p.programs.length > 1 ? `${pr.name} · ` : "";
    if (r.initial.finalCents > 0) strip.push({ label: `${tag}Initial service`, price: { program: i, part: "initial" }, caption: devices.length ? "Equipment + setup" : "One-time" });
    if (r.recurring) strip.push({ label: `${tag}${frequencyLabel(pr.frequency)} service`, price: { program: i, part: "recurring" }, caption: r.billing?.method === "fixed_monthly" && r.billing.fixedMonthlyCents != null ? "Per month" : "Per service visit" });
    if (r.equipment.lines.length && !r.equipment.unpriced.length && r.equipment.totalCents > 0) strip.push({ label: `${tag}Equipment`, price: { program: i, part: "equipment" }, caption: "One-time charge" });
  });
  if (strip.length) push({ kind: "priceStrip", items: strip, priority: 1 });

  // ── Next step ──
  const concl = sec("conclusion");
  const next = concl ? prose(concl.body).slice(-1)[0] : `The next step is to confirm the scope and schedule so the servicing branch can finalize the agreement and schedule the initial service.`;
  push({ kind: "paragraph", text: next, priority: 1 });

  return { hero: { ...hero, subtitle: cap(hero.subtitle) }, blocks: blocks.filter((b) => b.kind !== "paragraph" || b.text), source: "rules", updatedAt: new Date().toISOString() };
}


/** Drop list items that say nearly the same thing as an earlier one (several services share wording). */
function distinct(items: string[]): string[] {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const kept: { t: string; w: Set<string> }[] = [];
  for (const t of items) {
    const w = words(t);
    const dup = kept.some((k) => {
      const shared = [...w].filter((x) => k.w.has(x)).length;
      return shared / new Set([...w, ...k.w]).size >= 0.6;
    });
    if (!dup) kept.push({ t, w });
  }
  return kept.map((k) => k.t);
}
