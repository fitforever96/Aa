import type { FrequencySpec, PropertyInfo, ServiceCategory, ServiceProgram, ServiceRecommendation, TreatmentActivity } from "../types";
import { SERVICE_LABELS } from "./assumptions";
import { frequencyLabel } from "./frequency";
import { nowISO } from "../ids";
import { treatmentFromPreset, treatmentPreset } from "../factories";

/**
 * Rules-based service-design assistant. Always available offline. Separates
 * confirmed information, assumptions, recommendations and field-verification items.
 * Recommendations are suggestions only — nothing is applied without user action.
 */

export interface RecommendationDetail extends ServiceRecommendation {
  suggestedFrequency: FrequencySpec | null;
  suggestedTreatments: TreatmentActivity[];
  suggestedDevices: { catalogItemId: string; quantity: number; rationale: string }[];
}

export function recommendProgram(property: PropertyInfo, program: ServiceProgram): RecommendationDetail {
  const confirmed: string[] = [];
  const assumptions: string[] = [];
  const recommended: string[] = [];
  const verify: string[] = [];
  const treatments: TreatmentActivity[] = [];
  const devices: RecommendationDetail["suggestedDevices"] = [];
  let freq: FrequencySpec | null = null;
  const sv = new Set<ServiceCategory>(program.services);
  const sq = property.squareFeet ?? 0;
  const c = property.conditions;

  if (property.name) confirmed.push(`Property: ${property.name}${property.propertyType ? ` (${property.propertyType})` : ""}.`);
  if (property.squareFeet) confirmed.push(`Approximate size: ${property.squareFeet.toLocaleString()} sq ft, ${property.buildingCount} building(s), ${property.floorCount} floor(s).`);
  else assumptions.push("Square footage not provided — walking and inspection time use device-based allowances.");
  if (property.apartmentCount) confirmed.push(`${property.apartmentCount.toLocaleString()} apartment homes.`);
  for (const e of program.equipment) confirmed.push(`${e.quantity} × ${e.name} entered.`);
  if (program.services.length) confirmed.push(`Selected services: ${program.services.map((s) => SERVICE_LABELS[s]).join(", ")}.`);
  confirmed.push(`Selected frequency: ${frequencyLabel(program.frequency)}.`);
  if (property.activityLevel !== "none" && property.activityLevel !== "low") confirmed.push(`Reported activity level: ${property.activityLevel}.`);

  if (sv.has("rodent") || sv.has("exterior_baiting") || sv.has("interior_trapping")) {
    const ext = program.equipment.filter((e) => e.location === "exterior").reduce((s, e) => s + e.quantity, 0);
    const int = program.equipment.filter((e) => e.location === "interior").reduce((s, e) => s + e.quantity, 0);
    if (!ext && property.model !== "multifamily") {
      const perim = property.perimeterFt ?? (sq ? 4 * Math.sqrt(sq / Math.max(1, property.floorCount) / Math.max(1, property.buildingCount)) * Math.max(1, property.buildingCount) : 0);
      if (perim) {
        const q = Math.max(4, Math.ceil(perim / 75));
        devices.push({ catalogItemId: "eq_exterior_bait_station", quantity: q, rationale: `≈${Math.round(perim).toLocaleString()} ft perimeter at ~75 ft average spacing (planning assumption; adjust to label requirements, doors and site layout).` });
      }
      recommended.push("Exterior perimeter stations to intercept rodent pressure before it reaches the building.");
    }
    if (!int && sq) {
      const doorAllowance = Number(c["dock_doors"] ?? 0) * 2;
      const q = Math.max(6, Math.ceil((sq * (property.interiorCoverage ?? 0.3)) / 2500) + doorAllowance);
      devices.push({ catalogItemId: "eq_tin_cat", quantity: q, rationale: `Interior Tin Cats at entry points, wall lines and risk areas (${doorAllowance ? `${doorAllowance} for dock doors + ` : ""}density planning assumption).` });
    }
    recommended.push("Interior monitoring and capture at entry doors, dock doors, utility penetrations and break areas.");
    recommended.push("Initial entry-point and exclusion assessment with written recommendations (exclusion work quoted separately).");
    if (property.activityLevel === "high" || property.activityLevel === "severe") {
      freq = { kind: "weekly" };
      recommended.push("Weekly service until activity trends down, followed by a documented review before reducing frequency.");
    }
    if (property.model === "warehouse" || property.model === "large_industrial") {
      recommended.push("Device placement along dock doors, both sides of exterior doors and interior wall lines; rack-line monitoring where product is stored.");
      verify.push("Dock seals, leveler pits and door sweeps.");
    }
    verify.push("Rodent species identification (mouse vs. rat) — determines device type and spacing.", "Entry points and structural deficiencies.", "Device placement against current product labels.");
  }

  if (sv.has("german_cockroach")) {
    const affected = Number(c["affected_units"] ?? 0) || program.apartmentsPerVisit || 0;
    if (affected) {
      treatments.push(treatmentFromPreset(treatmentPreset("gel_bait_apartment"), affected, "both"));
      if (property.activityLevel === "high" || property.activityLevel === "severe") treatments.push(treatmentFromPreset(treatmentPreset("cleanout_apartment"), affected, "initial"));
      treatments.push(treatmentFromPreset(treatmentPreset("void_dusting"), affected * 2, "initial"));
      confirmed.push(`${affected} affected apartments/areas reported.`);
    }
    recommended.push("Intensive initial treatment of affected units with targeted gel bait and crack-and-crevice applications.");
    recommended.push("Follow-up at short intervals (e.g. every two weeks) until monitoring shows control, then move to the routine rotation.");
    recommended.push("Inspect adjoining units on shared walls/plumbing to limit spread.");
    recommended.push("Sanitation and preparation coordination with management; document conditions that sustain activity.");
    assumptions.push("Occupied-unit access will be coordinated by management with resident notice.");
    verify.push("Number and severity of affected units.", "Resident access and preparation requirements.");
    if (!freq && (property.activityLevel === "high" || property.activityLevel === "severe")) freq = { kind: "biweekly" };
  }

  if (sv.has("fly") || sv.has("drain")) {
    const drains = Number(c["drains"] ?? 0);
    if (drains) treatments.push(treatmentFromPreset(treatmentPreset("drain_treatment"), drains, "both"));
    recommended.push("Locate and document breeding sources; drain treatments where organic buildup supports breeding.");
    verify.push("Fly species and breeding sources.");
  }
  if (sv.has("bed_bug") || sv.has("canine_bed_bug") || sv.has("bed_bug_heat")) {
    recommended.push("Confirm activity before treatment; inspect adjacent units where the treatment plan calls for it.");
    recommended.push("Price bed bug work separately by unit size unless an approved standard exists.");
    verify.push("Unit bedroom counts and preparation readiness.");
  }
  if (sv.has("mosquito")) recommended.push("Seasonal scheduling during the active months with source-reduction recommendations each visit.");
  if (sv.has("wildlife")) verify.push("Legal review of wildlife methods under applicable state regulations.");
  if (sv.has("bird")) verify.push("Confirm species and any protections before recommending deterrents.");

  if (property.model === "multifamily") {
    if (!program.apartmentsPerVisit) assumptions.push("Apartments per visit not yet set — use the rotation planner to derive it from unit count, cycle and frequency.");
    recommended.push("Rotation structured so each apartment is scheduled within the agreed cycle, with common-area service each visit.");
  }
  if (property.model === "healthcare") recommended.push("Product selection and timing coordinated around sensitive populations and infection-control procedures.");
  if (property.model === "government") recommended.push("Service records formatted for procurement and oversight review; confirm security/escort procedures.");
  if (property.model === "restaurant") recommended.push("Service timed outside peak operations; sanitation findings prioritized for the kitchen manager.");

  return {
    confirmed,
    assumptions,
    recommended: [...new Set(recommended)],
    fieldVerification: [...new Set(verify)],
    generatedBy: "rules",
    createdAt: nowISO(),
    suggestedFrequency: freq,
    suggestedTreatments: treatments,
    suggestedDevices: devices,
  };
}
