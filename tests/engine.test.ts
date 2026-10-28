import { describe, it, expect } from "vitest";
import { deviceOnlyMinutes, estimateProgram } from "@/lib/engine/estimator";
import { laborCents, formatMoney, dollarsToCents, roundCents, applyPct } from "@/lib/engine/money";
import { priceProgram, customerPriceMap } from "@/lib/engine/pricing";
import { visitsPerYear, generateVisitDates, visitsByMonth, presentBilling, weekdayCount } from "@/lib/engine/frequency";
import { planRotation, rotationRate } from "@/lib/engine/rotation";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { deviceProgram, proposalWith, version } from "./helpers";

const A = DEFAULT_ASSUMPTIONS;
const RATE = A.laborRateCentsPerHour;

describe("Confirmed equipment labor (equipment only)", () => {
  it("default rate is $210/hr = $3.50/min", () => {
    expect(RATE).toBe(21000);
    expect(laborCents(1, RATE)).toBe(350);
  });
  it("Test A: 10 Tin Cats = 10 min = $35", () => {
    const m = deviceOnlyMinutes(deviceProgram(10, 0).equipment, A);
    expect(m).toBe(10);
    expect(laborCents(m, RATE)).toBe(3500);
  });
  it("Test B: 20 exterior bait stations = 40 min = $140", () => {
    const m = deviceOnlyMinutes(deviceProgram(0, 20).equipment, A);
    expect(m).toBe(40);
    expect(laborCents(m, RATE)).toBe(14000);
  });
  it("Test C: 40 Tin Cats + 30 stations = 100 min = $350", () => {
    const m = deviceOnlyMinutes(deviceProgram(40, 30).equipment, A);
    expect(m).toBe(100);
    expect(laborCents(m, RATE)).toBe(35000);
  });
  it("Test D: 104 Tin Cats + 72 stations = 248 min = $868", () => {
    const m = deviceOnlyMinutes(deviceProgram(104, 72).equipment, A);
    expect(m).toBe(248);
    expect(laborCents(m, RATE)).toBe(86800);
  });
  it("estimator device-servicing component equals the confirmed device minutes", () => {
    const p = proposalWith(deviceProgram(50, 40));
    const e = estimateProgram(p.property, p.programs[0], p.assumptions);
    expect(e.deviceServicing.minutes).toBe(130);
    expect(e.recurring.byComponent.devices).toBe(130);
    expect(e.deviceServicing.lines.every((l) => l.provenance === "confirmed")).toBe(true);
  });
  it("full-service estimate adds fieldwork beyond device minutes", () => {
    const p = proposalWith(deviceProgram(50, 40));
    p.property.squareFeet = 120000;
    p.property.model = "warehouse";
    const e = estimateProgram(p.property, p.programs[0], p.assumptions);
    expect(e.recurring.technicianMinutes).toBeGreaterThan(130);
    expect(e.recurring.byComponent.walking).toBeGreaterThan(0);
    expect(e.recurring.byComponent.documentation).toBeGreaterThan(0);
  });
  it("activity, access and calibration never change confirmed device minutes", () => {
    const p = proposalWith(deviceProgram(40, 30));
    p.property.activityLevel = "severe";
    p.property.accessLevel = "restricted";
    p.property.complexity.complexPlacement = true;
    p.assumptions.calibration.medium_commercial = { factor: 1.4, approvedAt: "2026-10-28", basis: "test" };
    const e = estimateProgram(p.property, p.programs[0], p.assumptions);
    expect(e.deviceServicing.minutes).toBe(100);
  });
});

describe("Property-size sensitivity", () => {
  it("10 Tin Cats in a 3,000 sq ft office vs a 650,000 sq ft multi-building industrial site", () => {
    const small = proposalWith(deviceProgram(10, 0));
    small.property.model = "small_office";
    small.property.squareFeet = 3000;
    const big = proposalWith(deviceProgram(10, 0));
    big.property.model = "large_industrial";
    big.property.squareFeet = 650000;
    big.property.buildingCount = 3;
    const es = estimateProgram(small.property, small.programs[0], small.assumptions);
    const eb = estimateProgram(big.property, big.programs[0], big.assumptions);
    expect(es.deviceServicing.minutes).toBe(eb.deviceServicing.minutes);
    expect(eb.recurring.byComponent.walking).toBeGreaterThan(es.recurring.byComponent.walking * 5);
  });
  it("multifamily labor is driven by apartments per visit, not total square footage", () => {
    const a = proposalWith(deviceProgram(0, 0));
    a.property.model = "multifamily";
    a.programs[0].apartmentsPerVisit = 8;
    a.property.squareFeet = 300000;
    const b = structuredClone(a);
    b.property.squareFeet = 600000;
    const ea = estimateProgram(a.property, a.programs[0], a.assumptions);
    const eb = estimateProgram(b.property, b.programs[0], b.assumptions);
    expect(ea.recurring.byComponent.inspection).toBe(eb.recurring.byComponent.inspection);
  });
});

describe("Multiple technicians", () => {
  it("distinguishes technician-hours from elapsed time and does not simply halve", () => {
    const p = proposalWith(deviceProgram(104, 72));
    p.property.squareFeet = 400000;
    p.property.model = "large_industrial";
    const one = estimateProgram(p.property, p.programs[0], p.assumptions);
    p.programs[0].technicians = 2;
    const two = estimateProgram(p.property, p.programs[0], p.assumptions);
    expect(two.recurring.technicianMinutes).toBeGreaterThanOrEqual(one.recurring.technicianMinutes);
    expect(two.recurring.elapsedMinutes).toBeLessThan(one.recurring.elapsedMinutes);
    expect(two.recurring.elapsedMinutes).toBeGreaterThan(one.recurring.elapsedMinutes / 2);
    const r = priceProgram(p, p.programs[0]);
    expect(r.recurring!.calculatedCents).toBe(laborCents(two.recurring.technicianMinutes, RATE));
  });
});

describe("Pricing engine", () => {
  it("labor and equipment are separate; equipment price updates flow through", () => {
    const p = proposalWith(deviceProgram(40, 30));
    let r = priceProgram(p, p.programs[0]);
    expect(r.equipment.unpriced.length).toBe(2);
    p.programs[0].equipment[0].unitPriceCents = 2000;
    p.programs[0].equipment[1].unitPriceCents = 2800;
    r = priceProgram(p, p.programs[0]);
    expect(r.equipment.totalCents).toBe(40 * 2000 + 30 * 2800);
    expect(r.recurring!.components.every((c) => c.kind !== "line")).toBe(true);
    p.programs[0].equipment[0].unitPriceCents = 2200;
    expect(priceProgram(p, p.programs[0]).equipment.totalCents).toBe(40 * 2200 + 30 * 2800);
  });
  it("initial and recurring are calculated separately", () => {
    const p = proposalWith(deviceProgram(40, 30));
    p.property.squareFeet = 50000;
    const r = priceProgram(p, p.programs[0]);
    expect(r.initial.technicianMinutes).not.toBe(r.recurring!.technicianMinutes);
    expect(r.initial.components[0].label).toMatch(/Initial/);
  });
  it("no automatic minimum, markup or discount", () => {
    const p = proposalWith(deviceProgram(10, 0));
    p.assumptions.minimumCharge = { enabled: true, cents: 50000 };
    const r = priceProgram(p, p.programs[0]);
    expect(r.recurring!.components.some((c) => c.kind === "adjustment")).toBe(false);
    p.programs[0].pricing.applyMinimumCharge = true;
    const r2 = priceProgram(p, p.programs[0]);
    expect(r2.recurring!.finalCents).toBe(50000);
  });
  it("override persists and calculation keeps running; yield + advisory shown", () => {
    const p = proposalWith(deviceProgram(104, 72));
    p.property.squareFeet = 400000;
    p.property.model = "large_industrial";
    p.programs[0].pricing.recurringOverride = { cents: 75000, locked: true, lockedAt: "2026-10-28", note: "" };
    const r = priceProgram(p, p.programs[0]);
    expect(r.recurring!.finalCents).toBe(75000);
    expect(r.recurring!.calculatedCents).toBeGreaterThan(0);
    expect(r.recurring!.differenceCents).toBe(75000 - r.recurring!.calculatedCents);
    expect(r.recurring!.effectiveHourlyYieldCents).toBe(Math.round((75000 * 60) / r.recurring!.technicianMinutes));
    // change scope: calculated changes, locked final does not
    p.programs[0].equipment[0].quantity = 200;
    const r2 = priceProgram(p, p.programs[0]);
    expect(r2.recurring!.finalCents).toBe(75000);
    expect(r2.recurring!.calculatedCents).toBeGreaterThan(r.recurring!.calculatedCents);
    expect(r2.advisories.some((a) => /below your \$210\.00\/hr target/.test(a))).toBe(true);
  });
  it("rate snapshot: changing defaults does not reprice an existing proposal", () => {
    const p = proposalWith(deviceProgram(40, 30));
    const before = priceProgram(p, p.programs[0]).recurring!.calculatedCents;
    version.assumptions.laborRateCentsPerHour = 25000; // global default changes
    const after = priceProgram(p, p.programs[0]).recurring!.calculatedCents;
    version.assumptions.laborRateCentsPerHour = 21000;
    expect(after).toBe(before);
  });
  it("customer and proposal rate overrides", () => {
    const p = proposalWith(deviceProgram(60, 0));
    p.customer.laborRateOverrideCents = 18000;
    expect(priceProgram(p, p.programs[0]).rateSource).toBe("customer_override");
    p.laborRateOverrideCents = 24000;
    const r = priceProgram(p, p.programs[0]);
    expect(r.rateSource).toBe("proposal_override");
    expect(r.rateCentsPerHour).toBe(24000);
  });
  it("no annualized contract totals unless explicitly enabled", () => {
    const p = proposalWith(deviceProgram(40, 30));
    expect(priceProgram(p, p.programs[0]).contractTotal).toBeNull();
    p.document.options.showContractTotals = true;
    p.document.options.contractMonths = 12;
    const r = priceProgram(p, p.programs[0]);
    expect(r.contractTotal!.visits).toBe(52);
  });
});

describe("Currency precision", () => {
  it("integer-cent rounding without float drift", () => {
    expect(laborCents(0.1 * 3, RATE)).toBe(105);
    expect(roundCents(34999.9999999)).toBe(35000);
    expect(dollarsToCents("$1,683.00")).toBe(168300);
    expect(dollarsToCents("0.1")).toBe(10);
    expect(dollarsToCents("19.995")).toBe(2000);
    expect(formatMoney(86800)).toBe("$868.00");
    expect(formatMoney(-1234)).toBe("-$12.34");
    expect(applyPct(10000, 7.5)).toBe(750);
    let total = 0;
    for (let i = 0; i < 1000; i++) total += laborCents(1 / 3, RATE);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe("Frequency & billing", () => {
  it("weekly vs every-two-weeks vs twice-monthly are distinct", () => {
    expect(visitsPerYear({ kind: "weekly" })).toBe(52);
    expect(visitsPerYear({ kind: "biweekly" })).toBe(26);
    expect(visitsPerYear({ kind: "twice_monthly" })).toBe(24);
    expect(visitsPerYear({ kind: "five_day_weekly" })).toBe(260);
  });
  it("weekly service produces five visits in some months", () => {
    const by = visitsByMonth({ kind: "weekly" }, "2026-10-01", 12);
    expect(Object.values(by).some((n) => n === 5)).toBe(true);
    expect(Object.values(by).every((n) => n === 4 || n === 5)).toBe(true);
    expect(weekdayCount(2026, 10, 4)).toBe(5); // Thursdays in Oct 2026
  });
  it("twice monthly always produces exactly two visits per full month", () => {
    const by = visitsByMonth({ kind: "twice_monthly" }, "2026-01-05", 12);
    expect(Object.values(by).every((n) => n === 2)).toBe(true);
  });
  it("seasonal schedule only visits in active months", () => {
    const d = generateVisitDates({ kind: "seasonal", seasonalMonths: [4, 5, 6, 7, 8, 9, 10], seasonalBase: "monthly" }, "2027-01-15", 12);
    expect(d.length).toBe(7);
    expect(d.every((x) => { const m = Number(x.slice(5, 7)); return m >= 4 && m <= 10; })).toBe(true);
  });
  it("per-visit billing is not converted into a fixed monthly price", () => {
    const b = presentBilling(15000, { kind: "weekly" }, { method: "per_visit", fixedMonthlyApproved: false, terms: "" });
    expect(b.fixedMonthlyCents).toBeNull();
  });
  it("fixed monthly only when approved; uses actual visits/yr", () => {
    const pending = presentBilling(15000, { kind: "weekly" }, { method: "fixed_monthly", fixedMonthlyApproved: false, terms: "" });
    expect(pending.fixedMonthlyCents).toBeNull();
    const ok = presentBilling(15000, { kind: "weekly" }, { method: "fixed_monthly", fixedMonthlyApproved: true, terms: "" });
    expect(ok.fixedMonthlyCents).toBe(65000);
    const tm = presentBilling(15000, { kind: "twice_monthly" }, { method: "fixed_monthly", fixedMonthlyApproved: true, terms: "" });
    expect(tm.fixedMonthlyCents).toBe(30000);
  });
});

describe("Multifamily rotation", () => {
  it("reproduces NRP schedule structure", () => {
    expect(planRotation(340, 12, { kind: "weekly" })).toMatchObject({ rotationPerMonth: 29, aptsPerVisit: 8 });
    expect(planRotation(299, 12, { kind: "twice_monthly" })).toMatchObject({ rotationPerMonth: 25, aptsPerVisit: 13 });
    expect(planRotation(202, 3, { kind: "weekly" })).toMatchObject({ rotationPerMonth: 68, aptsPerVisit: 17 });
    expect(rotationRate(17, 1600)).toBe(27200);
    expect(rotationRate(8, 1600, 2000)).toBe(14800);
  });
});

describe("Customer price map", () => {
  it("captures final prices for approval snapshots", () => {
    const p = proposalWith(deviceProgram(40, 30));
    p.programs[0].pricing.recurringOverride = { cents: 15000, locked: true, lockedAt: null, note: "" };
    const m = customerPriceMap(p);
    expect(m[`${p.programs[0].id}:recurring`]).toBe(15000);
  });
});
