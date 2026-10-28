"use client";

import { useState } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { Card, SectionTitle, Spinner } from "@/components/ui";
import { recommendProgram } from "@/lib/engine/recommend";
import { aiFetch, useAIStatus, useSettings } from "@/lib/client";
import { useToast } from "@/components/shell/Toast";
import { allocationFromCatalog } from "@/lib/factories";
import { SEED_EQUIPMENT } from "@/lib/seed";
import { frequencyLabel } from "@/lib/engine/frequency";
import { SERVICE_LABELS } from "@/lib/engine/assumptions";
import type { ServiceRecommendation } from "@/lib/types";
import { prog, type StepProps } from "./types";

function Group({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`eyebrow mb-1.5 ${tone}`}>{title}</div>
      <ul className="space-y-1.5 text-[14px] leading-snug text-ink2">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-red" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Recommendations({ proposal: p, update, programIdx }: StepProps) {
  const pr = prog(p, programIdx);
  const idx = p.programs.indexOf(pr);
  const rules = recommendProgram(p.property, pr);
  const settings = useSettings();
  const ai = useAIStatus();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shown: ServiceRecommendation = p.recommendation ?? rules;

  const askAI = async () => {
    setBusy(true);
    try {
      const facts = {
        propertyType: p.property.propertyType,
        model: p.property.model,
        squareFeet: p.property.squareFeet,
        buildings: p.property.buildingCount,
        floors: p.property.floorCount,
        apartments: p.property.apartmentCount,
        access: p.property.accessLevel,
        activity: p.property.activityLevel,
        conditions: p.property.conditions,
        facilityNotes: p.property.facilityNotes,
        services: pr.services.map((s) => SERVICE_LABELS[s]),
        frequency: frequencyLabel(pr.frequency),
        equipment: pr.equipment.map((e) => `${e.quantity} ${e.name} (${e.location})`),
        apartmentsPerVisit: pr.apartmentsPerVisit,
      };
      const r = await aiFetch<Omit<ServiceRecommendation, "generatedBy" | "createdAt">>("/api/ai/recommend", { facts }, settings);
      update((d) => void (d.recommendation = { ...r, generatedBy: "ai", createdAt: new Date().toISOString() }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI recommendation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle action={ai?.configured ? <button className="btn-ghost btn-sm" disabled={busy} onClick={askAI}>{busy ? <Spinner size={14} /> : <Sparkles size={14} />} AI service design</button> : undefined}>
        Service design assistant · {shown.generatedBy === "ai" ? "AI" : "rules"}
      </SectionTitle>
      <Card className="space-y-4">
        <Group title="Confirmed information" items={shown.confirmed} tone="!text-ok" />
        <Group title="Reasonable assumptions" items={shown.assumptions} tone="!text-warn" />
        <Group title="Recommended services" items={shown.recommended} tone="!text-ink" />
        <Group title="Requires field verification" items={shown.fieldVerification} tone="!text-info" />
        {(rules.suggestedDevices.length > 0 || rules.suggestedTreatments.length > 0 || rules.suggestedFrequency) && (
          <div className="rounded-xl bg-surface2 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Lightbulb size={15} className="text-warn" /> Suggested starting quantities (planning assumptions)</div>
            <ul className="space-y-1 text-[13px] text-ink2">
              {rules.suggestedDevices.map((d) => (
                <li key={d.catalogItemId}>• {d.quantity} × {SEED_EQUIPMENT.find((e) => e.id === d.catalogItemId)?.name} — {d.rationale}</li>
              ))}
              {rules.suggestedTreatments.map((t) => (
                <li key={t.id}>• {t.quantity} {t.unit} — {t.label} ({t.phase})</li>
              ))}
              {rules.suggestedFrequency && <li>• Frequency: {frequencyLabel(rules.suggestedFrequency)}</li>}
            </ul>
            <button
              className="btn-secondary btn-sm mt-3"
              onClick={() => {
                update((d) => {
                  const x = d.programs[idx];
                  for (const s of rules.suggestedDevices) if (!x.equipment.some((e) => e.catalogItemId === s.catalogItemId)) x.equipment.push(allocationFromCatalog(SEED_EQUIPMENT.find((e) => e.id === s.catalogItemId)!, s.quantity));
                  for (const t of rules.suggestedTreatments) if (!x.treatments.some((e) => e.activityType === t.activityType && e.phase === t.phase)) x.treatments.push(t);
                });
                toast("Suggestions added — review quantities on the Equipment step", "info");
              }}
            >
              Add suggestions to scope
            </button>
          </div>
        )}
        {p.recommendation && (
          <button className="text-[12px] text-ink3 underline" onClick={() => update((d) => void (d.recommendation = null))}>
            Show rules-based recommendations instead
          </button>
        )}
      </Card>
    </div>
  );
}
