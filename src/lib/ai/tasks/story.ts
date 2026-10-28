import { z } from "zod";
import { callJSON, type AICtx } from "../engine";
import { writingStandard } from "../prompts";

/**
 * Claude writes the portrait "story" proposal: an argument built for this site, in the
 * style of Anthony's own proposals. Prices are never written by the model; it places
 * price keys, and the pricing engine fills in amounts. Terms (responsibilities,
 * exclusions, guarantee wording) and the price summary are added by code afterwards.
 */
export const Body = z.object({
  facts: z.record(z.string(), z.unknown()),
  priceKeys: z.array(z.object({ key: z.string().max(80), label: z.string().max(200) })).max(20),
  length: z.enum(["one_page", "two_page", "short", "full"]),
  instruction: z.string().max(2000).optional(),
});

const P = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const Item = z.object({ title: z.string(), body: z.string() });
export const BlockOut = z.union([
  z.object({ kind: z.literal("heading"), priority: P, title: z.string(), accent: z.string(), lead: z.string() }),
  z.object({ kind: z.literal("label"), priority: P, text: z.string() }),
  z.object({ kind: z.literal("paragraph"), priority: P, text: z.string() }),
  z.object({ kind: z.literal("callout"), priority: P, title: z.string(), text: z.string(), emphasis: z.string() }),
  z.object({ kind: z.literal("checks"), priority: P, title: z.string(), items: z.array(Item).max(6) }),
  z.object({ kind: z.literal("darkColumns"), priority: P, title: z.string(), columns: z.array(Item).min(2).max(3) }),
  z.object({ kind: z.literal("stats"), priority: P, title: z.string(), stats: z.array(z.object({ value: z.string(), label: z.string() })).min(2).max(4) }),
  z.object({ kind: z.literal("scope"), priority: P, cards: z.array(z.object({ eyebrow: z.string(), title: z.string(), priceKey: z.string(), priceSuffix: z.string(), bullets: z.array(z.string()).max(6) })).min(1).max(4) }),
  z.object({ kind: z.literal("bigNumber"), priority: P, title: z.string(), value: z.string(), caption: z.string(), text: z.string() }),
  z.object({ kind: z.literal("charge"), priority: P, title: z.string(), priceKey: z.string(), priceLabel: z.string(), text: z.string() }),
  z.object({ kind: z.literal("note"), priority: P, text: z.string() }),
  z.object({ kind: z.literal("steps"), priority: P, title: z.string(), items: z.array(Item).max(5) }),
]);
export const StoryOut = z.object({
  hero: z.object({ eyebrow: z.string(), title: z.string(), subtitle: z.string(), tagline: z.string(), stats: z.array(z.object({ value: z.string(), label: z.string() })).max(4) }),
  blocks: z.array(BlockOut).max(32),
});
export type StoryOutput = z.infer<typeof StoryOut>;

const BUDGET: Record<z.infer<typeof Body>["length"], string> = {
  one_page: "ONE page: about 7 to 9 blocks. Short paragraphs (2 sentences). Skip optional depth.",
  two_page: "TWO pages: about 12 to 16 blocks.",
  short: "about THREE to FOUR pages: about 16 to 22 blocks.",
  full: "a complete proposal of about four to six dense pages: about 20 to 30 blocks, including depth on biology, method and evidence where the facts support it.",
};

export const STORY_SYSTEM = `You write commercial pest-management proposals for Anthony Acosta, Senior Account Manager, Orkin Commercial. Your output is a structured "story" rendered as a dense, portrait, designed PDF.

HOW ANTHONY'S BEST PROPOSALS WORK (follow this):
- They argue for a specific response at a specific building. Open with an assessment that classifies the condition from the facts given (where activity is, how it moves through this building type).
- Name the gap: a callout explaining why a lighter or complaint-only approach would fall short HERE (e.g. "Why a complaint-only response is not sufficient", "Fourteen days creates a blind interval"). End the callout with a one-line red "emphasis" conclusion.
- Objectives: 4 checks, each a 3-6 word title and a 1-2 sentence body tied to this site.
- One dark three-column insight: how this pest behaves or spreads in this kind of building (e.g. vertical pathways / concealed activity / control implication).
- "Control plan at a glance" stats using the exact counts provided.
- A "heading" before the scope (e.g. "Scope of service" with a one-line lead).
- Scope cards: a "First service / Initial setup" card and a "Thereafter / <frequency> service" card when both prices exist, each with 3-5 concrete bullets using the exact device counts, areas and capacities in the facts. Use priceKey to attach prices; priceSuffix like " / VISIT" for recurring.
- Capacity math in a bigNumber block when apartments/units and per-visit capacity are given (only the arithmetic provided in the facts).
- A charge block for each separately priced item, using its priceKey.
- A paragraph explaining why this frequency is required now, and how frequency and scope will be re-evaluated from documented findings.
- Headings and labels are short and punchy. Two-tone headings use "title" + red "accent" (e.g. title "Control incoming rats.", accent "Find hidden residency.").

RULES:
- Use only the facts provided. Never invent inspection findings, counts, dimensions, product names, case studies, statistics, certifications, response times or guarantees.
- Never write dollar amounts or prices in any text; prices appear only through priceKey (use only keys from the list).
- No promises of elimination, eradication or guaranteed results; say "reduce", "control", "intercept", "document".
- Do not write customer responsibilities, exclusions, guarantee terms or a price summary; those are added from approved wording.
- priority: 1 = essential (assessment, scope, charges), 2 = supporting argument, 3 = optional depth. Shorter versions drop 3, then 2.
- Plain, direct, professional. No buzzwords, no exclamation marks, minimal em dashes.
- hero: eyebrow like "COMMERCIAL RODENT CONTROL"; title = site or customer name; subtitle = program name; tagline = 3-4 method phrases separated by "  |  "; up to 4 stats from the facts (value + short label).`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>): Promise<StoryOutput> {
  const content = [
    body.instruction ? `ANTHONY'S INSTRUCTION: ${body.instruction}` : "",
    `LENGTH: ${BUDGET[body.length]}`,
    `PRICE KEYS (attach with priceKey; never write amounts):\n${body.priceKeys.map((k) => `- ${k.key}: ${k.label}`).join("\n") || "(none)"}`,
    `FACTS:\n${JSON.stringify(body.facts, null, 1)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return callJSON(ctx, { system: `${STORY_SYSTEM}\n\n${writingStandard(ctx.memory)}`, content, schema: StoryOut, effort: "medium", maxTokens: 24000 });
}
