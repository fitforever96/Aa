import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { applySpec, coreCheck, ensureFrequencyWhy, proposalAmounts, statedAmounts, toEngineState } from "@/lib/composer/apply";
import { ComposeSpec, run as runCompose, type ComposeSpecT } from "@/lib/ai/tasks/compose";
import { priceProposal } from "@/lib/engine/pricing";
import { chatOps } from "@/lib/composer/run";
import { SEED_CAPABILITIES, SEED_EQUIPMENT } from "@/lib/seed";
import { settings, version } from "./helpers";

const deps = { settings, version, catalog: SEED_EQUIPMENT, capabilities: SEED_CAPABILITIES };

function spec(over: Partial<ComposeSpecT> = {}, program: Partial<ComposeSpecT["programs"][number]> = {}): ComposeSpecT {
  return {
    reply: "Built it.",
    customer: { name: "Riverside Foods", contactName: null, contactTitle: null },
    site: { name: null, address: { line1: "1234 Woodward Ave", city: "Detroit", state: "MI", zip: "48226" }, propertyType: "Food distribution", model: "warehouse", squareFeet: null, buildings: null, floors: null, apartments: null, activityLevel: "moderate", findings: ["Rodent droppings along the north dock wall."] },
    programs: [
      {
        name: "Commercial Rodent Program",
        services: ["rodent"],
        frequency: "weekly",
        customVisitsPerYear: null,
        customLabel: null,
        apartmentsPerVisit: null,
        technicians: null,
        devices: [
          { kind: "tin_cat", name: "Tin Cat", quantity: 20, location: "interior" },
          { kind: "exterior_bait_station", name: "Exterior bait station", quantity: 16, location: "exterior" },
        ],
        initialPrice: null,
        recurringPrice: 350,
        recurringBasis: "per_visit",
        ...program,
      },
    ],
    charges: [],
    document: { title: null, length: "two_page", includeGuarantee: null },
    story: {
      hero: { eyebrow: "COMMERCIAL RODENT CONTROL", title: "Riverside Foods", subtitle: "Commercial Rodent Program", tagline: "Intercept | Document", stats: [] },
      blocks: [
        { kind: "paragraph", priority: 1, text: "Activity is concentrated along the north dock wall." },
        { kind: "callout", priority: 1, title: "Why weekly service", text: "Weekly service is required because the dock doors open daily.", emphasis: "Weekly keeps pressure on incoming rodents." },
        { kind: "scope", priority: 1, cards: [{ eyebrow: "Thereafter", title: "Weekly service", priceKey: "p0_recurring", priceSuffix: " / VISIT", bullets: ["Service 20 Tin Cats", "Service 16 exterior stations"] }] },
      ],
    },
    assumptions: [],
    questions: [],
    ...over,
  };
}

describe("proposal engine: stated amounts", () => {
  it("finds prices in plain and spoken forms", () => {
    const s = statedAmounts(["Create a proposal at $350 a visit", "three hundred fifty dollars", "door sweeps $1,250.50", "95 a month", "$2.5k setup"]);
    expect([...s].sort((a, b) => a - b)).toEqual([9500, 35000, 125050, 250000]);
  });

  it("does not treat counts as prices", () => {
    expect(statedAmounts(["40 Tin Cats, 30 stations, 120-unit building, 3 floors"]).size).toBe(0);
  });
});

describe("proposal engine: applying the engine's state", () => {
  it("locks a price Anthony stated, exactly", () => {
    const { proposal, dropped } = applySpec(spec(), null, deps, statedAmounts(["$350 a visit"]));
    expect(dropped).toEqual([]);
    expect(proposal.programs[0].pricing.recurringOverride?.cents).toBe(35000);
    expect(priceProposal(proposal)[0].recurring?.finalCents).toBe(35000);
  });

  it("refuses a price that was never stated and calculates instead", () => {
    const { proposal, dropped } = applySpec(spec(), null, deps, new Set());
    expect(proposal.programs[0].pricing.recurringOverride).toBeNull();
    expect(dropped[0]).toMatch(/\$350\.00 was not in your messages/);
    expect(priceProposal(proposal)[0].recurring?.finalCents).toBeGreaterThan(0);
  });

  it("never converts a monthly price to per-visit on its own", () => {
    const { proposal, dropped } = applySpec(spec({}, { recurringPrice: 1200, recurringBasis: "per_month" }), null, deps, statedAmounts(["$1200 a month"]));
    expect(proposal.programs[0].pricing.recurringOverride).toBeNull();
    expect(dropped.join(" ")).toMatch(/monthly price/);
  });

  it("never invents contact details", () => {
    const { proposal } = applySpec(spec(), null, deps, new Set([35000]));
    expect(proposal.customer.email).toBe("");
    expect(proposal.customer.phone).toBe("");
    expect(proposal.customer.contactName).toBe("");
  });

  it("adds stated charges and shows every price", () => {
    const s = spec({
      charges: [{ label: "Door sweeps", description: "Install door sweeps on 4 dock doors", amount: 480, phase: "initial" }],
    });
    s.story.blocks.push({ kind: "charge", priority: 1, title: "Door sweeps", priceKey: "charge_0", priceLabel: "One time", text: "Closes the gaps under the dock doors." });
    const { proposal } = applySpec(s, null, deps, statedAmounts(["$350 a visit", "door sweeps $480"]));
    expect(proposal.programs[0].pricing.additionalInitial[0].amountCents).toBe(48000);
    const core = coreCheck(proposal);
    expect(core.find((c) => c.item === "Every price shown")?.ok).toBe(true);
    expect(core.find((c) => c.item === "Devices")?.ok).toBe(true);
    expect(core.find((c) => c.item === "Customer responsibilities")?.ok).toBe(true);
    expect(core.find((c) => c.item === "Price summary")?.ok).toBe(true);
    // Prices never appear as typed text in the story; only through price references.
    expect(JSON.stringify(proposal.story?.blocks.filter((b) => b.kind === "paragraph" || b.kind === "callout"))).not.toMatch(/\$\d/);
  });

  it("strips dollar amounts Claude writes into the text", () => {
    const s = spec();
    s.story.blocks[0] = { kind: "paragraph", priority: 1, text: "We recommend weekly service at $9 per visit for the dock." };
    const { proposal } = applySpec(s, null, deps, new Set([35000]));
    expect(JSON.stringify(proposal.story)).not.toContain("$9");
  });

  it("round-trips a revision without changing prices", () => {
    const first = applySpec(spec(), null, deps, new Set([35000])).proposal;
    const state = toEngineState(first, first.document.sections.filter((x) => x.enabled)) as Omit<ComposeSpecT, "reply" | "assumptions" | "questions">;
    const again = applySpec({ ...state, reply: "", assumptions: [], questions: [] } as ComposeSpecT, first, deps, proposalAmounts(first));
    expect(again.dropped).toEqual([]);
    expect(again.proposal.programs[0].pricing.recurringOverride?.cents).toBe(35000);
    expect(again.changes.filter((c) => /\$/.test(c))).toEqual([]);
  });

  it("reports what changed on a revision", () => {
    const first = applySpec(spec(), null, deps, new Set([35000])).proposal;
    const { proposal, changes } = applySpec(spec({}, { frequency: "biweekly", recurringPrice: 400 }), first, deps, new Set([...proposalAmounts(first), 40000]));
    expect(changes).toContain("Commercial Rodent Program frequency: Weekly → Every two weeks");
    expect(changes).toContain("Commercial Rodent Program · recurring price: $350.00 → $400.00");
    expect(proposal.programs[0].pricing.recurringOverride?.cents).toBe(40000);
  });

  it("adds a frequency justification when the story has none", () => {
    const s = spec();
    s.story.blocks = s.story.blocks.filter((b) => b.kind !== "callout");
    const { proposal } = applySpec(s, null, deps, new Set([35000]));
    const why = proposal.story?.blocks.find((b) => b.kind === "callout" && /why weekly/i.test(b.title));
    expect(why).toBeTruthy();
    expect(ensureFrequencyWhy(proposal.story!, proposal)).toEqual(proposal.story);
  });
});

function sse(text: string) {
  const ev = [
    ["message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { index: 0 }],
    ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", {}],
  ] as const;
  return new Response(ev.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

describe("proposal engine: request to Claude", () => {
  it("sends the master memory, the conversation, attachments and the request, and parses the state", async () => {
    let body: Record<string, unknown> = {};
    const fetch = async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse(JSON.stringify(spec()));
    };
    const client = new Anthropic({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true, fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
    const out = await runCompose(
      { client, model: "claude-opus-5-5", memory: "MASTER-MEMORY-TEXT" },
      {
        request: "Make it detailed and justify the weekly frequency.",
        transcript: [{ role: "user", text: "Create a proposal for Riverside Foods at $350 a visit" }],
        current: null,
        lookupNotes: null,
        attachments: [
          { kind: "image", name: "dock.jpg", mediaType: "image/jpeg", data: "AAAA" },
          { kind: "text", name: "notes.txt", mediaType: "text/plain", data: "Droppings by door 3" },
        ],
        defaults: { length: "two_page", laborRate: "$80.00/hr" },
      },
    );
    expect(ComposeSpec.parse(out).programs[0].recurringPrice).toBe(350);
    expect(JSON.stringify(body.system)).toContain("MASTER-MEMORY-TEXT");
    const msgs = JSON.stringify(body.messages);
    expect(msgs).toContain("justify the weekly frequency");
    expect(msgs).toContain("Riverside Foods at $350");
    expect(msgs).toContain("Droppings by door 3");
    expect(msgs).toContain('"type":"image"');
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain("findings");
    expect(schema).toContain("charges");
  });
});

describe("proposal engine: offline revisions", () => {
  const base = applySpec(spec(), null, deps, new Set([35000])).proposal;
  it("understands everyday price and frequency phrasing", () => {
    expect(chatOps("Make it $300 a visit", base).ops).toEqual([{ op: "set_price_override", phase: "recurring", cents: 30000, lock: true }]);
    expect(chatOps("setup $500", base).ops).toEqual([{ op: "set_price_override", phase: "initial", cents: 50000, lock: true }]);
    expect(chatOps("make it every two weeks", base).ops).toEqual([{ op: "set_frequency", frequency: { kind: "biweekly" } }]);
  });
  it("does not convert a monthly price on weekly service", () => {
    const r = chatOps("make it $1,200 a month", base);
    expect(r.ops).toEqual([]);
    expect(r.notes[0]).toMatch(/don't convert monthly prices/);
  });
});
