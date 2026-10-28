"use client";

import type { Proposal, SectionType, Settings } from "./types";
import { aiFetch } from "./client";
import { applyWritingRevisions } from "./commands/ops";
import { writerContext } from "./writer/aiPayload";
import { db, snapshotVersion } from "./db";
import { search } from "./retrieval";
import { generateSection, type WriterContext } from "./writer/generate";

export interface RewriteResult {
  proposal: Proposal;
  changed: string[];
  skipped: string[];
  notes: string[];
  mode: "ai" | "template";
}

/** AI rewrite of selected sections. Pricing, scope and contractual sections are protected by applyWritingRevisions. */
export async function aiRewrite(p: Proposal, settings: Settings | undefined, opts: { instruction: string; target: "all" | SectionType | string[]; allowContractual: boolean }): Promise<RewriteResult> {
  const enabled = p.document.sections.filter((s) => s.enabled);
  const ids = Array.isArray(opts.target) ? opts.target : enabled.filter((s) => opts.target === "all" || s.type === opts.target).map((s) => s.id);
  const knowledge = await db().knowledge.toArray();
  const hits = search(knowledge, `${p.property.propertyType} ${p.programs.flatMap((x) => x.services).join(" ")} ${opts.instruction}`, 4);
  const research = p.research.filter((r) => r.status === "accepted").map((r) => ({ topic: r.topic, summary: r.summary, sources: r.sources.map((s) => s.url) }));
  const sections = p.document.sections.map((s) => ({ id: s.id, type: s.type, eyebrow: s.eyebrow, headline: s.headline, headlineAccent: s.headlineAccent, body: s.body, items: s.items, callout: s.callout, contractual: s.contractual }));
  const res = await aiFetch<{ revisions: unknown[]; notes: string[] }>("/api/ai/write", { instruction: opts.instruction, context: writerContext(p), sections, targetSectionIds: ids, research, knowledge: hits.map((h) => `[${h.docName}] ${h.chunk.text}`) }, settings);
  await snapshotVersion(p, `Before AI rewrite: ${opts.instruction.slice(0, 80)}`);
  const out = applyWritingRevisions(p, res.revisions, { allowContractual: opts.allowContractual, source: "ai" });
  return { ...out, notes: res.notes, mode: "ai" };
}

/** Offline fallback: regenerate sections from the template writer. */
export function templateRegenerate(p: Proposal, ctx: WriterContext, target: "all" | SectionType | string[]): RewriteResult {
  const next = structuredClone(p);
  const changed: string[] = [];
  for (const s of next.document.sections) {
    const hit = Array.isArray(target) ? target.includes(s.id) : target === "all" || s.type === target;
    if (!hit) continue;
    const g = generateSection(s.type, next, ctx);
    Object.assign(s, { eyebrow: g.eyebrow, headline: g.headline, headlineAccent: g.headlineAccent, body: g.body, items: g.items, callout: g.callout, source: "template", updatedAt: g.updatedAt });
    changed.push(s.id);
  }
  return { proposal: next, changed, skipped: [], notes: [], mode: "template" };
}

/** Claude writes the portrait story for this proposal; prices, terms and the summary are attached by code. */
export async function aiStory(p: Proposal, settings: Settings | undefined, instruction?: string): Promise<Proposal> {
  const { finalizeAIStory, priceKeys, storyFacts } = await import("./story/ai");
  const sections = p.document.sections.filter((s) => s.enabled);
  const out = await aiFetch<import("./ai/tasks/story").StoryOutput>("/api/ai/story", { facts: storyFacts(p, sections), priceKeys: priceKeys(p).map(({ key, label }) => ({ key, label })), length: p.document.options.length ?? "full", instruction }, settings);
  const next = { ...p, story: finalizeAIStory(out, p, sections) };
  await snapshotVersion(p, "Before Claude wrote the proposal story");
  return next;
}
