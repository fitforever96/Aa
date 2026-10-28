import type {
  AssumptionVersion,
  Customer,
  EquipmentAllocation,
  EquipmentItem,
  FrequencySpec,
  PropertyInfo,
  PropertyModel,
  Proposal,
  ProposalKind,
  ServiceCategory,
  ServiceProgram,
  Settings,
  TreatmentActivity,
  ZoneAllocation,
} from "./types";
import { uid, nowISO } from "./ids";
import { ZONE_PRESETS, TREATMENT_PRESETS, cloneAssumptions, type ZonePreset, type TreatmentPreset } from "./engine/assumptions";

export function newCustomer(): Customer {
  const t = nowISO();
  return { id: uid("cus"), name: "", contactName: "", contactTitle: "", email: "", phone: "", notes: "", laborRateOverrideCents: null, createdAt: t, updatedAt: t };
}

export function newProperty(): PropertyInfo {
  return {
    id: uid("prop"),
    name: "",
    address: { line1: "", city: "", state: "", zip: "" },
    propertyType: "",
    model: "medium_commercial",
    buildingCount: 1,
    squareFeet: null,
    floorCount: 1,
    apartmentCount: null,
    operatingEnvironment: "",
    facilityNotes: "",
    accessLevel: "easy",
    activityLevel: "low",
    complexity: { largeCampus: false, complexPlacement: false, multipleAreas: false },
    perimeterFt: null,
    interiorCoverage: null,
    exteriorCoverage: null,
    conditions: {},
  };
}

export function newProgram(services: ServiceCategory[] = ["general_pest"], frequency: FrequencySpec = { kind: "monthly" }, technicians = 1): ServiceProgram {
  return {
    id: uid("prg"),
    name: "Recurring service program",
    services,
    chargeType: frequency.kind === "one_time" ? "one_time" : "recurring",
    frequency,
    billing: { method: frequency.kind === "one_time" ? "one_time" : "per_visit", fixedMonthlyApproved: false, terms: "" },
    technicians,
    apartmentsPerVisit: null,
    equipment: [],
    zones: [],
    treatments: [],
    externalTravelMinutesOneWay: null,
    pricing: {
      recurringOverride: null,
      initialOverride: null,
      additionalRecurring: [],
      additionalInitial: [],
      applyMinimumCharge: false,
      markupPct: null,
      discountPct: null,
      billExternalTravel: false,
    },
    scopeNotes: "",
    actuals: [],
  };
}

export function allocationFromCatalog(item: EquipmentItem, quantity: number): EquipmentAllocation {
  return {
    id: uid("eqa"),
    catalogItemId: item.id,
    name: item.name,
    category: item.category,
    quantity,
    reserveQuantity: 0,
    location: item.defaultLocation,
    serviceMinutesEach: item.serviceMinutes,
    serviceTimeSource: item.serviceSource,
    installMinutesEach: item.installMinutes,
    installTimeSource: item.installSource,
    servicedFraction: 1,
    billable: true,
    unitPriceCents: item.approvalStatus === "approved_active" ? item.unitPriceCents : null,
    priceSource: item.approvalStatus === "approved_active" && item.unitPriceCents != null ? "catalog_approved" : "not_set",
  };
}

export function zoneFromPreset(p: ZonePreset, quantity: number): ZoneAllocation {
  return { id: uid("zn"), zoneType: p.key, label: p.label, quantity, unit: p.unit, minutesPerUnit: p.minutesPerUnit, source: "estimate", interior: p.interior };
}

export function treatmentFromPreset(p: TreatmentPreset, quantity: number, phase = p.phase): TreatmentActivity {
  return { id: uid("trt"), activityType: p.key, label: p.label, quantity, unit: p.unit, minutesPerUnit: p.minutesPerUnit, source: "estimate", phase };
}

export const zonePreset = (key: string) => ZONE_PRESETS.find((z) => z.key === key)!;
export const treatmentPreset = (key: string) => TREATMENT_PRESETS.find((t) => t.key === key)!;

export function kindForModel(model: PropertyModel): ProposalKind {
  switch (model) {
    case "multifamily":
      return "multifamily_rotation";
    case "large_industrial":
    case "warehouse":
      return "industrial";
    case "government":
      return "government";
    case "specialty":
      return "intensive_treatment";
    default:
      return "small_commercial";
  }
}

export function newProposal(settings: Settings, version: AssumptionVersion): Proposal {
  const t = nowISO();
  const p = settings.profile;
  return {
    id: uid("pro"),
    title: "Commercial Pest Management Proposal",
    subtitle: "",
    kind: "small_commercial",
    status: "draft",
    customerId: null,
    customer: newCustomer(),
    property: newProperty(),
    programs: [newProgram(["general_pest"], { kind: "monthly" }, settings.defaults.technicians)],
    specialtyItems: [],
    portfolioSchedules: [],
    document: {
      coverStyle: settings.defaults.coverStyle,
      coverImageAssetId: null,
      coverBadge: "",
      coverTagline: "",
      preparedBy: [{ name: p.name, title: p.title, phone: p.phone, email: p.email }],
      date: t.slice(0, 10),
      sections: [],
      options: { showContractTotals: false, contractMonths: 12, pageOrientation: settings.defaults.pageOrientation, accentHex: "#E4002B", showCoverStats: true },
    },
    research: [],
    recommendation: null,
    assumptions: cloneAssumptions(version.assumptions),
    assumptionsVersionId: version.id,
    laborRateOverrideCents: null,
    approvedSnapshot: null,
    internalNotes: "",
    templateUsed: null,
    importedFrom: null,
    wizardStep: 0,
    createdAt: t,
    updatedAt: t,
  };
}

/** Sensible starting inspection zones per property model (all estimates, all editable). */
export function suggestZones(property: PropertyInfo, services: ServiceCategory[]): ZoneAllocation[] {
  const zones: ZoneAllocation[] = [];
  const sq = property.squareFeet ?? 0;
  const add = (key: string, q: number) => q > 0 && zones.push(zoneFromPreset(zonePreset(key), q));
  if (property.model !== "multifamily" && property.model !== "exterior_only" && sq > 0) {
    const cov = property.interiorCoverage ?? undefined;
    const covered = Math.round(sq * (cov ?? defaultCoverage(property.model)));
    if (covered > 0) zones.push(zoneFromPreset(zonePreset("general_area"), covered));
  }
  if (property.model === "restaurant") add("kitchen", 1);
  if (property.model === "warehouse" || property.model === "large_industrial") add("loading_dock", Number(property.conditions["dock_doors"] ?? 0) || 0);
  if (property.model === "multifamily") add("common_area", 3);
  if (services.includes("rodent") || services.includes("exterior_baiting")) add("dumpster_area", 1);
  return zones;
}

function defaultCoverage(model: PropertyModel): number {
  const map: Record<PropertyModel, number> = {
    small_office: 0.9,
    medium_commercial: 0.6,
    large_industrial: 0.25,
    multifamily: 0.05,
    restaurant: 1,
    warehouse: 0.3,
    healthcare: 0.35,
    government: 0.4,
    campus: 0.2,
    exterior_only: 0,
    specialty: 0.5,
  };
  return map[model];
}
