"use client";

import type { ChatTurn, DocLength, Proposal } from "../types";
import type { ComposeSpecT } from "../ai/tasks/compose";
import { activeAssumptionVersion, db, getSettings, saveProposal, snapshotVersion } from "../db";
import { aiFetch } from "../client";
import { imageFileToDataUrl } from "../images";
import { readImportFile } from "../import/files";
import { applyOps, type Op } from "../commands/ops";
import { normalizeNumberWords, parseCommand, parseFrequency } from "../commands/parse";
import { formatMoney } from "../engine/money";
import { resolveRate } from "../engine/pricing";
import { quickBuild } from "../quick/run";
import { parseAddress } from "../quick/brief";
import { nowISO, uid } from "../ids";
import { applySpec, coreCheck, diff, proposalAmounts, statedAmounts, toEngineState } from "./apply";

export type ComposeStep = "read" | "lookup" | "compose" | "apply" | "check";

export interface PreparedAttachment {
  kind: "image" | "pdf" | "text";
  name: string;
  mediaType: string;
  /** Base64 for images and PDFs; plain text for text documents. */
  data: string;
  /** Data URL for images (shown in the chat and saved as a site photo). */
  preview?: string;
}

/** Read a picked file into something the engine can see. Images are downscaled; DOCX/TXT become text. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const name = file.name || "attachment";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(name)) {
    const url = await imageFileToDataUrl(file, 1600);
    const [head, data] = url.split(",");
    return { kind: "image", name, mediaType: head.match(/data:(.*?);/)?.[1] ?? "image/jpeg", data, preview: url };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > 24 * 1024 * 1024) throw new Error("PDFs over 24 MB can't be sent. Split it or attach the key pages.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { kind: "pdf", name, mediaType: "application/pdf", data: btoa(bin) };
  }
  const r = await readImportFile(file);
  return { kind: "text", name, mediaType: "text/plain", data: r.text.slice(0, 60_000) };
}

/** When the engine should look the site up online first: new proposals naming a place, or when asked. */
export function wantsLookup(request: string, isNew: boolean): boolean {
  if (/\b(look ?(it )?up|research|find out|search)\b/i.test(request)) return true;
  if (!isNew) return false;
  return !!parseAddress(request) || /\b(at|for)\s+[A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+)+/.test(request);
}

const LENGTH_WORDS: [RegExp, DocLength][] = [
  [/\b(one|1)[\s-]*page(r)?\b/i, "one_page"],
  [/\b(two|2)[\s-]*pages?\b/i, "two_page"],
  [/\b(short|brief)\b/i, "short"],
  [/\b(full|detailed|complete|long)\b/i, "full"],
];

/**
 * Offline revisions: the strict command parser plus everyday chat phrasing
 * ("make it $300 a visit", "setup $500", "go every two weeks").
 */
export function chatOps(request: string, p: Proposal): { ops: Op[]; notes: string[] } {
  const ops = parseCommand(request).ops;
  const notes: string[] = [];
  const t = normalizeNumberWords(request).toLowerCase();
  if (!ops.some((o) => o.op === "set_frequency")) {
    const f = /\b(make it|switch|change|go|move|service)\b|^\s*(weekly|biweekly|monthly|quarterly|every)/.test(t) ? parseFrequency(t) : null;
    if (f && JSON.stringify(f) !== JSON.stringify(p.programs[0]?.frequency)) ops.push({ op: "set_frequency", frequency: f });
  }
  if (!ops.some((o) => o.op === "set_price_override")) {
    for (const m of t.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)(?:\s*(?:a|an|per|\/|each)\s*(visit|service|treatment|month))?/g)) {
      const cents = Math.round(Number(m[1].replace(/,/g, "")) * 100);
      if (!(cents > 0)) continue;
      const before = t.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
      const initial = /(initial|setup|set-up|first service|start-?up|one[- ]time)/.test(before + (m[2] ?? ""));
      const freq = ops.find((o): o is Extract<Op, { op: "set_frequency" }> => o.op === "set_frequency")?.frequency ?? p.programs[0]?.frequency;
      if (m[2] === "month" && freq?.kind !== "monthly") {
        notes.push(`${formatMoney(cents)} a month wasn't applied: the service isn't monthly, and I don't convert monthly prices to per-visit on my own. Tell me the per-visit price.`);
        continue;
      }
      ops.push({ op: "set_price_override", phase: initial ? "initial" : "recurring", cents, lock: true });
    }
  }
  return { ops, notes };
}

export interface TurnResult {
  proposal: Proposal;
  turn: ChatTurn;
}

/**
 * One conversation turn. With Claude: optional web lookup, then the engine returns the complete
 * proposal state, which is validated and applied. Without Claude: the local engine builds new
 * proposals and the offline command parser handles simple revisions.
 */
export async function composeTurn(opts: { proposalId: string | null; request: string; attachments: PreparedAttachment[]; useAI: boolean; length: DocLength; onStep: (s: ComposeStep) => void }): Promise<TurnResult> {
  const { request, attachments, useAI, onStep } = opts;
  onStep("read");
  const settings = await getSettings();
  const base = opts.proposalId ? ((await db().proposals.get(opts.proposalId)) ?? null) : null;
  const [version, catalog, capabilities] = await Promise.all([activeAssumptionVersion(), db().equipment.toArray(), db().capabilities.toArray()]);
  const deps = { settings: { ...settings, defaults: { ...settings.defaults, docLength: opts.length } }, version, catalog, capabilities };
  const userTurn: ChatTurn = { id: uid("turn"), role: "user", text: request, at: nowISO(), attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })) };
  const history = base?.chat ?? [];

  let proposal: Proposal;
  let reply: ChatTurn;
  let beforeVersionId: string | null = null;
  if (base) beforeVersionId = (await snapshotVersion(base, `Before: ${request.slice(0, 80)}`)).id;

  if (useAI) {
    let lookupNotes: string | null = null;
    if (wantsLookup(request, !base)) {
      onStep("lookup");
      try {
        const r = await aiFetch<{ notes: string; sources: { url: string; title: string }[] }>("/api/ai/lookup", { request }, settings);
        lookupNotes = [r.notes, r.sources.length ? `Sources retrieved:\n${r.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
      } catch {
        lookupNotes = null;
      }
    }
    onStep("compose");
    const sections = base ? base.document.sections.filter((s) => s.enabled) : [];
    const rate = base ? resolveRate(base).cents : version.assumptions.laborRateCentsPerHour;
    const spec = await aiFetch<ComposeSpecT>(
      "/api/ai/compose",
      {
        request,
        transcript: history.slice(-20).map((t) => ({ role: t.role, text: t.text.slice(0, 20_000) })),
        current: base ? toEngineState(base, sections) : null,
        lookupNotes,
        attachments: attachments.map(({ kind, name, mediaType, data }) => ({ kind, name, mediaType, data })),
        defaults: { length: opts.length, laborRate: `${formatMoney(rate)}/hr` },
      },
      settings,
    );
    onStep("apply");
    const allowed = new Set([...statedAmounts([request, ...history.filter((t) => t.role === "user").map((t) => t.text), ...attachments.filter((a) => a.kind === "text").map((a) => a.data)]), ...(base ? proposalAmounts(base) : [])]);
    const r = applySpec(spec, base, deps, allowed);
    proposal = r.proposal;
    reply = { id: uid("turn"), role: "assistant", text: spec.reply, at: nowISO(), changes: r.changes, assumptions: spec.assumptions, guards: r.dropped, questions: spec.questions, mode: "ai" };
  } else if (!base) {
    onStep("compose");
    const notes = [request, ...attachments.filter((x) => x.kind === "text").map((x) => x.data)].join("\n\n");
    const q = await quickBuild(notes, false, () => {}, opts.length);
    proposal = q.proposal;
    reply = { id: uid("turn"), role: "assistant", text: "Built with the local engine (Claude isn't connected). Connect Claude in Settings for research, findings and custom writing.", at: nowISO(), assumptions: [...q.plan.assumptions, ...(q.priceNote ? [q.priceNote] : [])], questions: q.plan.fieldVerification.slice(0, 2), mode: "offline" };
  } else {
    onStep("compose");
    const parsed = chatOps(request, base);
    const r = applyOps(base, parsed.ops, new Set(parsed.ops.map((_, i) => i)));
    proposal = r.proposal;
    const len = LENGTH_WORDS.find(([re]) => re.test(request))?.[1];
    if (len) proposal.document.options.length = len;
    const changes = diff(base, proposal);
    reply = {
      id: uid("turn"),
      role: "assistant",
      text: changes.length ? "Done with the local engine." : "Without Claude connected I can only make simple changes here (price, frequency, devices, technicians, length, cover). Connect Claude in Settings for anything else.",
      at: nowISO(),
      changes,
      guards: parsed.notes,
      mode: "offline",
    };
  }

  onStep("check");
  reply.core = coreCheck(proposal);
  reply.beforeVersionId = beforeVersionId;
  // Photos attached in chat become site photos on the proposal.
  for (const a of attachments.filter((x) => x.kind === "image" && x.preview))
    await db().assets.add({ id: uid("ast"), proposalId: proposal.id, kind: "photo", name: a.name, mime: a.mediaType, dataUrl: a.preview!, caption: "", createdAt: nowISO() });
  proposal.chat = [...history, userTurn, reply];
  proposal.wizardStep = 7;
  await saveProposal(proposal);
  return { proposal, turn: reply };
}
