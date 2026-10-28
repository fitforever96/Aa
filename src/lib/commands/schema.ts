import { z } from "zod";

/** Shared schema for structured ops returned by the AI command endpoint. */
const freq = z.object({
  kind: z.enum(["one_time", "weekly", "biweekly", "twice_monthly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "five_day_weekly", "seasonal", "custom"]),
  seasonalMonths: z.array(z.number().int().min(1).max(12)).optional(),
  seasonalBase: z.enum(["weekly", "biweekly", "twice_monthly", "monthly"]).optional(),
  customVisitsPerYear: z.number().positive().optional(),
  customIntervalDays: z.number().positive().optional(),
});
const sectionType = z.enum(["executive_overview", "property_assessment", "program_objectives", "coverage", "service_methodology", "ipm", "equipment_allocation", "service_frequency", "pest_specific", "documentation", "investment", "specialty_services", "portfolio_schedules", "customer_responsibilities", "implementation", "review_milestones", "triple_guarantee", "reporting_capability", "exclusions", "authorization", "photos", "floor_plans", "custom"]);

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_frequency"), programIndex: z.number().int().min(0).optional(), frequency: freq }),
  z.object({ op: z.literal("set_equipment_qty"), programIndex: z.number().int().min(0).optional(), match: z.string().max(80), quantity: z.number().int().min(0).max(100000) }),
  z.object({ op: z.literal("add_equipment"), programIndex: z.number().int().min(0).optional(), catalogItemId: z.string().max(80), quantity: z.number().int().min(1).max(100000) }),
  z.object({ op: z.literal("set_price_override"), programIndex: z.number().int().min(0).optional(), phase: z.enum(["recurring", "initial"]), cents: z.number().int().min(0), lock: z.boolean() }),
  z.object({ op: z.literal("set_labor_rate"), cents: z.number().int().min(0) }),
  z.object({ op: z.literal("set_technicians"), programIndex: z.number().int().min(0).optional(), technicians: z.number().int().min(1).max(50) }),
  z.object({ op: z.literal("add_program"), services: z.array(z.string()).max(10), frequency: freq, name: z.string().max(120) }),
  z.object({ op: z.literal("add_section"), sectionType }),
  z.object({ op: z.literal("remove_section"), sectionType }),
  z.object({ op: z.literal("toggle_guarantee"), enabled: z.boolean() }),
  z.object({ op: z.literal("set_cover"), style: z.enum(["executive_charcoal", "corporate_white", "property_showcase"]) }),
  z.object({ op: z.literal("set_title"), title: z.string().max(160) }),
  z.object({ op: z.literal("rewrite"), target: z.union([z.literal("all"), sectionType]), instruction: z.string().max(2000) }),
  z.object({ op: z.literal("condense"), maxPages: z.number().int().min(1).max(60) }),
  z.object({ op: z.literal("show_price_at_rate"), cents: z.number().int().min(0) }),
  z.object({ op: z.literal("explain_estimate") }),
  z.object({ op: z.literal("hide_internal_details") }),
]);

export const RevisionSchema = z.object({
  sectionId: z.string(),
  eyebrow: z.string(),
  headline: z.string(),
  headlineAccent: z.string(),
  body: z.string(),
  items: z.array(z.object({ title: z.string(), body: z.string() })),
  callout: z.string(),
});

export const SectionInSchema = z.object({
  id: z.string().max(80),
  type: sectionType,
  eyebrow: z.string().max(200),
  headline: z.string().max(300),
  headlineAccent: z.string().max(300),
  body: z.string().max(12000),
  items: z.array(z.object({ title: z.string().max(300), body: z.string().max(2000) })).max(20),
  callout: z.string().max(2000),
  contractual: z.boolean(),
});
