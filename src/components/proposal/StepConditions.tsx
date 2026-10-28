"use client";

import { Card, NumberField, SectionTitle, Segmented, Select, TextField, Toggle } from "@/components/ui";
import { relevantQuestions } from "@/lib/questions";
import { DEFAULT_MODEL_PROFILES } from "@/lib/engine/assumptions";
import type { AccessLevel, ActivityLevel } from "@/lib/types";
import { Recommendations } from "./Recommendations";
import type { StepProps } from "./types";

export function StepConditions(props: StepProps) {
  const { proposal: p, update } = props;
  const pr = p.property;
  const services = [...new Set(p.programs.flatMap((x) => x.services))];
  const qs = relevantQuestions(services, pr.model);
  const prof = DEFAULT_MODEL_PROFILES[pr.model];

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Access & activity</SectionTitle>
        <Card className="space-y-4">
          <div>
            <span className="field-label">Access</span>
            <Segmented value={pr.accessLevel} onChange={(v: AccessLevel) => update((d) => void (d.property.accessLevel = v))} options={[{ value: "easy", label: "Easy" }, { value: "moderate", label: "Moderate" }, { value: "restricted", label: "Restricted" }]} />
          </div>
          <div>
            <span className="field-label">Reported pest activity</span>
            <Segmented size="sm" value={pr.activityLevel} onChange={(v: ActivityLevel) => update((d) => void (d.property.activityLevel = v))} options={[{ value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }, { value: "severe", label: "Severe" }]} />
          </div>
          <div className="divide-hair">
            <Toggle checked={pr.complexity.largeCampus} onChange={(v) => update((d) => void (d.property.complexity.largeCampus = v))} label="Large campus layout" description="Adds a walking allowance across grounds." />
            <Toggle checked={pr.complexity.complexPlacement} onChange={(v) => update((d) => void (d.property.complexity.complexPlacement = v))} label="Complex equipment placement" description="Adds access time per device; confirmed service minutes are unchanged." />
            <Toggle checked={pr.complexity.multipleAreas} onChange={(v) => update((d) => void (d.property.complexity.multipleAreas = v))} label="Multiple separate treatment areas" description="Doubles zone-to-zone access allowance." />
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Coverage per visit</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-3">
          <NumberField label="Interior coverage %" hint={`Model default ${Math.round(prof.interiorCoverage * 100)}% — total sq ft informs, but isn’t all serviced each visit.`} value={pr.interiorCoverage == null ? null : Math.round(pr.interiorCoverage * 100)} allowNull max={100} onChange={(v) => update((d) => void (d.property.interiorCoverage = v == null ? null : v / 100))} />
          <NumberField label="Exterior coverage %" hint={`Model default ${Math.round(prof.exteriorCoverage * 100)}%`} value={pr.exteriorCoverage == null ? null : Math.round(pr.exteriorCoverage * 100)} allowNull max={100} onChange={(v) => update((d) => void (d.property.exteriorCoverage = v == null ? null : v / 100))} />
          <NumberField label="Measured perimeter (ft)" hint="Blank = derived from footprint" value={pr.perimeterFt} allowNull onChange={(v) => update((d) => void (d.property.perimeterFt = v))} />
        </Card>
      </div>

      <div>
        <SectionTitle>Property conditions</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          {qs.map((q) => {
            const v = pr.conditions[q.id];
            const set = (val: string | number | boolean) => update((d) => void (d.property.conditions[q.id] = val));
            if (q.type === "number") return <NumberField key={q.id} label={q.label} hint={q.hint} value={typeof v === "number" ? v : null} allowNull onChange={(n) => set(n ?? 0)} />;
            if (q.type === "select") return <Select key={q.id} label={q.label} value={(v as string) ?? q.options![0]} onChange={set} options={q.options!.map((o) => ({ value: o, label: o }))} />;
            return <TextField key={q.id} label={q.label} hint={q.hint} value={(v as string) ?? ""} placeholder={q.placeholder} onChange={set} />;
          })}
        </Card>
        <p className="mt-2 text-[12px] text-ink3">Questions adapt to the selected services and property model. Answers are treated as confirmed customer information.</p>
      </div>
      <Recommendations {...props} />
    </div>
  );
}
