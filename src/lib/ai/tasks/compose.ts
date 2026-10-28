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

/** The proposal state in the app (nullable fields = not given). */
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

/*
 * What Claude actually fills in. The API allows only 16 union-typed fields ("string or null")
 * per request, so "not given" is written as "" or 0 or an explicit choice instead of null.
 */
const Text = (d: string) => z.string().describe(d);
const Count = (max: number, d: string) => z.number().int().min(0).max(max).describe(d);
const Price = z.number().min(0).max(5_000_000).describe("Dollars exactly as Anthony stated or as in CURRENT PROPOSAL; 0 if none was stated (the app calculates it)");
export const ComposeWire = z.object({
  reply: z.string(),
  customer: z.object({ name: Text('Customer or business name; "" if not given'), contactName: Text('"" unless Anthony gave it'), contactTitle: Text('"" unless Anthony gave it') }),
  site: z.object({
    name: Text('Site name; "" if not given'),
    address: z.object({ line1: z.string(), city: z.string(), state: z.string(), zip: z.string() }).describe('Every field "" when no address was given'),
    propertyType: Text('Plain description, e.g. "Ambulatory surgery center"; "" if unknown'),
    model: z.enum([...MODELS, "unspecified"]),
    squareFeet: Count(50_000_000, "0 if unknown"),
    buildings: Count(1000, "0 if unknown"),
    floors: Count(300, "0 if unknown"),
    apartments: Count(200_000, "0 if not applicable"),
    activityLevel: z.enum(["none", "low", "moderate", "high", "severe", "unknown"]),
    findings: z.array(z.string()).max(30),
  }),
  programs: z
    .array(
      z.object({
        name: z.string(),
        services: z.array(z.enum(SERVICES)).min(1).max(10),
        frequency: z.enum(FREQS),
        customVisitsPerYear: Count(730, "Visits per year when frequency is custom; otherwise 0"),
        customLabel: Text('Frequency label when frequency is custom; otherwise ""'),
        apartmentsPerVisit: Count(5000, "0 if not applicable"),
        technicians: Count(20, "0 for the default"),
        devices: z.array(z.object({ kind: z.enum(["tin_cat", "exterior_bait_station", "other"]), name: z.string(), quantity: z.number().int().min(0).max(10000), location: z.enum(["interior", "exterior"]) })).max(20),
        initialPrice: Price,
        recurringPrice: Price,
        recurringBasis: z.enum(["per_visit", "per_month"]),
      }),
    )
    .min(1)
    .max(8),
  charges: z.array(z.object({ label: z.string(), description: z.string(), amount: z.number().min(0).max(5_000_000), phase: z.enum(["initial", "recurring"]) })).max(20),
  document: z.object({ title: Text('"" to keep the current title or let the app name it'), length: z.enum([...LENGTHS, "keep"]), guarantee: z.enum(["include", "exclude", "default"]) }),
  story: z.object({
    hero: z.object({ eyebrow: z.string(), title: z.string(), subtitle: z.string(), tagline: z.string(), stats: z.array(z.object({ value: z.string(), label: z.string() })).max(4) }),
    blocks: z.array(BlockOut).max(36),
  }),
  assumptions: z.array(z.string()).max(15),
  questions: z.array(z.string()).max(4),
});
export type ComposeWireT = z.infer<typeof ComposeWire>;

const str = (v: string) => (v.trim() ? v.trim() : null);
const pos = (v: number) => (v > 0 ? v : null);

/** Claude's answer → the app's proposal state. */
export function fromWire(w: ComposeWireT): ComposeSpecT {
  const a = w.site.address;
  return {
    ...w,
    customer: { name: str(w.customer.name), contactName: str(w.customer.contactName), contactTitle: str(w.customer.contactTitle) },
    site: {
      name: str(w.site.name),
      address: [a.line1, a.city, a.state, a.zip].some((x) => x.trim()) ? { line1: a.line1.trim(), city: a.city.trim(), state: a.state.trim(), zip: a.zip.trim() } : null,
      propertyType: str(w.site.propertyType),
      model: w.site.model === "unspecified" ? null : w.site.model,
      squareFeet: pos(w.site.squareFeet),
      buildings: pos(w.site.buildings),
      floors: pos(w.site.floors),
      apartments: pos(w.site.apartments),
      activityLevel: w.site.activityLevel === "unknown" ? null : w.site.activityLevel,
      findings: w.site.findings.filter((f) => f.trim()),
    },
    programs: w.programs.map((p) => ({ ...p, customVisitsPerYear: pos(p.customVisitsPerYear), customLabel: str(p.customLabel), apartmentsPerVisit: pos(p.apartmentsPerVisit), technicians: pos(p.technicians), initialPrice: pos(p.initialPrice), recurringPrice: pos(p.recurringPrice) })),
    document: { title: str(w.document.title), length: w.document.length === "keep" ? null : w.document.length, includeGuarantee: w.document.guarantee === "default" ? null : w.document.guarantee === "include" },
  };
}

/** The app's proposal state → the same shape Claude writes (for CURRENT PROPOSAL). */
export function toWire(s: Omit<ComposeSpecT, "reply" | "assumptions" | "questions">): Omit<ComposeWireT, "reply" | "assumptions" | "questions"> {
  return {
    ...s,
    customer: { name: s.customer.name ?? "", contactName: s.customer.contactName ?? "", contactTitle: s.customer.contactTitle ?? "" },
    site: {
      ...s.site,
      name: s.site.name ?? "",
      address: s.site.address ?? { line1: "", city: "", state: "", zip: "" },
      propertyType: s.site.propertyType ?? "",
      model: s.site.model ?? "unspecified",
      squareFeet: s.site.squareFeet ?? 0,
      buildings: s.site.buildings ?? 0,
      floors: s.site.floors ?? 0,
      apartments: s.site.apartments ?? 0,
      activityLevel: s.site.activityLevel ?? "unknown",
    },
    programs: s.programs.map((p) => ({ ...p, customVisitsPerYear: p.customVisitsPerYear ?? 0, customLabel: p.customLabel ?? "", apartmentsPerVisit: p.apartmentsPerVisit ?? 0, technicians: p.technicians ?? 0, initialPrice: p.initialPrice ?? 0, recurringPrice: p.recurringPrice ?? 0 })),
    document: { title: s.document.title ?? "", length: s.document.length ?? "keep", guarantee: s.document.includeGuarantee == null ? "default" : s.document.includeGuarantee ? "include" : "exclude" },
  };
}

const Attachment = z.object({ kind: z.enum(["image", "pdf", "text"]), name: z.string().max(300), mediaType: z.string().max(100), data: z.string() });

export const Body = z.object({
  request: z.string().min(1).max(200_000),
  transcript: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(200_000) })).max(40),
  current: z.record(z.string(), z.unknown()).nullable(),
  lookupNotes: z.string().max(60_000).nullable(),
  attachments: z.array(Attachment).max(12),
  defaults: z.object({ length: z.enum(LENGTHS), laborRate: z.string() }),
});

const SYSTEM = `You are the proposal engine inside Orkin Proposal Studio, working for Anthony Acosta (Senior Account Manager, Orkin Commercial, Detroit Commercial, Branch 693). Anthony talks to you like a chat assistant: short or vague requests, detailed instructions, pasted findings, photos, PDFs. Every turn you return the COMPLETE proposal state as JSON. The app renders it immediately as a customer-facing PDF.

HOW TO WORK
- New proposal: build everything from the request, attachments and lookup notes. Vague requests are fine: make sensible, clearly labeled assumptions and still produce a complete, customer-ready proposal.
- Revision: CURRENT PROPOSAL is the state now, in the same format you write. Apply only what Anthony asks; carry everything else over unchanged (customer, site, programs, devices, prices, charges, story blocks he didn't ask to change).
- Follow his instructions about tone, detail and emphasis ("make it detailed", "justify the frequency", "enhance my findings", "explain what it is", "one page").
- Findings he gives you: rewrite them clearly and professionally and use them in the assessment and scope. Never add findings he didn't give you or that aren't in the lookup notes.
- Not given = "" for text, 0 for numbers, "unspecified"/"unknown"/"keep"/"default" for choices. Never use 0 or "" to mean anything else.

SERVICES AND PROGRAMS
- Each separately priced recurring service is its own program with its own frequency and price (for example general pest monthly, a rodent repellent service monthly, and a perimeter treatment twice a year = three programs, semiannual for twice a year).
- Use the closest service categories; for a service with no category (for example a Termidor perimeter treatment), use exterior_pest or custom and give the program an accurate name.
- Separate inspection areas (a detached dumpster enclosure, outbuildings) belong in the scope bullets and assessment.
- Start dates, agreement timing and scheduling Anthony mentions go in the story (assessment, scope or next-step wording). Never invent dates.

PRICES (strict)
- Put a dollar amount only where Anthony stated it in his messages or it is already in CURRENT PROPOSAL. Copy it exactly. Use 0 when he did not state one: the app calculates it from the labor rate. Never estimate, round or invent a price.
- recurringBasis "per_month" only with frequency "monthly" (use it when Anthony gives a monthly price for monthly service, e.g. "$197 per month"); otherwise per_visit.
- Additional services (programs after the first) carry no initial charge unless Anthony states one: leave their initialPrice 0.
- When Anthony says a price INCLUDES something (for example "initial service is $994 which includes equipment"), that price is the whole amount: do not add the included item again as a charge. Describe what is included in the scope bullets.
- Separately priced items he mentions (door sweeps, exclusion work, equipment packages) go in "charges" only when they are billed on top of the program prices.
- Attach prices to story blocks with priceKey: "p{i}_initial", "p{i}_recurring", "p{i}_equipment" for program i (0-based), and "charge_{k}" for charges[k]. With several programs, give every program its own scope cards so every price appears (one scope block per program reads best).
- In text, write a dollar amount only when Anthony stated it (for example his discount from a regular price to the proposed price). Never any other amount.

CONTACTS AND FACTS
- Never invent names, emails, phone numbers, addresses, square footage, counts or findings. Use what Anthony gave you, what is in CURRENT PROPOSAL, or what the lookup notes found. When you must assume something (size, device counts, frequency), list it in "assumptions" in one plain sentence each.
- Product and method explanations (what a product is, how a treatment works, why renovation disturbs pest harborage) are welcome when accurate and general; do not cite statistics or studies that are not in the lookup notes.
- Ask "questions" only for information you truly cannot proceed without (at most 3, short). Still return a complete proposal.

CORE INFORMATION every proposal must carry, at every length: customer and site; the condition or problem; scope of service; frequency AND why that frequency fits this site (a callout or paragraph that explains it); devices when used; every price and how it is billed; next step. Customer responsibilities, exclusions, terms, the guarantee wording and the price summary are added by the app from approved wording, so do not write them. When Anthony asks for the guarantee, set document.guarantee to "include".

LENGTH: "one_page", "two_page", "short" (about 3-4 pages) or "full" (complete, detailed). "Comprehensive", "detailed" or "everything" means full; "quick" or "one page" means one_page. Otherwise "keep" the current length (new proposals use the default). Write the story to fit: one_page about 7-9 blocks, two_page 12-16, short 16-22, full 20-32.

REPLY: 1-4 plain sentences to Anthony in chat: what you built or changed, anything important you assumed. No marketing language.

STORY STYLE
${"{{STORY}}"}`;

/** The story rules forbid amounts in text; here Anthony's own stated amounts are allowed (the app checks them). */
const STORY_FOR_ENGINE = STORY_SYSTEM.replace(/- Never write dollar amounts or prices in any text;[^\n]*/, "- Prices appear through priceKey. Amounts in text follow the PRICES rules above.");

export async function run(ctx: AICtx, body: z.infer<typeof Body>): Promise<ComposeSpecT> {
  const blocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (const a of body.attachments) {
    if (a.kind === "image") blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType as "image/jpeg", data: a.data } });
    else if (a.kind === "pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data }, title: a.name });
    else blocks.push({ type: "text", text: `ATTACHED FILE "${a.name}":\n${a.data}` });
  }
  const text = [
    `DEFAULTS: new proposals use length "${body.defaults.length}" unless Anthony asks otherwise. Labor rate (for your reference only; never write it): ${body.defaults.laborRate}.`,
    body.current ? `CURRENT PROPOSAL (state before this request):\n${JSON.stringify(body.current, null, 1)}` : "CURRENT PROPOSAL: none (this is a new proposal).",
    body.lookupNotes ? `LOOKUP NOTES (web research on the site and pest; cite nothing that isn't here):\n${body.lookupNotes}` : "",
    body.transcript.length ? `CONVERSATION SO FAR:\n${body.transcript.map((t) => `${t.role === "user" ? "ANTHONY" : "YOU"}: ${t.text}`).join("\n")}` : "",
    body.attachments.length ? `ATTACHMENTS: ${body.attachments.map((a) => a.name).join(", ")} (above).` : "",
    `ANTHONY'S REQUEST NOW:\n${body.request}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  blocks.push({ type: "text", text });
  const system = `${SYSTEM.replace("{{STORY}}", STORY_FOR_ENGINE)}\n\n${writingStandard(ctx.memory)}`;
  return fromWire(await callJSON(ctx, { system, content: blocks, schema: ComposeWire, effort: "medium", maxTokens: 64000 }));
}
