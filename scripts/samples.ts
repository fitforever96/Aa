// Sample proposals used for visual PDF QA and demo data. Not shipped to users.
import { newProposal, allocationFromCatalog, zoneFromPreset, zonePreset, newProgram, treatmentFromPreset, treatmentPreset } from "../src/lib/factories";
import { defaultSettings, SEED_EQUIPMENT, SEED_CAPABILITIES } from "../src/lib/seed";
import { DEFAULT_ASSUMPTIONS, cloneAssumptions } from "../src/lib/engine/assumptions";
import { generateDocument } from "../src/lib/writer/generate";
import type { Proposal } from "../src/lib/types";
import { planRotation, rotationRate } from "../src/lib/engine/rotation";

const version = { id: "asv_demo", effectiveDate: "2026-10-28", createdAt: "2026-10-28", note: "", assumptions: cloneAssumptions(DEFAULT_ASSUMPTIONS) };
export const settings = defaultSettings(version.id);
const eq = (id: string) => SEED_EQUIPMENT.find((e) => e.id === id)!;

export function warehouse(): Proposal {
  const p = newProposal(settings, version);
  p.title = "Distribution Center Rodent Management Program";
  p.subtitle = "Facility proposal";
  p.kind = "industrial";
  p.customer.name = "Midwest Logistics Partners";
  p.customer.contactName = "Dana Whitfield";
  p.customer.contactTitle = "Facilities Manager";
  p.property.name = "Bentonville Distribution Center";
  p.property.address = { line1: "1200 Sample Logistics Way", city: "Bentonville", state: "AR", zip: "72712" };
  p.property.propertyType = "Distribution warehouse";
  p.property.model = "warehouse";
  p.property.squareFeet = 250000;
  p.property.activityLevel = "moderate";
  p.property.conditions = { activity_areas: "Reported activity: loading docks, office entrances.", dock_doors: 24 };
  const pr = p.programs[0];
  pr.name = "Rodent management";
  pr.services = ["rodent"];
  pr.frequency = { kind: "weekly" };
  const tc = allocationFromCatalog(eq("eq_tin_cat"), 50);
  tc.unitPriceCents = 2000; tc.priceSource = "customer_override";
  const st = allocationFromCatalog(eq("eq_exterior_bait_station"), 35);
  st.unitPriceCents = 2800; st.priceSource = "customer_override"; st.reserveQuantity = 4;
  pr.equipment.push(tc, st);
  pr.zones.push(zoneFromPreset(zonePreset("general_area"), 75000), zoneFromPreset(zonePreset("loading_dock"), 24));
  pr.pricing.recurringOverride = { cents: 32500, locked: true, lockedAt: "2026-10-28", note: "" };
  pr.pricing.initialOverride = { cents: 95000, locked: true, lockedAt: "2026-10-28", note: "" };
  const q = newProgram(["consulting"], { kind: "quarterly" }, 1);
  q.name = "Quarterly facility inspection";
  q.zones.push(zoneFromPreset(zonePreset("general_area"), 250000));
  q.pricing.recurringOverride = { cents: 37500, locked: true, lockedAt: "2026-10-28", note: "" };
  q.pricing.initialOverride = { cents: 0, locked: true, lockedAt: null, note: "" };
  p.programs.push(q);
  p.document.coverTagline = "Layered rodent protection built around docks, doors and the routes rodents actually travel.";
  p.document.sections = generateDocument(p, { settings, capabilities: SEED_CAPABILITIES, includeGuarantee: true, includeReporting: true });
  return p;
}

export function portfolio(): Proposal {
  const p = newProposal(settings, version);
  p.title = "Multifamily Precision Protection";
  p.subtitle = "Portfolio proposal";
  p.kind = "portfolio";
  p.customer.name = "Sample Residential Group";
  p.property.name = "Sample Residential portfolio";
  p.property.model = "multifamily";
  p.programs[0].name = "Market communities — weekly";
  p.programs[0].services = ["general_pest", "german_cockroach", "ant", "rodent"];
  p.programs[0].frequency = { kind: "weekly" };
  p.programs[0].apartmentsPerVisit = 8;
  p.programs[0].pricing.recurringOverride = { cents: 14800, locked: true, lockedAt: null, note: "" };
  p.programs[0].pricing.initialOverride = { cents: 0, locked: true, lockedAt: null, note: "" };
  const names = ["Azure Commons", "Brookstone Flats", "Cedar Park Lofts", "Delmar Terrace", "Elm Station", "Fairview Heights", "Granite Ridge", "Harbor Point", "Ivy Green", "Juniper Court", "Kingston Place", "Laurel Row", "Maple Yard", "North Gate", "Oakview", "Pine Hollow", "Quarry Lane", "Riverside Walk", "Stonebridge", "Timber Creek", "Union Square Lofts", "Vista Grande"];
  p.portfolioSchedules = [
    { id: "s1", code: "A1", title: "Market | Weekly", subtitle: "Annual apartment rotation · common-area service included", frequency: { kind: "weekly" }, rateLabel: "Rate / visit", rows: names.map((n, i) => { const units = 300 + ((i * 37) % 100); const pl = planRotation(units, 12, { kind: "weekly" }); return { id: `r${i}`, name: n, address: `${100 + i * 11} Sample Street, Austin, TX 787${10 + i}`, metro: i % 3 ? "Austin" : "Dallas", units, rotationPerMonth: pl.rotationPerMonth, aptsPerVisit: pl.aptsPerVisit, rateCents: rotationRate(pl.aptsPerVisit, 1600, 2000), notes: "" }; }) },
  ];
  p.specialtyItems = [
    { id: "x1", name: "Cockroach cleanout", description: "Intensive crack-and-crevice treatment in an affected apartment; separate from routine cockroach control.", priceCents: 35000, priceHighCents: null, basis: "per unit", qualifier: "", source: "historical_reference", approved: true },
    { id: "x2", name: "Bed bug chemical · 1 bedroom", description: "Chemical treatment of one active apartment; preparation and access coordinated with management.", priceCents: 40000, priceHighCents: null, basis: "per unit", qualifier: "", source: "historical_reference", approved: true },
    { id: "x3", name: "Stinging insect nest", description: "Treatment/removal of an accessible nest on a structure, up to 5 ft.", priceCents: 10000, priceHighCents: 20000, basis: "per nest", qualifier: "", source: "historical_reference", approved: true },
  ];
  p.document.coverStyle = "corporate_white";
  p.document.coverTagline = "A stronger standard of pest management for every community.";
  p.document.sections = generateDocument(p, { settings, capabilities: SEED_CAPABILITIES, includeGuarantee: false, includeReporting: false });
  return p;
}

export function restaurant(): Proposal {
  const p = newProposal(settings, version);
  p.title = "Food Service Pest Management Program";
  p.kind = "small_commercial";
  p.customer.name = "Sample Bistro Group";
  p.customer.contactName = "Chris Morgan";
  p.property.name = "Sample Bistro — Downtown";
  p.property.address = { line1: "45 Sample Ave", city: "Fayetteville", state: "AR", zip: "72701" };
  p.property.model = "restaurant";
  p.property.squareFeet = 6500;
  const pr = p.programs[0];
  pr.name = "Food service program";
  pr.services = ["general_pest", "german_cockroach", "fly"];
  pr.frequency = { kind: "twice_monthly" };
  pr.zones.push(zoneFromPreset(zonePreset("kitchen"), 1), zoneFromPreset(zonePreset("dumpster_area"), 1));
  pr.treatments.push(treatmentFromPreset(treatmentPreset("gel_bait_kitchen"), 1), treatmentFromPreset(treatmentPreset("drain_treatment"), 6));
  p.document.coverStyle = "property_showcase";
  p.document.sections = generateDocument(p, { settings, capabilities: SEED_CAPABILITIES, includeGuarantee: false, includeReporting: false });
  return p;
}
