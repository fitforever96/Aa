import { z } from "zod";
import { callJSON, research, extractJson, type AICtx } from "../engine";
import { writingStandard, planningStandard } from "../prompts";
import { OpSchema } from "@/lib/commands/schema";


export const Body = z.object({ command: z.string().min(1).max(4000), summary: z.record(z.string(), z.unknown()) });

const Intake = z.object({
  propertyName: z.string().nullable(),
  model: z.enum(["small_office", "medium_commercial", "large_industrial", "multifamily", "restaurant", "warehouse", "healthcare", "government", "campus", "exterior_only", "specialty"]).nullable(),
  propertyType: z.string().nullable(),
  squareFeet: z.number().nullable(),
  buildings: z.number().nullable(),
  floors: z.number().nullable(),
  apartments: z.number().nullable(),
  apartmentsPerVisit: z.number().nullable(),
  tinCats: z.number().nullable(),
  exteriorStations: z.number().nullable(),
  technicians: z.number().nullable(),
  services: z.array(z.string()),
  activityAreas: z.array(z.string()),
  activityLevel: z.enum(["low", "moderate", "high", "severe"]).nullable(),
});

export const Out = z.object({ ops: z.array(OpSchema), intake: Intake.nullable(), explanation: z.string() });

const SYSTEM = `Translate Anthony's natural-language instruction for a commercial pest-control proposal into structured operations.
- Use only the operation types in the schema. Do not invent values the user did not state.
- Writing/tone/design requests become "rewrite" (target a section type or "all") or "condense".
- "Show me the price at $X/hour" is analysis only (show_price_at_rate) — not set_labor_rate.
- Money is integer cents.
- Frequencies: weekly ≠ every two weeks (biweekly) ≠ twice monthly.
- If the instruction describes a new property/program (size, devices, pests), fill "intake" with only the stated facts; otherwise intake = null.
- services in intake use these keys: general_pest, rodent, german_cockroach, american_cockroach, bed_bug, canine_bed_bug, bed_bug_heat, exterior_pest, mosquito, fly, drain, ant, bird, wildlife, exterior_baiting, interior_trapping, sewer_baiting, burrow, seasonal, consulting, stinging_insect, flea, custom.
- Equipment catalog ids: eq_tin_cat, eq_exterior_bait_station, eq_snap_trap_station, eq_glue_board, eq_fly_light, eq_pheromone_monitor, eq_rat_station_large.
- explanation: one or two plain sentences describing what will change.`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>) {

    const out = await callJSON(ctx, { system: `${SYSTEM}\n\n${planningStandard(ctx.memory)}`, content: `Current proposal summary: ${JSON.stringify(body.summary)}\n\nInstruction: ${body.command}`, schema: Out, effort: "low", maxTokens: 8000 });
    return (out);
}
