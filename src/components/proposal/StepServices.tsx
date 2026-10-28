"use client";

import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, Plus, History } from "lucide-react";
import { useState } from "react";
import { Badge, Callout, Card, MoneyField, NumberField, SectionTitle, Segmented, Sheet, TextField, Toggle } from "@/components/ui";
import { SERVICE_LABELS } from "@/lib/engine/assumptions";
import { db } from "@/lib/db";
import { uid } from "@/lib/ids";
import { formatMoney } from "@/lib/engine/money";
import type { ServiceCategory, SpecialtyItem } from "@/lib/types";
import { FrequencyEditor } from "./FrequencyEditor";
import { ProgramTabs } from "./ProgramTabs";
import { RfpMatrix } from "./RfpMatrix";
import { prog, type StepProps } from "./types";

const CATS = Object.keys(SERVICE_LABELS) as ServiceCategory[];

export function StepServices(props: StepProps) {
  const { proposal: p, update, programIdx, setProgramIdx } = props;
  const pr = prog(p, programIdx);
  const i = p.programs.indexOf(pr);
  const set = (fn: (x: typeof pr) => void) => update((d) => fn(d.programs[i]));
  const [histOpen, setHistOpen] = useState(false);
  const historical = useLiveQuery(() => db().historical.where("category").equals("Specialty").toArray(), []);

  const addSpecialty = (s?: Partial<SpecialtyItem>) =>
    update((d) => void d.specialtyItems.push({ id: uid("spc"), name: "", description: "", priceCents: null, priceHighCents: null, basis: "per unit", qualifier: "", source: "manual", approved: false, ...s }));

  return (
    <div className="space-y-5">
      <ProgramTabs {...props} />
      <div>
        <SectionTitle>Service categories</SectionTitle>
        <Card>
          <TextField label="Program name" value={pr.name} onChange={(v) => set((x) => void (x.name = v))} className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => {
              const on = pr.services.includes(c);
              return (
                <button key={c} type="button" className={clsx("chip", on && "chip-on")} onClick={() => set((x) => void (x.services = on ? x.services.filter((s) => s !== c) : [...x.services, c]))}>
                  {SERVICE_LABELS[c]}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Charge type & frequency</SectionTitle>
        <Card className="space-y-4">
          <Segmented
            value={pr.chargeType}
            onChange={(v) => set((x) => { x.chargeType = v; if (v === "one_time") { x.frequency = { kind: "one_time" }; x.billing.method = "one_time"; } else if (x.frequency.kind === "one_time") { x.frequency = { kind: "monthly" }; x.billing.method = "per_visit"; } })}
            options={[{ value: "recurring", label: "Recurring program" }, { value: "one_time", label: "One-time / specialty" }]}
          />
          <FrequencyEditor value={pr.frequency} onChange={(f) => set((x) => { x.frequency = f; x.chargeType = f.kind === "one_time" ? "one_time" : "recurring"; })} />
          <NumberField label="Technicians assigned" value={pr.technicians} min={1} max={20} stepper onChange={(v) => set((x) => void (x.technicians = v ?? 1))} hint="Labor is priced on total technician-hours; elapsed time is shown separately." />
        </Card>
      </div>

      {pr.chargeType === "recurring" && (
        <div>
          <SectionTitle>Billing terms</SectionTitle>
          <Card className="space-y-3">
            <Segmented value={pr.billing.method === "fixed_monthly" ? "fixed_monthly" : "per_visit"} onChange={(v) => set((x) => void (x.billing.method = v))} options={[{ value: "per_visit", label: "Per completed visit" }, { value: "fixed_monthly", label: "Fixed monthly" }]} />
            {pr.billing.method === "fixed_monthly" && (
              <Toggle checked={pr.billing.fixedMonthlyApproved} onChange={(v) => set((x) => void (x.billing.fixedMonthlyApproved = v))} label="Fixed-monthly billing approved" description="Monthly rate = per-visit price × actual visits per year ÷ 12. Until approved, the customer proposal shows per-visit pricing." />
            )}
            <TextField label="Billing terms note (customer-facing, optional)" value={pr.billing.terms} onChange={(v) => set((x) => void (x.billing.terms = v))} placeholder="e.g. Billed per completed scheduled visit." />
          </Card>
        </div>
      )}

      <div>
        <SectionTitle action={<div className="flex gap-1.5"><button className="btn-ghost btn-sm" onClick={() => setHistOpen(true)}><History size={14} /> Historical</button><button className="btn-secondary btn-sm" onClick={() => addSpecialty()}><Plus size={14} /> Add</button></div>}>Specialty & separately authorized services</SectionTitle>
        {p.specialtyItems.length === 0 ? (
          <Card className="text-[13px] text-ink3">No specialty pricing. Add items such as cleanouts, bed bug treatment or nest removal. Prices are never invented — enter approved prices or start from a labeled historical reference.</Card>
        ) : (
          <div className="space-y-2.5">
            {p.specialtyItems.map((s, k) => (
              <Card key={s.id} className="space-y-3">
                <div className="flex items-start gap-2">
                  <TextField label="Service" value={s.name} onChange={(v) => update((d) => void (d.specialtyItems[k].name = v))} className="flex-1" />
                  <button className="btn-ghost btn-sm mt-6" onClick={() => update((d) => void d.specialtyItems.splice(k, 1))} aria-label="Remove">
                    <Trash2 size={15} />
                  </button>
                </div>
                <TextField label="Description" value={s.description} onChange={(v) => update((d) => void (d.specialtyItems[k].description = v))} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MoneyField label="Price" cents={s.priceCents} onChange={(v) => update((d) => void ((d.specialtyItems[k].priceCents = v), (d.specialtyItems[k].approved = false)))} />
                  <MoneyField label="Range high (opt.)" cents={s.priceHighCents} onChange={(v) => update((d) => void (d.specialtyItems[k].priceHighCents = v))} placeholder="—" />
                  <TextField label="Basis" value={s.basis} onChange={(v) => update((d) => void (d.specialtyItems[k].basis = v))} />
                  <TextField label="Qualifier" value={s.qualifier} onChange={(v) => update((d) => void (d.specialtyItems[k].qualifier = v))} placeholder="avg." />
                </div>
                <div className="flex items-center justify-between">
                  {s.source === "historical_reference" ? <Badge tone="warn">From historical reference</Badge> : <Badge>{s.source.replace("_", " ")}</Badge>}
                  <Toggle checked={s.approved} onChange={(v) => update((d) => void (d.specialtyItems[k].approved = v))} label={<span className="text-[13px]">Price approved</span>} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {(p.kind === "government" || p.kind === "rfp") && <RfpMatrix {...props} />}
      <Sheet open={histOpen} onClose={() => setHistOpen(false)} title="Historical specialty references">
        <Callout tone="warn" className="mb-3">These are customer-specific historical prices for comparison. Adding one creates an unapproved line you must review and approve.</Callout>
        <div className="divide-hair">
          {(historical ?? []).map((h) => (
            <button key={h.id} className="flex w-full items-start justify-between gap-3 py-3 text-left" onClick={() => { addSpecialty({ name: h.program.replace(/^Specialty — /, ""), description: h.description, priceCents: h.priceCents, priceHighCents: h.priceHighCents, basis: h.basis.replace(/^avg\. /, ""), qualifier: /avg/.test(h.basis) ? "avg." : "", source: "historical_reference" }); setHistOpen(false); }}>
              <div>
                <div className="text-[14px] font-medium">{h.program}</div>
                <div className="text-[12px] text-ink3">{h.customer} · {h.status.replace("_", " ")}</div>
              </div>
              <div className="num text-[14px] font-semibold">{formatMoney(h.priceCents)}{h.priceHighCents ? `–${formatMoney(h.priceHighCents)}` : ""}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
