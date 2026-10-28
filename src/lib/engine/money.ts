import type { Cents } from "../types";

/**
 * Money helpers. All money is integer cents. Conversions from fractional
 * quantities (minutes × rate) round half-up to the nearest cent exactly once,
 * at the point the amount is produced, and that rounding is disclosed in formulas.
 */

export function assertCents(v: number, label = "amount"): Cents {
  if (!Number.isFinite(v) || !Number.isInteger(v)) throw new Error(`${label} must be integer cents, got ${v}`);
  return v;
}

/** Round a non-integer cent value half-up (away from zero for negatives). */
export function roundCents(v: number): Cents {
  // Guard against binary noise such as 34999.999999 before rounding.
  const fixed = Math.round(v * 1e6) / 1e6;
  return fixed >= 0 ? Math.floor(fixed + 0.5) : -Math.floor(-fixed + 0.5);
}

/** Labor value for technician minutes at an hourly rate in cents: minutes ÷ 60 × rate. */
export function laborCents(minutes: number, rateCentsPerHour: Cents): Cents {
  assertCents(rateCentsPerHour, "rate");
  return roundCents((minutes * rateCentsPerHour) / 60);
}

export function dollarsToCents(input: string | number): Cents | null {
  if (typeof input === "number") return Number.isFinite(input) ? roundCents(input * 100) : null;
  const s = input.replace(/[$,\s]/g, "");
  if (!s || !/^-?\d*(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const fracPadded = (frac + "000").slice(0, 3);
  let cents = parseInt(whole || "0", 10) * 100 + parseInt(fracPadded.slice(0, 2), 10);
  if (parseInt(fracPadded[2], 10) >= 5) cents += 1;
  return s.startsWith("-") ? -cents : cents;
}

export function formatMoney(cents: Cents | null | undefined, opts: { showCents?: boolean } = {}): string {
  if (cents === null || cents === undefined) return "—";
  const showCents = opts.showCents ?? true;
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const d = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = showCents ? `${d}.${rem.toString().padStart(2, "0")}` : rem === 0 ? d : `${d}.${rem.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}$${body}`;
}

/** Integer percentage application with half-up rounding (pct may be fractional, e.g. 7.5). */
export function applyPct(cents: Cents, pct: number): Cents {
  return roundCents((cents * pct) / 100);
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((a, b) => a + assertCents(b), 0);
}

export function formatMinutes(min: number): string {
  const r = Math.round(min * 10) / 10;
  if (r < 60) return `${r.toFixed(r % 1 === 0 ? 0 : 1)} min`;
  const h = Math.floor(r / 60);
  const m = Math.round((r - h * 60) * 10) / 10;
  return m === 0 ? `${h} hr` : `${h} hr ${m.toFixed(m % 1 === 0 ? 0 : 1)} min`;
}

export function formatHours(min: number): string {
  return `${(min / 60).toFixed(2)} hr`;
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
