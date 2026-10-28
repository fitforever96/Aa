import type { PdfQAResult, QCCheck } from "../qc";

/**
 * Rendered-PDF inspection. Parses the generated file (not the source data) and
 * measures every text run's position and size on every page.
 * Performed: clipping/out-of-bounds text, text-on-text overlap, blank and
 * near-empty pages, minimum font size, left-margin consistency.
 * Not performed (reported as not_run): pixel-level contrast analysis.
 */

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}
// Minimal structural typing for pdfjs so the analyzer runs with the browser or Node build.
export interface PdfjsLike {
  getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<PageLike> }> };
  OPS: Record<string, number>;
}
interface PageLike {
  view: number[];
  getTextContent: () => Promise<{ items: unknown[] }>;
  getOperatorList: () => Promise<{ fnArray: number[] }>;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  s: string;
  size: number;
}

export async function analyzePdf(data: Uint8Array, pdfjs: PdfjsLike): Promise<PdfQAResult> {
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, disableFontFace: true }).promise;
  const pages: PdfQAResult["pages"] = [];
  const clipped: string[] = [];
  const overlaps: string[] = [];
  const blank: number[] = [];
  const sparse: number[] = [];
  let minFont = Infinity;
  let minFontPage = 0;
  const leftEdges: number[] = [];
  const imageOps = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].filter((x) => x != null);

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [, , W, H] = page.view;
    const tc = await page.getTextContent();
    const ops = await page.getOperatorList();
    const images = ops.fnArray.filter((f) => imageOps.includes(f)).length;
    const boxes: Box[] = (tc.items as TextItemLike[])
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => {
        const size = Math.hypot(i.transform[2], i.transform[3]) || i.height;
        return { x: i.transform[4], y: i.transform[5], w: i.width, h: size, s: i.str, size };
      });
    const chars = boxes.reduce((a, b) => a + b.s.length, 0);
    const issues: string[] = [];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.w);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y + b.h);
      if (b.x < -0.5 || b.x + b.w > W + 0.5 || b.y < -0.5 || b.y + b.h * 0.8 > H + 0.5) {
        clipped.push(`p${n}: “${b.s.slice(0, 40)}”`);
        issues.push("text outside page");
      }
      if (b.size < minFont) {
        minFont = b.size;
        minFontPage = n;
      }
    }
    // Text-on-text overlap (different runs whose boxes intersect substantially).
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (Math.abs(a.y - b.y) < 0.5 && (a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5)) continue;
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h * 0.75, b.y + b.h * 0.75) - Math.max(a.y, b.y);
        if (ix > 1 && iy > 1) {
          const area = ix * iy;
          const small = Math.min(a.w * a.h * 0.75, b.w * b.h * 0.75);
          if (small > 0 && area / small > 0.25) {
            overlaps.push(`p${n}: “${a.s.slice(0, 24)}” × “${b.s.slice(0, 24)}”`);
            issues.push("overlapping text");
          }
        }
      }
    }
    if (n > 1) {
      const body = boxes.filter((b) => b.y > 60 && b.y < H - 80);
      if (!body.length && images === 0) blank.push(n);
      else if (n < doc.numPages) {
        const top = Math.max(...body.map((b) => b.y + b.h));
        const bottom = Math.min(...body.map((b) => b.y));
        const fill = (top - bottom) / (H - 140);
        if (fill < 0.22 && images === 0) {
          sparse.push(n);
          issues.push(`content fills ${Math.round(fill * 100)}% of page`);
        }
      }
      if (body.length) leftEdges.push(Math.min(...body.map((b) => b.x)));
    }
    pages.push({ index: n, chars, images, minX, maxX, minY, maxY, issues: [...new Set(issues)] });
  }

  const spread = leftEdges.length ? Math.max(...leftEdges) - Math.min(...leftEdges) : 0;
  const checks: QCCheck[] = [
    { id: "vis_pages", group: "visual", label: "Rendered PDF inspected", status: "pass", detail: `${doc.numPages} pages parsed from the generated file.` },
    { id: "vis_clip", group: "visual", label: "No clipped or off-page text", status: clipped.length ? "fail" : "pass", detail: clipped.length ? clipped.slice(0, 5).join("; ") : "All text runs lie within page bounds." },
    { id: "vis_overlap", group: "visual", label: "No overlapping text", status: overlaps.length ? "fail" : "pass", detail: overlaps.length ? overlaps.slice(0, 5).join("; ") : "No text runs overlap." },
    { id: "vis_blank", group: "visual", label: "No blank pages", status: blank.length ? "fail" : "pass", detail: blank.length ? `Blank pages: ${blank.join(", ")}` : "Every page has content." },
    { id: "vis_sparse", group: "visual", label: "No nearly-empty pages", status: sparse.length ? "warn" : "pass", detail: sparse.length ? `Low content on page(s) ${sparse.join(", ")} — consider removing a short section or adding photos.` : "Page fill is balanced." },
    { id: "vis_font", group: "visual", label: "Readable type size", status: minFont < 6 ? "warn" : "pass", detail: Number.isFinite(minFont) ? `Smallest text ${minFont.toFixed(1)} pt (page ${minFontPage}).` : "No text found." },
    { id: "vis_margins", group: "visual", label: "Consistent margins", status: spread > 14 ? "warn" : "pass", detail: `Left content edge varies ${spread.toFixed(1)} pt across content pages.` },
    { id: "vis_contrast", group: "visual", label: "Pixel-level contrast analysis", status: "not_run", detail: "Not available in this environment; the color palette is fixed to high-contrast tokens." },
  ];
  return { ranAt: new Date().toISOString(), pageCount: doc.numPages, checks, pages };
}
