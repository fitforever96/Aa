import type { EquipmentItem, HistoricalPrice, ImportMode, Proposal, ServiceCategory, Settings, VerifiedCapability, AssumptionVersion } from "../types";
import type { Extraction } from "./extract";
import { newProposal, allocationFromCatalog, newProgram } from "../factories";
import { parseFrequency, detectServices, detectModel } from "../commands/parse";
import { generateDocument } from "../writer/generate";
import { uid, nowISO } from "../ids";
import { CONFIRMED_DEVICE_IDS } from "../engine/catalogIds";

/** Build a proposal from REVIEWED extraction items. Only confirmed items are used; imported prices are locked. */
export function proposalFromExtraction(x: Extraction, mode: ImportMode, ctx: { settings: Settings; version: AssumptionVersion; catalog: EquipmentItem[]; capabilities: VerifiedCapability[]; fileName: string; docId: string | null; fullText: string }): Proposal {
  const p = newProposal(ctx.settings, ctx.version);
  const keepCustomer = mode !== "template";
  const keepPrices = mode !== "template";
  if (keepCustomer) {
    if (x.customer?.confirmed) p.customer.name = x.customer.value;
    if (x.propertyName?.confirmed) p.property.name = x.propertyName.value;
    if (x.contact?.confirmed) p.customer.contactName = x.contact.value;
    if (x.address?.confirmed) {
      const m = x.address.value.match(/^(.*?),?\s+([A-Za-z .]+),\s*([A-Z]{2})\s+(\d{5})/);
      if (m) p.property.address = { line1: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] };
      else p.property.address.line1 = x.address.value;
    }
  }
  const services = detectServices(x.scope.filter((s) => s.confirmed).map((s) => s.value).join(" ") + " " + x.equipment.filter((e) => e.confirmed).map((e) => e.value.name).join(" "));
  const model = detectModel(ctx.fullText.slice(0, 4000), null);
  if (model) p.property.model = model;
  const prog = p.programs[0];
  prog.services = (services.length ? services : ["general_pest"]) as ServiceCategory[];
  const f = x.frequencies.find((q) => q.confirmed);
  if (f) {
    const spec = parseFrequency(f.value);
    if (spec) {
      prog.frequency = spec;
      prog.chargeType = spec.kind === "one_time" ? "one_time" : "recurring";
    }
  }
  for (const e of x.equipment.filter((q) => q.confirmed)) {
    const isTin = /tin\s*cat/i.test(e.value.name);
    const isExt = /bait|exterior|station/i.test(e.value.name) && !isTin;
    const item = ctx.catalog.find((c) => c.id === (isTin ? CONFIRMED_DEVICE_IDS.tinCat : isExt ? CONFIRMED_DEVICE_IDS.baitStation : "")) ?? ctx.catalog.find((c) => c.name.toLowerCase().includes(e.value.name.toLowerCase().split(" ")[0]));
    const a = item ? allocationFromCatalog(item, e.value.quantity ?? 0) : { ...allocationFromCatalog(ctx.catalog[0], e.value.quantity ?? 0), catalogItemId: null, name: e.value.name, serviceTimeSource: "estimate" as const };
    if (!item) a.serviceMinutesEach = 1;
    if (keepPrices && e.value.unitCents != null) {
      a.unitPriceCents = e.value.unitCents;
      a.priceSource = "customer_override";
    }
    if (mode === "template") a.quantity = 0;
    prog.equipment.push(a);
  }
  if (keepPrices) {
    const charges = x.charges.filter((c) => c.confirmed && c.value.cents != null);
    const rec = charges.filter((c) => c.value.kind === "recurring");
    const init = charges.find((c) => c.value.kind === "initial");
    if (rec[0]) prog.pricing.recurringOverride = { cents: rec[0].value.cents!, locked: true, lockedAt: nowISO(), note: `Imported from ${ctx.fileName}: “${rec[0].evidence}”` };
    for (const extra of rec.slice(1)) {
      const np = newProgram(prog.services, prog.frequency, 1);
      np.name = extra.value.label.slice(0, 60) || "Imported program";
      np.pricing.recurringOverride = { cents: extra.value.cents!, locked: true, lockedAt: nowISO(), note: `Imported: “${extra.evidence}”` };
      np.pricing.initialOverride = { cents: 0, locked: true, lockedAt: nowISO(), note: "No initial charge in source" };
      p.programs.push(np);
    }
    if (init) prog.pricing.initialOverride = { cents: init.value.cents!, locked: true, lockedAt: nowISO(), note: `Imported from ${ctx.fileName}: “${init.evidence}”` };
    for (const s of charges.filter((c) => c.value.kind === "specialty")) p.specialtyItems.push({ id: uid("spc"), name: s.value.label.slice(0, 80), description: "", priceCents: s.value.cents, priceHighCents: null, basis: s.value.basis || "per unit", qualifier: "", source: "imported", approved: true });
  }
  p.title = mode === "comprehensive" ? "Comprehensive Pest Management Program" : p.title;
  if (mode === "comprehensive") p.kind = model === "multifamily" ? "multifamily_rotation" : "industrial";
  p.importedFrom = { fileName: ctx.fileName, docId: ctx.docId, mode };
  p.document.sections = generateDocument(p, { settings: ctx.settings, capabilities: ctx.capabilities, includeGuarantee: x.guarantees.some((g) => g.confirmed), includeReporting: false });
  // Preserve source commitments verbatim.
  const excl = x.exclusions.filter((e) => e.confirmed).map((e) => `- ${e.value}`);
  const resp = x.responsibilities.filter((e) => e.confirmed).map((e) => `- ${e.value}`);
  for (const s of p.document.sections) {
    if (s.type === "exclusions" && excl.length && mode !== "template") (s.body = excl.join("\n")), (s.source = "imported");
    if (s.type === "customer_responsibilities" && resp.length && mode !== "template") (s.body = resp.join("\n")), (s.source = "imported");
  }
  p.internalNotes = `Imported from ${ctx.fileName} (${x.method.replace("_", " ")}) — mode: ${mode}. Review every section against the source before sending.`;
  return p;
}

export function historicalFromExtraction(x: Extraction, fileName: string, customer: string): HistoricalPrice[] {
  return x.charges
    .filter((c) => c.confirmed && c.value.cents != null)
    .map((c) => ({
      id: uid("hist"),
      customer: customer || fileName,
      program: c.value.label.slice(0, 80) || "Imported charge",
      category: c.value.kind === "specialty" ? "Specialty" : c.value.kind === "equipment" ? "Equipment" : "Imported",
      description: c.evidence,
      priceCents: c.value.cents,
      priceHighCents: null,
      basis: c.value.basis || c.value.kind,
      frequency: x.frequencies.find((f) => f.confirmed)?.value ?? "",
      status: "unverified_extracted" as const,
      source: fileName,
      version: "",
      effectiveDate: null,
      notes: `Extracted (${x.method}); confidence ${c.confidence}. Customer-specific — not a universal price.`,
      tags: [c.value.kind],
      metrics: {},
    }));
}
