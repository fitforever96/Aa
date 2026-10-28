"use client";

import type { IntakeExtraction } from "@/lib/commands/parse";
import { frequencyLabel } from "@/lib/engine/frequency";
import { SERVICE_LABELS, DEFAULT_MODEL_PROFILES } from "@/lib/engine/assumptions";

export function IntakePreview({ x }: { x: IntakeExtraction }) {
  const rows: [string, string | null][] = [
    ["Property", x.propertyName],
    ["Property type", x.propertyType],
    ["Estimating model", x.model ? DEFAULT_MODEL_PROFILES[x.model].label : null],
    ["Square feet", x.squareFeet ? x.squareFeet.toLocaleString() : null],
    ["Buildings", x.buildings ? String(x.buildings) : null],
    ["Floors", x.floors ? String(x.floors) : null],
    ["Apartments", x.apartments ? x.apartments.toLocaleString() : null],
    ["Apartments / visit", x.apartmentsPerVisit ? String(x.apartmentsPerVisit) : null],
    ["Tin Cats", x.tinCats != null ? String(x.tinCats) : null],
    ["Exterior bait stations", x.exteriorStations != null ? String(x.exteriorStations) : null],
    ["Technicians", x.technicians ? String(x.technicians) : null],
    ["Frequency", x.frequency ? frequencyLabel(x.frequency) : null],
    ["Services", x.services.length ? x.services.map((s) => SERVICE_LABELS[s]).join(", ") : null],
    ["Activity areas", x.activityAreas.length ? x.activityAreas.join(", ") : null],
    ["Activity level", x.activityLevel],
  ];
  const found = rows.filter(([, v]) => v);
  const missing = rows.filter(([k, v]) => !v && ["Square feet", "Frequency", "Services", "Estimating model"].includes(k));
  return (
    <div className="card divide-hair overflow-hidden">
      {found.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-[14px]">
          <span className="text-ink3">{k}</span>
          <span className="num text-right font-medium">{v}</span>
        </div>
      ))}
      {missing.length > 0 && <div className="px-4 py-2.5 text-[12.5px] text-warn">Not detected: {missing.map(([k]) => k.toLowerCase()).join(", ")} — you can fill these in next.</div>}
    </div>
  );
}
