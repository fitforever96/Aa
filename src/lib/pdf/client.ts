"use client";

import type { Asset, HistoricalPrice, Proposal } from "../types";
import type { PdfQAResult } from "../qc";
import { buildPdfModel } from "./model";
import { buildInternalModel } from "./internalModel";

/** Client-side PDF generation (works offline). Heavy libraries load on demand. */

async function renderer() {
  const [r, doc] = await Promise.all([import("@react-pdf/renderer"), import("./ProposalDocument")]);
  doc.registerPdfFonts(window.location.origin);
  return { r, doc };
}

export async function generateCustomerPdf(p: Proposal, assets: Asset[]): Promise<Blob> {
  const { r, doc } = await renderer();
  const React = await import("react");
  const el = React.createElement(doc.ProposalDocument, { m: buildPdfModel(p, assets) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return r.pdf(el as any).toBlob();
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
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
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
