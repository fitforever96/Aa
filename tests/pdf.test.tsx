import { describe, it, expect, beforeAll } from "vitest";
import React from "react";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { ProposalDocument, registerPdfFonts } from "@/lib/pdf/ProposalDocument";
import { InternalEstimateDocument } from "@/lib/pdf/InternalDocument";
import { buildPdfModel } from "@/lib/pdf/model";
import { buildInternalModel } from "@/lib/pdf/internalModel";
import { analyzePdf, type PdfjsLike } from "@/lib/pdf/qa";
import { renderToFit, countPdfPages } from "@/lib/pdf/fit";
import { condenseSection, firstSentences } from "@/lib/pdf/condense";
import { warehouse, portfolio, restaurant } from "../scripts/samples";

async function textOf(buf: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: buf.slice() }).promise;
  let s = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    s += tc.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return s;
}

beforeAll(() => registerPdfFonts(path.resolve("public")));

describe("PDF export", () => {
  for (const [name, make] of [["warehouse", warehouse], ["portfolio", portfolio], ["restaurant", restaurant]] as const) {
    it(`${name}: renders a searchable PDF that passes visual inspection`, async () => {
      const p = make();
      const buf = new Uint8Array(await renderToBuffer(<ProposalDocument m={buildPdfModel(p, [])} />));
      expect(new TextDecoder().decode(buf.slice(0, 5))).toBe("%PDF-");
      const qa = await analyzePdf(buf, pdfjs as unknown as PdfjsLike);
      const byId = Object.fromEntries(qa.checks.map((c) => [c.id, c]));
      expect(byId.vis_clip.status, byId.vis_clip.detail).toBe("pass");
      expect(byId.vis_overlap.status, byId.vis_overlap.detail).toBe("pass");
      expect(byId.vis_blank.status).toBe("pass");
      const text = await textOf(buf);
      expect(text).toContain("ORKIN");
      // Customer PDF must not expose internal estimating details or annualized totals by default.
      expect(text).not.toMatch(/\$210\.00\/hr|technician-min|per technician|yield|Tin Cat .*1 min/i);
      expect(text).not.toMatch(/annual(ized)? total|contract-period total/i);
    }, 60000);
  }

  it("customer PDF shows locked approved prices exactly", async () => {
    const p = warehouse();
    const buf = new Uint8Array(await renderToBuffer(<ProposalDocument m={buildPdfModel(p, [])} />));
    const text = await textOf(buf);
    expect(text).toContain("$325.00");
    expect(text).toContain("$950.00");
    expect(text).toContain("$2,092.00");
  }, 60000);

  it("contract-period totals appear only when enabled", async () => {
    const p = warehouse();
    p.document.options.showContractTotals = true;
    const text = await textOf(new Uint8Array(await renderToBuffer(<ProposalDocument m={buildPdfModel(p, [])} />)));
    expect(text).toMatch(/Contract-period total/);
  }, 60000);

  it("internal estimate PDF contains the labor model", async () => {
    const buf = new Uint8Array(await renderToBuffer(<InternalEstimateDocument m={buildInternalModel(warehouse(), [])} />));
    const text = await textOf(buf);
    expect(text).toMatch(/INTERNAL ESTIMATE/);
    expect(text).toMatch(/\$210\.00\/hr/);
  }, 60000);
});

describe("PDF text searchability", () => {
  it("headings extract as whole words", async () => {
    const buf = new Uint8Array(await renderToBuffer(<ProposalDocument m={buildPdfModel(warehouse(), [])} />));
    const text = await textOf(buf);
    expect(text).toMatch(/EXECUTIVE OVERVIEW/);
    expect(text).toMatch(/COMMERCIAL SERVICES/);
  }, 60000);
});

describe("PDF length options", () => {
  const render = (p: ReturnType<typeof warehouse>) => {
    const m = buildPdfModel(p, []);
    return renderToFit(m.length, async (level, variant) => new Uint8Array(await renderToBuffer(<ProposalDocument m={m} level={level} variant={variant} />)));
  };
  const norm = (t: string) => t.replace(/\s+/g, " ");

  for (const [length, pages] of [["one_page", 1], ["two_page", 2], ["short", 4]] as const) {
    it(`${length}: fits ${pages} page(s), keeps every price and exclusion, passes layout inspection`, async () => {
      const p = warehouse();
      p.document.options.length = length;
      const fit = await render(p);
      expect(fit.pages).toBeLessThanOrEqual(pages);
      expect(countPdfPages(fit.bytes)).toBe(fit.pages);
      const text = norm(await textOf(fit.bytes));
      for (const price of ["$325.00", "$950.00", "$2,092.00", "$375.00"]) expect(text).toContain(price);
      // Exclusions are contractual: every one survives condensing, in full.
      for (const e of p.document.sections.find((s) => s.type === "exclusions")!.body.split("\n")) expect(text).toContain(e.replace(/^- /, "").slice(0, 60));
      expect(text).toMatch(/governed by the executed Orkin service agreement/i);
      expect(text).not.toMatch(/\$210\.00\/hr|technician-min|yield/i);
      const qa = await analyzePdf(fit.bytes, pdfjs as unknown as PdfjsLike);
      const byId = Object.fromEntries(qa.checks.map((c) => [c.id, c]));
      expect(byId.vis_clip.status, byId.vis_clip.detail).toBe("pass");
      expect(byId.vis_overlap.status, byId.vis_overlap.detail).toBe("pass");
      expect(byId.vis_font.status).toBe("pass");
    }, 120000);
  }

  it("every section is represented at the shortest length", async () => {
    const p = warehouse();
    p.document.options.length = "one_page";
    const text = norm(await textOf((await render(p)).bytes)).toUpperCase();
    for (const s of p.document.sections.filter((x) => x.enabled && x.type !== "photos" && x.type !== "floor_plans")) expect(text).toContain((s.eyebrow || s.type.replace(/_/g, " ")).toUpperCase());
  }, 120000);

  it("reports honestly when a proposal can't fit (large property schedules)", async () => {
    const p = portfolio();
    p.document.options.length = "two_page";
    const fit = await render(p);
    expect(fit.fits).toBe(false);
    expect(fit.pages).toBeGreaterThan(2);
  }, 120000);
});

describe("condensing", () => {
  it("keeps abbreviations intact and never drops contractual items", () => {
    expect(firstSentences("Orkin's A.I.M.® process has three steps. Assess first.", 1)).toBe("Orkin's A.I.M.® process has three steps.");
    const p = warehouse();
    const ex = p.document.sections.find((s) => s.type === "exclusions")!;
    for (const level of [1, 2, 3, 4]) expect(condenseSection(ex, level).items.length).toBe(ex.body.split("\n").length);
  });
});
