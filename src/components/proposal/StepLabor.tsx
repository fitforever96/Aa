"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Gauge, Plus, Trash2, Users } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Callout, Card, NumberField, ProvenanceBadge, Row, SectionTitle, Segmented, Stat } from "@/components/ui";
import { COMPONENT_LABELS, type Component, type PhaseEstimate } from "@/lib/engine/estimator";
import { formatHours, formatMinutes, formatMoney, laborCents } from "@/lib/engine/money";
import { db } from "@/lib/db";
import { uid } from "@/lib/ids";
import { cloneAssumptions } from "@/lib/engine/assumptions";
import { ProgramTabs } from "./ProgramTabs";
import { prog, type StepProps } from "./types";

const ORDER: Component[] = ["devices", "install", "walking", "inspection", "treatment", "setup", "documentation"];

function PhaseBreakdown({ phase, rate, title }: { phase: PhaseEstimate; rate: number; title: string }) {
  const [open, setOpen] = useState<Component | null>(null);
  const max = Math.max(1, ...ORDER.map((c) => phase.byComponent[c]));
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex items-center justify-between border-b hairline px-4 py-3">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="num text-right">
          <div className="text-[15px] font-semibold">{formatMinutes(phase.technicianMinutes)}</div>
          <div className="text-[11.5px] text-ink3">{formatHours(phase.technicianMinutes)} technician · {formatMinutes(phase.elapsedMinutes)} elapsed</div>
        </div>
      </div>
      <div className="divide-hair">
        {ORDER.filter((c) => phase.byComponent[c] > 0).map((c) => {
          const lines = phase.lines.filter((l) => l.component === c);
          const isOpen = open === c;
          return (
            <div key={c}>
              <button className="w-full px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : c)} aria-expanded={isOpen}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[14px] font-medium">
                    <ChevronDown size={15} className={clsx("text-ink3 transition", isOpen && "rotate-180")} />
                    {COMPONENT_LABELS[c]}
                  </div>
                  <div className="num text-[14px]">
                    {formatMinutes(phase.byComponent[c])} <span className="text-ink3">· {formatMoney(laborCents(phase.byComponent[c], rate))}</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface3">
                  <div className={clsx("h-full rounded-full", c === "devices" ? "bg-ok" : c === "install" ? "bg-info" : "bg-red/80")} style={{ width: `${(phase.byComponent[c] / max) * 100}%` }} />
                </div>
              </button>
              {isOpen && (
                <div className="animate-rise space-y-2 bg-surface2/50 px-4 pb-3 pt-1">
                  {lines.map((l) => (
                    <div key={l.key} className="rounded-lg border hairline bg-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{l.label}</span>
                        <span className="flex items-center gap-1.5">
                          <ProvenanceBadge p={l.provenance} />
                          <span className="num text-[13px]">{formatMinutes(l.minutes)}</span>
                        </span>
                      </div>
                      <div className="num mt-1 font-mono text-[11.5px] leading-snug text-ink3">{l.formula}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function StepLabor(props: StepProps) {
  const { proposal: p, update, pricing, programIdx } = props;
  const pr = prog(p, programIdx);
  const idx = p.programs.indexOf(pr);
  const r = pricing[idx];
  const e = r.estimate;
  const [phase, setPhase] = useState<"recurring" | "initial">(pr.chargeType === "recurring" ? "recurring" : "initial");
  const activeVersion = useLiveQuery(async () => {
    const s = await db().settings.get("settings");
    return s ? db().assumptionVersions.get(s.activeAssumptionsVersionId) : undefined;
  }, []);
  const outdated = activeVersion && activeVersion.id !== p.assumptionsVersionId;
  const frozen = ["approved", "sent", "active"].includes(p.status);
  const [actual, setActual] = useState<{ minutes: number | null; phase: "initial" | "recurring"; techs: number; notes: string }>({ minutes: null, phase: "recurring", techs: pr.technicians, notes: "" });

  const conf = e.confidence;
  const ph = phase === "recurring" ? e.recurring : e.initial;

  return (
    <div className="space-y-5">
      <ProgramTabs {...props} allowAdd={false} />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat accent label="Confirmed device labor" value={formatMinutes(e.deviceServicing.minutes)} sub={`${formatMoney(laborCents(e.deviceServicing.minutes, r.rateCentsPerHour))} at ${formatMoney(r.rateCentsPerHour)}/hr`} />
        <Stat label="Recurring technician time" value={formatHours(e.recurring.technicianMinutes)} sub={`${formatMinutes(e.recurring.elapsedMinutes)} elapsed · ${e.technicians} tech`} />
        <Stat label="Initial technician time" value={formatHours(e.initial.technicianMinutes)} sub={`${formatMinutes(e.initial.elapsedMinutes)} elapsed`} />
        <div className={clsx("card p-4", conf.level === "high" ? "border-ok/30" : conf.level === "medium" ? "border-warn/30" : "border-red/40")}>
          <div className="eyebrow flex items-center gap-1.5"><Gauge size={13} /> Confidence</div>
          <div className={clsx("mt-1.5 font-display text-[28px] font-bold uppercase leading-none", conf.level === "high" ? "text-ok" : conf.level === "medium" ? "text-warn" : "text-red")}>{conf.level}</div>
          <div className="mt-1.5 text-[12px] text-ink3">{Math.round(conf.confirmedShare * 100)}% confirmed/measured</div>
        </div>
      </div>

      {(conf.missing.length > 0 || conf.reasons.length > 0) && (
        <Card className="space-y-2 text-[13px]">
          <div className="eyebrow">Basis of estimate</div>
          {conf.reasons.map((x, i) => (
            <div key={i} className="text-ink2">• {x}</div>
          ))}
          {conf.missing.map((x, i) => (
            <div key={i} className="text-warn">• Missing: {x}</div>
          ))}
          {e.notes.map((x, i) => (
            <div key={i} className="text-ink3">• {x}</div>
          ))}
        </Card>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <Segmented className="flex-1 sm:max-w-xs" value={phase} onChange={setPhase} options={[{ value: "recurring", label: "Recurring visit" }, { value: "initial", label: "Initial service" }]} />
          <div className="flex items-center gap-2 text-[13px] text-ink2">
            <Users size={16} />
            <NumberField className="w-[132px]" value={pr.technicians} min={1} max={20} stepper onChange={(v) => update((d) => void (d.programs[idx].technicians = v ?? 1))} />
          </div>
        </div>
        {phase === "recurring" && pr.chargeType !== "recurring" ? <Card className="text-[13px] text-ink3">One-time program — no recurring visit.</Card> : <PhaseBreakdown phase={ph} rate={r.rateCentsPerHour} title={phase === "recurring" ? "Recurring service visit" : "Initial service"} />}
        <p className="mt-2 text-[12px] leading-relaxed text-ink3">
          Technician time is the billable labor basis. Elapsed time assumes work divides between technicians only where tasks can run in parallel (device servicing {Math.round(p.assumptions.parallelFractions.devices * 100)}%, inspection {Math.round(p.assumptions.parallelFractions.inspection * 100)}%, walking {Math.round(p.assumptions.parallelFractions.walking * 100)}%, documentation {Math.round(p.assumptions.parallelFractions.documentation * 100)}%).
        </p>
      </div>

      <div>
        <SectionTitle>External travel (optional, separate)</SectionTitle>
        <Card className="grid items-end gap-3 sm:grid-cols-2">
          <NumberField label="Drive time to site, one way (min)" value={pr.externalTravelMinutesOneWay} allowNull onChange={(v) => update((d) => void (d.programs[idx].externalTravelMinutesOneWay = v))} hint="Travel between customer locations — never mixed with on-site walking." />
          <div className="text-[13px] text-ink2">
            {e.externalTravel ? <>Round trip {formatMinutes(e.externalTravel.roundTripMinutes)} · {formatMinutes(e.externalTravel.technicianMinutes)} technician time. {pr.pricing.billExternalTravel ? <Badge tone="warn">Billed</Badge> : <Badge>Not billed</Badge>}</> : "Not included."}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle action={<Link href="/knowledge?tab=assumptions" className="text-[13px] font-medium text-red">Advanced assumptions</Link>}>Assumption snapshot</SectionTitle>
        <Card className="space-y-2 text-[13px]">
          <Row label="Labor rate in this estimate" value={`${formatMoney(r.rateCentsPerHour)}/hr`} sub={r.rateSource === "default" ? "Snapshot of your default rate when this estimate was created" : r.rateSource === "customer_override" ? "Customer-specific override" : "Proposal-specific override"} />
          <Row label="Tin Cat service time" value={`${p.assumptions.tinCatServiceMinutes} min`} sub="Confirmed standard" />
          <Row label="Exterior bait station service time" value={`${p.assumptions.baitStationServiceMinutes} min`} sub="Confirmed standard" />
          {outdated && (
            <Callout tone="warn" title="Newer standards available">
              Your default assumptions changed after this estimate was built. {frozen ? "This proposal is approved, so it keeps its original snapshot." : "Apply them only if you want this draft repriced."}
              {!frozen && (
                <button className="btn-secondary btn-sm mt-2" onClick={() => update((d) => void ((d.assumptions = cloneAssumptions(activeVersion!.assumptions)), (d.assumptionsVersionId = activeVersion!.id)))}>
                  Apply current standards to this draft
                </button>
              )}
            </Callout>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>Actual service time (calibration)</SectionTitle>
        <Card className="space-y-3">
          <p className="text-[13px] text-ink3">Once this is an active account, record observed labor. Knowledge › Calibration compares estimated vs. actual across jobs and suggests adjustments — your confirmed device times never change without your approval.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Actual technician minutes" value={actual.minutes} allowNull onChange={(v) => setActual((a) => ({ ...a, minutes: v }))} />
            <NumberField label="Technicians" value={actual.techs} min={1} onChange={(v) => setActual((a) => ({ ...a, techs: v ?? 1 }))} />
            <div className="col-span-2">
              <span className="field-label">Phase</span>
              <Segmented value={actual.phase} onChange={(v) => setActual((a) => ({ ...a, phase: v }))} options={[{ value: "recurring", label: "Recurring" }, { value: "initial", label: "Initial" }]} />
            </div>
          </div>
          <input className="input" placeholder="Notes (optional)" value={actual.notes} onChange={(ev) => setActual((a) => ({ ...a, notes: ev.target.value }))} />
          <button
            className="btn-secondary"
            disabled={!actual.minutes}
            onClick={() => {
              update((d) =>
                void d.programs[idx].actuals.push({ id: uid("act"), date: new Date().toISOString(), phase: actual.phase, actualTechnicianMinutes: actual.minutes!, technicians: actual.techs, estimatedTechnicianMinutes: actual.phase === "recurring" ? e.recurring.technicianMinutes : e.initial.technicianMinutes, notes: actual.notes }),
              );
              setActual((a) => ({ ...a, minutes: null, notes: "" }));
            }}
          >
            <Plus size={16} /> Record actual
          </button>
          {pr.actuals.length > 0 && (
            <div className="divide-hair">
              {pr.actuals.map((a, k) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span>{new Date(a.date).toLocaleDateString()} · {a.phase}</span>
                  <span className="num">
                    est {formatMinutes(a.estimatedTechnicianMinutes)} → actual {formatMinutes(a.actualTechnicianMinutes)}{" "}
                    <span className={a.actualTechnicianMinutes > a.estimatedTechnicianMinutes ? "text-warn" : "text-ok"}>({a.actualTechnicianMinutes >= a.estimatedTechnicianMinutes ? "+" : ""}{Math.round(((a.actualTechnicianMinutes - a.estimatedTechnicianMinutes) / Math.max(1, a.estimatedTechnicianMinutes)) * 100)}%)</span>
                  </span>
                  <button className="btn-ghost btn-sm" onClick={() => update((d) => void d.programs[idx].actuals.splice(k, 1))} aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
