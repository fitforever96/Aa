"use client";

import { Rolling } from "@/components/motion";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Lock, Plus, Trash2, Unlock } from "lucide-react";
import clsx from "clsx";
import { Badge, Callout, Card, MoneyField, NumberField, Row, SectionTitle, Toggle } from "@/components/ui";
import { formatMoney, laborCents } from "@/lib/engine/money";
import { explainPricing, relevantHistorical } from "@/lib/engine/explain";
import { db } from "@/lib/db";
import { uid, nowISO } from "@/lib/ids";
import type { PricePoint } from "@/lib/engine/pricing";
import type { PriceOverride } from "@/lib/types";
import { ProgramTabs } from "./ProgramTabs";
import { prog, type StepProps } from "./types";

function PricePanel({ title, point, override, onOverride, rate }: { title: string; point: PricePoint; override: PriceOverride | null; onOverride: (o: PriceOverride | null) => void; rate: number }) {
  const [showCalc, setShowCalc] = useState(false);
  const locked = !!override?.locked;
  return (
    <Card className={clsx("space-y-3", locked && "border-ok/30")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{title}</div>
          <div className="num mt-1 font-display text-[34px] font-bold leading-none">
            <Rolling value={point.finalCents} format={(c) => formatMoney(c)} />
          </div>
          <div className="mt-1 text-[12px] text-ink3">{override ? (locked ? "Your approved price (locked)" : "Your manual price (unlocked)") : "Calculated suggestion"}</div>
        </div>
        {locked ? <Badge tone="ok"><Lock size={11} /> Locked</Badge> : override ? <Badge tone="warn">Manual</Badge> : <Badge>Calculated</Badge>}
      </div>
      <button className="text-left text-[13px] font-medium text-red" onClick={() => setShowCalc(!showCalc)}>
        {showCalc ? "Hide" : "Show"} calculation
      </button>
      {showCalc && (
        <div className="animate-rise space-y-1.5 rounded-xl bg-surface2 p-3">
          {point.components.map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-[13px]"><span>{c.label}</span><span className="num">{formatMoney(c.cents)}</span></div>
              <div className="num font-mono text-[11.5px] text-ink3">{c.formula}</div>
            </div>
          ))}
          <div className="flex justify-between border-t hairline pt-1.5 text-[13px] font-semibold"><span>Calculated</span><span className="num">{formatMoney(point.calculatedCents)}</span></div>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <MoneyField label="Manual final price" cents={override?.cents ?? null} placeholder={(point.calculatedCents / 100).toFixed(2)} onChange={(c) => onOverride(c == null ? null : { cents: c, locked: false, lockedAt: null, note: override?.note ?? "" })} />
        {override && (
          <button className={clsx("btn mb-px", locked ? "btn-secondary" : "bg-ok/15 text-ok hover:bg-ok/25")} onClick={() => onOverride({ ...override, locked: !locked, lockedAt: !locked ? nowISO() : null })}>
            {locked ? <Unlock size={16} /> : <Lock size={16} />} {locked ? "Unlock" : "Lock"}
          </button>
        )}
      </div>
      {locked && <p className="text-[12px] text-ink3">Locked prices never change from scope edits, AI revisions or setting changes. The labor model keeps calculating for comparison.</p>}
      <div className="divide-hair rounded-xl border hairline px-3">
        <Row label="Calculated suggested price" value={formatMoney(point.calculatedCents)} />
        <Row label="Your manual price" value={point.overrideCents != null ? formatMoney(point.overrideCents) : "—"} />
        <Row label="Difference" value={point.differenceCents != null ? <span className={point.differenceCents < 0 ? "text-warn" : "text-ok"}>{point.differenceCents >= 0 ? "+" : ""}{formatMoney(point.differenceCents)}</span> : "—"} />
        <Row label="Effective billable hourly yield" value={point.effectiveHourlyYieldCents != null ? <span className={point.belowTarget ? "text-warn" : ""}>{formatMoney(point.effectiveHourlyYieldCents)}/hr</span> : "—"} sub={`Target ${formatMoney(rate)}/hr · ${(point.technicianMinutes / 60).toFixed(2)} technician-hours`} />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-ink3">Internal analysis — never shown in the customer proposal</div>
    </Card>
  );
}

export function StepPricing(props: StepProps) {
  const { proposal: p, update, pricing, programIdx } = props;
  const pr = prog(p, programIdx);
  const idx = p.programs.indexOf(pr);
  const r = pricing[idx];
  const set = (fn: (x: typeof pr) => void) => update((d) => fn(d.programs[idx]));
  const historical = useLiveQuery(() => db().historical.toArray(), []);
  const settings = useLiveQuery(() => db().settings.get("settings"), []);
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const hist = historical ? relevantHistorical(historical, p, pr) : [];
  const explanation = explainPricing(p, pr, r);

  return (
    <div className="space-y-5">
      <ProgramTabs {...props} allowAdd={false} />
      {r.advisories.map((a, i) => (
        <Callout key={i} tone="warn" title={<span className="flex items-center gap-1.5"><AlertTriangle size={14} /> Internal advisory</span>}>
          {a}
        </Callout>
      ))}
      <div className="grid gap-3 lg:grid-cols-2">
        {r.recurring && <PricePanel title={`Recurring · ${r.billing?.customerLabel ?? "per visit"}`} point={r.recurring} override={pr.pricing.recurringOverride} onOverride={(o) => set((x) => void (x.pricing.recurringOverride = o))} rate={r.rateCentsPerHour} />}
        <PricePanel title="Initial service" point={r.initial} override={pr.pricing.initialOverride} onOverride={(o) => set((x) => void (x.pricing.initialOverride = o))} rate={r.rateCentsPerHour} />
      </div>

      {r.billing?.method === "fixed_monthly" && r.billing.fixedMonthlyCents != null && (
        <Card>
          <Row strong label="Fixed monthly billing (approved)" value={formatMoney(r.billing.fixedMonthlyCents)} sub={r.billing.formula} />
        </Card>
      )}

      <div>
        <SectionTitle>Equipment investment</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {r.equipment.lines.length === 0 && <div className="p-4 text-[13px] text-ink3">No billable equipment.</div>}
          {r.equipment.lines.map((l) => (
            <div key={l.allocationId} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]">
              <div>
                <div className="font-medium">{l.name}</div>
                <div className="num text-[12px] text-ink3">{l.quantity} × {l.unitPriceCents != null ? formatMoney(l.unitPriceCents) : <span className="text-red">price not set</span>} · {l.priceSource.replace(/_/g, " ")}</div>
              </div>
              <div className="num font-semibold">{l.totalCents != null ? formatMoney(l.totalCents) : "—"}</div>
            </div>
          ))}
          {r.equipment.lines.length > 0 && <div className="flex justify-between px-4 py-3 text-[14px] font-semibold"><span>Equipment total</span><span className="num">{formatMoney(r.equipment.totalCents)}</span></div>}
        </Card>
      </div>

      <div>
        <SectionTitle>Rate & adjustments</SectionTitle>
        <Card className="space-y-1">
          <MoneyField label="Labor rate for this proposal" hint={`Using ${formatMoney(r.rateCentsPerHour)}/hr (${r.rateSource.replace("_", " ")}). Blank = customer/default. Stored with this estimate; changing Settings never reprices it.`} cents={p.laborRateOverrideCents} onChange={(c) => update((d) => void (d.laborRateOverrideCents = c))} placeholder={(p.assumptions.laborRateCentsPerHour / 100).toFixed(2)} />
          <div className="divide-hair pt-2">
            <Toggle checked={pr.pricing.applyMinimumCharge} disabled={!p.assumptions.minimumCharge.enabled} onChange={(v) => set((x) => void (x.pricing.applyMinimumCharge = v))} label="Apply minimum charge" description={p.assumptions.minimumCharge.enabled ? `Configured minimum ${formatMoney(p.assumptions.minimumCharge.cents)}` : "No minimum configured (Knowledge › Assumptions)."} />
            <Toggle checked={pr.pricing.billExternalTravel} disabled={!pr.externalTravelMinutesOneWay} onChange={(v) => set((x) => void (x.pricing.billExternalTravel = v))} label="Bill external travel time" description="Off by default. Enter drive time on the Labor step." />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <NumberField label="Markup %" value={pr.pricing.markupPct} allowNull decimal onChange={(v) => set((x) => void (x.pricing.markupPct = v))} hint="None unless entered" />
            <NumberField label="Discount %" value={pr.pricing.discountPct} allowNull decimal onChange={(v) => set((x) => void (x.pricing.discountPct = v))} hint="None unless entered" />
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle action={<div className="flex gap-1.5"><button className="btn-ghost btn-sm" onClick={() => set((x) => void x.pricing.additionalInitial.push({ id: uid("li"), label: "", description: "", amountCents: 0, approved: false }))}><Plus size={14} /> Initial</button><button className="btn-ghost btn-sm" onClick={() => set((x) => void x.pricing.additionalRecurring.push({ id: uid("li"), label: "", description: "", amountCents: 0, approved: false }))}><Plus size={14} /> Recurring</button></div>}>Approved additional charges</SectionTitle>
        {[...pr.pricing.additionalInitial.map((l, k) => ({ l, k, kind: "additionalInitial" as const })), ...pr.pricing.additionalRecurring.map((l, k) => ({ l, k, kind: "additionalRecurring" as const }))].map(({ l, k, kind }) => (
          <Card key={l.id} className="mb-2 grid grid-cols-[1fr_120px_auto] items-end gap-2">
            <div>
              <span className="field-label">{kind === "additionalInitial" ? "Initial" : "Recurring"} charge</span>
              <input className="input" value={l.label} placeholder="e.g. Exclusion — door sweeps" onChange={(e) => set((x) => void (x.pricing[kind][k].label = e.target.value))} />
            </div>
            <MoneyField cents={l.amountCents} onChange={(c) => set((x) => void (x.pricing[kind][k].amountCents = c ?? 0))} />
            <button className="btn-ghost btn-sm mb-1" onClick={() => set((x) => void x.pricing[kind].splice(k, 1))} aria-label="Remove"><Trash2 size={15} /></button>
            <div className="col-span-3">
              <Toggle checked={l.approved} onChange={(v) => set((x) => void (x.pricing[kind][k].approved = v))} label={<span className="text-[13px]">Approved — include in price</span>} />
            </div>
          </Card>
        ))}
      </div>

      <div>
        <SectionTitle>Contract-period totals</SectionTitle>
        <Card className="space-y-2">
          <Toggle checked={p.document.options.showContractTotals} onChange={(v) => update((d) => void (d.document.options.showContractTotals = v))} label="Show contract-period totals" description="Off by default. Use only when an RFP or government bid requires it." />
          {p.document.options.showContractTotals && (
            <>
              <NumberField label="Contract months" value={p.document.options.contractMonths} min={1} max={120} onChange={(v) => update((d) => void (d.document.options.contractMonths = v ?? 12))} />
              {r.contractTotal && <Row strong label="Contract total (recurring)" value={formatMoney(r.contractTotal.cents)} sub={r.contractTotal.formula} />}
            </>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>Recommendation, explained</SectionTitle>
        <Card className="space-y-2 text-[14px] leading-relaxed text-ink2">
          {explanation.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-surface2 p-3">
            <MoneyField className="w-36" label="What if rate =" cents={whatIf} onChange={setWhatIf} placeholder="210.00" />
            {whatIf != null && r.recurring && <div className="num pb-2.5 text-[14px]">Recurring {formatMoney(laborCents(r.estimate.recurring.technicianMinutes, whatIf))} · Initial {formatMoney(laborCents(r.estimate.initial.technicianMinutes, whatIf))} <span className="text-ink3">(labor only, nothing saved)</span></div>}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Historical comparisons</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {hist.length === 0 && <div className="p-4 text-[13px] text-ink3">No comparable historical proposals in your library.</div>}
          {hist.map((h) => (
            <div key={h.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{h.customer} — {h.program}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink3">{h.description}</div>
                </div>
                <div className="num shrink-0 text-right text-[14px] font-semibold">
                  {formatMoney(h.priceCents)}
                  {h.priceHighCents ? `–${formatMoney(h.priceHighCents)}` : ""}
                  <div className="text-[11px] font-normal text-ink3">{h.basis}</div>
                </div>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <Badge tone={h.status === "approved_standard" ? "ok" : h.status === "unverified_extracted" ? "warn" : "neutral"}>{h.status.replace(/_/g, " ")}</Badge>
                <Badge>{h.frequency}</Badge>
              </div>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-ink3">Historical prices are references for comparison only. Only approved active standards apply automatically — none apply here without your choice.</p>
      </div>
      {settings && null}
    </div>
  );
}
