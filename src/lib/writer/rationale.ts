import type { PropertyInfo, ServiceProgram } from "../types";
import { frequencyLabel } from "../engine/frequency";
import { plannedVisitsPerMonth } from "../engine/rotation";

/**
 * Site-specific frequency rationale and validated rotation arithmetic
 * (master memory §10, §11, §36). Never invents findings; it explains the
 * operational reason for the approved frequency from the data entered.
 */

export interface RotationCheck {
  units: number;
  aptsPerVisit: number;
  visitsPerMonth: number;
  monthlyCapacity: number;
  cycleMonths: number; // months to reach every apartment once
}

export function rotationCheck(property: PropertyInfo, program: ServiceProgram): RotationCheck | null {
  const units = property.apartmentCount ?? 0;
  const apv = program.apartmentsPerVisit ?? 0;
  if (!units || !apv || program.chargeType !== "recurring") return null;
  const vpm = plannedVisitsPerMonth(program.frequency);
  const cap = apv * vpm;
  return { units, aptsPerVisit: apv, visitsPerMonth: vpm, monthlyCapacity: cap, cycleMonths: Math.ceil(units / cap) };
}

export function rotationSentence(r: RotationCheck): string {
  return `With ${r.aptsPerVisit} apartments scheduled per visit, the program provides capacity for approximately ${r.monthlyCapacity.toLocaleString()} apartments per month, reaching each of the ${r.units.toLocaleString()} apartment homes in about ${r.cycleMonths} month${r.cycleMonths === 1 ? "" : "s"}. Completion depends on resident access and scheduling; apartments that cannot be entered are rescheduled within the rotation.`;
}

export function frequencyRationale(property: PropertyInfo, program: ServiceProgram): string {
  const f = program.frequency.kind;
  const s = new Set(program.services);
  const rodent = s.has("rodent") || s.has("exterior_baiting") || s.has("interior_trapping");
  const devices = program.equipment.reduce((a, e) => a + e.quantity, 0);
  const active = property.activityLevel === "moderate" || property.activityLevel === "high" || property.activityLevel === "severe";
  const units = property.apartmentCount ?? 0;
  const apv = program.apartmentsPerVisit ?? 0;
  const label = frequencyLabel(program.frequency);

  if (f === "one_time") return "This is a one-time service; any follow-up is defined in the treatment plan and quoted separately where applicable.";
  if (f === "five_day_weekly")
    return `Service five days per week provides the capacity to work through affected areas in a concentrated period${apv ? `, with ${apv} apartments scheduled per service day (about ${apv * 5} per week)` : ""}, while monitoring confirms progress before the program transitions to routine service.`;
  if (property.model === "multifamily" && (f === "weekly" || f === "twice_monthly" || f === "biweekly")) {
    const size = units ? `${units.toLocaleString()} apartment homes` : "the community";
    if (f === "weekly") return `For ${size}, a weekly visit gives the scheduled apartment rotation, common areas and resident-reported activity a consistent technician presence and leaves room for follow-up without disrupting the rotation.`;
    if (f === "twice_monthly") return `For ${size}, two scheduled visits per month provide a practical rotation and follow-up cadence while keeping common-area coverage consistent.`;
    return `Visits approximately every two weeks keep the apartment rotation moving and allow treated units to be reviewed between cycles.`;
  }
  if (rodent && (f === "weekly" || f === "twice_monthly")) {
    const dev = devices ? `the ${devices.toLocaleString()} devices` : "the monitoring equipment";
    return `${active ? `${label} service reflects the reported rodent activity. It keeps ${dev} under frequent inspection` : `${label} service keeps ${dev} under regular inspection`} so captures are removed, activity is tracked device by device and placements are adjusted as results are evaluated. Frequency is reviewed against findings rather than reduced after the first improvement.`;
  }
  if (s.has("german_cockroach") && (f === "biweekly" || f === "weekly")) return `Follow-up ${f === "weekly" ? "each week" : "approximately every two weeks"} allows baits to be inspected and replenished, monitoring to confirm progress and untreated harborage to be addressed before activity rebounds.`;
  if ((s.has("fly") || s.has("drain")) && (f === "custom" || f === "biweekly")) return `A ${label.toLowerCase()} cadence aligns follow-up with small-fly breeding cycles so drains and source conditions are re-evaluated before a new generation develops.`;
  if (f === "seasonal") return "Service is concentrated in the months when the target pests are active, so visits align with seasonal pest pressure rather than a fixed calendar.";
  if (f === "quarterly") return "Quarterly visits provide a structured, documented review of the property at regular intervals, appropriate where pest pressure is low and steady.";
  if (f === "monthly") return "Monthly service maintains preventive coverage, monitoring and documentation at a cadence suited to routine pest pressure.";
  if (f === "weekly") return "Weekly service provides consistent monitoring and timely response to activity identified between visits.";
  return `${label} service is matched to the activity, risk areas and equipment on site.`;
}
