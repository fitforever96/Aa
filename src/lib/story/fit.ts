import type { Fitted } from "../pdf/fit";
import { countPdfPages, squeezeLastPage } from "../pdf/fit";
import { PAGE_TARGET } from "../pdf/condense";
import { storyPlans, type StoryModel, type StoryPlan } from "./resolve";

/** Render the story at the fullest plan that fits its page budget, then avoid a nearly empty last page. */
export async function fitStory(m: StoryModel, render: (plan: StoryPlan, squeeze: number) => Promise<Uint8Array>): Promise<Fitted & { plan: StoryPlan }> {
  const target = PAGE_TARGET[m.length];
  let last: (Fitted & { plan: StoryPlan }) | null = null;
  for (const plan of storyPlans(m.blocks, m.length)) {
    const bytes = await render(plan, 0);
    const pages = countPdfPages(bytes);
    last = { bytes, pages, target, level: plan.level, variant: 0, fits: target == null || pages <= target, plan };
    if (last.fits) break;
  }
  // Fill leftover space: try adding dropped blocks back (most valuable first) and keep each one that still fits.
  let best = last!;
  if (best.fits && best.plan.drop.length && target != null)
    for (const i of [...best.plan.drop].reverse()) {
      const plan = { level: best.plan.level, drop: best.plan.drop.filter((d) => d !== i) };
      const bytes = await render(plan, 0);
      const pages = countPdfPages(bytes);
      if (pages <= target) best = { ...best, bytes, pages, plan };
    }
  const plan = best.plan;
  const squeezed = await squeezeLastPage(best, (sq) => render(plan, sq));
  return { ...squeezed, plan };
}
