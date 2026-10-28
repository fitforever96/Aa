"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, publishAssumptions } from "@/lib/db";
import { Callout, Card, SectionTitle, Segmented } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { collectRows, groupStats, sizeBand, type CalibrationRow } from "@/lib/engine/calibration";
import { cloneAssumptions, DEFAULT_MODEL_PROFILES } from "@/lib/engine/assumptions";
import { formatMinutes } from "@/lib/engine/money";
import { FREQUENCY_LABELS } from "@/lib/engine/frequency";
import type { PropertyModel } from "@/lib/types";

const BY: Record<string, { label: string; fn: (r: CalibrationRow) => string }> = {
  model: { label: "Property type", fn: (r) => r.model },
  size: { label: "Size", fn: (r) => sizeBand(r.squareFeet) },
  freq: { label: "Frequency", fn: (r) => FREQUENCY_LABELS[r.frequency as keyof typeof FREQUENCY_LABELS] ?? r.frequency },
  techs: { label: "Technicians", fn: (r) => `${r.technicians} tech` },
  access: { label: "Access", fn: (r) => r.access },
  devices: { label: "Equipment count", fn: (r) => (r.devices === 0 ? "No devices" : r.devices < 50 ? "1–49 devices" : r.devices < 150 ? "50–149" : "150+") },
  pest: { label: "Pest type", fn: (r) => r.services[0] ?? "—" },
};

export function CalibrationTab() {
  const toast = useToast();
  const proposals = useLiveQuery(() => db().proposals.toArray(), []);
  const settings = useLiveQuery(() => db().settings.get("settings"), []);
  const [by, setBy] = useState("model");
  const rows = collectRows(proposals ?? []);
  const stats = groupStats(rows, BY[by].fn);

  const apply = async (model: PropertyModel, factor: number, n: number) => {
    if (!settings) return;
    const v = await db().assumptionVersions.get(settings.activeAssumptionsVersionId);
    if (!v) return;
    if (!confirm(`Publish a new assumptions version with a ×${factor.toFixed(3)} calibration on app-estimated components for ${DEFAULT_MODEL_PROFILES[model].label}? Confirmed Tin Cat and bait-station times are not affected. Existing proposals keep their snapshot.`)) return;
    const a = cloneAssumptions(v.assumptions);
    a.calibration[model] = { factor, approvedAt: new Date().toISOString(), basis: `median of ${n} recorded visits` };
    await publishAssumptions(a, `Calibration ${DEFAULT_MODEL_PROFILES[model].label} ×${factor.toFixed(3)}`, new Date().toISOString().slice(0, 10));
    toast("Calibration published as a new assumptions version");
  };

  return (
    <div className="space-y-3">
      <Callout>Record actual service labor on each proposal’s Labor step. This view compares estimated vs. actual with plain statistics (median ratio, mean absolute % error) — no hidden learning. Adjustments apply only with your approval and never change confirmed device standards.</Callout>
      <Segmented size="sm" value={by} onChange={setBy} options={Object.entries(BY).map(([k, v]) => ({ value: k, label: v.label }))} className="overflow-x-auto" />
      {rows.length === 0 ? (
        <Card className="text-[13px] text-ink3">No actual service times recorded yet.</Card>
      ) : (
        <Card pad={false} className="divide-hair overflow-hidden">
          {stats.map((s) => (
            <div key={s.key} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] font-semibold">{by === "model" ? DEFAULT_MODEL_PROFILES[s.key as PropertyModel]?.label ?? s.key : s.key}</div>
                <div className="num text-[13px] text-ink2">n={s.n} · median ×{s.medianRatio.toFixed(2)} · MAPE {Math.round(s.mape * 100)}%</div>
              </div>
              {s.suggestion && <div className="mt-1 text-[12.5px] text-ink3">{s.suggestion}</div>}
              {by === "model" && s.n >= 3 && Math.abs(s.medianRatio - 1) >= 0.05 && (
                <button className="btn-secondary btn-sm mt-2" onClick={() => apply(s.key as PropertyModel, s.medianRatio, s.n)}>Apply ×{s.medianRatio.toFixed(2)} to estimated components</button>
              )}
            </div>
          ))}
        </Card>
      )}
      {rows.length > 0 && (
        <>
          <SectionTitle>Observations</SectionTitle>
          <Card pad={false} className="divide-hair overflow-hidden">
            {rows.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 px-4 py-2 text-[13px]">
                <span className="truncate">{r.customer} · {new Date(r.date).toLocaleDateString()}</span>
                <span className="num shrink-0">{formatMinutes(r.estimated)} → {formatMinutes(r.actual)} (×{r.ratio.toFixed(2)})</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
