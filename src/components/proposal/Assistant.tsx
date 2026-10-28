"use client";

import { useState } from "react";
import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { Send, Sparkles, Wand2 } from "lucide-react";
import { Badge, Callout, Sheet, Spinner } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { IntakePreview } from "@/components/IntakePreview";
import { useToast } from "@/components/shell/Toast";
import { parseCommand, parseIntake, type IntakeExtraction } from "@/lib/commands/parse";
import { applyOps, categorize, describeOp, requiresApproval, type Op } from "@/lib/commands/ops";
import { aiFetch, useAIStatus, useSettings } from "@/lib/client";
import { aiRewrite, templateRegenerate } from "@/lib/aiActions";
import { generateSection, type WriterContext } from "@/lib/writer/generate";
import { applyIntake } from "@/lib/templates";
import { db, snapshotVersion } from "@/lib/db";
import { formatMinutes, formatMoney, laborCents } from "@/lib/engine/money";
import { priceProposal } from "@/lib/engine/pricing";
import { runQC } from "@/lib/qc";
import type { ServiceCategory } from "@/lib/types";
import type { StepProps } from "./types";

const CAT_TONE = { writing: "info", design: "info", analysis: "neutral", financial: "red", scope: "warn", contractual: "warn" } as const;

export function Assistant({ open, onClose, ...props }: StepProps & { open: boolean; onClose: () => void }) {
  const { proposal: p, replace } = props;
  const toast = useToast();
  const settings = useSettings();
  const capabilities = useLiveQuery(() => db().capabilities.toArray(), []);
  const ai = useAIStatus();
  const [text, setText] = useState("");
  const [ops, setOps] = useState<Op[]>([]);
  const [intake, setIntake] = useState<IntakeExtraction | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [explanation, setExplanation] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const ctx: WriterContext | null = settings && capabilities ? { settings, capabilities, includeGuarantee: false, includeReporting: false } : null;

  const reset = () => {
    setOps([]);
    setIntake(null);
    setApproved(new Set());
    setExplanation("");
  };

  const interpret = async (useAI: boolean) => {
    reset();
    setResults([]);
    if (!text.trim()) return;
    if (useAI) {
      setBusy("ai");
      try {
        const summary = { title: p.title, kind: p.kind, programs: p.programs.map((x, i) => ({ index: i, name: x.name, frequency: x.frequency.kind, equipment: x.equipment.map((e) => `${e.quantity} ${e.name}`) })), sections: p.document.sections.map((s) => s.type) };
        const r = await aiFetch<{ ops: Op[]; intake: (Partial<IntakeExtraction> & { services: string[] }) | null; explanation: string }>("/api/ai/command", { command: text, summary }, settings);
        setOps(r.ops);
        setExplanation(r.explanation);
        if (r.intake) {
          const local = parseIntake(text);
          setIntake({ ...local, ...Object.fromEntries(Object.entries(r.intake).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))), services: (r.intake.services.length ? r.intake.services : local.services) as ServiceCategory[], frequency: local.frequency, raw: text } as IntakeExtraction);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "AI interpretation failed", "error");
      } finally {
        setBusy(null);
      }
      return;
    }
    const r = parseCommand(text);
    if (r.intake) setIntake(r.intake);
    setOps(r.ops);
    if (!r.understood) setExplanation(ai?.configured ? "I couldn’t map that to a structured change offline. Try “Interpret with AI”." : "I couldn’t map that to a structured change. Try phrasing like “Change service to twice monthly” or “Add an IPM page”.");
  };

  const apply = async () => {
    setBusy("apply");
    const out: string[] = [];
    try {
      let next = p;
      if (intake) {
        next = structuredClone(next);
        applyIntake(next, intake, await db().equipment.toArray());
        out.push("Applied stated property and equipment details.");
      }
      const r = applyOps(next, ops, approved);
      next = r.proposal;
      out.push(...r.messages);
      if (r.pending.length) out.push(`${r.pending.length} change(s) not applied — they need your approval.`);
      for (const op of r.applied) {
        if (op.op === "show_price_at_rate") {
          for (const pr of priceProposal(next)) {
            const prog = next.programs.find((x) => x.id === pr.programId)!;
            out.push(`${prog.name}: at ${formatMoney(op.cents)}/hr, recurring labor = ${formatMoney(laborCents(pr.estimate.recurring.technicianMinutes, op.cents))} (${formatMinutes(pr.estimate.recurring.technicianMinutes)}); initial = ${formatMoney(laborCents(pr.estimate.initial.technicianMinutes, op.cents))}. Nothing was changed.`);
          }
        }
        if (op.op === "explain_estimate") {
          for (const pr of priceProposal(next)) {
            const prog = next.programs.find((x) => x.id === pr.programId)!;
            const e = pr.estimate;
            out.push(`${prog.name}: device servicing ${formatMinutes(e.deviceServicing.minutes)} (confirmed); full recurring visit ${formatMinutes(e.recurring.technicianMinutes)} technician time, about ${formatMinutes(e.recurring.elapsedMinutes)} elapsed with ${e.technicians} technician(s); initial ${formatMinutes(e.initial.technicianMinutes)}. Confidence: ${e.confidence.level}.`);
          }
        }
        if (op.op === "hide_internal_details") {
          const leak = runQC(next).find((c) => c.id === "doc_internal_leak")!;
          out.push(`Customer PDFs never include labor minutes, the hourly estimating rate, per-door math or yields — they’re excluded by design. Current check: ${leak.status === "pass" ? "no internal details found in the text" : leak.detail}.`);
        }
      }
      if (r.needsWriting.length && ctx) {
        for (const op of r.needsWriting) {
          if (op.op === "add_section") {
            next = structuredClone(next);
            const insertAt = Math.max(0, next.document.sections.findIndex((s) => s.type === "investment"));
            next.document.sections.splice(insertAt, 0, generateSection(op.sectionType, next, ctx));
            out.push(`Added section: ${op.sectionType.replace(/_/g, " ")}.`);
          } else if (op.op === "rewrite" || op.op === "condense") {
            const instruction = op.op === "condense" ? `Condense the proposal to about ${op.maxPages} pages. Tighten wording and shorten cards. Do not omit essential scope, exclusions, responsibilities or pricing.` : op.instruction;
            if (ai?.configured && settings?.ai.consent) {
              const w = await aiRewrite(next, settings, { instruction, target: op.op === "rewrite" ? op.target : "all", allowContractual: false });
              next = w.proposal;
              out.push(`AI revised ${w.changed.length} section(s); pricing and scope unchanged.${w.skipped.length ? ` Protected sections skipped: ${w.skipped.length}.` : ""}`, ...w.notes);
            } else if (op.op === "rewrite") {
              const w = templateRegenerate(next, ctx, op.target);
              next = w.proposal;
              out.push(`Regenerated ${w.changed.length} section(s) with the offline writer (AI not available).`);
            } else {
              next = structuredClone(next);
              const optional = ["reporting_capability", "documentation", "program_objectives", "review_milestones", "property_assessment", "service_methodology", "photos", "floor_plans"];
              let removed = 0;
              for (const s of next.document.sections) if (s.enabled && optional.includes(s.type) && removed < 4) (s.enabled = false), removed++;
              out.push(`Offline condense: hid ${removed} optional section(s). Contractual sections and pricing were kept. Re-enable any on the Document step.`);
            }
          }
        }
      }
      if (next !== p) {
        await snapshotVersion(p, `Before assistant: ${text.slice(0, 80)}`);
        replace(next);
      }
      setResults(out.length ? out : ["Done."]);
      reset();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not apply", "error");
    } finally {
      setBusy(null);
    }
  };

  const gated = ops.map((o, i) => ({ o, i })).filter(({ o }) => requiresApproval(o));

  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Sparkles size={17} className="text-red" /> Assistant</span>} wide>
      <div className="space-y-3">
        <VoiceInput value={text} onChange={setText} rows={3} placeholder="e.g. Change service to twice monthly · Add an IPM page · Show me the price at $210 an hour · Keep pricing exactly the same but give me a stronger executive overview" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!text.trim() || !!busy} onClick={() => interpret(false)}><Wand2 size={16} /> Interpret</button>
          {ai?.configured && <button className="btn-ghost" disabled={!text.trim() || !!busy} onClick={() => interpret(true)}>{busy === "ai" ? <Spinner /> : <Sparkles size={16} />} Interpret with AI</button>}
        </div>
        {explanation && <Callout>{explanation}</Callout>}
        {intake && (
          <div>
            <div className="eyebrow mb-1.5">Details to apply (scope change)</div>
            <IntakePreview x={intake} />
          </div>
        )}
        {ops.length > 0 && (
          <div className="card divide-hair overflow-hidden">
            {ops.map((o, i) => {
              const gate = requiresApproval(o);
              const on = approved.has(i);
              return (
                <label key={i} className={clsx("flex items-start gap-3 px-4 py-3", gate && "cursor-pointer")}>
                  {gate ? (
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--red))]" checked={on} onChange={() => setApproved((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-ok/30" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{describeOp(o, p)}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge tone={CAT_TONE[categorize(o)]}>{categorize(o)}</Badge>
                      <span className="text-[12px] text-ink3">{gate ? (on ? "Approved by you" : "Requires your approval") : "Applies directly"}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        {(ops.length > 0 || intake) && (
          <button className="btn-primary w-full" disabled={!!busy || (gated.length > 0 && gated.every(({ i }) => !approved.has(i)) && ops.length === gated.length && !intake)} onClick={apply}>
            {busy === "apply" ? <Spinner /> : <Send size={16} />} Apply {gated.length ? `(${approved.size}/${gated.length} approved)` : ""}
          </button>
        )}
        {intake && <p className="text-[12px] text-ink3">Applying details changes scope; tapping Apply is your approval for those stated facts.</p>}
        {results.length > 0 && (
          <div className="space-y-2 rounded-xl bg-surface2 p-3 text-[13.5px] leading-relaxed">
            {results.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        )}
        <p className="text-[11.5px] text-ink3">Writing and design changes apply directly. Changes to pricing, equipment, frequency, guarantees, exclusions or contractual content always wait for your approval.{ai?.configured ? " “Interpret with AI” sends this instruction plus a short summary (program names, frequencies, equipment counts, section list) to the configured provider." : ""}</p>
      </div>
    </Sheet>
  );
}
