import { describe, it, expect } from "vitest";
import { applyOps, applyWritingRevisions, requiresApproval, newSection } from "@/lib/commands/ops";
import { parseCommand, parseIntake } from "@/lib/commands/parse";
import { customerPriceMap, priceProgram } from "@/lib/engine/pricing";
import { generateDocument } from "@/lib/writer/generate";
import { runQC } from "@/lib/qc";
import { SEED_CAPABILITIES } from "@/lib/seed";
import { deviceProgram, proposalWith, settings } from "./helpers";

function lockedProposal() {
  const p = proposalWith(deviceProgram(40, 30));
  p.programs[0].pricing.recurringOverride = { cents: 15000, locked: true, lockedAt: "2026-10-28", note: "approved" };
  p.programs[0].pricing.initialOverride = { cents: 45000, locked: true, lockedAt: "2026-10-28", note: "approved" };
  p.document.sections = generateDocument(p, { settings, capabilities: SEED_CAPABILITIES, includeGuarantee: false, includeReporting: false });
  return p;
}

describe("Locked approved price cannot be changed by AI revisions", () => {
  it("AI writing revisions that smuggle pricing/scope fields are ignored", () => {
    const p = lockedProposal();
    const before = customerPriceMap(p);
    const exec = p.document.sections.find((s) => s.type === "executive_overview")!;
    const malicious = [
      { sectionId: exec.id, body: "A more persuasive overview.", pricing: { recurringOverride: { cents: 1 } }, programs: [], frequency: { kind: "monthly" } },
      { sectionType: "investment", body: "Now only $99 per visit." },
    ];
    const { proposal: out, changed, skipped } = applyWritingRevisions(p, malicious);
    expect(customerPriceMap(out)).toEqual(before);
    expect(out.programs[0].pricing.recurringOverride!.cents).toBe(15000);
    expect(out.programs[0].frequency.kind).toBe("weekly");
    expect(changed).toEqual([exec.id]);
    expect(skipped.join(" ")).toMatch(/contractual/);
  });
  it("'make it more persuasive' produces only writing ops and preserves prices", () => {
    const p = lockedProposal();
    const parsed = parseCommand("Make the proposal more persuasive");
    expect(parsed.ops.every((o) => !requiresApproval(o))).toBe(true);
    const r = applyOps(p, parsed.ops);
    expect(customerPriceMap(r.proposal)).toEqual(customerPriceMap(p));
  });
  it("price change from a command is held for approval", () => {
    const p = lockedProposal();
    const parsed = parseCommand("Lock the recurring price at $175");
    expect(parsed.ops[0]).toMatchObject({ op: "set_price_override", cents: 17500 });
    const pending = applyOps(p, parsed.ops);
    expect(pending.pending.length).toBe(1);
    expect(priceProgram(pending.proposal, pending.proposal.programs[0]).recurring!.finalCents).toBe(15000);
    const approved = applyOps(p, parsed.ops, new Set([0]));
    expect(priceProgram(approved.proposal, approved.proposal.programs[0]).recurring!.finalCents).toBe(17500);
  });
  it("frequency change requires approval", () => {
    const p = lockedProposal();
    const parsed = parseCommand("Change service to twice monthly");
    expect(parsed.ops[0]).toMatchObject({ op: "set_frequency", frequency: { kind: "twice_monthly" } });
    expect(applyOps(p, parsed.ops).proposal.programs[0].frequency.kind).toBe("weekly");
  });
  it("cover change applies directly and never touches price", () => {
    const p = lockedProposal();
    const r = applyOps(p, parseCommand("Use the corporate white cover").ops);
    expect(r.proposal.document.coverStyle).toBe("corporate_white");
    expect(customerPriceMap(r.proposal)).toEqual(customerPriceMap(p));
  });
  it("removing a contractual section reports the material content lost", () => {
    const p = lockedProposal();
    const r = applyOps(p, [{ op: "remove_section", sectionType: "exclusions" }], new Set([0]));
    expect(r.messages.join(" ")).toMatch(/service exclusions/);
  });
});

describe("Natural-language intake", () => {
  it("parses the dictation example", () => {
    const x = parseIntake("New proposal for a 250,000-square-foot distribution warehouse. We have mice around the loading docks and office entrances. I want 35 exterior bait stations, 50 Tin Cats, and weekly service. Give me the labor estimate and recommend pricing.");
    expect(x.squareFeet).toBe(250000);
    expect(x.model).toBe("warehouse");
    expect(x.exteriorStations).toBe(35);
    expect(x.tinCats).toBe(50);
    expect(x.frequency).toEqual({ kind: "weekly" });
    expect(x.services).toContain("rodent");
    expect(x.activityAreas).toEqual(expect.arrayContaining(["loading docks", "office entrances"]));
    expect(x.wantsEstimate && x.wantsPricing).toBe(true);
  });
  it("handles spelled-out numbers", () => {
    const x = parseIntake("weekly rodent program with thirty-five bait stations and fifty tin cats for a 120,000 square foot warehouse");
    expect(x.exteriorStations).toBe(35);
    expect(x.tinCats).toBe(50);
    expect(x.squareFeet).toBe(120000);
  });
  it("parses create-program commands into intake", () => {
    const c = parseCommand("Create a weekly rodent program for a 120,000-square-foot warehouse with 40 exterior bait stations and 60 Tin Cats.");
    expect(c.intake?.tinCats).toBe(60);
    expect(c.intake?.exteriorStations).toBe(40);
  });
  it("show price at a rate is analysis only", () => {
    const c = parseCommand("Show me what the price would be at $210 an hour");
    expect(c.ops).toEqual([{ op: "show_price_at_rate", cents: 21000 }]);
    expect(requiresApproval(c.ops[0])).toBe(false);
  });
});

describe("QC", () => {
  it("flags internal labor details and stray prices in customer text", () => {
    const p = lockedProposal();
    const exec = p.document.sections.find((s) => s.type === "executive_overview")!;
    exec.body = "Each Tin Cat takes 1 minute per device at $210 per hour. Service is only $99.";
    const qc = runQC(p);
    expect(qc.find((c) => c.id === "doc_internal_leak")!.status).toBe("fail");
    expect(qc.find((c) => c.id === "fin_text_prices")!.status).toBe("fail");
  });
  it("flags invented response times and National Accounts claims", () => {
    const p = lockedProposal();
    p.document.sections.push(newSection("custom", { headline: "Extra", body: "We respond within 2 hours as your National Account provider." }));
    const qc = runQC(p);
    expect(qc.find((c) => c.id === "lg_response")!.status).toBe("fail");
    expect(qc.find((c) => c.id === "lg_national")!.status).toBe("fail");
  });
  it("generated template text passes the leakage check", () => {
    const qc = runQC(lockedProposal());
    expect(qc.find((c) => c.id === "doc_internal_leak")!.status).toBe("pass");
    expect(qc.find((c) => c.id === "vis_not_run")!.status).toBe("not_run");
  });
  it("detects approved-price drift against the approval snapshot", () => {
    const p = lockedProposal();
    p.approvedSnapshot = { approvedAt: "2026-10-28", prices: customerPriceMap(p) };
    expect(runQC(p).find((c) => c.id === "fin_approved")!.status).toBe("pass");
    p.programs[0].pricing.recurringOverride!.cents = 16000;
    expect(runQC(p).find((c) => c.id === "fin_approved")!.status).toBe("fail");
  });
});
