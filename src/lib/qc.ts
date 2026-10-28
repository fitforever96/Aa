import type { Proposal } from "./types";
import { customerPriceMap, priceProposal } from "./engine/pricing";
import { diffPrices } from "./commands/ops";
import { formatMoney } from "./engine/money";
import { rotationCheck } from "./writer/rationale";

export type QCStatus = "pass" | "warn" | "fail" | "not_run";
export type QCGroup = "financial" | "operational" | "legal" | "document" | "visual";

export interface QCCheck {
  id: string;
  group: QCGroup;
  label: string;
  status: QCStatus;
  detail: string;
  sectionId?: string;
}

export interface PdfQAResult {
  ranAt: string;
  pageCount: number;
  checks: QCCheck[];
  pages: { index: number; chars: number; images: number; minX: number; maxX: number; minY: number; maxY: number; issues: string[] }[];
}

/** Every block of text in a story, so Claude-written story copy goes through the same writing and legal checks. */
export function storyText(story: NonNullable<Proposal["story"]>): string {
  const out: string[] = [story.hero.title, story.hero.subtitle, story.hero.tagline];
  for (const b of story.blocks) {
    const { priority: _p, kind: _k, ...rest } = b as Record<string, unknown>;
    void _p;
    void _k;
    JSON.stringify(rest, (k, v) => {
      if (typeof v === "string" && !["program", "part", "phase", "specialty", "line"].includes(k)) out.push(v);
      return v;
    });
  }
  return out.filter(Boolean).join("\n");
}

const SECTION_TEXT = (p: Proposal) => [
  ...p.document.sections
    .filter((s) => s.enabled)
    .map((s) => ({ s, text: [s.eyebrow, s.headline, s.headlineAccent, s.body, s.callout, ...s.items.flatMap((i) => [i.title, i.body])].join("\n") })),
  ...(p.story && (p.document.options.layout ?? "story") === "story"
    ? [{ s: { id: "story", type: "custom", eyebrow: "Story", headline: "Proposal story", headlineAccent: "", body: "", items: [], callout: "", enabled: true, contractual: false, source: p.story.source === "ai" ? "ai" : "template", sourceRefs: [], updatedAt: p.story.updatedAt } as Proposal["document"]["sections"][number], text: storyText(p.story) }]
    : []),
];

/**
 * Automated quality control. Every check listed here is actually executed against
 * the proposal data; checks that cannot run (e.g. no approval snapshot, no PDF
 * rendered yet) report `not_run` with the reason.
 */
export function runQC(p: Proposal, pdf: PdfQAResult | null = null): QCCheck[] {
  const out: QCCheck[] = [];
  const add = (c: QCCheck) => out.push(c);
  const results = priceProposal(p);
  const prices = customerPriceMap(p);
  const texts = SECTION_TEXT(p);
  const all = texts.map((x) => x.text).join("\n");

  // ───── Financial ─────
  if (p.approvedSnapshot) {
    const d = diffPrices(p.approvedSnapshot.prices, prices);
    add({ id: "fin_approved", group: "financial", label: "Approved prices unchanged", status: d.length ? "fail" : "pass", detail: d.length ? `Changed since approval: ${d.join("; ")}` : `All ${Object.keys(prices).length} approved prices match the approval snapshot.` });
  } else add({ id: "fin_approved", group: "financial", label: "Approved prices unchanged", status: "not_run", detail: "No approval snapshot yet. Approve the proposal to lock and track prices." });

  for (const r of results) {
    const prog = p.programs.find((x) => x.id === r.programId)!;
    if (r.recurring) {
      add({ id: `fin_rec_${prog.id}`, group: "financial", label: `${prog.name}: recurring rate`, status: r.recurring.finalCents > 0 ? "pass" : "fail", detail: r.recurring.finalCents > 0 ? `${formatMoney(r.recurring.finalCents)} ${r.billing?.customerLabel ?? ""}${r.recurring.locked ? " (locked)" : ""}` : "Recurring program has no recurring price." });
      const sum = r.recurring.components.reduce((s, c) => s + c.cents, 0);
      add({ id: `fin_math_${prog.id}`, group: "financial", label: `${prog.name}: arithmetic`, status: sum === r.recurring.calculatedCents ? "pass" : "fail", detail: sum === r.recurring.calculatedCents ? "Component lines sum exactly to the calculated price." : `Components sum ${formatMoney(sum)} ≠ calculated ${formatMoney(r.recurring.calculatedCents)}.` });
    }
    const installs = prog.equipment.some((e) => e.installMinutesEach > 0 && e.quantity > 0);
    add({ id: `fin_init_${prog.id}`, group: "financial", label: `${prog.name}: initial service charge`, status: r.initial.finalCents > 0 || !installs ? "pass" : "warn", detail: r.initial.finalCents > 0 ? `${formatMoney(r.initial.finalCents)} initial${r.initial.locked ? " (locked)" : ""}` : installs ? "Equipment installation is scoped but the initial charge is $0." : "No initial charge." });
    const badEquip = r.equipment.lines.filter((l) => l.unitPriceCents != null && l.totalCents !== l.unitPriceCents * l.quantity);
    add({ id: `fin_equip_${prog.id}`, group: "financial", label: `${prog.name}: equipment calculations`, status: r.equipment.unpriced.length ? "fail" : badEquip.length ? "fail" : "pass", detail: r.equipment.unpriced.length ? `No approved price: ${r.equipment.unpriced.join(", ")}` : r.equipment.lines.length ? `Equipment total ${formatMoney(r.equipment.totalCents)} verified (${r.equipment.lines.length} line${r.equipment.lines.length > 1 ? "s" : ""}).` : "No billable equipment." });
    const labels = [...prog.pricing.additionalRecurring, ...prog.pricing.additionalInitial].map((l) => l.label.trim().toLowerCase()).filter(Boolean);
    const catalogDupes = prog.equipment.map((e) => `${e.catalogItemId ?? e.name}|${e.location}`);
    const dup = labels.length !== new Set(labels).size || catalogDupes.length !== new Set(catalogDupes).size;
    add({ id: `fin_dup_${prog.id}`, group: "financial", label: `${prog.name}: duplicated charges`, status: dup ? "warn" : "pass", detail: dup ? "Duplicate charge labels or duplicate equipment lines detected." : "No duplicate charges." });
    if (prog.billing.method === "fixed_monthly" && !prog.billing.fixedMonthlyApproved) add({ id: `fin_bill_${prog.id}`, group: "financial", label: `${prog.name}: billing method`, status: "warn", detail: "Fixed-monthly billing selected but not approved; the customer PDF shows per-visit pricing." });
    else add({ id: `fin_bill_${prog.id}`, group: "financial", label: `${prog.name}: billing method`, status: r.visitsPerYear > 0 ? "pass" : "fail", detail: r.visitsPerYear > 0 ? `${prog.billing.method.replace("_", " ")} · ${Number.isInteger(r.visitsPerYear) ? r.visitsPerYear : r.visitsPerYear.toFixed(1)} visits/yr` : "Frequency produces zero visits per year." });
  }
  const specialtyNames = p.specialtyItems.map((s) => s.name.trim().toLowerCase());
  if (specialtyNames.length !== new Set(specialtyNames).size) add({ id: "fin_spec_dup", group: "financial", label: "Specialty pricing duplicates", status: "warn", detail: "Two specialty items share the same name." });
  const unapprovedSpec = p.specialtyItems.filter((s) => !s.approved);
  if (p.specialtyItems.length) add({ id: "fin_spec", group: "financial", label: "Specialty prices approved", status: unapprovedSpec.length ? "warn" : "pass", detail: unapprovedSpec.length ? `Not yet approved: ${unapprovedSpec.map((s) => s.name).join(", ")}` : "All specialty prices approved." });

  const allowed = new Set(Object.values(prices));
  const strays: string[] = [];
  for (const { s, text } of texts) {
    for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)) {
      const cents = Math.round(Number(m[1].replace(/,/g, "")) * 100);
      if (!allowed.has(cents)) strays.push(`${m[0]} in “${s.headline || s.type}”`);
    }
  }
  add({ id: "fin_text_prices", group: "financial", label: "Prices in narrative match approved pricing", status: strays.length ? "fail" : "pass", detail: strays.length ? `Unmatched amounts: ${strays.slice(0, 6).join("; ")}` : "No unapproved dollar amounts appear in proposal text." });

  // ───── Internal-information leakage ─────
  const leaks: string[] = [];
  const leakRe = /(\$\s?210(\.00)?\s*(\/|per)\s*(hour|hr))|technician[-\s]minutes?|per[-\s]technician[-\s]minute|labor rate|hourly yield|per[-\s]door|\bmargin\b|\d+\s*min(ute)?s?\s*(per|\/)\s*(tin cat|station|device)/i;
  for (const { s, text } of texts) if (leakRe.test(text)) leaks.push(s.headline || s.type);
  add({ id: "doc_internal_leak", group: "document", label: "No internal estimating details in customer proposal", status: leaks.length ? "fail" : "pass", detail: leaks.length ? `Internal labor/rate language found in: ${leaks.join(", ")}` : "Labor rate, device minutes, per-door math and yield are excluded." });

  // ───── Operational ─────
  for (const pr of p.programs) {
    const neg = pr.equipment.filter((e) => !(e.quantity >= 0) || !Number.isFinite(e.quantity));
    add({ id: `op_qty_${pr.id}`, group: "operational", label: `${pr.name}: equipment quantities`, status: neg.length ? "fail" : "pass", detail: neg.length ? "Invalid quantities." : `${pr.equipment.reduce((s, e) => s + e.quantity, 0)} devices allocated.` });
  }
  const freqMismatch: string[] = [];
  for (const { s, text } of texts) {
    const t = text.toLowerCase();
    const kinds = new Set(p.programs.map((x) => x.frequency.kind));
    if (/bi-?weekly|every two weeks/.test(t) && !kinds.has("biweekly")) freqMismatch.push(`“${s.headline}” mentions every-two-weeks service`);
    if (/twice[\s-]monthly|twice a month/.test(t) && !kinds.has("twice_monthly") && s.type !== "portfolio_schedules") freqMismatch.push(`“${s.headline}” mentions twice-monthly service`);
    if (/\bweekly\b/.test(t) && !/bi-?weekly/.test(t) && !kinds.has("weekly") && !kinds.has("five_day_weekly") && s.type !== "portfolio_schedules") freqMismatch.push(`“${s.headline}” mentions weekly service`);
  }
  add({ id: "op_freq_text", group: "operational", label: "Frequencies in text match the program", status: freqMismatch.length ? "warn" : "pass", detail: freqMismatch.length ? freqMismatch.join("; ") : "Narrative frequencies are consistent with program data." });
  const qtyMismatch: string[] = [];
  for (const { s, text } of texts)
    for (const m of text.matchAll(/(\d[\d,]*)\s+(tin cats?|exterior (?:rodent )?(?:bait )?stations?)/gi)) {
      const n = Number(m[1].replace(/,/g, ""));
      const isTin = /tin/i.test(m[2]);
      const actual = p.programs.flatMap((x) => x.equipment).filter((e) => (isTin ? /tin cat/i.test(e.name) : e.location === "exterior")).reduce((a, e) => a + e.quantity + (e.reserveQuantity || 0), 0);
      if (n !== actual) qtyMismatch.push(`${m[0]} in “${s.headline}” (data: ${actual})`);
    }
  add({ id: "op_qty_text", group: "operational", label: "Equipment counts in text match allocations", status: qtyMismatch.length ? "fail" : "pass", detail: qtyMismatch.length ? qtyMismatch.join("; ") : "No conflicting equipment counts in narrative." });
  const rotationClaims = texts.filter(({ text }) => /rotation|every apartment|each apartment/i.test(text));
  const hasRotationData = p.programs.some((x) => x.apartmentsPerVisit) || p.portfolioSchedules.length > 0;
  add({ id: "op_rotation", group: "operational", label: "Rotation claims supported", status: rotationClaims.length && !hasRotationData ? "warn" : "pass", detail: rotationClaims.length && !hasRotationData ? "Text describes an apartment rotation but no apartments-per-visit or schedule is defined." : "Rotation statements are backed by program data or absent." });
  const rot = p.programs.map((x) => rotationCheck(p.property, x)).find(Boolean);
  if (rot) {
    const t = all.toLowerCase();
    const claimsQuarter = /quarterly (apartment )?rotation|three-month (cycle|rotation)|every three months/.test(t);
    const claimsYear = /annual (apartment )?rotation|12-month (cycle|rotation)/.test(t);
    const bad = (claimsQuarter && rot.cycleMonths > 3) || (claimsYear && rot.cycleMonths > 12);
    add({ id: "op_rotation_math", group: "operational", label: "Rotation arithmetic", status: bad ? "fail" : "pass", detail: `${rot.aptsPerVisit} apts/visit × ${rot.visitsPerMonth} planned visits/mo = ${rot.monthlyCapacity}/mo → ${rot.units} units in ${rot.cycleMonths} month(s).${bad ? " The text claims a shorter rotation than this capacity supports." : ""}` });
  }
  const excl = p.document.sections.find((s) => s.type === "exclusions");
  add({ id: "op_exclusions", group: "operational", label: "Exclusions included", status: excl?.enabled && excl.body.trim() ? "pass" : "warn", detail: excl?.enabled ? "Exclusions section present." : "No enabled exclusions section — confirm customer-specific exclusions." });
  const missing = results.flatMap((r) => r.estimate.confidence.missing);
  add({ id: "op_scope", group: "operational", label: "Scope information complete", status: missing.length ? "warn" : "pass", detail: missing.length ? `Missing: ${[...new Set(missing)].join("; ")}` : "Estimate inputs complete." });

  // ───── Legal & technical ─────
  const gSection = p.document.sections.find((s) => s.type === "triple_guarantee" && s.enabled);
  const guaranteeMentions = texts.filter(({ s, text }) => s.type !== "triple_guarantee" && s.type !== "authorization" && /guarantee/i.test(text));
  add({ id: "lg_guarantee", group: "legal", label: "Guarantee statements supported", status: guaranteeMentions.length ? "warn" : "pass", detail: guaranteeMentions.length ? `Guarantee language outside the guarantee section: ${guaranteeMentions.map((x) => x.s.headline).join(", ")}. Confirm it matches the controlling agreement.` : gSection ? "Guarantee appears only in the configurable guarantee section with agreement-control disclaimer." : "No guarantee language." });
  if (gSection) add({ id: "lg_guarantee_verify", group: "legal", label: "Triple Guarantee terms verified", status: "warn", detail: "Confirm current Triple Guarantee terms at orkin.com/commercial and that this customer’s agreement includes them." });
  // Master memory §14/§30: no fixed response times anywhere, including the guarantee section.
  const responseRe = /(within\s+(\d+|two|twenty-four|one)\s*(hours?|hrs?|minutes?|business days?|days?))|(\d+[-\s]hour\s+(response|on-site|onsite))|(\b2\s*[x×]\s*24\b)|same[-\s]day|24\/7|(on-?site\s+(representative|response|technician)?.{0,30}\b(within|in)\s+\d+)/i;
  const responseTimes = texts.filter(({ text }) => responseRe.test(text));
  add({ id: "lg_response", group: "legal", label: "No invented response times", status: responseTimes.length ? "fail" : "pass", detail: responseTimes.length ? `Response-time commitments found in: ${responseTimes.map((x) => x.s.headline || x.s.type).join(", ")}. Use only terms from the executed agreement; the 24-hour on-site language was specifically rejected.` : "No response-time promises in proposal text." });
  const overRe = /\b(eradicat\w*|pest[-\s]free|eliminat\w*\s+(all|every)|guarantee[sd]?\s+(elimination|eradication|results|compliance|infection)|permanent(ly)?\s+(eliminat\w*|resolv\w*|solv\w*)|prevent(s)?\s+(all|every)\s+infest\w*|ensures?\s+(regulatory\s+|food[-\s]safety\s+)?compliance|unlimited\s+(free\s+)?(service|treatment|callbacks?)|unconditional\s+refund|increase[sd]?\s+(property\s+value|occupancy))\b/gi;
  const over = [...new Set(all.match(overRe) ?? [])];
  add({ id: "lg_overpromise", group: "legal", label: "No guaranteed outcomes or overpromises", status: over.length ? "fail" : "pass", detail: over.length ? `Remove or qualify: ${over.join(", ")}` : "No eradication, compliance, refund or unlimited-service promises." });
  const startRe = /anticipated start|will (begin|commence) on|start date of|commencing on/i;
  if (startRe.test(all)) add({ id: "lg_start", group: "legal", label: "Start-date language", status: "warn", detail: "Proposal states a start date. Include only an approved date; remove anticipated-start language when procurement requests it." });
  const labelClaims = all.match(/\b(100% (safe|effective)|completely safe|non-toxic|eliminates? all|odorless|pet[-\s]safe|child[-\s]safe|organic|green)\b/gi);
  add({ id: "lg_label", group: "legal", label: "Claims requiring product-label verification", status: labelClaims ? "warn" : "pass", detail: labelClaims ? `Verify against current EPA labels: ${[...new Set(labelClaims)].join(", ")}` : "No safety/efficacy claims requiring label verification." });
  const wildlife = p.programs.some((x) => x.services.includes("wildlife") || x.services.includes("bird"));
  const wildMethods = all.match(/\b(relocat\w*|round-?ups?|egg\s+(oiling|addling|treatment)|lethal|trap\w*\s+and\s+remov\w*|nest\s+removal)\b/gi);
  add({ id: "lg_wildlife", group: "legal", label: "Wildlife/bird methods legal review", status: wildMethods ? "fail" : wildlife ? "warn" : "pass", detail: wildMethods ? `Method language requires verified legality and branch capability: ${[...new Set(wildMethods)].join(", ")}. Prefer nonlethal deterrence; goose roundup/relocation is not offered.` : wildlife ? "Wildlife or bird services selected: confirm species protections, permits and branch capability." : "No wildlife services." });
  if (/owl box/i.test(all) && /owl box[^.]{0,120}\b(control|eliminat|reduc\w* (the )?rodent population)/i.test(all)) add({ id: "lg_owl", group: "legal", label: "Owl-box claims", status: "warn", detail: "Owl boxes support biological control but must not be described as guaranteed rodent population control." });
  add({ id: "lg_national", group: "legal", label: "No unsupported National Accounts claims", status: /national account/i.test(all) ? "fail" : "pass", detail: /national account/i.test(all) ? "Text references National Accounts. Multistate service does not imply a formal Orkin National Account." : "No National Accounts claims." });
  const certs = all.match(/\b(certified|certification|accredited|licensed|ISO\s?\d*)\b/gi);
  add({ id: "lg_cert", group: "legal", label: "Certifications verified", status: certs ? "warn" : "pass", detail: certs ? `Verify before sending: ${[...new Set(certs)].join(", ")}` : "No certification claims." });
  const accepted = p.research.filter((r) => r.status === "accepted");
  const noSource = accepted.filter((r) => !r.sources.length);
  const refsRejected = p.document.sections.filter((s) => s.sourceRefs.some((id) => p.research.find((r) => r.id === id)?.status === "rejected"));
  add({ id: "lg_sources", group: "legal", label: "Technical sources", status: noSource.length || refsRejected.length ? "warn" : "pass", detail: noSource.length ? `${noSource.length} accepted research finding(s) have no source URL.` : refsRejected.length ? `Sections cite rejected research: ${refsRejected.map((s) => s.headline).join(", ")}` : accepted.length ? `${accepted.length} accepted finding(s), all sourced.` : "No research used." });

  // ───── Writing standard (master memory §35) ─────
  const buzz = [...new Set(all.match(/\b(world-class|cutting-edge|unparalleled|best-in-class|state-of-the-art|industry-leading|second to none|unmatched)\b/gi) ?? [])];
  const dashes = (all.match(/—/g) ?? []).length;
  const bangs = (all.match(/!/g) ?? []).length;
  const comp = /\bcomprehensive\b/i.test(all + " " + p.title);
  add({ id: "doc_style", group: "document", label: "Writing standard", status: buzz.length || dashes > 4 || bangs ? "warn" : "pass", detail: buzz.length || dashes > 4 || bangs ? [buzz.length ? `Avoid: ${buzz.join(", ")}` : "", dashes > 4 ? `${dashes} em dashes; use sparingly` : "", bangs ? "Remove exclamation marks" : ""].filter(Boolean).join(" · ") : "Direct, precise language; no buzzwords or decorative punctuation." });
  if (comp) add({ id: "doc_comprehensive", group: "document", label: "“Comprehensive” claim", status: "warn", detail: "Use “comprehensive” only when the actual scope justifies it." });
  if (p.document.sections.some((x) => x.type === "authorization" && x.enabled)) add({ id: "doc_signature", group: "document", label: "Signature / authorization page", status: "warn", detail: "Included. Your standard is to add signature or authorization blocks only when requested." });
  if (p.kind === "government" || p.kind === "rfp") {
    const req = p.rfpRequirements ?? [];
    const openMandatory = req.filter((r) => r.mandatory && (r.status === "open" || r.status === "cannot_perform"));
    const approval = req.filter((r) => r.status === "needs_approval");
    add({ id: "op_rfp_matrix", group: "operational", label: "RFP requirements matrix", status: !req.length ? "warn" : openMandatory.length ? "fail" : approval.length ? "warn" : "pass", detail: !req.length ? "No requirements matrix. Build one on the Services step before drafting a procurement response." : openMandatory.length ? `Mandatory requirements not addressed: ${openMandatory.map((r) => r.requirement).slice(0, 4).join("; ")}` : approval.length ? `${approval.length} requirement(s) need operational approval.` : `All ${req.length} requirements addressed.` });
  }

  // ───── Document ─────
  const inv = p.document.sections.find((s) => s.type === "investment" && s.enabled);
  add({ id: "doc_pricing", group: "document", label: "Pricing table present", status: inv ? "pass" : "fail", detail: inv ? "Investment section enabled." : "Customer proposal has no enabled investment/pricing section." });
  const missingInfo = [!p.customer.name && "customer name", !p.property.name && "property name", !p.property.address.line1 && "site address", !p.customer.contactName && "customer contact"].filter(Boolean) as string[];
  add({ id: "doc_customer", group: "document", label: "Customer information", status: missingInfo.length > 1 ? "fail" : missingInfo.length ? "warn" : "pass", detail: missingInfo.length ? `Missing: ${missingInfo.join(", ")}` : "Customer, property, address and contact present." });
  const empty = p.document.sections.filter((s) => s.enabled && !s.body.trim() && !s.items.length && !["investment", "specialty_services", "portfolio_schedules", "equipment_allocation", "photos", "floor_plans"].includes(s.type));
  add({ id: "doc_empty", group: "document", label: "No empty sections", status: empty.length ? "warn" : "pass", detail: empty.length ? `Empty: ${empty.map((s) => s.headline || s.type).join(", ")}` : "All enabled sections have content." });
  const longParas = texts.filter(({ s }) => s.body.split(/\n\n/).some((para) => para.length > 900));
  add({ id: "doc_readability", group: "document", label: "Readability (paragraph length)", status: longParas.length ? "warn" : "pass", detail: longParas.length ? `Very long paragraphs in: ${longParas.map((x) => x.s.headline).join(", ")}` : "Paragraph lengths suit the page layout." });
  add({ id: "doc_brand", group: "document", label: "Branding & authorship", status: p.title && p.document.preparedBy.length ? "pass" : "warn", detail: p.title && p.document.preparedBy.length ? `ORKIN wordmark, ${p.document.coverStyle.replace(/_/g, " ")} cover, prepared by ${p.document.preparedBy.map((x) => x.name).join(" & ")}.` : "Missing title or prepared-by." });
  if (p.document.coverStyle === "property_showcase" && !p.document.coverImageAssetId) add({ id: "doc_cover_image", group: "document", label: "Property Showcase cover image", status: "warn", detail: "Property Showcase cover selected without an uploaded property photo; a graphic treatment will be used." });
  if (p.importedFrom && ["redesign", "cover_only", "improve"].includes(p.importedFrom.mode)) {
    const unlocked = p.programs.filter((x) => (x.pricing.recurringOverride && !x.pricing.recurringOverride.locked) || (x.pricing.initialOverride && !x.pricing.initialOverride.locked));
    add({ id: "doc_source_preserve", group: "document", label: "Source-document pricing preserved", status: unlocked.length ? "warn" : "pass", detail: unlocked.length ? "Some imported prices are not locked." : `Imported prices from ${p.importedFrom.fileName} are locked.` });
  }

  // ───── Visual (PDF render inspection) ─────
  if (pdf) out.push(...pdf.checks);
  else add({ id: "vis_not_run", group: "visual", label: "Rendered PDF inspection", status: "not_run", detail: "Generate the PDF to run page-by-page layout inspection (text clipping, overlap, blank pages, margins, font size)." });
  return out;
}

export function qcSummary(checks: QCCheck[]) {
  return {
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    pass: checks.filter((c) => c.status === "pass").length,
    notRun: checks.filter((c) => c.status === "not_run").length,
  };
}
