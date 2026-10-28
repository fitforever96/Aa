import type { DocLength } from "../types";
import { FIT_LEVELS, PAGE_TARGET } from "./condense";

/** Page count straight from the PDF bytes (react-pdf writes one /Type /Page object per page). */
export function countPdfPages(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

export interface Fitted {
  bytes: Uint8Array;
  level: number;
  variant: number;
  pages: number;
  target: number | null;
  fits: boolean;
}

/**
 * Render at increasing condense levels until the document fits its page budget.
 * Returns the first level that fits, or the most condensed attempt if none does.
 */
/**
 * After fitting, try slightly tighter spacing at the same level; keep it only when it saves a page
 * (so a document never ends on a nearly empty page when a little tightening avoids it).
 */
export async function squeezeLastPage(fit: Fitted, render: (squeeze: number) => Promise<Uint8Array>, steps = [1, 2]): Promise<Fitted> {
  if (fit.pages <= 1) return fit;
  for (const sq of steps) {
    const bytes = await render(sq);
    const pages = countPdfPages(bytes);
    if (pages < fit.pages) return { ...fit, bytes, pages, fits: fit.target == null || pages <= fit.target };
  }
  return fit;
}

export async function renderToFit(length: DocLength, render: (level: number, variant: number) => Promise<Uint8Array>, opts: { levels?: number[]; variants?: number } = {}): Promise<Fitted> {
  const target = PAGE_TARGET[length];
  const variants = opts.variants ?? (length === "one_page" ? 3 : 1);
  let last: Fitted | null = null;
  for (const level of opts.levels ?? FIT_LEVELS[length])
    for (let variant = 0; variant < variants; variant++) {
      const bytes = await render(level, variant);
      const pages = countPdfPages(bytes);
      last = { bytes, level, variant, pages, target, fits: target == null || pages <= target };
      if (last.fits) return last;
    }
  return last!;
}
