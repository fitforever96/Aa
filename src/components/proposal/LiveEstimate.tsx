"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronUp, Lock } from "lucide-react";
import { formatHours, formatMinutes, formatMoney, laborCents } from "@/lib/engine/money";
import { COMPONENT_LABELS, type Component } from "@/lib/engine/estimator";
import { Row } from "@/components/ui";
import { Collapse, Rolling } from "@/components/motion";
import type { ProgramPricingResult } from "@/lib/engine/pricing";
import type { ServiceProgram } from "@/lib/types";

/** Live estimate dashboard: always visible while editing scope (bottom bar on phone, side panel on desktop). */
export function LiveEstimatePanel({ r, program }: { r: ProgramPricingResult; program: ServiceProgram }) {
  const e = r.estimate;
  const rec = e.recurring;
  const comps = (Object.keys(rec.byComponent) as Component[]).filter((c) => rec.byComponent[c] > 0);
  const tin = program.equipment.filter((x) => /tin cat/i.test(x.name)).reduce((s, x) => s + x.quantity, 0);
  const st = program.equipment.filter((x) => x.location === "exterior").reduce((s, x) => s + x.quantity, 0);
  return (
    <div className="space-y-1">
      <div className="eyebrow mb-1">{program.name}</div>
      {tin > 0 && <Row label="Interior rodent devices" value={`${tin} Tin Cats`} />}
      {st > 0 && <Row label="Exterior rodent stations" value={`${st} stations`} />}
      <Row label="Device servicing labor" value={formatMinutes(e.deviceServicing.minutes)} sub="Confirmed standards" />
      {comps.filter((c) => c !== "devices").map((c) => (
        <Row key={c} label={COMPONENT_LABELS[c]} value={formatMinutes(rec.byComponent[c])} sub="Estimated" />
      ))}
      <Row strong label="Total technician labor" value={formatHours(rec.technicianMinutes)} sub={`${formatMinutes(rec.elapsedMinutes)} elapsed · ${e.technicians} tech · ${e.confidence.level} confidence`} />
      <Row label="Labor rate" value={`${formatMoney(r.rateCentsPerHour)}/hr`} />
      {r.recurring && <Row label="Suggested recurring charge" value={formatMoney(r.recurring.calculatedCents)} sub={`= ${formatMoney(laborCents(rec.technicianMinutes, r.rateCentsPerHour))} labor`} />}
      {r.recurring?.overrideCents != null && <Row strong label={<span className="flex items-center gap-1">{r.recurring.locked && <Lock size={12} className="text-ok" />} Your recurring price</span>} value={formatMoney(r.recurring.finalCents)} />}
      <Row label="Initial service" value={formatMoney(r.initial.finalCents)} sub={r.initial.overrideCents != null ? "Manual" : "Calculated"} />
      <Row label="Equipment investment" value={r.equipment.lines.length ? formatMoney(r.equipment.totalCents) : "—"} sub={r.equipment.unpriced.length ? `${r.equipment.unpriced.length} item(s) unpriced` : "Separate from labor"} />
    </div>
  );
}

export function LiveEstimateBar({ r, program }: { r: ProgramPricingResult; program: ServiceProgram }) {
  const [open, setOpen] = useState(false);
  const price = r.recurring ? r.recurring.finalCents : r.initial.finalCents;
  return (
    <div className="fixed inset-x-0 z-30 lg:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom) + 58px)" }}>
      <div className="mx-auto max-w-xl px-3">
        <div className={clsx("overflow-hidden rounded-2xl border hairline-strong bg-surface2/95 shadow-2xl backdrop-blur-xl transition-all")}>
          <Collapse open={open}>
            <div className="max-h-[52dvh] overflow-y-auto border-b hairline px-4 py-3">
              <LiveEstimatePanel r={r} program={program} />
            </div>
          </Collapse>
          <button className="flex w-full items-center gap-3 px-4 py-2.5" onClick={() => setOpen(!open)} aria-expanded={open}>
            <div className="min-w-0 flex-1 text-left">
              <div className="hud-eyebrow">{r.recurring ? (r.recurring.overrideCents != null ? "Your price / visit" : "Suggested / visit") : "One-time"}</div>
              <div className="num font-display text-[22px] font-bold leading-tight">
                <Rolling value={price} format={(c) => formatMoney(c)} />
              </div>
            </div>
            <div className="text-right">
              <div className="num text-[14px] font-semibold">{formatHours(r.estimate.recurring.technicianMinutes || r.estimate.initial.technicianMinutes)}</div>
              <div className="text-[11px] text-ink3">technician time</div>
            </div>
            <ChevronUp size={18} className={clsx("chev text-ink3", !open && "chev-open")} />
          </button>
        </div>
      </div>
    </div>
  );
}
