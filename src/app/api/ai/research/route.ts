import { z } from "zod";
import { errorResponse, extractJson, guard, readJson, research } from "@/server/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  topics: z.array(z.string().min(2).max(300)).min(1).max(6),
  context: z.string().max(4000),
  extraDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).max(10).optional(),
});

const Finding = z.object({ topic: z.string(), summary: z.string(), relevance: z.string(), sourceUrls: z.array(z.string()) });

const SYSTEM = `You are the research assistant inside Orkin Proposal Studio. Research the requested commercial pest-management topics using web search. Consult https://www.orkin.com/commercial first for Orkin service descriptions and terminology, then authoritative sources (EPA, CDC, USDA, OSHA, state agencies, university extension, product labels).
Report only what the sources say. Never invent citations. If a source could not be found, say so in the summary.
Finish with a single JSON code block: {"findings":[{"topic":string,"summary":string (≤120 words, practical, proposal-relevant),"relevance":string (how it should inform this proposal),"sourceUrls":[urls you actually retrieved]}]}`;

export async function POST(req: Request) {
  try {
    guard(req);
    const body = await readJson(req, Body);
    const out = await research(SYSTEM, `Proposal context: ${body.context}\n\nResearch topics:\n${body.topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`, body.extraDomains ?? []);
    const parsed = z.object({ findings: z.array(Finding) }).safeParse(extractJson(out.text));
    const retrieved = new Map(out.sources.map((s) => [s.url, s.title]));
    const retrievedAt = new Date().toISOString();
    const findings = (parsed.success ? parsed.data.findings : []).map((f) => ({
      topic: f.topic,
      summary: f.summary,
      relevance: f.relevance,
      // Keep only URLs the search tool actually returned — prevents fabricated citations.
      sources: f.sourceUrls.filter((u) => retrieved.has(u)).map((u) => ({ url: u, title: retrieved.get(u) || u, retrievedAt })),
      unverifiedUrls: f.sourceUrls.filter((u) => !retrieved.has(u)),
    }));
    return Response.json({ findings, allSources: out.sources.map((s) => ({ ...s, retrievedAt })), searches: out.searches, parsed: parsed.success });
  } catch (e) {
    return errorResponse(e);
  }
}
