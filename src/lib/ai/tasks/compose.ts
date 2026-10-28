import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { callJSON, type AICtx } from "../engine";
import { writingStandard } from "../prompts";
import { BlockOut, STORY_SYSTEM } from "./story";

/**
 * The proposal engine: one request in plain language ("create a 2-page proposal for X at $Y,
 * justify the weekly frequency, here are my findings") → the complete proposal state.
 *
 * Claude returns the whole state each turn (customer, site, programs, devices, the prices Anthony
 * stated, the written story, assumptions and questions). The app validates it: amounts must
 * appear in Anthony's own messages or the current proposal, contact details are never invented,
 * terms and the price summary come from approved wording, and core information is checked.
 */

const MODELS = ["small_office", "medium_commercial", "large_industrial", "multifamily", "restaurant", "warehouse", "healthcare", "government", "campus", "exterior_only", "specialty"] as const;
const SERVICES = ["general_pest", "rodent", "german_cockroach", "american_cockroach", "bed_bug", "canine_bed_bug", "bed_bug_heat", "exterior_pest", "mosquito", "fly", "drain", "ant", "bird", "wildlife", "exterior_baiting", "interior_trapping", "sewer_baiting", "burrow", "seasonal", "consulting", "stinging_insect", "flea", "custom"] as const;
const FREQS = ["one_time", "weekly", "biweekly", "twice_monthly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "five_day_weekly", "custom"] as const;
const LENGTHS = ["one_page", "two_page", "short", "full"] as const;

const Dollars = z.number().min(0).max(5_000_000).nullable();

export const ComposeSpec = z.object({
  reply: z.string(),
  customer: z.object({ name: z.string().nullable(), contactName: z.string().nullable(), contactTitle: z.string().nullable() }),
  site: z.object({
    name: z.string().nullable(),
    address: z.object({ line1: z.string(), city: z.string(), state: z.string(), zip: z.string() }).nullable(),
    propertyType: z.string().nullable(),
    model: z.enum(MODELS).nullable(),
    squareFeet: z.number().int().min(0).max(50_000_000).nullable(),
    buildings: z.number().int().min(1).max(1000).nullable(),
    floors: z.number().int().min(1).max(300).nullable(),
    apartments: z.number().int().min(0).max(200_000).nullable(),
    activityLevel: z.enum(["none", "low", "moderate", "high", "severe"]).nullable(),
    findings: z.array(z.string()).max(30),
  }),
  programs: z
    .array(
      z.object({
        name: z.string(),
        services: z.array(z.enum(SERVICES)).min(1).max(10),
        frequency: z.enum(FREQS),
        customVisitsPerYear: z.number().int().min(1).max(730).nullable(),
        customLabel: z.string().nullable(),
        apartmentsPerVisit: z.number().int().min(1).max(5000).nullable(),
        technicians: z.number().int().min(1).max(20).nullable(),
        devices: z.array(z.object({ kind: z.enum(["tin_cat", "exterior_bait_station", "other"]), name: z.string(), quantity: z.number().int().min(0).max(10000), location: z.enum(["interior", "exterior"]) })).max(20),
        initialPrice: Dollars,
        recurringPrice: Dollars,
        recurringBasis: z.enum(["per_visit", "per_month"]),
      }),
    )
    .min(1)
    .max(8),
  charges: z.array(z.object({ label: z.string(), description: z.string(), amount: z.number().min(0).max(5_000_000), phase: z.enum(["initial", "recurring"]) })).max(20),
  document: z.object({ title: z.string().nullable(), length: z.enum(LENGTHS).nullable(), includeGuarantee: z.boolean().nullable() }),
  story: z.object({
    hero: z.object({ eyebrow: z.string(), title: z.string(), subtitle: z.string(), tagline: z.string(), stats: z.array(z.object({ value: z.string(), label: z.string() })).max(4) }),
    blocks: z.array(BlockOut).max(36),
  }),
  assumptions: z.array(z.string()).max(15),
  questions: z.array(z.string()).max(4),
});
export type ComposeSpecT = z.infer<typeof ComposeSpec>;

const Attachment = z.object({ kind: z.enum(["image", "pdf", "text"]), name: z.string().max(300), mediaType: z.string().max(100), data: z.string() });

export const Body = z.object({
  request: z.string().min(1).max(20_000),
  transcript: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) })).max(40),
  current: z.record(z.string(), z.unknown()).nullable(),
  lookupNotes: z.string().max(40_000).nullable(),
  attachments: z.array(Attachment).max(12),
  defaults: z.object({ length: z.enum(LENGTHS), laborRate: z.string() }),
});

const SYSTEM = `You are the proposal engine inside Orkin Proposal Studio, working for Anthony Acosta (Senior Account Manager, Orkin Commercial, Detroit Commercial, Branch 693). Anthony talks to you like a chat assistant: short or vague requests, detailed instructions, pasted findings, photos, PDFs. Every turn you return the COMPLETE proposal state as JSON. The app renders it immediately as a customer-facing PDF.

HOW TO WORK
- New proposal: build everything from the request, attachments and lookup notes. Vague requests are fine: make sensible, clearly labeled assumptions and still produce a complete, customer-ready proposal.
- Revision: CURRENT PROPOSAL is the state now. Apply only what Anthony asks; carry everything else over unchanged (customer, site, programs, devices, prices, charges, story blocks he didn't ask to change).
- Follow his instructions about tone, detail and emphasis ("make it detailed", "justify the frequency", "enhance my findings", "one page").
- Findings he gives you: rewrite them clearly and professionally and use them in the assessment and scope. Never add findings he didn't give you or that aren't in the lookup notes.

PRICES (strict)
- Put a dollar amount only where Anthony stated it in his messages or it is already in CURRENT PROPOSAL. Copy it exactly.
- If no price was stated, leave initialPrice/recurringPrice null: the app calculates it from the labor rate. Never estimate, round or invent a price.
- Separately priced items he mentions (door sweeps, exclusion work, equipment packages) go in "charges".
- Never write dollar amounts in story text. Attach prices with priceKey: "p{i}_initial", "p{i}_recurring", "p{i}_equipment" for program i (0-based), and "charge_{k}" for charges[k].

CONTACTS AND FACTS
- Never invent names, emails, phone numbers, addresses, square footage, counts or findings. Use what Anthony gave you, what is in CURRENT PROPOSAL, or what the lookup notes found. When you must assume something (size, device counts, frequency), list it in "assumptions" in one plain sentence each.
- Ask "questions" only for information you truly cannot proceed without (at most 3, short). Still return a complete proposal.

CORE INFORMATION every proposal must carry, at every length: customer and site; the condition or problem; scope of service; frequency AND why that frequency fits this site (a callout or paragraph that explains it); devices when used; every price and how it is billed; next step. Customer responsibilities, exclusions, terms and the price summary are added by the app from approved wording, so do not write them.

LENGTH: "one_page", "two_page", "short" (about 3-4 pages) or "full" (complete, detailed). Use what Anthony asks for ("detailed" usually means full or short; "quick" or "one page" means one_page). Otherwise keep the current length, or the default for new proposals. Write the story to fit: one_page about 7-9 blocks, two_page 12-16, short 16-22, full 20-32.

REPLY: 1-4 plain sentences to Anthony in chat: what you built or changed, anything important you assumed. No marketing language.

STORY STYLE
${"{{STORY}}"}`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>): Promise<ComposeSpecT> {
  const blocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (const a of body.attachments) {
    if (a.kind === "image") blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType as "image/jpeg", data: a.data } });
    else if (a.kind === "pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data }, title: a.name });
    else blocks.push({ type: "text", text: `ATTACHED FILE "${a.name}":\n${a.data}` });
  }
  const text = [
    `DEFAULTS: new proposals use length "${body.defaults.length}". Labor rate (for your reference only; never write it): ${body.defaults.laborRate}.`,
    body.current ? `CURRENT PROPOSAL (state before this request):\n${JSON.stringify(body.current, null, 1)}` : "CURRENT PROPOSAL: none (this is a new proposal).",
    body.lookupNotes ? `LOOKUP NOTES (web research on the site and pest; cite nothing that isn't here):\n${body.lookupNotes}` : "",
    body.transcript.length ? `CONVERSATION SO FAR:\n${body.transcript.map((t) => `${t.role === "user" ? "ANTHONY" : "YOU"}: ${t.text}`).join("\n")}` : "",
    body.attachments.length ? `ATTACHMENTS: ${body.attachments.map((a) => a.name).join(", ")} (above).` : "",
    `ANTHONY'S REQUEST NOW:\n${body.request}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  blocks.push({ type: "text", text });
  const system = `${SYSTEM.replace("{{STORY}}", STORY_SYSTEM)}\n\n${writingStandard(ctx.memory)}`;
  return callJSON(ctx, { system, content: blocks, schema: ComposeSpec, effort: "medium", maxTokens: 48000 });
}
