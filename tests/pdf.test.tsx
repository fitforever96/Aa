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
