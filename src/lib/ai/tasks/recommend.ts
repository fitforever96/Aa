import { z } from "zod";
import { callJSON, research, extractJson, type AICtx } from "../engine";
import { writingStandard, planningStandard } from "../prompts";


export const Body = z.object({ facts: z.record(z.string(), z.unknown()) });
export const Out = z.object({
  confirmed: z.array(z.string()),
  assumptions: z.array(z.string()),
  recommended: z.array(z.string()),
  fieldVerification: z.array(z.string()),
});

const SYSTEM = `You are a senior commercial pest-management planner advising Anthony Acosta (Orkin Commercial). Evaluate the property and scope and recommend a practical, property-specific service design.
Separate strictly:
- confirmed: only facts present in the input.
- assumptions: reasonable working assumptions you are making.
- recommended: specific service activities, placement logic, frequency considerations, follow-up and sanitation/exclusion coordination appropriate to THIS property type and pest situation (not generic).
- fieldVerification: items that must be verified on site or legally (labels, wildlife regulations, species ID).
Never invent inspection findings, prices, guarantees or response times. No dollar amounts.`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>) {

    const out = await callJSON(ctx, { system: `${SYSTEM}\n\n${planningStandard(ctx.memory)}`, content: JSON.stringify(body.facts), schema: Out, effort: "medium", maxTokens: 8000 });
    return (out);
}
