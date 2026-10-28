import { z } from "zod";
import { research, type AICtx } from "../engine";
import { LOOKUP } from "./draft";

/** Web lookup for the proposal engine: what is at the site, plus authoritative pest guidance. */
export const Body = z.object({ request: z.string().min(1).max(20_000) });

export async function run(ctx: AICtx, body: z.infer<typeof Body>) {
  const out = await research(ctx, LOOKUP, `Anthony's request: """${body.request}"""`, [], { open: true });
  return { notes: out.text, sources: out.sources, searches: out.searches };
}
