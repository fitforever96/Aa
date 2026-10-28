import { z } from "zod";
import { callJSON, errorResponse, guard, readJson } from "@/server/ai";
import { WRITING_STANDARD } from "@/server/prompts";
import { RevisionSchema, SectionInSchema } from "@/lib/commands/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  instruction: z.string().max(4000),
  context: z.record(z.string(), z.unknown()),
  sections: z.array(SectionInSchema).max(40),
  targetSectionIds: z.array(z.string()).max(40),
  research: z.array(z.object({ topic: z.string().max(300), summary: z.string().max(4000), sources: z.array(z.string().max(600)).max(10) })).max(20),
  knowledge: z.array(z.string().max(3000)).max(10),
});

const Out = z.object({ revisions: z.array(RevisionSchema), notes: z.array(z.string()) });

export async function POST(req: Request) {
  try {
    guard(req);
    const body = await readJson(req, Body);
    const targets = body.sections.filter((s) => body.targetSectionIds.includes(s.id));
    if (!targets.length) return Response.json({ revisions: [], notes: ["No sections selected."] });
    const prompt = [
      `INSTRUCTION FROM ANTHONY: ${body.instruction || "Write strong, customer-specific copy for these sections."}`,
      `PROPOSAL FACTS (customer-facing only; use exactly):\n${JSON.stringify(body.context, null, 1)}`,
      body.research.length ? `ACCEPTED RESEARCH (may inform technical accuracy; do not cite URLs in copy):\n${body.research.map((r) => `- ${r.topic}: ${r.summary}`).join("\n")}` : "",
      body.knowledge.length ? `RELEVANT EXCERPTS FROM ANTHONY'S PRIOR PROPOSALS (style and methodology reference only — never copy another customer's prices, names or customer-specific promises):\n${body.knowledge.map((k) => `---\n${k}`).join("\n")}` : "",
      `ALL SECTIONS (for flow and to avoid repetition):\n${JSON.stringify(body.sections.map((s) => ({ id: s.id, type: s.type, headline: s.headline })), null, 0)}`,
      `SECTIONS TO REWRITE (return one revision per section, same sectionId; contractual sections must keep every commitment, exclusion and responsibility — improve wording only):\n${JSON.stringify(targets, null, 1)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const out = await callJSON({ system: WRITING_STANDARD, content: prompt, schema: Out, effort: "medium" });
    const allowed = new Set(targets.map((t) => t.id));
    return Response.json({ revisions: out.revisions.filter((r) => allowed.has(r.sectionId)), notes: out.notes });
  } catch (e) {
    return errorResponse(e);
  }
}
