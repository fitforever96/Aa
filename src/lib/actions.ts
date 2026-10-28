"use client";

import { activeAssumptionVersion, db, getSettings, saveProposal, snapshotVersion } from "./db";
import { newProposal } from "./factories";
import { STARTER_TEMPLATES, applyIntake, applyTemplate } from "./templates";
import type { IntakeExtraction } from "./commands/parse";
import type { Proposal, ProposalStatus } from "./types";
import { customerPriceMap } from "./engine/pricing";
import { nowISO, uid } from "./ids";

export async function createProposal(opts: { template?: string; intake?: IntakeExtraction; title?: string } = {}): Promise<Proposal> {
  const settings = await getSettings();
  const version = await activeAssumptionVersion();
  const catalog = await db().equipment.toArray();
  const p = newProposal(settings, version);
  const t = STARTER_TEMPLATES.find((x) => x.key === (opts.template ?? "blank")) ?? STARTER_TEMPLATES[0];
  applyTemplate(p, t, catalog);
  if (opts.intake) applyIntake(p, opts.intake, catalog);
  if (opts.title) p.title = opts.title;
  await saveProposal(p);
  if (opts.template && opts.template !== "blank") {
    const recent = [opts.template, ...settings.recentTemplates.filter((k) => k !== opts.template)].slice(0, 4);
    await db().settings.put({ ...settings, recentTemplates: recent });
  }
  return p;
}

export async function duplicateProposal(id: string): Promise<Proposal> {
  const src = await db().proposals.get(id);
  if (!src) throw new Error("Proposal not found");
  const copy: Proposal = { ...structuredClone(src), id: uid("pro"), title: `${src.title} (copy)`, status: "draft", approvedSnapshot: null, createdAt: nowISO(), updatedAt: nowISO() };
  await saveProposal(copy);
  return copy;
}

export async function deleteProposal(id: string) {
  await db().transaction("rw", [db().proposals, db().versions, db().assets], async () => {
    await db().proposals.delete(id);
    await db().versions.where("proposalId").equals(id).delete();
    await db().assets.where("proposalId").equals(id).delete();
  });
}

/** Status transitions. Approval freezes a price snapshot that QC checks against. */
export function withStatus(p: Proposal, status: ProposalStatus): Proposal {
  const next = { ...p, status };
  if (status === "approved" && !p.approvedSnapshot) next.approvedSnapshot = { approvedAt: nowISO(), prices: customerPriceMap(p) };
  if (status === "draft" || status === "in_review") next.approvedSnapshot = null;
  return next;
}

export async function setStatus(p: Proposal, status: ProposalStatus) {
  const next = withStatus(p, status);
  await saveProposal(next);
  await snapshotVersion(next, `Status changed to ${status.replace(/_/g, " ")}`);
  return next;
}

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  sent: "Sent",
  active: "Active account",
  archived: "Archived",
};
export const STATUS_TONE: Record<ProposalStatus, "neutral" | "red" | "ok" | "warn" | "info"> = {
  draft: "neutral",
  in_review: "info",
  awaiting_approval: "warn",
  approved: "ok",
  sent: "ok",
  active: "red",
  archived: "neutral",
};
