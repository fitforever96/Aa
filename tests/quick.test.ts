import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { buildQuickProposal, mergeDraft, parseAddress, parseBrief, parsePrice, estimateDevices, type AIDraft } from "@/lib/quick/brief";
import { run as runDraft, type DraftOutput } from "@/lib/ai/tasks/draft";
import { priceProposal } from "@/lib/engine/pricing";
import { runQC } from "@/lib/qc";
import { SEED_CAPABILITIES, SEED_EQUIPMENT } from "@/lib/seed";
import { settings, version } from "./helpers";

const deps = { settings, version, catalog: SEED_EQUIPMENT, capabilities: SEED_CAPABILITIES };
// Compile-time check: Claude's output satisfies the shape the merger expects.
const _shape: (d: DraftOutput) => AIDraft = (d) => d as AIDraft;
void _shape;

describe("Quick Build: reading a short brief", () => {
  it("pulls address, price and pest from a few words", () => {
    const plan = parseBrief("Riverside Foods, 1234 Woodward Ave, Detroit MI 48226. Mice in the back room and loading dock. $350 a visit.");
    expect(plan.address).toEqual({ line1: "1234 Woodward Ave", city: "Detroit", state: "MI", zip: "48226" });
    expect(plan.customerName).toBe("Riverside Foods");
    expect(plan.priceCents).toBe(35000);
    expect(plan.priceBasis).toBe("per_visit");
    expect(plan.services).toContain("rodent");
    expect(plan.tinCats).toBeGreaterThan(0);
    expect(plan.exteriorStations).toBeGreaterThan(0);
    expect(plan.equipmentBasis).toBe("estimate");
  });

  it("handles spoken prices and addresses without a city", () => {
    expect(parsePrice("three hundred fifty dollars a month")).toEqual({ cents: 35000, basis: "per_month" });
    expect(parsePrice("$1,250.50")).toEqual({ cents: 125050, basis: "per_visit" });
    expect(parsePrice("no price yet")).toBeNull();
    expect(parseAddress("400 Monroe St roaches in kitchen")?.line1).toBe("400 Monroe St");
    expect(parseAddress("400 Monroe St roaches in kitchen")?.city).toBe("");
  });

  it("never invents contact details", () => {
    const { proposal } = buildQuickProposal(parseBrief("1234 Woodward Ave Detroit MI, mice, $300"), deps);
    expect(proposal.customer.email).toBe("");
    expect(proposal.customer.phone).toBe("");
    expect(proposal.customer.contactName).toBe("");
  });

  it("uses stated device counts and frequency over estimates", () => {
    const plan = parseBrief("Warehouse at 55 Industrial Dr, 40 Tin Cats and 30 stations, weekly, $350");
    expect(plan.tinCats).toBe(40);
    expect(plan.exteriorStations).toBe(30);
    expect(plan.frequency).toEqual({ kind: "weekly" });
    expect(plan.equipmentBasis).toBe("stated");
  });

  it("estimates more devices for bigger buildings", () => {
    const small = estimateDevices("warehouse", 50_000, 1, 1);
    const big = estimateDevices("warehouse", 400_000, 1, 1);
    expect(big.exteriorStations).toBeGreaterThan(small.exteriorStations);
    expect(big.tinCats).toBeGreaterThan(small.tinCats);
    expect(small.exteriorStations % 2).toBe(0);
  });
});

describe("Quick Build: complete proposal", () => {
  it("locks Anthony's stated price exactly and writes every section", () => {
    const { proposal, priceNote } = buildQuickProposal(parseBrief("Riverside Foods, 1234 Woodward Ave, Detroit MI 48226. Mice in the back room. $350 a visit."), deps);
    const r = priceProposal(proposal)[0];
    expect(r.recurring!.finalCents).toBe(35000);
    expect(proposal.programs[0].pricing.recurringOverride?.locked).toBe(true);
    expect(priceNote).toBeNull();
    expect(proposal.document.sections.length).toBeGreaterThan(8);
    expect(proposal.document.sections.every((s) => s.body || s.items.length)).toBe(true);
    expect(proposal.property.address.line1).toBe("1234 Woodward Ave");
    expect(proposal.recommendation?.assumptions.length).toBeGreaterThan(0);
    expect(runQC(proposal).filter((c) => c.status === "fail").map((c) => c.id)).toEqual([]);
  });

  it("never converts a monthly price to per-visit on its own", () => {
    const { proposal, priceNote } = buildQuickProposal(parseBrief("12 Main St, roaches, weekly, $800 a month"), deps);
    expect(proposal.programs[0].pricing.recurringOverride).toBeNull();
    expect(priceNote).toMatch(/per month/);
  });

  it("works with no price: shows the calculated $210/hr price", () => {
    const { proposal, priceNote } = buildQuickProposal(parseBrief("Office at 9 Elm St, 10 Tin Cats, monthly, mice"), deps);
    expect(priceNote).toMatch(/No price/);
    expect(priceProposal(proposal)[0].recurring!.finalCents).toBeGreaterThan(0);
  });
});

function sse(content: unknown[]) {
  const ev: string[] = [];
  const push = (type: string, data: object) => ev.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  push("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
  content.forEach((block, index) => {
    const b = block as { type: string; text?: string };
    if (b.type === "text") {
      push("content_block_start", { index, content_block: { type: "text", text: "" } });
      push("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
    } else push("content_block_start", { index, content_block: block });
    push("content_block_stop", { index });
  });
  push("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
  push("message_stop", {});
  return new Response(ev.join(""), { headers: { "content-type": "text/event-stream" } });
}

describe("Quick Build with Claude", () => {
  it("looks up the property, keeps only real sources, and Anthony's stated facts win", async () => {
    const plan = {
      customerName: "Made Up Corp",
      customerNameBasis: "found_online",
      customerNameUrl: "https://fake.example/x",
      address: { line1: "1234 Woodward Ave", city: "Detroit", state: "MI", zip: "48226" },
      propertyType: "Grocery distribution warehouse",
      propertyTypeBasis: "found_online",
      model: "warehouse",
      squareFeet: 180000,
      squareFeetBasis: "found_online",
      buildings: 1,
      floors: 1,
      apartments: null,
      services: ["rodent"],
      pestsBasis: "stated",
      activityAreas: ["loading dock"],
      activityLevel: "moderate",
      frequency: "twice_monthly",
      frequencyBasis: "estimate",
      frequencyReason: "Dock doors stay open during receiving.",
      rodentDevicesNeeded: true,
      tinCats: 60,
      exteriorStations: 36,
      equipmentBasis: "estimate",
      equipmentReason: "Perimeter every 60 ft.",
      title: "Distribution Center Rodent Management Program",
      assumptions: ["Size from county records."],
      fieldVerification: ["Confirm contact details."],
      recommended: ["Dock door sweeps."],
      research: [{ topic: "House mice", summary: "Seal gaps.", relevance: "Docks.", sourceUrls: ["https://www.epa.gov/rodents", "https://fake.example/y"] }],
    };
    const calls: Record<string, unknown>[] = [];
    const responses = [
      () => sse([{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "1234 Woodward Ave Detroit" } }, { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://www.epa.gov/rodents", title: "EPA", encrypted_content: "x", page_age: null }] }, { type: "text", text: "It is a warehouse of about 180,000 sq ft." }]),
      () => sse([{ type: "text", text: JSON.stringify(plan) }]),
    ];
    const fetch = async (_u: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return responses[calls.length - 1]();
    };
    const client = new Anthropic({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true, fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
    const brief = "1234 Woodward Ave Detroit MI, mice at the dock, $425 per visit";
    const out = await runDraft({ client, model: "claude-opus-5-5", memory: "" }, { brief, hints: { address: "1234 Woodward Ave, Detroit, MI", customerName: null } });
    // Open search for the address lookup; no prices requested from the model.
    expect((calls[0].tools as { allowed_domains?: string[] }[])[0].allowed_domains).toBeUndefined();
    expect(JSON.stringify(calls[1].output_config)).not.toMatch(/price/i);
    // A business name "found" at a URL the search never returned is dropped.
    expect(out.customerName).toBeNull();
    expect(out.research[0].sourceUrls).toEqual(["https://www.epa.gov/rodents"]);

    const merged = mergeDraft(parseBrief(brief), out);
    expect(merged.mode).toBe("ai");
    expect(merged.squareFeet).toBe(180000);
    expect(merged.tinCats).toBe(60);
    expect(merged.priceCents).toBe(42500);
    const { proposal } = buildQuickProposal(merged, deps);
    expect(priceProposal(proposal)[0].recurring!.finalCents).toBe(42500);
    expect(proposal.research).toHaveLength(1);
    expect(proposal.research[0].status).toBe("accepted");
    expect(proposal.kind).toBe("industrial");
  });
});
