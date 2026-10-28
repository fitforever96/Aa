import type { EquipmentItem, FrequencySpec, PropertyModel, Proposal, ProposalKind, ServiceCategory } from "./types";
import { allocationFromCatalog, kindForModel, suggestZones, treatmentFromPreset, treatmentPreset, zoneFromPreset, zonePreset } from "./factories";
import type { IntakeExtraction } from "./commands/parse";
import { CONFIRMED_DEVICE_IDS } from "./engine/catalogIds";
import { SERVICE_LABELS } from "./engine/assumptions";

export interface StarterTemplate {
  key: string;
  name: string;
  description: string;
  kind: ProposalKind;
  model: PropertyModel;
  services: ServiceCategory[];
  frequency: FrequencySpec;
  title: string;
  equipment?: { id: string; qty: number }[];
  treatments?: { key: string; qty: number; phase?: "initial" | "recurring" | "both" }[];
  zones?: { key: string; qty: number }[];
  apartmentsPerVisit?: number;
  contractTotals?: boolean;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { key: "blank", name: "Blank commercial proposal", description: "Start from scratch — any industry.", kind: "small_commercial", model: "medium_commercial", services: ["general_pest"], frequency: { kind: "monthly" }, title: "Commercial Pest Management Proposal" },
  { key: "office_rodent", name: "Office mouse program", description: "Tin Cats + exterior stations, weekly.", kind: "small_commercial", model: "small_office", services: ["rodent"], frequency: { kind: "weekly" }, title: "Office Rodent Protection Program", equipment: [{ id: CONFIRMED_DEVICE_IDS.tinCat, qty: 0 }, { id: CONFIRMED_DEVICE_IDS.baitStation, qty: 0 }] },
  { key: "warehouse_rodent", name: "Warehouse / distribution rodent", description: "Dock-focused interior + perimeter program.", kind: "industrial", model: "warehouse", services: ["rodent"], frequency: { kind: "weekly" }, title: "Distribution Center Rodent Management Program", equipment: [{ id: CONFIRMED_DEVICE_IDS.tinCat, qty: 0 }, { id: CONFIRMED_DEVICE_IDS.baitStation, qty: 0 }], zones: [{ key: "loading_dock", qty: 0 }] },
  { key: "industrial", name: "Industrial facility program", description: "Large footprint, multiple buildings, audit-ready.", kind: "industrial", model: "large_industrial", services: ["rodent", "general_pest"], frequency: { kind: "weekly" }, title: "Industrial Facility Pest Management Agreement", equipment: [{ id: CONFIRMED_DEVICE_IDS.tinCat, qty: 0 }, { id: CONFIRMED_DEVICE_IDS.baitStation, qty: 0 }] },
  { key: "multifamily", name: "Multifamily apartment rotation", description: "Rotation by apartments per visit + common areas.", kind: "multifamily_rotation", model: "multifamily", services: ["general_pest", "german_cockroach"], frequency: { kind: "weekly" }, title: "Multifamily Precision Protection", apartmentsPerVisit: 8, zones: [{ key: "common_area", qty: 3 }] },
  { key: "gcr_intensive", name: "German cockroach intensive", description: "Initial cleanout + every-two-weeks follow-up.", kind: "intensive_treatment", model: "multifamily", services: ["german_cockroach"], frequency: { kind: "biweekly" }, title: "German Cockroach Intensive Treatment Program", treatments: [{ key: "cleanout_apartment", qty: 0, phase: "initial" }, { key: "gel_bait_apartment", qty: 0, phase: "both" }] },
  { key: "restaurant", name: "Restaurant / food service", description: "General pest + flies, twice monthly.", kind: "small_commercial", model: "restaurant", services: ["general_pest", "german_cockroach", "fly"], frequency: { kind: "twice_monthly" }, title: "Food Service Pest Management Program", zones: [{ key: "kitchen", qty: 1 }, { key: "dumpster_area", qty: 1 }], treatments: [{ key: "gel_bait_kitchen", qty: 1 }, { key: "drain_treatment", qty: 4 }] },
  { key: "small_fly", name: "Small-fly program", description: "Drain-focused, every 14 days.", kind: "intensive_treatment", model: "restaurant", services: ["fly", "drain"], frequency: { kind: "custom", customIntervalDays: 14, customLabel: "Every 14 days" }, title: "Small Fly Reduction Program", treatments: [{ key: "drain_treatment", qty: 6 }] },
  { key: "seasonal_ant", name: "Seasonal exterior ant", description: "April–October exterior program.", kind: "small_commercial", model: "exterior_only", services: ["ant", "exterior_pest"], frequency: { kind: "seasonal", seasonalMonths: [4, 5, 6, 7, 8, 9, 10], seasonalBase: "monthly" }, title: "Seasonal Exterior Ant Program", treatments: [{ key: "perimeter_treatment", qty: 0 }] },
  { key: "government", name: "Government bid response", description: "Formal scope, documentation, contract-period totals.", kind: "government", model: "government", services: ["general_pest", "rodent"], frequency: { kind: "monthly" }, title: "Integrated Pest Management Services — Bid Response", contractTotals: true, equipment: [{ id: CONFIRMED_DEVICE_IDS.tinCat, qty: 0 }, { id: CONFIRMED_DEVICE_IDS.baitStation, qty: 0 }] },
  { key: "healthcare", name: "Hospital / senior living", description: "Sensitive environments, documented service.", kind: "small_commercial", model: "healthcare", services: ["general_pest", "rodent", "fly"], frequency: { kind: "monthly" }, title: "Healthcare Pest Management Program" },
  { key: "portfolio", name: "Multi-property portfolio", description: "Schedules of properties with per-visit rates.", kind: "portfolio", model: "multifamily", services: ["general_pest", "german_cockroach"], frequency: { kind: "weekly" }, title: "Portfolio Pest Management Proposal" },
  { key: "specialty", name: "Specialty treatment project", description: "Bed bug, canine, heat or cleanout — one-time.", kind: "intensive_treatment", model: "specialty", services: ["bed_bug"], frequency: { kind: "one_time" }, title: "Specialty Treatment Proposal" },
];

export function applyTemplate(p: Proposal, t: StarterTemplate, catalog: EquipmentItem[]) {
  p.kind = t.kind;
  p.title = t.title;
  p.templateUsed = t.key;
  p.property.model = t.model;
  const prog = p.programs[0];
  prog.services = [...t.services];
  prog.frequency = t.frequency;
  prog.chargeType = t.frequency.kind === "one_time" ? "one_time" : "recurring";
  prog.billing.method = t.frequency.kind === "one_time" ? "one_time" : "per_visit";
  prog.name = t.services.length === 1 ? SERVICE_LABELS[t.services[0]] : "Recurring service program";
  if (t.apartmentsPerVisit) prog.apartmentsPerVisit = t.apartmentsPerVisit;
  for (const e of t.equipment ?? []) {
    const item = catalog.find((c) => c.id === e.id);
    if (item) prog.equipment.push(allocationFromCatalog(item, e.qty));
  }
  for (const z of t.zones ?? []) prog.zones.push(zoneFromPreset(zonePreset(z.key), z.qty));
  for (const tr of t.treatments ?? []) prog.treatments.push(treatmentFromPreset(treatmentPreset(tr.key), tr.qty, tr.phase));
  if (t.contractTotals) p.document.options.showContractTotals = true;
}

/** Populate a proposal from a dictated or typed description. Only stated facts are applied. */
export function applyIntake(p: Proposal, x: IntakeExtraction, catalog: EquipmentItem[]) {
  if (x.propertyName) {
    p.property.name = p.property.name || x.propertyName;
    p.customer.name = p.customer.name || x.propertyName;
  }
  if (x.model) {
    p.property.model = x.model;
    p.kind = kindForModel(x.model);
  }
  if (x.propertyType) p.property.propertyType = x.propertyType.replace(/^\w/, (c) => c.toUpperCase());
  if (x.squareFeet) p.property.squareFeet = x.squareFeet;
  if (x.buildings) p.property.buildingCount = x.buildings;
  if (x.floors) p.property.floorCount = x.floors;
  if (x.apartments) p.property.apartmentCount = x.apartments;
  if (x.activityLevel) p.property.activityLevel = x.activityLevel;
  const prog = p.programs[0];
  if (x.services.length) {
    prog.services = [...new Set(x.services)];
    prog.name = prog.services.length === 1 ? SERVICE_LABELS[prog.services[0]] : "Recurring service program";
  }
  if (x.frequency) {
    prog.frequency = x.frequency;
    prog.chargeType = x.frequency.kind === "one_time" ? "one_time" : "recurring";
  }
  if (x.technicians) prog.technicians = x.technicians;
  if (x.apartmentsPerVisit) prog.apartmentsPerVisit = x.apartmentsPerVisit;
  const setQty = (id: string, q: number | null) => {
    if (q == null) return;
    const ex = prog.equipment.find((e) => e.catalogItemId === id);
    if (ex) ex.quantity = q;
    else {
      const item = catalog.find((c) => c.id === id);
      if (item) prog.equipment.push(allocationFromCatalog(item, q));
    }
  };
  setQty(CONFIRMED_DEVICE_IDS.tinCat, x.tinCats);
  setQty(CONFIRMED_DEVICE_IDS.baitStation, x.exteriorStations);
  if (x.activityAreas.length) {
    p.property.conditions["activity_areas"] = `Reported activity: ${x.activityAreas.join(", ")}.`;
    if (x.activityAreas.some((a) => a.includes("dock")) && !prog.zones.some((z) => z.zoneType === "loading_dock")) prog.zones.push(zoneFromPreset(zonePreset("loading_dock"), 0));
  }
  if (!prog.zones.some((z) => z.zoneType === "general_area") && p.property.squareFeet) {
    const sug = suggestZones(p.property, prog.services).filter((z) => !prog.zones.some((e) => e.zoneType === z.zoneType));
    prog.zones.push(...sug);
  }
}
