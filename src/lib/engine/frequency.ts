import type { BillingSpec, Cents, FrequencySpec } from "../types";
import { formatMoney, roundCents } from "./money";

/**
 * Service-frequency logic. Operational frequency (how often the technician visits)
 * is kept separate from billing terms (how the customer is invoiced).
 *
 * Biweekly = every 14 days (26 visits/yr). Twice monthly = two visits per calendar
 * month (24 visits/yr). They are never interchangeable.
 */

export const FREQUENCY_LABELS: Record<FrequencySpec["kind"], string> = {
  one_time: "One-time service",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  twice_monthly: "Twice monthly",
  monthly: "Monthly",
  bimonthly: "Every other month",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual",
  five_day_weekly: "Five days per week",
  seasonal: "Seasonal",
  custom: "Custom interval",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function frequencyLabel(f: FrequencySpec): string {
  if (f.kind === "seasonal") {
    const months = (f.seasonalMonths ?? []).slice().sort((a, b) => a - b);
    const range = months.length ? `${MONTHS_LONG[months[0] - 1]}–${MONTHS_LONG[months[months.length - 1] - 1]}` : "season not set";
    return `Seasonal (${FREQUENCY_LABELS[f.seasonalBase ?? "monthly"].toLowerCase()}, ${range})`;
  }
  if (f.kind === "custom") {
    if (f.customLabel) return f.customLabel;
    if (f.customVisitsPerYear) return `${f.customVisitsPerYear} visits per year`;
    if (f.customIntervalDays) return `Every ${f.customIntervalDays} days`;
  }
  return FREQUENCY_LABELS[f.kind];
}

/** Average visits per year implied by a frequency. Exact for calendar-based cadences. */
export function visitsPerYear(f: FrequencySpec): number {
  switch (f.kind) {
    case "one_time":
      return 1;
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "twice_monthly":
      return 24;
    case "monthly":
      return 12;
    case "bimonthly":
      return 6;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
    case "five_day_weekly":
      return 260;
    case "seasonal": {
      const months = f.seasonalMonths?.length ?? 0;
      const base = f.seasonalBase ?? "monthly";
      const perMonth = base === "weekly" ? 52 / 12 : base === "biweekly" ? 26 / 12 : base === "twice_monthly" ? 2 : 1;
      return months * perMonth;
    }
    case "custom":
      if (f.customVisitsPerYear) return f.customVisitsPerYear;
      if (f.customIntervalDays) return 365 / f.customIntervalDays;
      return 0;
  }
}

/** Count of a weekday (0=Sun) in a month. */
export function weekdayCount(year: number, month1: number, weekday: number): number {
  const days = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) if (new Date(Date.UTC(year, month1 - 1, d)).getUTCDay() === weekday) n++;
  return n;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generate scheduled visit dates from a start date for N months.
 * Weekly service lands on the start date's weekday and therefore produces
 * five visits in some months.
 */
export function generateVisitDates(f: FrequencySpec, startISO: string, months = 12): string[] {
  const start = parseISODate(startISO);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  const out: string[] = [];
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const stepDays = (n: number) => {
    for (let d = start; d < end; d = addDays(d, n)) out.push(toISO(d));
  };
  const monthly = (everyMonths: number, daysOfMonth: number[]) => {
    for (let i = 0; i < months; i += everyMonths) {
      for (const dom of daysOfMonth) {
        const y = start.getUTCFullYear();
        const m = start.getUTCMonth() + i;
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const d = new Date(Date.UTC(y, m, Math.min(dom, last)));
        if (d >= start && d < end) out.push(toISO(d));
      }
    }
  };
  const sd = start.getUTCDate();
  switch (f.kind) {
    case "one_time":
      return [toISO(start)];
    case "weekly":
      stepDays(7);
      break;
    case "biweekly":
      stepDays(14);
      break;
    case "five_day_weekly":
      for (let d = start; d < end; d = addDays(d, 1)) {
        const wd = d.getUTCDay();
        if (wd >= 1 && wd <= 5) out.push(toISO(d));
      }
      break;
    case "twice_monthly": {
      const first = Math.min(sd, 28);
      const second = first <= 14 ? first + 14 : first - 14;
      monthly(1, [first, second].sort((a, b) => a - b));
      // include days earlier in the start month that precede start are filtered above
      break;
    }
    case "monthly":
      monthly(1, [sd]);
      break;
    case "bimonthly":
      monthly(2, [sd]);
      break;
    case "quarterly":
      monthly(3, [sd]);
      break;
    case "semiannual":
      monthly(6, [sd]);
      break;
    case "annual":
      monthly(12, [sd]);
      break;
    case "seasonal": {
      const active = new Set(f.seasonalMonths ?? []);
      const base: FrequencySpec = { kind: f.seasonalBase ?? "monthly" };
      return generateVisitDates(base, startISO, months).filter((iso) => active.has(Number(iso.slice(5, 7))));
    }
    case "custom":
      if (f.customIntervalDays) stepDays(f.customIntervalDays);
      else if (f.customVisitsPerYear) stepDays(Math.max(1, Math.round(365 / f.customVisitsPerYear)));
      break;
  }
  return out.sort();
}

/** Visits per calendar month from a generated schedule, e.g. {"2026-10": 5}. */
export function visitsByMonth(f: FrequencySpec, startISO: string, months = 12): Record<string, number> {
  const res: Record<string, number> = {};
  for (const d of generateVisitDates(f, startISO, months)) {
    const k = d.slice(0, 7);
    res[k] = (res[k] ?? 0) + 1;
  }
  return res;
}

export function monthName(m1: number, long = false) {
  return (long ? MONTHS_LONG : MONTHS)[m1 - 1];
}

export interface BillingPresentation {
  method: BillingSpec["method"];
  customerLabel: string; // e.g. "$150.00 per completed service visit"
  perVisitCents: Cents | null;
  fixedMonthlyCents: Cents | null;
  formula: string | null;
  warnings: string[];
}

/**
 * Converts a per-visit price into the approved billing presentation.
 * Fixed-monthly is only produced when billing method is fixed_monthly AND approved.
 */
export function presentBilling(perVisitCents: Cents, f: FrequencySpec, billing: BillingSpec): BillingPresentation {
  const warnings: string[] = [];
  if (billing.method === "one_time" || f.kind === "one_time") {
    return { method: "one_time", customerLabel: "one-time service", perVisitCents, fixedMonthlyCents: null, formula: null, warnings };
  }
  if (billing.method === "fixed_monthly") {
    const vpy = visitsPerYear(f);
    const monthly = roundCents((perVisitCents * vpy) / 12);
    const formula = `${formatMoney(perVisitCents)} per visit × ${Number.isInteger(vpy) ? vpy : vpy.toFixed(2)} visits/yr ÷ 12 = ${formatMoney(monthly)} per month`;
    if (!billing.fixedMonthlyApproved) {
      warnings.push("Fixed-monthly billing has not been approved. The customer proposal will show per-visit pricing until it is approved.");
      return { method: "per_visit", customerLabel: "per completed service visit", perVisitCents, fixedMonthlyCents: null, formula, warnings };
    }
    if (f.kind === "seasonal") warnings.push("Seasonal schedules billed monthly: confirm whether billing runs only in active months.");
    return { method: "fixed_monthly", customerLabel: "per month", perVisitCents, fixedMonthlyCents: monthly, formula, warnings };
  }
  return { method: "per_visit", customerLabel: "per completed service visit", perVisitCents, fixedMonthlyCents: null, formula: null, warnings };
}
