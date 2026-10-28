import type { PropertyModel, ServiceCategory } from "./types";

/** Adaptive property-condition questions. Only questions relevant to the selected services/model are asked. */
export interface ConditionQuestion {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "bool";
  options?: string[];
  placeholder?: string;
  services?: ServiceCategory[];
  models?: PropertyModel[];
  hint?: string;
}

const RODENT: ServiceCategory[] = ["rodent", "exterior_baiting", "interior_trapping", "burrow", "sewer_baiting"];
const ROACH: ServiceCategory[] = ["german_cockroach", "american_cockroach"];
const BB: ServiceCategory[] = ["bed_bug", "canine_bed_bug", "bed_bug_heat"];

export const QUESTIONS: ConditionQuestion[] = [
  { id: "rodent_evidence", label: "Evidence of rodent activity", type: "text", placeholder: "Droppings at dock 4, rub marks in break room…", services: RODENT },
  { id: "rodent_species", label: "Rodent species", type: "select", options: ["Unknown — verify on site", "House mouse", "Norway rat", "Roof rat", "Mixed"], services: RODENT },
  { id: "access_points", label: "Known access / entry points", type: "text", placeholder: "Damaged dock seals, gaps under man doors…", services: [...RODENT, "wildlife", "bird"] },
  { id: "dock_doors", label: "Dock doors", type: "number", services: RODENT, models: ["warehouse", "large_industrial", "campus", "government"] },
  { id: "exterior_conditions", label: "Exterior conditions", type: "text", placeholder: "Dense landscaping, dumpster pad, adjacent fields…", services: [...RODENT, "exterior_pest", "ant", "mosquito"] },
  { id: "interior_conditions", label: "Interior conditions", type: "text", placeholder: "Clutter in storage, food in workstations…", services: [...RODENT, ...ROACH, "general_pest"] },
  { id: "existing_equipment", label: "Existing equipment on site", type: "text", placeholder: "Previous vendor stations to be replaced?", services: RODENT },
  { id: "affected_units", label: "Affected apartments / areas", type: "number", services: [...ROACH, ...BB, "flea"] },
  { id: "treatment_frequency_need", label: "Follow-up requirement", type: "select", options: ["Standard", "Every two weeks until controlled", "Weekly until controlled"], services: ROACH },
  { id: "sanitation", label: "Sanitation conditions", type: "select", options: ["Good", "Fair", "Poor — management coordination required"], services: [...ROACH, "fly", "drain", "general_pest"] },
  { id: "occupied_access", label: "Occupied-unit access", type: "text", placeholder: "Resident notice 48 hrs; management escorts…", services: [...ROACH, ...BB], models: ["multifamily", "healthcare"] },
  { id: "unit_sizes", label: "Unit sizes affected", type: "text", placeholder: "Mostly 2-bedroom", services: BB },
  { id: "drains", label: "Drains associated with fly activity", type: "number", services: ["fly", "drain"] },
  { id: "fly_sources", label: "Suspected breeding sources", type: "text", placeholder: "Floor drains in dish area, trash corral…", services: ["fly", "drain"] },
  { id: "ant_species", label: "Ant species (if known)", type: "text", services: ["ant"] },
  { id: "mosquito_area", label: "Treatable area (sq ft)", type: "number", services: ["mosquito"] },
  { id: "standing_water", label: "Standing water / breeding sites", type: "text", services: ["mosquito"] },
  { id: "bird_species", label: "Bird species & roosting areas", type: "text", services: ["bird"] },
  { id: "wildlife_species", label: "Wildlife species", type: "text", services: ["wildlife"], hint: "Methods require legal review under state regulations." },
  { id: "nests", label: "Number of nests", type: "number", services: ["stinging_insect"] },
  { id: "offices", label: "Office areas", type: "text", models: ["large_industrial", "warehouse", "campus", "government"] },
  { id: "cafeterias", label: "Cafeterias / break rooms", type: "number", models: ["large_industrial", "warehouse", "campus", "government", "healthcare", "medium_commercial"] },
  { id: "production_areas", label: "Production areas", type: "text", models: ["large_industrial"] },
  { id: "restricted_spaces", label: "Restricted / secure spaces", type: "text", placeholder: "Clean rooms, labs, secure IT…", models: ["large_industrial", "government", "healthcare", "campus"] },
  { id: "kitchens", label: "Kitchens / food prep areas", type: "number", models: ["restaurant", "healthcare", "campus", "government"] },
  { id: "common_areas", label: "Common areas serviced", type: "text", placeholder: "Clubhouse, leasing office, laundry, trash rooms", models: ["multifamily"] },
  { id: "audit", label: "Audit / compliance requirements", type: "text", placeholder: "AIB, SQF, Joint Commission, contract specs…", models: ["large_industrial", "warehouse", "healthcare", "government", "restaurant"] },
  { id: "customer_requirements", label: "Customer requirements", type: "text", placeholder: "Service window, check-in procedure, reporting format…" },
];

export function relevantQuestions(services: ServiceCategory[], model: PropertyModel): ConditionQuestion[] {
  return QUESTIONS.filter((q) => {
    const sOk = !q.services || q.services.some((s) => services.includes(s));
    const mOk = !q.models || q.models.includes(model);
    if (q.services && q.models) return sOk && mOk;
    return q.services ? sOk : q.models ? mOk : true;
  });
}
