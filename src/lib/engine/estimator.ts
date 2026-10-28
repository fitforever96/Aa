import type {
  EquipmentAllocation,
  EstimatingAssumptions,
  ModelProfile,
  PropertyInfo,
  Provenance,
  ServiceProgram,
} from "../types";
import { CONFIRMED_DEVICE_IDS } from "./catalogIds";

/**
 * Multi-component physical service-time estimator.
 *
 * Every line carries its formula and provenance so the estimate is fully
 * explainable. Confirmed device times are never multiplied by complexity,
 * activity or calibration factors.
 */

export type Component = "devices" | "install" | "walking" | "inspection" | "treatment" | "setup" | "documentation";

export const COMPONENT_LABELS: Record<Component, string> = {
  devices: "Equipment servicing",
  install: "Equipment installation",
  walking: "Movement within property",
  inspection: "Inspection",
  treatment: "Physical treatment",
  setup: "Access & setup",
  documentation: "Documentation",
};

export interface EstimateLine {
  key: string;
  component: Component;
  label: string;
  minutes: number; // total technician minutes
  elapsedMinutes: number;
  formula: string;
  provenance: Provenance;
}

export interface PhaseEstimate {
  lines: EstimateLine[];
  byComponent: Record<Component, number>;
  technicianMinutes: number;
  elapsedMinutes: number;
  confirmedMinutes: number;
  estimatedMinutes: number;
}

export interface ConfidenceAssessment {
  level: "high" | "medium" | "low";
  confirmedShare: number;
  reasons: string[];
  missing: string[];
}

export interface EstimateResult {
  technicians: number;
  recurring: PhaseEstimate;
  initial: PhaseEstimate;
  deviceServicing: { minutes: number; lines: EstimateLine[] };
  externalTravel: { roundTripMinutes: number; technicianMinutes: number } | null;
  confidence: ConfidenceAssessment;
  coveredInteriorSqFt: number | null;
  interiorRouteFt: number | null;
  exteriorRouteFt: number | null;
  notes: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number, d = 2) => (Number.isInteger(n) ? n.toString() : n.toFixed(d).replace(/0+$/, "").replace(/\.$/, ""));

/** Resolve a device's per-visit service minutes from the versioned assumptions when confirmed. */
export function deviceServiceMinutes(a: EquipmentAllocation, assumptions: EstimatingAssumptions): number {
  if (a.serviceTimeSource === "confirmed") {
    if (a.catalogItemId === CONFIRMED_DEVICE_IDS.tinCat) return assumptions.tinCatServiceMinutes;
    if (a.catalogItemId === CONFIRMED_DEVICE_IDS.baitStation) return assumptions.baitStationServiceMinutes;
  }
  return a.serviceMinutesEach;
}

function emptyPhase(): PhaseEstimate {
  return {
    lines: [],
    byComponent: { devices: 0, install: 0, walking: 0, inspection: 0, treatment: 0, setup: 0, documentation: 0 },
    technicianMinutes: 0,
    elapsedMinutes: 0,
    confirmedMinutes: 0,
    estimatedMinutes: 0,
  };
}

function finalize(phase: PhaseEstimate) {
  for (const l of phase.lines) {
    phase.byComponent[l.component] += l.minutes;
    phase.technicianMinutes += l.minutes;
    phase.elapsedMinutes += l.elapsedMinutes;
    if (l.provenance === "confirmed" || l.provenance === "user") phase.confirmedMinutes += l.minutes;
    else phase.estimatedMinutes += l.minutes;
  }
  return phase;
}

export function profileFor(property: PropertyInfo, assumptions: EstimatingAssumptions): ModelProfile {
  return assumptions.models[property.model];
}

export function estimateProgram(
  property: PropertyInfo,
  program: ServiceProgram,
  assumptions: EstimatingAssumptions,
): EstimateResult {
  const prof = profileFor(property, assumptions);
  const n = Math.max(1, Math.floor(program.technicians || 1));
  const pf = assumptions.parallelFractions;
  const notes: string[] = [];
  const calib = assumptions.calibration[property.model];
  const calibFactor = calib?.factor ?? 1;

  const elapsedFor = (minutes: number, p: number) => minutes * (1 - p + p / n);
  const est = (base: Provenance = "estimate"): Provenance => (base === "estimate" && calib ? "calibrated" : base);
  const cal = (m: number, prov: Provenance) => (prov === "estimate" && calib ? m * calibFactor : m);
  const calNote = calib ? ` × calibration ${fmt(calibFactor, 3)}` : "";

  const accessMult = assumptions.accessMultipliers[property.accessLevel];
  const activityMult = assumptions.activityMultipliers[property.activityLevel];

  const interiorDevices = program.equipment.filter((e) => e.location === "interior");
  const exteriorDevices = program.equipment.filter((e) => e.location === "exterior");
  const deviceCount = program.equipment.reduce((s, e) => s + e.quantity, 0);
  const isMultifamily = property.model === "multifamily";
  const apts = isMultifamily ? program.apartmentsPerVisit ?? 0 : 0;

  const interiorZones = program.zones.filter((z) => z.interior);
  const exteriorZones = program.zones.filter((z) => !z.interior);
  const exteriorTreatment = program.treatments.some((t) => /perimeter|broadcast|mosquito|burrow|sewer/.test(t.activityType));
  const hasInteriorWork = interiorDevices.length > 0 || interiorZones.length > 0 || apts > 0 || program.treatments.some((t) => !/perimeter|broadcast|mosquito|burrow|sewer/.test(t.activityType));
  const hasExteriorWork = exteriorDevices.length > 0 || exteriorZones.length > 0 || exteriorTreatment;

  // ── Equipment servicing (recurring) ──
  const deviceLines: EstimateLine[] = [];
  for (const a of program.equipment) {
    if (a.quantity <= 0) continue;
    const each = deviceServiceMinutes(a, assumptions);
    const serviced = a.quantity * (a.servicedFraction ?? 1);
    const minutes = serviced * each;
    const fracText = a.servicedFraction !== 1 ? ` × ${fmt(a.servicedFraction * 100)}% serviced/visit` : "";
    deviceLines.push({
      key: `dev_${a.id}`,
      component: "devices",
      label: `${a.name} (${a.quantity})`,
      minutes,
      elapsedMinutes: elapsedFor(minutes, pf.devices),
      formula: `${a.quantity} devices${fracText} × ${fmt(each)} min = ${fmt(minutes)} min`,
      provenance: a.serviceTimeSource,
    });
  }
  const deviceMinutes = deviceLines.reduce((s, l) => s + l.minutes, 0);

  // ── Movement within the property ──
  const walkingLines: EstimateLine[] = [];
  const sqft = property.squareFeet;
  const floors = Math.max(1, property.floorCount || 1);
  const buildings = Math.max(1, property.buildingCount || 1);
  const interiorCoverage = property.interiorCoverage ?? prof.interiorCoverage;
  const exteriorCoverage = property.exteriorCoverage ?? prof.exteriorCoverage;
  let coveredInteriorSqFt: number | null = null;
  let interiorRouteFt: number | null = null;
  let exteriorRouteFt: number | null = null;
  const walkMult = accessMult * (property.complexity.largeCampus ? assumptions.largeCampusWalkingMultiplier : 1);
  const overlap = 1 + assumptions.walkingOverlapPerExtraTech * (n - 1);
  const multText = `${walkMult !== 1 ? ` × access/campus ${fmt(walkMult, 3)}` : ""}${n > 1 ? ` × multi-tech overlap ${fmt(overlap, 2)}` : ""}${calNote}`;
  const pushWalk = (key: string, label: string, baseMin: number, formulaBase: string) => {
    const m = cal(baseMin * walkMult * overlap, "estimate");
    walkingLines.push({
      key,
      component: "walking",
      label,
      minutes: m,
      elapsedMinutes: elapsedFor(m, pf.walking),
      formula: `${formulaBase}${multText} = ${fmt(r1(m), 1)} min`,
      provenance: est(),
    });
  };

  if (hasInteriorWork && !isMultifamily) {
    if (sqft && sqft > 0) {
      coveredInteriorSqFt = sqft * interiorCoverage;
      interiorRouteFt = coveredInteriorSqFt / prof.routeSpacingFt;
      const base = interiorRouteFt / prof.walkingSpeedFtPerMin;
      pushWalk(
        "walk_interior",
        "Interior route",
        base,
        `${Math.round(sqft).toLocaleString()} sq ft × ${fmt(interiorCoverage * 100)}% covered ÷ ${prof.routeSpacingFt} ft route spacing = ${Math.round(interiorRouteFt).toLocaleString()} ft ÷ ${prof.walkingSpeedFtPerMin} ft/min`,
      );
    } else if (interiorDevices.length) {
      const cnt = interiorDevices.reduce((s, e) => s + e.quantity, 0);
      pushWalk("walk_interior", "Interior route (no sq ft — device allowance)", cnt * 0.5, `${cnt} interior devices × 0.5 min distribution allowance`);
    }
  }
  if (hasExteriorWork) {
    if (property.perimeterFt && property.perimeterFt > 0) {
      exteriorRouteFt = property.perimeterFt * exteriorCoverage;
      pushWalk(
        "walk_exterior",
        "Exterior perimeter route",
        exteriorRouteFt / prof.walkingSpeedFtPerMin,
        `${Math.round(property.perimeterFt).toLocaleString()} ft measured perimeter × ${fmt(exteriorCoverage * 100)}% covered ÷ ${prof.walkingSpeedFtPerMin} ft/min`,
      );
    } else if (sqft && sqft > 0) {
      const footprint = sqft / floors / buildings;
      const perim = 4 * Math.sqrt(footprint) * buildings;
      exteriorRouteFt = perim * exteriorCoverage;
      pushWalk(
        "walk_exterior",
        "Exterior perimeter route (derived)",
        exteriorRouteFt / prof.walkingSpeedFtPerMin,
        `4 × sqrt(${Math.round(footprint).toLocaleString()} sq ft footprint) × ${buildings} bldg = ${Math.round(perim).toLocaleString()} ft × ${fmt(exteriorCoverage * 100)}% ÷ ${prof.walkingSpeedFtPerMin} ft/min`,
      );
    } else if (exteriorDevices.length) {
      const cnt = exteriorDevices.reduce((s, e) => s + e.quantity, 0);
      pushWalk("walk_exterior", "Exterior route (no size data — device allowance)", cnt * 0.75, `${cnt} exterior stations × 0.75 min spacing allowance`);
    }
  }
  if (isMultifamily && apts > 0) {
    pushWalk("walk_apartments", "Apartment-to-apartment movement", apts * prof.perApartmentTransitionMinutes, `${apts} apartments/visit × ${fmt(prof.perApartmentTransitionMinutes)} min (notice, knock, entry)`);
  }
  if (isMultifamily && sqft && sqft > 0 && interiorCoverage > 0) {
    coveredInteriorSqFt = sqft * interiorCoverage;
    interiorRouteFt = coveredInteriorSqFt / prof.routeSpacingFt;
    pushWalk("walk_common", "Common-area route", interiorRouteFt / prof.walkingSpeedFtPerMin, `${Math.round(coveredInteriorSqFt).toLocaleString()} sq ft common areas ÷ ${prof.routeSpacingFt} ft spacing ÷ ${prof.walkingSpeedFtPerMin} ft/min`);
  }
  if (floors > 1 && hasInteriorWork) {
    pushWalk("walk_floors", "Floor transitions", (floors - 1) * assumptions.perFloorTransitionMinutes, `(${floors} floors − 1) × ${fmt(assumptions.perFloorTransitionMinutes)} min`);
  }
  if (buildings > 1) {
    pushWalk("walk_buildings", "Building-to-building transitions", (buildings - 1) * prof.perBuildingTransitionMinutes, `(${buildings} buildings − 1) × ${fmt(prof.perBuildingTransitionMinutes)} min`);
  }

  // ── Inspection (recurring) ──
  const inspectionLines = (initial: boolean): EstimateLine[] => {
    const mult = activityMult * (initial ? assumptions.initialInspectionMultiplier : 1);
    const lines: EstimateLine[] = [];
    for (const z of program.zones) {
      if (z.quantity <= 0) continue;
      const perUnit = z.zoneType === "general_area" && z.source === "estimate" ? 1 / prof.generalInspectionSqFtPerMin : z.minutesPerUnit;
      const base = z.quantity * perUnit;
      const m = cal(base * mult, z.source);
      const unitText = z.unit === "sqft" ? `${Math.round(z.quantity).toLocaleString()} sq ft ÷ ${fmt(Math.round(1 / perUnit))} sq ft/min` : `${fmt(z.quantity)} ${z.unit === "linear_ft" ? "linear ft" : "×"} ${z.unit === "linear_ft" ? `× ${fmt(perUnit, 4)} min/ft` : `${fmt(perUnit)} min`}`;
      const multParts = [mult !== 1 ? `× ${initial ? "initial assessment & " : ""}activity ${fmt(mult, 3)}` : "", z.source === "estimate" ? calNote : ""].join("");
      lines.push({
        key: `insp_${z.id}`,
        component: "inspection",
        label: z.label,
        minutes: m,
        elapsedMinutes: elapsedFor(m, pf.inspection),
        formula: `${unitText}${multParts ? " " + multParts : ""} = ${fmt(r1(m), 1)} min`,
        provenance: z.source === "estimate" ? est() : z.source,
      });
    }
    if (isMultifamily && apts > 0 && prof.perApartmentMinutes > 0 && !program.treatments.some((t) => /apartment/.test(t.activityType))) {
      const m = cal(apts * prof.perApartmentMinutes * activityMult, "estimate");
      lines.push({
        key: "insp_apartments",
        component: "inspection",
        label: "Apartment service (inspect + targeted treatment)",
        minutes: m,
        elapsedMinutes: elapsedFor(m, pf.inspection),
        formula: `${apts} apartments × ${fmt(prof.perApartmentMinutes)} min${activityMult !== 1 ? ` × activity ${fmt(activityMult, 3)}` : ""}${calNote} = ${fmt(r1(m), 1)} min`,
        provenance: est(),
      });
    }
    return lines;
  };

  // ── Treatment ──
  const treatmentLines = (initial: boolean): EstimateLine[] =>
    program.treatments
      .filter((t) => t.quantity > 0 && (t.phase === "both" || (initial ? t.phase === "initial" : t.phase === "recurring")))
      .map((t) => {
        const m = cal(t.quantity * t.minutesPerUnit * activityMult, t.source);
        return {
          key: `trt_${t.id}`,
          component: "treatment" as const,
          label: t.label,
          minutes: m,
          elapsedMinutes: elapsedFor(m, pf.treatment),
          formula: `${fmt(t.quantity)} ${t.unit} × ${fmt(t.minutesPerUnit)} min${activityMult !== 1 ? ` × activity ${fmt(activityMult, 3)}` : ""}${t.source === "estimate" ? calNote : ""} = ${fmt(r1(m), 1)} min`,
          provenance: t.source === "estimate" ? est() : t.source,
        };
      });

  // ── Access & setup ──
  const setupLines = (): EstimateLine[] => {
    const lines: EstimateLine[] = [];
    const setup = prof.setupMinutesPerTech * n;
    lines.push({
      key: "setup_base",
      component: "setup",
      label: "Arrival, check-in & equipment prep",
      minutes: setup,
      elapsedMinutes: setup / n,
      formula: `${fmt(prof.setupMinutesPerTech)} min × ${n} technician${n > 1 ? "s" : ""} = ${fmt(setup)} min`,
      provenance: "estimate",
    });
    if (property.accessLevel === "restricted") {
      const m = assumptions.restrictedAccessCheckInMinutes * n;
      lines.push({ key: "setup_restricted", component: "setup", label: "Restricted-access check-in / escort", minutes: m, elapsedMinutes: m / n, formula: `${fmt(assumptions.restrictedAccessCheckInMinutes)} min × ${n} tech = ${fmt(m)} min`, provenance: "estimate" });
    }
    const areas = program.zones.length + (interiorDevices.length ? 1 : 0) + (exteriorDevices.length ? 1 : 0);
    if (areas > 1) {
      const factor = property.complexity.multipleAreas ? 2 : 1;
      const m = (areas - 1) * assumptions.zoneTransitionMinutes * factor * accessMult;
      lines.push({ key: "setup_zones", component: "setup", label: "Zone-to-zone access", minutes: m, elapsedMinutes: elapsedFor(m, pf.walking), formula: `(${areas} service areas − 1) × ${fmt(assumptions.zoneTransitionMinutes)} min${factor > 1 ? " × 2 separate treatment areas" : ""}${accessMult !== 1 ? ` × access ${fmt(accessMult, 3)}` : ""} = ${fmt(r1(m), 1)} min`, provenance: "estimate" });
    }
    if (property.complexity.complexPlacement && deviceCount > 0) {
      const m = deviceCount * assumptions.complexPlacementMinutesPerDevice;
      lines.push({ key: "setup_complex", component: "setup", label: "Complex device placement access", minutes: m, elapsedMinutes: elapsedFor(m, pf.devices), formula: `${deviceCount} devices × ${fmt(assumptions.complexPlacementMinutesPerDevice)} min access allowance = ${fmt(r1(m), 1)} min`, provenance: "estimate" });
    }
    if (n > 1) {
      const m = (n - 1) * assumptions.coordinationMinutesPerExtraTech;
      lines.push({ key: "setup_coord", component: "setup", label: "Multi-technician coordination", minutes: m, elapsedMinutes: m / n, formula: `(${n} − 1) × ${fmt(assumptions.coordinationMinutesPerExtraTech)} min = ${fmt(m)} min`, provenance: "estimate" });
    }
    return lines.map((l) => ({ ...l, provenance: est(l.provenance), minutes: cal(l.minutes, l.provenance), elapsedMinutes: cal(l.elapsedMinutes, l.provenance) }));
  };

  // ── Documentation ──
  const docLines = (initial: boolean): EstimateLine[] => {
    const base = prof.documentationBaseMinutes * (initial ? assumptions.initialDocumentationMultiplier : 1);
    const perDev = deviceCount * assumptions.documentationPerDeviceMinutes;
    const perApt = apts * assumptions.documentationPerApartmentMinutes;
    const lines: EstimateLine[] = [];
    const m = cal(base + perDev + perApt, "estimate");
    lines.push({
      key: "doc_base",
      component: "documentation",
      label: initial ? "Initial service report & findings" : "Service report & findings",
      minutes: m,
      elapsedMinutes: elapsedFor(m, pf.documentation),
      formula: `${fmt(base)} min base${initial ? ` (×${fmt(assumptions.initialDocumentationMultiplier)} initial)` : ""}${perDev ? ` + ${deviceCount} devices × ${fmt(assumptions.documentationPerDeviceMinutes)} min` : ""}${perApt ? ` + ${apts} apts × ${fmt(assumptions.documentationPerApartmentMinutes)} min` : ""}${calNote} = ${fmt(r1(m), 1)} min`,
      provenance: est(),
    });
    if (initial && deviceCount > 0) {
      const mm = cal(deviceCount * assumptions.deviceMappingMinutesPerDevice, "estimate");
      lines.push({ key: "doc_mapping", component: "documentation", label: "Device mapping & labeling", minutes: mm, elapsedMinutes: elapsedFor(mm, pf.documentation), formula: `${deviceCount} devices × ${fmt(assumptions.deviceMappingMinutesPerDevice)} min${calNote} = ${fmt(r1(mm), 1)} min`, provenance: est() });
    }
    return lines;
  };

  // ── Build phases ──
  const recurring = emptyPhase();
  if (program.chargeType === "recurring") {
    recurring.lines.push(...deviceLines, ...walkingLines, ...inspectionLines(false), ...treatmentLines(false), ...setupLines(), ...docLines(false));
  }
  finalize(recurring);

  const initial = emptyPhase();
  for (const a of program.equipment) {
    if (a.quantity <= 0) continue;
    if (a.installMinutesEach > 0) {
      const m = a.quantity * a.installMinutesEach;
      initial.lines.push({ key: `inst_${a.id}`, component: "install", label: `Install ${a.name}`, minutes: m, elapsedMinutes: elapsedFor(m, pf.devices), formula: `${a.quantity} devices × ${fmt(a.installMinutesEach)} min install = ${fmt(m)} min`, provenance: a.installTimeSource });
    } else {
      const l = deviceLines.find((d) => d.key === `dev_${a.id}`);
      if (l) initial.lines.push({ ...l, key: `init_${l.key}`, label: `${l.label} — existing devices serviced` });
    }
  }
  initial.lines.push(...walkingLines.map((l) => ({ ...l, key: `init_${l.key}` })), ...inspectionLines(true).map((l) => ({ ...l, key: `init_${l.key}` })), ...treatmentLines(true).map((l) => ({ ...l, key: `init_${l.key}` })), ...setupLines().map((l) => ({ ...l, key: `init_${l.key}` })), ...docLines(true).map((l) => ({ ...l, key: `init_${l.key}` })));
  finalize(initial);

  // ── External travel (optional, separate) ──
  const externalTravel =
    program.externalTravelMinutesOneWay && program.externalTravelMinutesOneWay > 0
      ? { roundTripMinutes: program.externalTravelMinutesOneWay * 2, technicianMinutes: program.externalTravelMinutesOneWay * 2 * n }
      : null;

  // ── Confidence ──
  const missing: string[] = [];
  const reasons: string[] = [];
  if (!sqft && (hasInteriorWork || hasExteriorWork) && !property.perimeterFt) missing.push("Square footage (drives walking and general inspection)");
  if (isMultifamily && !apts) missing.push("Apartments serviced per visit");
  if (!deviceCount && !program.zones.length && !program.treatments.length && !apts) missing.push("Scope quantities (equipment, inspection zones or treatment activities)");
  if (!program.equipment.length && program.services.includes("rodent")) missing.push("Rodent equipment counts");
  const total = recurring.technicianMinutes || initial.technicianMinutes;
  const confirmedTotal = recurring.technicianMinutes ? recurring.confirmedMinutes : initial.confirmedMinutes;
  const confirmedShare = total > 0 ? confirmedTotal / total : 0;
  if (deviceMinutes > 0) {
    const confirmedDev = deviceLines.filter((l) => l.provenance === "confirmed").reduce((s, l) => s + l.minutes, 0);
    reasons.push(`${fmt(r1(confirmedDev), 1)} of ${fmt(r1(deviceMinutes), 1)} device-service minutes use your confirmed time standards.`);
  }
  reasons.push(`${Math.round(confirmedShare * 100)}% of modeled technician time is confirmed or user-measured; ${Math.round((1 - confirmedShare) * 100)}% is app-generated planning estimate.`);
  if (sqft) reasons.push(`Square footage provided (${Math.round(sqft).toLocaleString()} sq ft) with ${fmt(interiorCoverage * 100)}% interior coverage assumed.`);
  if (calib) reasons.push(`Calibration factor ${fmt(calibFactor, 3)} applied to estimated components (${calib.basis}).`);
  let level: ConfidenceAssessment["level"];
  const critical = missing.some((m) => /Scope quantities|Apartments/.test(m));
  if (critical || (missing.length && confirmedShare < 0.3)) level = "low";
  else if (confirmedShare >= 0.5 && missing.length === 0) level = "high";
  else level = "medium";

  if (property.model !== "multifamily" && property.apartmentCount) notes.push("Apartment count recorded but the selected property model is not multifamily.");
  if (isMultifamily && sqft) notes.push("Multifamily labor is driven by apartments serviced per visit; total square footage only informs common-area coverage.");

  return {
    technicians: n,
    recurring,
    initial,
    deviceServicing: { minutes: deviceMinutes, lines: deviceLines },
    externalTravel,
    confidence: { level, confirmedShare, reasons, missing },
    coveredInteriorSqFt,
    interiorRouteFt,
    exteriorRouteFt,
    notes,
  };
}

/** Equipment-only labor: Σ quantity × confirmed/entered minutes (no other fieldwork). */
export function deviceOnlyMinutes(equipment: EquipmentAllocation[], assumptions: EstimatingAssumptions): number {
  return equipment.reduce((s, a) => s + a.quantity * (a.servicedFraction ?? 1) * deviceServiceMinutes(a, assumptions), 0);
}
