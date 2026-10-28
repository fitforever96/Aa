import { z } from "zod";
import { callJSON, research, type AICtx } from "../engine";
import { planningStandard } from "../prompts";

/**
 * Quick Build: from a few words (address, pest issue, price) Claude looks up the property,
 * then plans the program. Prices are never set by the model; Anthony's stated price is
 * parsed and locked in code. Contact details are never invented.
 */
export const Body = z.object({
  brief: z.string().min(3).max(4000),
  hints: z.object({ address: z.string().max(300).nullable(), customerName: z.string().max(200).nullable() }),
});

const MODELS = ["small_office", "medium_commercial", "large_industrial", "multifamily", "restaurant", "warehouse", "healthcare", "government", "campus", "exterior_only", "specialty"] as const;
const SERVICES = ["general_pest", "rodent", "german_cockroach", "american_cockroach", "bed_bug", "canine_bed_bug", "bed_bug_heat", "exterior_pest", "mosquito", "fly", "drain", "ant", "bird", "wildlife", "sewer_baiting", "burrow", "consulting", "stinging_insect", "flea"] as const;
const FREQS = ["one_time", "weekly", "biweekly", "twice_monthly", "monthly", "bimonthly", "quarterly"] as const;
const BASIS = ["stated", "found_online", "estimate"] as const;

export const DraftOut = z.object({
  customerName: z.string().nullable(),
  customerNameBasis: z.enum([...BASIS, "none"]),
  customerNameUrl: z.string().nullable(),
  address: z.object({ line1: z.string(), city: z.string(), state: z.string(), zip: z.string() }).nullable(),
  propertyType: z.string(),
  propertyTypeBasis: z.enum(BASIS),
  model: z.enum(MODELS),
  squareFeet: z.number().int().min(0).max(20_000_000).nullable(),
  squareFeetBasis: z.enum([...BASIS, "unknown"]),
  buildings: z.number().int().min(1).max(500),
  floors: z.number().int().min(1).max(200),
  apartments: z.number().int().min(0).max(100_000).nullable(),
  services: z.array(z.enum(SERVICES)).min(1).max(8),
  pestsBasis: z.enum(BASIS),
  activityAreas: z.array(z.string()).max(12),
  activityLevel: z.enum(["low", "moderate", "high", "severe"]),
  frequency: z.enum(FREQS),
  frequencyBasis: z.enum(BASIS),
  frequencyReason: z.string(),
  rodentDevicesNeeded: z.boolean(),
  tinCats: z.number().int().min(0).max(2000).nullable(),
  exteriorStations: z.number().int().min(0).max(2000).nullable(),
  equipmentBasis: z.enum(BASIS),
  equipmentReason: z.string(),
  title: z.string(),
  assumptions: z.array(z.string()).max(12),
  fieldVerification: z.array(z.string()).max(12),
  recommended: z.array(z.string()).max(12),
  research: z.array(z.object({ topic: z.string(), summary: z.string(), relevance: z.string(), sourceUrls: z.array(z.string()).max(6) })).max(4),
});
export type DraftOutput = z.infer<typeof DraftOut> & { sources: { url: string; title: string }[]; searches: number };

export const LOOKUP = `You help Anthony Acosta (Senior Account Manager, Orkin Commercial, Detroit) prepare a commercial pest-management proposal from a short note.
Use web search to:
1. Identify what is at the address: the business or property name, what kind of facility it is, approximate building size (sq ft), number of buildings, floors or apartment count. Prefer public records, the business's own site, listings and maps data.
2. Look up practical, authoritative guidance (orkin.com, EPA, university extension) on the pest issue for this kind of facility.
Report what you found with the URL for each fact. If you can't find something, say so plainly. Never guess a business name or size and present it as found. Do not look up or report personal contact details.`;

const PLAN = `You are a senior commercial pest-management planner. Build the service plan for Anthony's proposal from his note and the lookup notes.
Rules:
- Basis labels: "stated" = Anthony said it; "found_online" = in the lookup notes with a URL; "estimate" = your planning assumption. Be honest.
- customerName: only if Anthony stated it or the lookup found the business at that address (give the URL). Otherwise null with basis "none". Never invent contact names, emails or phone numbers.
- address: normalize Anthony's address (add city/state/ZIP only if stated or found). Never invent an address.
- squareFeet: stated or found; otherwise a reasonable estimate for the facility type, basis "estimate". Use "unknown" only if no sensible estimate exists.
- services: what the stated pest issue requires; add general pest prevention only where the facility type normally needs it.
- frequency: use what Anthony stated. Otherwise pick what the facility type and activity level need, with a one-sentence site-specific reason.
- Rodent devices: when the program includes rodent control, plan Tin Cats (interior multiple-catch traps along walls, entries, activity areas) and exterior bait stations (perimeter, about every 50-100 ft, both sides of doors, docks, dumpsters). Give counts that fit the building size, with a one-sentence reason. Use null counts if no devices are needed.
- title: short program title, e.g. "Distribution Center Rodent Management Program".
- assumptions: each estimate you made, in one sentence.
- fieldVerification: what Anthony must confirm on site or with the customer (always include contact details).
- recommended: 3-6 specific service recommendations for THIS property and pest.
- research: up to 3 findings from the lookup notes that should shape the proposal, with only URLs that appear in the notes.
- Never set prices, dollar amounts, guarantees or response times.`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>): Promise<DraftOutput> {
  const lookup = await research(ctx, LOOKUP, `Anthony's note: """${body.brief}"""${body.hints.address ? `\nAddress as parsed: ${body.hints.address}` : ""}${body.hints.customerName ? `\nCustomer as stated: ${body.hints.customerName}` : ""}`, [], { open: true });
  const sourceList = lookup.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  const content = [`ANTHONY'S NOTE:\n${body.brief}`, `LOOKUP NOTES:\n${lookup.text || "(no lookup results)"}`, sourceList ? `URLS RETRIEVED:\n${sourceList}` : ""].filter(Boolean).join("\n\n");
  const out = await callJSON(ctx, { system: `${PLAN}\n\n${planningStandard(ctx.memory)}`, content, schema: DraftOut, effort: "medium", maxTokens: 12000 });
  const retrieved = new Set(lookup.sources.map((s) => s.url));
  // Keep only URLs the search tool actually returned: no fabricated citations or findings.
  const customerOk = out.customerNameBasis !== "found_online" || (out.customerNameUrl != null && retrieved.has(out.customerNameUrl));
  return {
    ...out,
    customerName: customerOk ? out.customerName : null,
    customerNameBasis: customerOk ? out.customerNameBasis : "none",
    research: out.research.map((r) => ({ ...r, sourceUrls: r.sourceUrls.filter((u) => retrieved.has(u)) })),
    sources: lookup.sources,
    searches: lookup.searches,
  };
}
