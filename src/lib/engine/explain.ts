import type { HistoricalPrice, Proposal, ServiceProgram } from "../types";
import type { ProgramPricingResult } from "./pricing";
import { COMPONENT_LABELS, type Component } from "./estimator";
import { formatMinutes, formatMoney } from "./money";
import { frequencyLabel } from "./frequency";

/** Plain-English internal explanation of a pricing recommendation. Deterministic. */
export function explainPricing(p: Proposal, pr: ServiceProgram, r: ProgramPricingResult): string[] {
  const out: string[] = [];
  const e = r.estimate;
  const rec = e.recurring;
  const devices = pr.equipment.filter((x) => x.quantity > 0);
  if (devices.length) {
    out.push(`Confirmed device servicing: ${devices.map((d) => `${d.quantity} ${d.name}`).join(" + ")} = ${formatMinutes(e.deviceServicing.minutes)} per visit, using your confirmed time standards where applicable.`);
  }
  if (pr.chargeType === "recurring") {
    const parts = (Object.keys(rec.byComponent) as Component[]).filter((c) => c !== "devices" && rec.byComponent[c] > 0).map((c) => `${COMPONENT_LABELS[c].toLowerCase()} ${formatMinutes(rec.byComponent[c])}`);
    if (parts.length) out.push(`Additional estimated fieldwork per visit: ${parts.join(", ")}. These are planning estimates for a ${p.assumptions.models[p.property.model].label.toLowerCase()} and can be adjusted.`);
    out.push(`Total recurring technician time is ${formatMinutes(rec.technicianMinutes)} (${(rec.technicianMinutes / 60).toFixed(2)} technician-hours). At ${formatMoney(r.rateCentsPerHour)}/hr this supports a suggested ${frequencyLabel(pr.frequency).toLowerCase()} charge of ${formatMoney(r.recurring!.calculatedCents)} per visit.`);
    if (r.recurring!.overrideCents != null) out.push(`Your manual price of ${formatMoney(r.recurring!.overrideCents)} is ${r.recurring!.differenceCents! >= 0 ? "above" : "below"} the calculation by ${formatMoney(Math.abs(r.recurring!.differenceCents!))}, an effective ${formatMoney(r.recurring!.effectiveHourlyYieldCents)}/hr on modeled time.`);
  }
  out.push(`Initial service models ${formatMinutes(e.initial.technicianMinutes)} of technician time (installation, a deeper initial assessment and setup documentation), suggesting ${formatMoney(r.initial.calculatedCents)}.`);
  if (r.equipment.lines.length) out.push(r.equipment.unpriced.length ? `Equipment is billed separately; ${r.equipment.unpriced.join(", ")} still need an approved price.` : `Equipment is billed separately at ${formatMoney(r.equipment.totalCents)}.`);
  out.push(`Confidence is ${e.confidence.level}: ${Math.round(e.confidence.confirmedShare * 100)}% of modeled time comes from confirmed or measured values.`);
  return out;
}

/** Historical examples relevant to this program — comparison only, never auto-applied. */
export function relevantHistorical(all: HistoricalPrice[], p: Proposal, pr: ServiceProgram): HistoricalPrice[] {
  const tags = new Set<string>();
  if (pr.services.includes("rodent")) tags.add("rodent");
  if (pr.services.some((s) => s === "german_cockroach" || s === "american_cockroach")) tags.add("cockroach");
  if (pr.services.includes("fly") || pr.services.includes("drain")) tags.add("fly");
  if (pr.services.includes("ant")) tags.add("ant");
  if (p.property.model === "multifamily") tags.add("multifamily");
  if (p.property.model === "large_industrial" || p.property.model === "warehouse") tags.add("industrial");
  if (p.property.model === "small_office" || p.property.model === "medium_commercial") tags.add("office");
  if (pr.frequency.kind === "weekly") tags.add("weekly");
  if (pr.frequency.kind === "seasonal") tags.add("seasonal");
  return all
    .filter((h) => h.status !== "archived" && h.category !== "Specialty" && h.category !== "Equipment")
    .map((h) => ({ h, score: h.tags.filter((t) => tags.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.h);
}
