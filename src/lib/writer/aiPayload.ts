import type { Proposal } from "../types";
import { SERVICE_LABELS, DEFAULT_MODEL_PROFILES } from "../engine/assumptions";
import { frequencyLabel } from "../engine/frequency";

/**
 * Customer-facing facts sent to the AI writer. Internal rates, minutes, yields,
 * prices and internal notes are deliberately excluded.
 */
export function writerContext(p: Proposal) {
  return {
    proposalType: p.kind,
    title: p.title,
    customer: p.customer.name,
    property: p.property.name,
    location: [p.property.address.city, p.property.address.state].filter(Boolean).join(", "),
    propertyType: p.property.propertyType || DEFAULT_MODEL_PROFILES[p.property.model].label,
    squareFeet: p.property.squareFeet,
    buildings: p.property.buildingCount,
    floors: p.property.floorCount,
    apartments: p.property.apartmentCount,
    operatingEnvironment: p.property.operatingEnvironment,
    facilityNotes: p.property.facilityNotes,
    reportedActivityLevel: p.property.activityLevel,
    confirmedConditions: Object.fromEntries(Object.entries(p.property.conditions).filter(([, v]) => v !== "" && v != null)),
    programs: p.programs.map((pr) => ({
      name: pr.name,
      services: pr.services.map((s) => SERVICE_LABELS[s]),
      frequency: frequencyLabel(pr.frequency),
      billing: pr.chargeType === "one_time" ? "one-time" : pr.billing.method === "fixed_monthly" && pr.billing.fixedMonthlyApproved ? "monthly" : "per completed visit",
      apartmentsPerVisit: pr.apartmentsPerVisit,
      equipment: pr.equipment.filter((e) => e.quantity > 0).map((e) => ({ device: e.name, location: e.location, quantity: e.quantity, reserve: e.reserveQuantity })),
    })),
    specialtyServicesOffered: p.specialtyItems.filter((s) => s.approved).map((s) => s.name),
    portfolioSchedules: p.portfolioSchedules.map((s) => ({ title: s.title, properties: s.rows.length })),
  };
}

export function suggestedResearchTopics(p: Proposal): string[] {
  const svc = [...new Set(p.programs.flatMap((x) => x.services))];
  const env = DEFAULT_MODEL_PROFILES[p.property.model].label.toLowerCase();
  const topics = svc.slice(0, 3).map((s) => `${SERVICE_LABELS[s]} in a ${env}: Integrated Pest Management practices, biology and prevention`);
  topics.push(`Orkin Commercial service description and terminology for ${env} customers`);
  if (svc.includes("rodent")) topics.push("Exterior rodent bait station placement requirements on current EPA labels");
  return topics.slice(0, 5);
}
