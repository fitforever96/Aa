import type { Cents, EstimatingAssumptions, PriceOverride, Proposal, ServiceProgram } from "../types";
import { estimateProgram, type EstimateResult } from "./estimator";
import { presentBilling, visitsPerYear, type BillingPresentation } from "./frequency";
import { applyPct, formatMoney, laborCents, roundCents } from "./money";

/**
 * Deterministic pricing engine. The AI never performs arithmetic: every number
 * shown to the user or customer is produced here and is reproducible from the
 * proposal's stored assumptions snapshot.
 *
 * Rules: labor and equipment stay separate; no hidden rounding (one half-up
 * rounding to cents per amount, disclosed); no automatic minimum, markup or
 * discount — each must be explicitly enabled and is shown as its own line.
 */

export interface PriceComponent {
  label: string;
  cents: Cents;
  formula: string;
  kind: "labor" | "line" | "adjustment" | "travel";
}

export interface PricePoint {
  technicianMinutes: number;
  calculatedCents: Cents;
  components: PriceComponent[];
  overrideCents: Cents | null;
  locked: boolean;
  finalCents: Cents;
  differenceCents: Cents | null;
  /** Final price ÷ technician hours (cents/hour). Internal only. */
  effectiveHourlyYieldCents: Cents | null;
  belowTarget: boolean;
}

export interface EquipmentLine {
  allocationId: string;
  name: string;
  quantity: number;
  unitPriceCents: Cents | null;
  totalCents: Cents | null;
  priceSource: string;
}

export interface ProgramPricingResult {
  programId: string;
  rateCentsPerHour: Cents;
  rateSource: "proposal_override" | "customer_override" | "default";
  estimate: EstimateResult;
  recurring: PricePoint | null;
  initial: PricePoint;
  equipment: { lines: EquipmentLine[]; totalCents: Cents; unpriced: string[] };
  billing: BillingPresentation | null;
  visitsPerYear: number;
  contractTotal: { months: number; visits: number; cents: Cents; formula: string } | null;
  advisories: string[];
}

export function resolveRate(p: Pick<Proposal, "laborRateOverrideCents" | "customer" | "assumptions">): {
  cents: Cents;
  source: ProgramPricingResult["rateSource"];
} {
  if (p.laborRateOverrideCents != null) return { cents: p.laborRateOverrideCents, source: "proposal_override" };
  if (p.customer.laborRateOverrideCents != null) return { cents: p.customer.laborRateOverrideCents, source: "customer_override" };
  return { cents: p.assumptions.laborRateCentsPerHour, source: "default" };
}

const rateText = (c: Cents) => `${formatMoney(c)}/hr`;
const minText = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

function buildPoint(
  label: string,
  minutes: number,
  rate: Cents,
  lines: { label: string; amountCents: Cents; approved: boolean }[],
  override: PriceOverride | null,
  program: ServiceProgram,
  assumptions: EstimatingAssumptions,
  travelMinutes: number,
): PricePoint {
  const components: PriceComponent[] = [];
  const labor = laborCents(minutes, rate);
  components.push({
    label: `${label} labor`,
    cents: labor,
    kind: "labor",
    formula: `${minText(minutes)} technician-min ÷ 60 × ${rateText(rate)} = ${formatMoney(labor)}${Number.isInteger((minutes * rate) / 60) ? "" : " (rounded to nearest cent)"}`,
  });
  if (travelMinutes > 0 && program.pricing.billExternalTravel) {
    const t = laborCents(travelMinutes, rate);
    components.push({ label: "External travel (approved billable)", cents: t, kind: "travel", formula: `${minText(travelMinutes)} technician-min ÷ 60 × ${rateText(rate)} = ${formatMoney(t)}` });
  }
  for (const l of lines) {
    if (!l.approved) continue;
    components.push({ label: l.label, cents: l.amountCents, kind: "line", formula: `Approved additional charge ${formatMoney(l.amountCents)}` });
  }
  let subtotal = components.reduce((s, c) => s + c.cents, 0);
  if (program.pricing.markupPct) {
    const m = applyPct(subtotal, program.pricing.markupPct);
    components.push({ label: `Markup ${program.pricing.markupPct}%`, cents: m, kind: "adjustment", formula: `${formatMoney(subtotal)} × ${program.pricing.markupPct}% = ${formatMoney(m)}` });
    subtotal += m;
  }
  if (program.pricing.discountPct) {
    const d = -applyPct(subtotal, program.pricing.discountPct);
    components.push({ label: `Discount ${program.pricing.discountPct}%`, cents: d, kind: "adjustment", formula: `${formatMoney(subtotal)} × −${program.pricing.discountPct}% = ${formatMoney(d)}` });
    subtotal += d;
  }
  if (program.pricing.applyMinimumCharge && assumptions.minimumCharge.enabled && subtotal < assumptions.minimumCharge.cents) {
    const add = assumptions.minimumCharge.cents - subtotal;
    components.push({ label: "Minimum charge adjustment", cents: add, kind: "adjustment", formula: `Configured minimum ${formatMoney(assumptions.minimumCharge.cents)} − ${formatMoney(subtotal)} = ${formatMoney(add)}` });
    subtotal += add;
  }
  const calculated = subtotal;
  const locked = !!override?.locked;
  const overrideCents = override ? override.cents : null;
  const finalCents = overrideCents ?? calculated;
  const yieldC = minutes > 0 ? roundCents((finalCents * 60) / minutes) : null;
  return {
    technicianMinutes: minutes,
    calculatedCents: calculated,
    components,
    overrideCents,
    locked,
    finalCents,
    differenceCents: overrideCents != null ? overrideCents - calculated : null,
    effectiveHourlyYieldCents: yieldC,
    belowTarget: yieldC != null && yieldC < rate,
  };
}

export function priceProgram(proposal: Proposal, program: ServiceProgram): ProgramPricingResult {
  const assumptions = proposal.assumptions;
  const rate = resolveRate(proposal);
  const estimate = estimateProgram(proposal.property, program, assumptions);
  const travelTech = estimate.externalTravel?.technicianMinutes ?? 0;

  const recurring =
    program.chargeType === "recurring"
      ? buildPoint("Recurring service", estimate.recurring.technicianMinutes, rate.cents, program.pricing.additionalRecurring.map((l) => ({ label: l.label, amountCents: l.amountCents, approved: l.approved })), program.pricing.recurringOverride, program, assumptions, travelTech)
      : null;
  const initial = buildPoint("Initial service", estimate.initial.technicianMinutes, rate.cents, program.pricing.additionalInitial.map((l) => ({ label: l.label, amountCents: l.amountCents, approved: l.approved })), program.pricing.initialOverride, program, assumptions, travelTech);

  const lines: EquipmentLine[] = program.equipment
    .filter((e) => e.billable && e.quantity + (e.reserveQuantity ?? 0) > 0)
    .map((e) => {
      const qty = e.quantity + (e.reserveQuantity ?? 0);
      return {
        allocationId: e.id,
        name: e.name,
        quantity: qty,
        unitPriceCents: e.unitPriceCents,
        totalCents: e.unitPriceCents != null ? e.unitPriceCents * qty : null,
        priceSource: e.priceSource,
      };
    });
  const unpriced = lines.filter((l) => l.unitPriceCents == null).map((l) => l.name);
  const equipmentTotal = lines.reduce((s, l) => s + (l.totalCents ?? 0), 0);

  const vpy = visitsPerYear(program.frequency);
  const billing = recurring ? presentBilling(recurring.finalCents, program.frequency, program.billing) : null;

  let contractTotal: ProgramPricingResult["contractTotal"] = null;
  if (recurring && proposal.document.options.showContractTotals) {
    const months = proposal.document.options.contractMonths;
    const visits = (vpy * months) / 12;
    const cents = roundCents(recurring.finalCents * visits);
    contractTotal = { months, visits, cents, formula: `${formatMoney(recurring.finalCents)} × ${Number.isInteger(visits) ? visits : visits.toFixed(2)} visits over ${months} months = ${formatMoney(cents)}` };
  }

  const advisories: string[] = [];
  for (const [pt, name] of [
    [recurring, "recurring"],
    [initial, "initial"],
  ] as const) {
    if (pt && pt.overrideCents != null && pt.overrideCents > 0 && pt.belowTarget && pt.technicianMinutes > 0) {
      advisories.push(
        `At the estimated ${name} service duration (${(pt.technicianMinutes / 60).toFixed(2)} technician-hours), the quoted ${formatMoney(pt.finalCents)} produces an effective labor revenue of ${formatMoney(pt.effectiveHourlyYieldCents)}/hr — below your ${rateText(rate.cents)} target. Advisory only; your approved price is unchanged.`,
      );
    }
  }
  if (unpriced.length) advisories.push(`Billable equipment without an approved price: ${unpriced.join(", ")}. Set a price or mark the equipment non-billable.`);
  if (billing) advisories.push(...billing.warnings);

  return {
    programId: program.id,
    rateCentsPerHour: rate.cents,
    rateSource: rate.source,
    estimate,
    recurring,
    initial,
    equipment: { lines, totalCents: equipmentTotal, unpriced },
    billing,
    visitsPerYear: vpy,
    contractTotal,
    advisories,
  };
}

export function priceProposal(proposal: Proposal): ProgramPricingResult[] {
  return proposal.programs.map((p) => priceProgram(proposal, p));
}

/**
 * The full set of customer-facing prices that must be preserved through
 * writing/design revisions and approval. Keys are stable identifiers.
 */
export function customerPriceMap(proposal: Proposal): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const r of priceProposal(proposal)) {
    if (r.recurring) out[`${r.programId}:recurring`] = r.recurring.finalCents;
    out[`${r.programId}:initial`] = r.initial.finalCents;
    if (r.billing?.fixedMonthlyCents != null) out[`${r.programId}:monthly`] = r.billing.fixedMonthlyCents;
    for (const l of r.equipment.lines) if (l.unitPriceCents != null) out[`${r.programId}:equip:${l.allocationId}`] = l.unitPriceCents;
  }
  for (const s of proposal.specialtyItems) {
    if (s.priceCents != null) out[`specialty:${s.id}`] = s.priceCents;
    if (s.priceHighCents != null) out[`specialty:${s.id}:high`] = s.priceHighCents;
  }
  for (const sch of proposal.portfolioSchedules) for (const row of sch.rows) if (row.rateCents != null) out[`schedule:${sch.id}:${row.id}`] = row.rateCents;
  return out;
}
