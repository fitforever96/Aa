import type { EstimatingAssumptions, ModelProfile, PropertyModel, ServiceCategory } from "../types";

/**
 * Default estimating assumptions.
 *
 * CONFIRMED by Anthony Acosta (fixed starting assumptions; never auto-adjusted):
 *   - Billable estimating rate: $210 per technician-hour ($3.50 per technician-minute)
 *   - Tin Cat interior rodent trap: 1 minute per device per scheduled service
 *   - Exterior rodent bait station: 2 minutes per station per scheduled service
 *
 * EVERYTHING ELSE below is a preliminary planning assumption created by the
 * application. These are NOT proven Orkin production standards. They are visible
 * and editable in Knowledge & Pricing › Assumptions and in each estimate.
 */

const profile = (p: ModelProfile) => p;

export const DEFAULT_MODEL_PROFILES: Record<PropertyModel, ModelProfile> = {
  small_office: profile({
    label: "Small commercial office",
    description: "Single-tenant or suite office under ~25,000 sq ft.",
    interiorCoverage: 0.9,
    exteriorCoverage: 1,
    routeSpacingFt: 30,
    walkingSpeedFtPerMin: 200,
    generalInspectionSqFtPerMin: 600,
    setupMinutesPerTech: 5,
    documentationBaseMinutes: 5,
    perBuildingTransitionMinutes: 3,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  medium_commercial: profile({
    label: "Medium commercial property",
    description: "Multi-tenant office, retail center or mixed commercial, ~25k–150k sq ft.",
    interiorCoverage: 0.6,
    exteriorCoverage: 1,
    routeSpacingFt: 40,
    walkingSpeedFtPerMin: 220,
    generalInspectionSqFtPerMin: 800,
    setupMinutesPerTech: 8,
    documentationBaseMinutes: 8,
    perBuildingTransitionMinutes: 3,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  large_industrial: profile({
    label: "Large industrial facility",
    description: "Manufacturing, engineering or production facility; coverage concentrates on risk zones.",
    interiorCoverage: 0.25,
    exteriorCoverage: 0.8,
    routeSpacingFt: 60,
    walkingSpeedFtPerMin: 250,
    generalInspectionSqFtPerMin: 2500,
    setupMinutesPerTech: 15,
    documentationBaseMinutes: 12,
    perBuildingTransitionMinutes: 4,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  multifamily: profile({
    label: "Multifamily apartment rotation",
    description: "Estimated from apartments serviced per visit plus common areas — not total square footage.",
    interiorCoverage: 0.05,
    exteriorCoverage: 0.5,
    routeSpacingFt: 40,
    walkingSpeedFtPerMin: 200,
    generalInspectionSqFtPerMin: 800,
    setupMinutesPerTech: 10,
    documentationBaseMinutes: 10,
    perBuildingTransitionMinutes: 2,
    perApartmentMinutes: 15,
    perApartmentTransitionMinutes: 2,
  }),
  restaurant: profile({
    label: "Restaurant / food service",
    description: "Kitchens, prep, dish, storage and dining; dense, detailed inspection.",
    interiorCoverage: 1,
    exteriorCoverage: 1,
    routeSpacingFt: 20,
    walkingSpeedFtPerMin: 180,
    generalInspectionSqFtPerMin: 300,
    setupMinutesPerTech: 5,
    documentationBaseMinutes: 6,
    perBuildingTransitionMinutes: 3,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  warehouse: profile({
    label: "Warehouse / distribution",
    description: "Racked storage, docks and perimeter walls; route follows walls and docks.",
    interiorCoverage: 0.3,
    exteriorCoverage: 0.9,
    routeSpacingFt: 60,
    walkingSpeedFtPerMin: 250,
    generalInspectionSqFtPerMin: 3000,
    setupMinutesPerTech: 10,
    documentationBaseMinutes: 10,
    perBuildingTransitionMinutes: 4,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  healthcare: profile({
    label: "Hospital / senior living",
    description: "Sensitive occupied environments; check-in, escorts and sanitation-critical areas.",
    interiorCoverage: 0.35,
    exteriorCoverage: 0.8,
    routeSpacingFt: 40,
    walkingSpeedFtPerMin: 200,
    generalInspectionSqFtPerMin: 900,
    setupMinutesPerTech: 12,
    documentationBaseMinutes: 12,
    perBuildingTransitionMinutes: 4,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  government: profile({
    label: "Government facility",
    description: "Security check-in, controlled access and formal documentation.",
    interiorCoverage: 0.4,
    exteriorCoverage: 0.8,
    routeSpacingFt: 45,
    walkingSpeedFtPerMin: 200,
    generalInspectionSqFtPerMin: 1000,
    setupMinutesPerTech: 15,
    documentationBaseMinutes: 12,
    perBuildingTransitionMinutes: 4,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  campus: profile({
    label: "Campus environment",
    description: "Multiple buildings across grounds; building-to-building movement dominates.",
    interiorCoverage: 0.2,
    exteriorCoverage: 0.6,
    routeSpacingFt: 50,
    walkingSpeedFtPerMin: 250,
    generalInspectionSqFtPerMin: 1500,
    setupMinutesPerTech: 15,
    documentationBaseMinutes: 12,
    perBuildingTransitionMinutes: 6,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  exterior_only: profile({
    label: "Exterior-only program",
    description: "Perimeter devices and exterior treatments only.",
    interiorCoverage: 0,
    exteriorCoverage: 1,
    routeSpacingFt: 50,
    walkingSpeedFtPerMin: 220,
    generalInspectionSqFtPerMin: 1000,
    setupMinutesPerTech: 5,
    documentationBaseMinutes: 5,
    perBuildingTransitionMinutes: 3,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
  specialty: profile({
    label: "Specialty treatment project",
    description: "Cleanouts, heat, canine or one-time treatments; driven by treatment activities.",
    interiorCoverage: 0.5,
    exteriorCoverage: 0.3,
    routeSpacingFt: 30,
    walkingSpeedFtPerMin: 200,
    generalInspectionSqFtPerMin: 400,
    setupMinutesPerTech: 10,
    documentationBaseMinutes: 10,
    perBuildingTransitionMinutes: 3,
    perApartmentMinutes: 0,
    perApartmentTransitionMinutes: 0,
  }),
};

export const DEFAULT_ASSUMPTIONS: EstimatingAssumptions = {
  laborRateCentsPerHour: 21000,
  tinCatServiceMinutes: 1,
  baitStationServiceMinutes: 2,
  perFloorTransitionMinutes: 2,
  documentationPerDeviceMinutes: 0.05,
  documentationPerApartmentMinutes: 1,
  initialInspectionMultiplier: 1.75,
  initialDocumentationMultiplier: 2,
  deviceMappingMinutesPerDevice: 0.5,
  complexPlacementMinutesPerDevice: 0.25,
  zoneTransitionMinutes: 1,
  restrictedAccessCheckInMinutes: 10,
  coordinationMinutesPerExtraTech: 5,
  walkingOverlapPerExtraTech: 0.1,
  accessMultipliers: { easy: 1, moderate: 1.15, restricted: 1.35 },
  activityMultipliers: { none: 1, low: 1, moderate: 1.15, high: 1.3, severe: 1.5 },
  largeCampusWalkingMultiplier: 1.1,
  parallelFractions: { devices: 0.9, walking: 0.6, inspection: 0.8, treatment: 0.8, setup: 0, documentation: 0.3 },
  models: DEFAULT_MODEL_PROFILES,
  calibration: {},
  minimumCharge: { enabled: false, cents: 0 },
};

/** Fields of EstimatingAssumptions that Anthony explicitly confirmed. */
export const CONFIRMED_ASSUMPTION_KEYS = ["laborRateCentsPerHour", "tinCatServiceMinutes", "baitStationServiceMinutes"] as const;

export interface ZonePreset {
  key: string;
  label: string;
  unit: "each" | "sqft" | "linear_ft";
  minutesPerUnit: number;
  interior: boolean;
  hint: string;
}

/** Inspection zones. All minutes are app-generated planning estimates. */
export const ZONE_PRESETS: ZonePreset[] = [
  { key: "general_area", label: "General interior area (covered sq ft)", unit: "sqft", minutesPerUnit: 1 / 800, interior: true, hint: "Rate set by property model" },
  { key: "office_suite", label: "Office suite", unit: "each", minutesPerUnit: 4, interior: true, hint: "Desks, break nook, storage" },
  { key: "apartment", label: "Apartment (inspection only)", unit: "each", minutesPerUnit: 8, interior: true, hint: "Kitchen, baths, closets" },
  { key: "common_area", label: "Common area", unit: "each", minutesPerUnit: 5, interior: true, hint: "Lobby, corridor, clubhouse" },
  { key: "utility_room", label: "Utility / mechanical room", unit: "each", minutesPerUnit: 4, interior: true, hint: "" },
  { key: "cafeteria", label: "Cafeteria / break room", unit: "each", minutesPerUnit: 10, interior: true, hint: "" },
  { key: "kitchen", label: "Commercial kitchen", unit: "each", minutesPerUnit: 15, interior: true, hint: "Equipment lines, dish, dry storage" },
  { key: "basement", label: "Basement / crawl access", unit: "each", minutesPerUnit: 8, interior: true, hint: "" },
  { key: "loading_dock", label: "Loading dock door", unit: "each", minutesPerUnit: 1.5, interior: true, hint: "Seals, leveler pits, debris" },
  { key: "trash_room", label: "Trash room / compactor", unit: "each", minutesPerUnit: 5, interior: true, hint: "" },
  { key: "stairwell", label: "Stairwell", unit: "each", minutesPerUnit: 2, interior: true, hint: "" },
  { key: "storage", label: "Storage room", unit: "each", minutesPerUnit: 3, interior: true, hint: "" },
  { key: "production_area", label: "Production area (sq ft)", unit: "sqft", minutesPerUnit: 1 / 2000, interior: true, hint: "" },
  { key: "restroom", label: "Restroom", unit: "each", minutesPerUnit: 1.5, interior: true, hint: "" },
  { key: "exterior_perimeter", label: "Exterior perimeter inspection (linear ft)", unit: "linear_ft", minutesPerUnit: 1 / 200, interior: false, hint: "In addition to walking time" },
  { key: "dumpster_area", label: "Dumpster enclosure", unit: "each", minutesPerUnit: 4, interior: false, hint: "" },
  { key: "landscape_bed", label: "Landscape / harborage area", unit: "each", minutesPerUnit: 3, interior: false, hint: "" },
];

export interface TreatmentPreset {
  key: string;
  label: string;
  unit: string;
  minutesPerUnit: number;
  phase: "initial" | "recurring" | "both";
  services: ServiceCategory[];
}

/** Physical treatment activities. All minutes are app-generated planning estimates. */
export const TREATMENT_PRESETS: TreatmentPreset[] = [
  { key: "crack_crevice", label: "Crack and crevice application", unit: "1,000 sq ft", minutesPerUnit: 6, phase: "both", services: ["general_pest", "german_cockroach", "american_cockroach", "ant"] },
  { key: "gel_bait_apartment", label: "Gel bait application — apartment", unit: "apartment", minutesPerUnit: 8, phase: "both", services: ["german_cockroach"] },
  { key: "gel_bait_kitchen", label: "Gel bait application — kitchen", unit: "kitchen", minutesPerUnit: 10, phase: "both", services: ["german_cockroach", "general_pest"] },
  { key: "apartment_service", label: "Apartment service (inspect + targeted treatment)", unit: "apartment", minutesPerUnit: 15, phase: "both", services: ["general_pest", "german_cockroach"] },
  { key: "cleanout_apartment", label: "Intensive cockroach cleanout", unit: "apartment", minutesPerUnit: 45, phase: "initial", services: ["german_cockroach"] },
  { key: "perimeter_treatment", label: "Exterior perimeter treatment", unit: "100 linear ft", minutesPerUnit: 1.5, phase: "both", services: ["exterior_pest", "ant", "general_pest"] },
  { key: "granular_broadcast", label: "Granular bait broadcast", unit: "1,000 sq ft", minutesPerUnit: 1, phase: "both", services: ["ant", "exterior_pest"] },
  { key: "drain_treatment", label: "Drain treatment", unit: "drain", minutesPerUnit: 3, phase: "both", services: ["drain", "fly"] },
  { key: "fly_light_service", label: "Fly light service / glue-board change", unit: "unit", minutesPerUnit: 4, phase: "recurring", services: ["fly"] },
  { key: "burrow_treatment", label: "Burrow treatment", unit: "burrow", minutesPerUnit: 2, phase: "both", services: ["burrow", "rodent"] },
  { key: "sewer_baiting", label: "Sewer baiting", unit: "manhole", minutesPerUnit: 10, phase: "both", services: ["sewer_baiting", "rodent"] },
  { key: "void_dusting", label: "Void / wall dusting", unit: "void", minutesPerUnit: 2, phase: "both", services: ["german_cockroach", "american_cockroach", "general_pest"] },
  { key: "mosquito_barrier", label: "Mosquito barrier treatment", unit: "1,000 sq ft", minutesPerUnit: 2, phase: "both", services: ["mosquito"] },
  { key: "bed_bug_unit", label: "Bed bug chemical treatment", unit: "unit", minutesPerUnit: 90, phase: "initial", services: ["bed_bug"] },
  { key: "canine_inspection_unit", label: "Canine inspection", unit: "unit", minutesPerUnit: 3, phase: "initial", services: ["canine_bed_bug"] },
  { key: "stinging_nest", label: "Stinging insect nest treatment", unit: "nest", minutesPerUnit: 15, phase: "initial", services: ["stinging_insect"] },
  { key: "flea_unit", label: "Flea treatment", unit: "unit", minutesPerUnit: 40, phase: "initial", services: ["flea"] },
  { key: "bird_inspection", label: "Bird activity inspection", unit: "area", minutesPerUnit: 5, phase: "both", services: ["bird"] },
  { key: "exclusion_assessment", label: "Exclusion / entry-point assessment", unit: "building", minutesPerUnit: 20, phase: "initial", services: ["rodent", "wildlife", "bird"] },
  { key: "snap_trap_set", label: "Interior snap-trap / glue-board placement", unit: "placement", minutesPerUnit: 0.75, phase: "both", services: ["interior_trapping", "rodent"] },
];

export const SERVICE_LABELS: Record<ServiceCategory, string> = {
  general_pest: "General pest control",
  rodent: "Rodent management",
  german_cockroach: "German cockroach control",
  american_cockroach: "American cockroach control",
  bed_bug: "Bed bug management",
  canine_bed_bug: "Canine bed bug inspections",
  bed_bug_heat: "Bed bug heat treatment",
  exterior_pest: "Exterior pest management",
  mosquito: "Mosquito management",
  fly: "Fly management",
  drain: "Drain treatments",
  ant: "Ant control",
  bird: "Bird control",
  wildlife: "Wildlife-related services",
  exterior_baiting: "Exterior baiting",
  interior_trapping: "Interior trapping",
  sewer_baiting: "Sewer baiting",
  burrow: "Burrow treatments",
  seasonal: "Seasonal pest program",
  consulting: "Consulting & inspection program",
  stinging_insect: "Stinging insect service",
  flea: "Flea treatment",
  custom: "Custom service",
};

export function cloneAssumptions(a: EstimatingAssumptions): EstimatingAssumptions {
  return JSON.parse(JSON.stringify(a));
}
