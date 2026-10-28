"use client";

import { Plus, Trash2 } from "lucide-react";
import { Callout, Card, SectionTitle, Select } from "@/components/ui";
import { uid } from "@/lib/ids";
import type { RfpRequirement } from "@/lib/types";
import type { StepProps } from "./types";

const STARTER: Omit<RfpRequirement, "id">[] = [
  { requirement: "Mandatory services and service areas", category: "service", mandatory: true, status: "open", response: "" },
  { requirement: "Required pricing format / bid sheet", category: "pricing_format", mandatory: true, status: "open", response: "" },
  { requirement: "Contract duration and renewal terms", category: "contract", mandatory: true, status: "open", response: "" },
  { requirement: "Insurance and licensing documentation", category: "documentation", mandatory: true, status: "open", response: "" },
  { requirement: "Reporting requirements", category: "reporting", mandatory: true, status: "open", response: "" },
  { requirement: "Submission format, due date and signatures", category: "submission", mandatory: true, status: "open", response: "" },
];

/** Internal RFP requirements matrix (master memory §43). Never printed in the customer PDF. */
export function RfpMatrix({ proposal: p, update }: StepProps) {
  const reqs = p.rfpRequirements ?? [];
  const set = (fn: (r: RfpRequirement[]) => void) => update((d) => { d.rfpRequirements = d.rfpRequirements ?? []; fn(d.rfpRequirements); });
  return (
    <div>
      <SectionTitle action={<button className="btn-secondary btn-sm" onClick={() => set((r) => void r.push({ id: uid("rfp"), requirement: "", category: "other", mandatory: true, status: "open", response: "" }))}><Plus size={14} /> Requirement</button>}>RFP requirements matrix</SectionTitle>
      <Callout className="mb-2.5">Map every requirement before drafting. Flag anything Orkin cannot perform or that needs operational approval; never add unsupported commitments to appear compliant. Internal only.</Callout>
      {reqs.length === 0 && (
        <Card className="flex items-center justify-between gap-3 text-[13px] text-ink3">
          No requirements yet.
          <button className="btn-secondary btn-sm" onClick={() => set((r) => void r.push(...STARTER.map((x) => ({ ...x, id: uid("rfp") }))))}>Start with standard items</button>
        </Card>
      )}
      <div className="space-y-2">
        {reqs.map((r, i) => (
          <Card key={r.id} className="space-y-2">
            <div className="flex gap-2">
              <input className="input" value={r.requirement} placeholder="Requirement (quote the RFP section)" onChange={(e) => set((x) => void (x[i].requirement = e.target.value))} />
              <button className="btn-ghost btn-sm" onClick={() => set((x) => void x.splice(i, 1))} aria-label="Remove requirement"><Trash2 size={15} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select value={r.status} onChange={(v) => set((x) => void (x[i].status = v))} options={[{ value: "open", label: "Open" }, { value: "addressed", label: "Addressed" }, { value: "needs_approval", label: "Needs approval" }, { value: "cannot_perform", label: "Cannot perform" }]} />
              <Select value={r.mandatory ? "m" : "o"} onChange={(v) => set((x) => void (x[i].mandatory = v === "m"))} options={[{ value: "m", label: "Mandatory" }, { value: "o", label: "Optional" }]} />
              <Select className="col-span-2 sm:col-span-1" value={r.category} onChange={(v) => set((x) => void (x[i].category = v))} options={[["service", "Service"], ["pricing_format", "Pricing format"], ["submission", "Submission"], ["documentation", "Documentation"], ["reporting", "Reporting"], ["contract", "Contract"], ["other", "Other"]].map(([value, label]) => ({ value: value as RfpRequirement["category"], label }))} />
            </div>
            <input className="input" value={r.response} placeholder="Where / how it is addressed" onChange={(e) => set((x) => void (x[i].response = e.target.value))} />
          </Card>
        ))}
      </div>
    </div>
  );
}
