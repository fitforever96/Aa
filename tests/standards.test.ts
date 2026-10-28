import { describe, it, expect } from "vitest";
import { generateDocument } from "@/lib/writer/generate";
import { newSection } from "@/lib/commands/ops";
import { runQC } from "@/lib/qc";
import { rotationCheck } from "@/lib/writer/rationale";
import { SEED_CAPABILITIES, SEED_HISTORICAL } from "@/lib/seed";
import { deviceProgram, proposalWith, settings } from "./helpers";

const ctx = (g = true) => ({ settings, capabilities: SEED_CAPABILITIES, includeGuarantee: g, includeReporting: false });
const qc = (p: Parameters<typeof runQC>[0], id: string) => runQC(p).find((c) => c.id === id);

describe("Master memory: guarantee & contract language", () => {
  it("Triple Guarantee section contains no hour-specific response commitment", () => {
    const p = proposalWith(deviceProgram(40, 30));
    p.document.sections = generateDocument(p, ctx(true));
    const g = p.document.sections.find((s) => s.type === "triple_guarantee")!;
    const text = [g.body, g.callout, ...g.items.map((i) => i.body)].join(" ");
    expect(text).not.toMatch(/24 hours|two hours|2 × 24|within \d/i);
    expect(qc(p, "lg_response")!.status).toBe("pass");
  });
  it("QC fails the rejected 24-hour on-site language even inside the guarantee section", () => {
    const p = proposalWith(deviceProgram(10, 0));
    p.document.sections = generateDocument(p, ctx(true));
    p.document.sections.find((s) => s.type === "triple_guarantee")!.items[0].body = "Orkin provides an on-site representative within 24 hours.";
    expect(qc(p, "lg_response")!.status).toBe("fail");
  });
  it("flags eradication, compliance and unlimited-service promises", () => {
    const p = proposalWith(deviceProgram(10, 0));
    p.document.sections = [newSection("custom", { headline: "x", body: "We will eradicate all mice, ensure compliance and offer unlimited free service." })];
    expect(qc(p, "lg_overpromise")!.status).toBe("fail");
  });
  it("flags goose roundup / relocation language", () => {
    const p = proposalWith(deviceProgram(0, 0));
    p.document.sections = [newSection("custom", { headline: "Geese", body: "Annual goose roundup and relocation." })];
    expect(qc(p, "lg_wildlife")!.status).toBe("fail");
  });
});

describe("Master memory: structure & style", () => {
  it("no signature/authorization page by default; concise conclusion instead", () => {
    for (const kind of ["small_commercial", "industrial", "government", "multifamily_rotation", "consulting"] as const) {
      const p = proposalWith(deviceProgram(10, 10));
      p.kind = kind;
      const types = generateDocument(p, ctx(false)).map((s) => s.type);
      expect(types).not.toContain("authorization");
      expect(types).toContain("conclusion");
    }
  });
  it("generated copy passes writing-standard and overpromise checks", () => {
    for (const services of [["rodent"], ["german_cockroach", "bed_bug"], ["fly", "drain"], ["bird"]] as const) {
      const p = proposalWith(deviceProgram(20, 10));
      p.programs[0].services = [...services];
      p.document.sections = generateDocument(p, ctx(true));
      expect(qc(p, "doc_style")!.status, services.join()).toBe("pass");
      expect(qc(p, "lg_overpromise")!.status, services.join()).toBe("pass");
      expect(qc(p, "lg_response")!.status).toBe("pass");
    }
  });
  it("buzzwords are flagged", () => {
    const p = proposalWith(deviceProgram(1, 0));
    p.document.sections = [newSection("custom", { headline: "x", body: "A world-class, cutting-edge program!" })];
    expect(qc(p, "doc_style")!.status).toBe("warn");
  });
  it("rodent programs get a 60-day review milestone and a site-specific frequency rationale", () => {
    const p = proposalWith(deviceProgram(50, 35));
    p.kind = "industrial";
    p.property.activityLevel = "moderate";
    const secs = generateDocument(p, ctx(false));
    expect(secs.find((s) => s.type === "review_milestones")!.items.map((i) => i.title)).toContain("60-day review");
    expect(secs.find((s) => s.type === "service_frequency")!.body).toMatch(/85 devices.*captures are removed/);
  });
});

describe("Master memory: rotation arithmetic", () => {
  it("validates rotation capacity and fails unsupported quarterly claims", () => {
    const p = proposalWith(deviceProgram(0, 0));
    p.property.model = "multifamily";
    p.property.apartmentCount = 300;
    p.programs[0].apartmentsPerVisit = 8; // weekly: 8 × 4 = 32/mo → 10 months
    expect(rotationCheck(p.property, p.programs[0])!.cycleMonths).toBe(10);
    p.document.sections = [newSection("custom", { headline: "Rotation", body: "Every apartment is serviced on a quarterly rotation." })];
    expect(qc(p, "op_rotation_math")!.status).toBe("fail");
    p.programs[0].apartmentsPerVisit = 25; // 100/mo → 3 months
    expect(qc(p, "op_rotation_math")!.status).toBe("pass");
  });
});

describe("Master memory: precedents & RFP", () => {
  it("confidential history is not shipped in public source", () => {
    expect(SEED_HISTORICAL).toEqual([]);
  });
  it("government proposals require a requirements matrix with mandatory items addressed", () => {
    const p = proposalWith(deviceProgram(10, 10));
    p.kind = "government";
    expect(qc(p, "op_rfp_matrix")!.status).toBe("warn");
    p.rfpRequirements = [{ id: "r1", requirement: "Sewer baiting", category: "service", mandatory: true, status: "open", response: "" }];
    expect(qc(p, "op_rfp_matrix")!.status).toBe("fail");
    p.rfpRequirements[0].status = "addressed";
    expect(qc(p, "op_rfp_matrix")!.status).toBe("pass");
  });
  it("profile carries the Detroit Commercial branch", () => {
    expect(settings.profile.branch).toMatch(/693/);
  });
});

describe("Review milestones selection", () => {
  it("a rodent program with an added quarterly inspection keeps rodent milestones", async () => {
    const { newProgram } = await import("@/lib/factories");
    const p = proposalWith(deviceProgram(50, 35));
    p.programs.push(newProgram(["consulting"], { kind: "quarterly" }, 1));
    const m = generateDocument(p, ctx(false)).find((s) => s.type === "review_milestones");
    if (m) expect(m.items.map((i) => i.title)).toContain("60-day review");
    p.kind = "consulting";
    expect(generateDocument(p, ctx(false)).find((s) => s.type === "review_milestones")!.items[0].title).toBe("Kickoff");
  });
});
