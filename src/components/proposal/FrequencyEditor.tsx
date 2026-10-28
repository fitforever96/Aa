"use client";

import clsx from "clsx";
import type { FrequencySpec } from "@/lib/types";
import { FREQUENCY_LABELS, monthName, visitsPerYear } from "@/lib/engine/frequency";
import { NumberField, Select } from "@/components/ui";

const KINDS: FrequencySpec["kind"][] = ["one_time", "weekly", "biweekly", "twice_monthly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "five_day_weekly", "seasonal", "custom"];

export function FrequencyEditor({ value, onChange }: { value: FrequencySpec; onChange: (f: FrequencySpec) => void }) {
  const vpy = visitsPerYear(value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} type="button" className={clsx("chip", value.kind === k && "chip-on")} onClick={() => onChange(k === "seasonal" ? { kind: k, seasonalMonths: value.seasonalMonths ?? [4, 5, 6, 7, 8, 9, 10], seasonalBase: value.seasonalBase ?? "monthly" } : k === "custom" ? { kind: k, customIntervalDays: value.customIntervalDays ?? 14 } : { kind: k })}>
            {FREQUENCY_LABELS[k]}
          </button>
        ))}
      </div>
      {value.kind === "seasonal" && (
        <div className="space-y-3 rounded-xl bg-surface2 p-3">
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const on = value.seasonalMonths?.includes(m);
              return (
                <button key={m} type="button" onClick={() => onChange({ ...value, seasonalMonths: on ? value.seasonalMonths!.filter((x) => x !== m) : [...(value.seasonalMonths ?? []), m].sort((a, b) => a - b) })} className={clsx("rounded-lg py-1.5 text-[12px] font-semibold", on ? "bg-red text-white" : "bg-surface3 text-ink3")}>
                  {monthName(m)}
                </button>
              );
            })}
          </div>
          <Select label="Cadence during season" value={value.seasonalBase ?? "monthly"} onChange={(v) => onChange({ ...value, seasonalBase: v })} options={[{ value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Every two weeks" }, { value: "twice_monthly", label: "Twice monthly" }, { value: "monthly", label: "Monthly" }]} />
        </div>
      )}
      {value.kind === "custom" && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface2 p-3">
          <NumberField label="Interval (days)" value={value.customIntervalDays ?? null} allowNull onChange={(v) => onChange({ ...value, customIntervalDays: v ?? undefined, customVisitsPerYear: undefined })} />
          <NumberField label="or visits / year" value={value.customVisitsPerYear ?? null} allowNull onChange={(v) => onChange({ ...value, customVisitsPerYear: v ?? undefined })} />
          <div className="col-span-2">
            <span className="field-label">Label shown to customer</span>
            <input className="input" value={value.customLabel ?? ""} placeholder="e.g. Approximately every 14–16 days" onChange={(e) => onChange({ ...value, customLabel: e.target.value })} />
          </div>
        </div>
      )}
      <div className="text-[12.5px] text-ink3">
        {value.kind === "one_time" ? "Single service." : `${Number.isInteger(vpy) ? vpy : vpy.toFixed(1)} scheduled visits per year.`} {value.kind === "weekly" && "Weekly service follows the calendar — some months have five visits."}
        {value.kind === "biweekly" && " Every 14 days (26/yr) — not the same as twice monthly."}
        {value.kind === "twice_monthly" && " Two visits each calendar month (24/yr) — not the same as every two weeks."}
      </div>
    </div>
  );
}
