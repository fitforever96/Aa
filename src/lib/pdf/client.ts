"use client";

import type { Asset, HistoricalPrice, Proposal } from "../types";
import type { PdfQAResult } from "../qc";
import { buildPdfModel } from "./model";
import { buildInternalModel } from "./internalModel";
import { withBase } from "../base";
import { renderToFit, type Fitted } from "./fit";

/** Client-side PDF generation (works offline). Heavy libraries load on demand. */

async function renderer() {
  const [r, doc] = await Promise.all([import("@react-pdf/renderer"), import("./ProposalDocument")]);
  doc.registerPdfFonts(window.location.origin + withBase(""));
  return { r, doc };
}

/** Customer PDF at the proposal's chosen length; shorter lengths are condensed until they fit. */
export async function generateCustomerPdf(p: Proposal, assets: Asset[]): Promise<Blob & { fit?: Fitted }> {
  const { r, doc } = await renderer();
  const React = await import("react");
  const m = buildPdfModel(p, assets);
  const fit = await renderToFit(m.length, async (level, variant) => {
    const el = React.createElement(doc.ProposalDocument, { m, level, variant });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Uint8Array(await (await r.pdf(el as any).toBlob()).arrayBuffer());
  });
  return Object.assign(new Blob([fit.bytes as BlobPart], { type: "application/pdf" }), { fit });
}

export async function generateInternalPdf(p: Proposal, historical: HistoricalPrice[]): Promise<Blob> {
  const { r } = await renderer();
  const React = await import("react");
  const { InternalEstimateDocument } = await import("./InternalDocument");
  const el = React.createElement(InternalEstimateDocument, { m: buildInternalModel(p, historical) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return r.pdf(el as any).toBlob();
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
export function loadPdfjs() {
  if (!pdfjsPromise)
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = withBase("/pdf.worker.min.mjs");
      return m;
    });
  return pdfjsPromise;
}

export async function inspectPdf(blob: Blob): Promise<PdfQAResult> {
  const pdfjs = await loadPdfjs();
  const { analyzePdf } = await import("./qa");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return analyzePdf(new Uint8Array(await blob.arrayBuffer()), pdfjs as any);
}

/** Render pages to images for an in-app preview (iOS Safari can't reliably show multi-page PDFs inline). */
export async function renderPreviews(blob: Blob, width = 900): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvas, viewport: vp }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}

/**
 * Replace (or prepend) the cover of an existing PDF while keeping every other page
 * byte-for-byte as rendered by the original document.
 */
export async function replaceCover(original: Uint8Array, p: Proposal, assets: Asset[], mode: "replace" | "prepend"): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(original, { ignoreEncryption: false });
  const first = src.getPage(0);
  const { width, height } = first.getSize();
  const { r, doc } = await renderer();
  const React = await import("react");
  const el = React.createElement(doc.CoverOnlyDocument, { m: buildPdfModel(p, assets), W: width, H: height });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coverBlob = await r.pdf(el as any).toBlob();
  const cover = await PDFDocument.load(new Uint8Array(await coverBlob.arrayBuffer()));
  const out = await PDFDocument.create();
  const [c] = await out.copyPages(cover, [0]);
  out.addPage(c);
  const keep = src.getPageIndices().slice(mode === "replace" ? 1 : 0);
  for (const pg of await out.copyPages(src, keep)) out.addPage(pg);
  out.setTitle(p.title);
  out.setCreator("Orkin Proposal Studio");
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
