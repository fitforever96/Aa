import { describe, it, expect } from "vitest";
import { extractFromText } from "@/lib/import/extract";
import { proposalFromExtraction, historicalFromExtraction } from "@/lib/import/apply";
import { priceProgram } from "@/lib/engine/pricing";
import { SEED_EQUIPMENT, SEED_CAPABILITIES } from "@/lib/seed";
import { settings, version } from "./helpers";

const SOURCE = `Prepared for: Hyundai Regional Office
Site: 4500 Sample Parkway, Fountain Valley, CA 92708
Attention: Jordan Lee
Weekly service will be performed on a weekly basis and billed per completed visit.
The program includes 24 Tin Cats and 12 exterior bait stations at $28.00 each.
Initial service: $450.00 (discounted)
Recurring weekly service: $150.00 per visit
Bed bug treatment is excluded and quoted separately with written authorization.
The customer shall maintain door sweeps and provide access to service areas.`;

const ctx = { settings, version, catalog: SEED_EQUIPMENT, capabilities: SEED_CAPABILITIES, fileName: "hyundai.pdf", docId: null, fullText: SOURCE };

describe("Source document import", () => {
  it("extracts customer, address, frequency, equipment, charges, exclusions — all unconfirmed", () => {
    const x = extractFromText(SOURCE, "pdf_text");
    expect(x.customer?.value).toMatch(/Hyundai/);
    expect(x.address?.value).toMatch(/Fountain Valley, CA 92708/);
    expect(x.frequencies.map((f) => f.value)).toContain("Weekly");
    expect(x.equipment.some((e) => /tin cat/i.test(e.value.name) && e.value.quantity === 24)).toBe(true);
    const cents = x.charges.map((c) => c.value.cents);
    expect(cents).toEqual(expect.arrayContaining([45000, 15000]));
    expect(x.exclusions.length).toBeGreaterThan(0);
    const all = [x.customer, x.address, ...x.frequencies, ...x.equipment, ...x.charges, ...x.exclusions];
    expect(all.every((i) => i && i.confirmed === false)).toBe(true);
  });

  it("unconfirmed items are never applied", () => {
    const p = proposalFromExtraction(extractFromText(SOURCE, "pdf_text"), "redesign", ctx);
    expect(p.customer.name).toBe("");
    expect(p.programs[0].pricing.recurringOverride).toBeNull();
  });

  it("redesign preserves confirmed prices as locked overrides", () => {
    const x = extractFromText(SOURCE, "pdf_text");
    for (const k of ["customer", "address"] as const) x[k]!.confirmed = true;
    x.frequencies.forEach((f) => (f.confirmed = true));
    x.equipment.forEach((e) => (e.confirmed = true));
    x.charges.filter((c) => c.value.cents === 45000 || c.value.cents === 15000).forEach((c) => (c.confirmed = true));
    x.exclusions.forEach((e) => (e.confirmed = true));
    const p = proposalFromExtraction(x, "redesign", ctx);
    expect(p.customer.name).toMatch(/Hyundai/);
    expect(p.property.address.zip).toBe("92708");
    const r = priceProgram(p, p.programs[0]);
    expect(r.recurring!.finalCents).toBe(15000);
    expect(r.recurring!.locked).toBe(true);
    expect(r.initial.finalCents).toBe(45000);
    expect(p.document.sections.find((s) => s.type === "exclusions")!.body).toMatch(/Bed bug/);
  });

  it("template mode drops customer, prices and quantities", () => {
    const x = extractFromText(SOURCE, "pdf_text");
    [x.customer!, ...x.charges, ...x.equipment].forEach((i) => (i.confirmed = true));
    const p = proposalFromExtraction(x, "template", ctx);
    expect(p.customer.name).toBe("");
    expect(p.programs[0].pricing.recurringOverride).toBeNull();
    expect(p.programs[0].equipment.every((e) => e.quantity === 0)).toBe(true);
  });

  it("historical import is labeled unverified and customer-specific", () => {
    const x = extractFromText(SOURCE, "pdf_text");
    x.charges.forEach((c) => (c.confirmed = true));
    const rows = historicalFromExtraction(x, "hyundai.pdf", "Hyundai");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "unverified_extracted")).toBe(true);
  });
});
