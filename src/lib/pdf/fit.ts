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
export async function renderToFit(length: DocLength, render: (level: number, variant: number) => Promise<Uint8Array>): Promise<Fitted> {
  const target = PAGE_TARGET[length];
  const variants = length === "one_page" ? 3 : 1;
  let last: Fitted | null = null;
  for (const level of FIT_LEVELS[length])
    for (let variant = 0; variant < variants; variant++) {
      const bytes = await render(level, variant);
      const pages = countPdfPages(bytes);
      last = { bytes, level, variant, pages, target, fits: target == null || pages <= target };
      if (last.fits) return last;
    }
  return last!;
}
