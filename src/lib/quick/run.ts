"use client";

import type { Proposal, Settings } from "../types";
import { activeAssumptionVersion, db, getSettings, saveProposal, snapshotVersion } from "../db";
import { aiFetch } from "../client";
import { aiRewrite } from "../aiActions";
import { runQC, type QCCheck } from "../qc";
import { buildQuickProposal, mergeDraft, parseBrief, type AIDraft, type QuickPlan } from "./brief";

export type QuickStep = "read" | "lookup" | "plan" | "write" | "check";

export interface QuickResult {
  proposal: Proposal;
  plan: QuickPlan;
  priceNote: string | null;
  issues: QCCheck[];
  warnings: string[];
}

const WRITE_INSTRUCTION =
  "Write a complete, customer-specific proposal for this property and pest issue. Fill every section with concrete, site-specific detail drawn from the facts, recommendations and research. Keep it plain, direct and professional.";

/** One-shot build: read the brief, look up the property, plan, price, write and check. */
export async function quickBuild(brief: string, useAI: boolean, onStep: (s: QuickStep) => void): Promise<QuickResult> {
  const warnings: string[] = [];
  onStep("read");
  const local = parseBrief(brief);
  let settings: Settings = await getSettings();
  let plan = local;
  if (useAI) {
    onStep("lookup");
    try {
      const addr = local.address ? [local.address.line1, local.address.city, local.address.state, local.address.zip].filter(Boolean).join(", ") : null;
      const draft = await aiFetch<AIDraft>("/api/ai/draft", { brief, hints: { address: addr, customerName: local.customerName } }, settings);
      plan = mergeDraft(local, draft);
    } catch (e) {
      warnings.push(`Claude couldn't look up the property (${e instanceof Error ? e.message : "error"}). Filled in with built-in estimates instead.`);
    }
  }
  onStep("plan");
  settings = await getSettings();
  const [version, catalog, capabilities] = await Promise.all([activeAssumptionVersion(), db().equipment.toArray(), db().capabilities.toArray()]);
  const built = buildQuickProposal(plan, { settings, version, catalog, capabilities });
  let p = built.proposal;
  await saveProposal(p);

  if (useAI && plan.mode === "ai") {
    onStep("write");
    try {
      const r = await aiRewrite(p, settings, { instruction: WRITE_INSTRUCTION, target: "all", allowContractual: false });
      p = r.proposal;
      await saveProposal(p);
    } catch (e) {
      warnings.push(`Claude couldn't finish the writing (${e instanceof Error ? e.message : "error"}). The proposal uses the built-in writer; you can rewrite it from the Document step.`);
    }
  }

  onStep("check");
  await snapshotVersion(p, "Built with Quick Build");
  const issues = runQC(p).filter((c) => c.status === "fail" || c.status === "warn");
  return { proposal: p, plan: built.plan, priceNote: built.priceNote, issues, warnings };
}
