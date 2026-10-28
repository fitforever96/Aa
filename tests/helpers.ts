import { newProposal, allocationFromCatalog, newProgram } from "@/lib/factories";
import { defaultSettings, SEED_EQUIPMENT } from "@/lib/seed";
import { DEFAULT_ASSUMPTIONS, cloneAssumptions } from "@/lib/engine/assumptions";
import type { Proposal, ServiceProgram } from "@/lib/types";

export const version = { id: "asv_test", effectiveDate: "2026-10-28", createdAt: "2026-10-28", note: "", assumptions: cloneAssumptions(DEFAULT_ASSUMPTIONS) };
export const settings = defaultSettings(version.id);
export const tinCat = SEED_EQUIPMENT.find((e) => e.id === "eq_tin_cat")!;
export const station = SEED_EQUIPMENT.find((e) => e.id === "eq_exterior_bait_station")!;

export function deviceProgram(tinCats: number, stations: number, freq: ServiceProgram["frequency"] = { kind: "weekly" }): ServiceProgram {
  const p = newProgram(["rodent"], freq, 1);
  if (tinCats) p.equipment.push(allocationFromCatalog(tinCat, tinCats));
  if (stations) p.equipment.push(allocationFromCatalog(station, stations));
  return p;
}

export function proposalWith(program: ServiceProgram): Proposal {
  const p = newProposal(settings, version);
  p.programs = [program];
  p.customer.name = "Test Customer";
  p.property.name = "Test Facility";
  return p;
}
