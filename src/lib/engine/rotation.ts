import type { Cents, FrequencySpec } from "../types";
import { roundCents } from "./money";

/**
 * Multifamily rotation planning.
 *
 * rotation per month = ceil(units ÷ cycle months)
 * apartments per visit = ceil(rotation per month ÷ planned visits per month)
 *
 * Planned visits per month uses the guaranteed minimum (weekly = 4, twice monthly = 2)
 * so that the monthly rotation minimum is still met in four-visit months. This mirrors
 * the structure of prior portfolio schedules.
 */
export function plannedVisitsPerMonth(f: FrequencySpec): number {
  switch (f.kind) {
    case "weekly":
      return 4;
    case "biweekly":
      return 2;
    case "twice_monthly":
      return 2;
    case "five_day_weekly":
      return 20;
    case "monthly":
      return 1;
    default:
      return 1;
  }
}

export interface RotationPlan {
  rotationPerMonth: number;
  aptsPerVisit: number;
  visitsPerMonth: number;
  formula: string;
}

export function planRotation(units: number, cycleMonths: number, f: FrequencySpec): RotationPlan {
  const vpm = plannedVisitsPerMonth(f);
  const rot = Math.ceil(units / Math.max(1, cycleMonths));
  const apv = Math.ceil(rot / vpm);
  return {
    rotationPerMonth: rot,
    aptsPerVisit: apv,
    visitsPerMonth: vpm,
    formula: `⌈${units} units ÷ ${cycleMonths} mo⌉ = ${rot}/mo; ⌈${rot} ÷ ${vpm} visits⌉ = ${apv} apts/visit`,
  };
}

/** Rate per visit from a per-apartment rate and an optional per-visit common-area component. */
export function rotationRate(aptsPerVisit: number, perAptCents: Cents, perVisitCommonCents: Cents = 0): Cents {
  return roundCents(aptsPerVisit * perAptCents + perVisitCommonCents);
}
