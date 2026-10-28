"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, publishAssumptions } from "@/lib/db";
import { Callout, Card, MoneyField, NumberField, ProvenanceBadge, SectionTitle, TextField, Toggle } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { cloneAssumptions, DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import type { EstimatingAssumptions, PropertyModel } from "@/lib/types";
import { formatMoney } from "@/lib/engine/money";

/** Advanced Assumptions panel — edits create a new effective-dated version; existing proposals keep their snapshot. */
export function AssumptionsTab() {
  const toast = useToast();
  const settings = useLiveQuery(() => db().settings.get("settings"), []);
  const versions = useLiveQuery(() => db().assumptionVersions.orderBy("createdAt").reverse().toArray(), []);
  const active = versions?.find((v) => v.id === settings?.activeAssumptionsVersionId);
  const [a, setA] = useState<EstimatingAssumptions | null>(null);
  const [note, setNote] = useState("");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => {
    if (active && !a) setA(cloneAssumptions(active.assumptions));
  }, [active, a]);
  if (!a || !active) return null;
  const dirty = JSON.stringify(a) !== JSON.stringify(active.assumptions);
  const set = (fn: (x: EstimatingAssumptions) => void) => setA((cur) => { const n = cloneAssumptions(cur!); fn(n); return n; });
  const confirmedChanged = a.laborRateCentsPerHour !== active.assumptions.laborRateCentsPerHour || a.tinCatServiceMinutes !== active.assumptions.tinCatServiceMinutes || a.baitStationServiceMinutes !== active.assumptions.baitStationServiceMinutes;

  const publish = async () => {
    if (confirmedChanged && !confirm("You are changing a confirmed standard (labor rate or device time). New proposals will use it from the effective date. Existing and approved proposals keep their original snapshot. Continue?")) return;
    await publishAssumptions(a, note || "Updated assumptions", effective);
    setNote("");
    toast("New assumptions version published");
  };

  const model = (k: PropertyModel, f: keyof EstimatingAssumptions["models"][PropertyModel], v: number) => set((x) => void ((x.models[k] as unknown as Record<string, number>)[f as string] = v));

  return (
    <div className="space-y-4">
      <Callout>Changes publish a new <b>effective-dated version</b>. Previously created and approved proposals are never repriced automatically.</Callout>
      <SectionTitle>Confirmed standards</SectionTitle>
      <Card className="grid gap-3 sm:grid-cols-3">
        <MoneyField label={<span className="flex items-center gap-1.5">Billable labor rate / hr <ProvenanceBadge p="confirmed" /></span>} cents={a.laborRateCentsPerHour} onChange={(c) => set((x) => void (x.laborRateCentsPerHour = c ?? 0))} hint={`${formatMoney(Math.round(a.laborRateCentsPerHour / 60))} per technician-minute · estimating rate, not wage`} />
        <NumberField label={<span className="flex items-center gap-1.5">Tin Cat min / service <ProvenanceBadge p="confirmed" /></span>} value={a.tinCatServiceMinutes} decimal onChange={(v) => set((x) => void (x.tinCatServiceMinutes = v ?? 0))} />
        <NumberField label={<span className="flex items-center gap-1.5">Exterior bait station min <ProvenanceBadge p="confirmed" /></span>} value={a.baitStationServiceMinutes} decimal onChange={(v) => set((x) => void (x.baitStationServiceMinutes = v ?? 0))} />
      </Card>

      <SectionTitle>Planning estimates (app-generated)</SectionTitle>
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField label="Floor transition (min)" value={a.perFloorTransitionMinutes} decimal onChange={(v) => set((x) => void (x.perFloorTransitionMinutes = v ?? 0))} />
        <NumberField label="Zone transition (min)" value={a.zoneTransitionMinutes} decimal onChange={(v) => set((x) => void (x.zoneTransitionMinutes = v ?? 0))} />
        <NumberField label="Restricted check-in (min/tech)" value={a.restrictedAccessCheckInMinutes} decimal onChange={(v) => set((x) => void (x.restrictedAccessCheckInMinutes = v ?? 0))} />
        <NumberField label="Coordination / extra tech" value={a.coordinationMinutesPerExtraTech} decimal onChange={(v) => set((x) => void (x.coordinationMinutesPerExtraTech = v ?? 0))} />
        <NumberField label="Docs per device (min)" value={a.documentationPerDeviceMinutes} decimal step={0.01} onChange={(v) => set((x) => void (x.documentationPerDeviceMinutes = v ?? 0))} />
        <NumberField label="Docs per apartment (min)" value={a.documentationPerApartmentMinutes} decimal onChange={(v) => set((x) => void (x.documentationPerApartmentMinutes = v ?? 0))} />
        <NumberField label="Initial inspection ×" value={a.initialInspectionMultiplier} decimal step={0.05} onChange={(v) => set((x) => void (x.initialInspectionMultiplier = v ?? 1))} />
        <NumberField label="Initial documentation ×" value={a.initialDocumentationMultiplier} decimal step={0.05} onChange={(v) => set((x) => void (x.initialDocumentationMultiplier = v ?? 1))} />
        <NumberField label="Device mapping (min/device)" value={a.deviceMappingMinutesPerDevice} decimal step={0.05} onChange={(v) => set((x) => void (x.deviceMappingMinutesPerDevice = v ?? 0))} />
        <NumberField label="Complex placement (min/device)" value={a.complexPlacementMinutesPerDevice} decimal step={0.05} onChange={(v) => set((x) => void (x.complexPlacementMinutesPerDevice = v ?? 0))} />
        <NumberField label="Walking overlap / extra tech" value={a.walkingOverlapPerExtraTech} decimal step={0.05} onChange={(v) => set((x) => void (x.walkingOverlapPerExtraTech = v ?? 0))} />
        <NumberField label="Large campus walking ×" value={a.largeCampusWalkingMultiplier} decimal step={0.05} onChange={(v) => set((x) => void (x.largeCampusWalkingMultiplier = v ?? 1))} />
      </Card>
      <Card className="grid grid-cols-3 gap-3">
        {(["easy", "moderate", "restricted"] as const).map((k) => (
          <NumberField key={k} label={`Access: ${k} ×`} value={a.accessMultipliers[k]} decimal step={0.05} onChange={(v) => set((x) => void (x.accessMultipliers[k] = v ?? 1))} />
        ))}
        {(["none", "low", "moderate", "high", "severe"] as const).map((k) => (
          <NumberField key={k} label={`Activity: ${k} ×`} value={a.activityMultipliers[k]} decimal step={0.05} onChange={(v) => set((x) => void (x.activityMultipliers[k] = v ?? 1))} />
        ))}
      </Card>
      <Card className="grid grid-cols-3 gap-3">
        <div className="col-span-3 text-[13px] text-ink3">Parallelizable share of each component (affects elapsed time with multiple technicians, not billed hours).</div>
        {(Object.keys(a.parallelFractions) as (keyof EstimatingAssumptions["parallelFractions"])[]).map((k) => (
          <NumberField key={k} label={`${k} %`} value={Math.round(a.parallelFractions[k] * 100)} max={100} onChange={(v) => set((x) => void (x.parallelFractions[k] = (v ?? 0) / 100))} />
        ))}
      </Card>
      <Card>
        <Toggle checked={a.minimumCharge.enabled} onChange={(v) => set((x) => void (x.minimumCharge.enabled = v))} label="Optional minimum charge" description="Never applied automatically — each program must opt in on its Pricing step." />
        {a.minimumCharge.enabled && <MoneyField label="Minimum per visit" cents={a.minimumCharge.cents} onChange={(c) => set((x) => void (x.minimumCharge.cents = c ?? 0))} />}
      </Card>

      <SectionTitle>Property model profiles</SectionTitle>
      <div className="space-y-2.5">
        {(Object.keys(a.models) as PropertyModel[]).map((k) => {
          const m = a.models[k];
          return (
            <Card key={k} className="space-y-2">
              <div className="text-[14px] font-semibold">{m.label} <span className="font-normal text-ink3">· {m.description}</span></div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <NumberField label="Interior cov. %" value={Math.round(m.interiorCoverage * 100)} max={100} onChange={(v) => model(k, "interiorCoverage", (v ?? 0) / 100)} />
                <NumberField label="Exterior cov. %" value={Math.round(m.exteriorCoverage * 100)} max={100} onChange={(v) => model(k, "exteriorCoverage", (v ?? 0) / 100)} />
                <NumberField label="Route spacing ft" value={m.routeSpacingFt} onChange={(v) => model(k, "routeSpacingFt", v ?? 1)} />
                <NumberField label="Walk ft/min" value={m.walkingSpeedFtPerMin} onChange={(v) => model(k, "walkingSpeedFtPerMin", v ?? 1)} />
                <NumberField label="Inspect sq ft/min" value={m.generalInspectionSqFtPerMin} onChange={(v) => model(k, "generalInspectionSqFtPerMin", v ?? 1)} />
                <NumberField label="Setup min/tech" value={m.setupMinutesPerTech} decimal onChange={(v) => model(k, "setupMinutesPerTech", v ?? 0)} />
                <NumberField label="Docs base min" value={m.documentationBaseMinutes} decimal onChange={(v) => model(k, "documentationBaseMinutes", v ?? 0)} />
                <NumberField label="Bldg transition min" value={m.perBuildingTransitionMinutes} decimal onChange={(v) => model(k, "perBuildingTransitionMinutes", v ?? 0)} />
                {k === "multifamily" && <NumberField label="Min / apartment" value={m.perApartmentMinutes} decimal onChange={(v) => model(k, "perApartmentMinutes", v ?? 0)} />}
                {k === "multifamily" && <NumberField label="Apt transition min" value={m.perApartmentTransitionMinutes} decimal onChange={(v) => model(k, "perApartmentTransitionMinutes", v ?? 0)} />}
              </div>
              {a.calibration[k] && <div className="text-[12px] text-info">Calibration ×{a.calibration[k]!.factor.toFixed(3)} — {a.calibration[k]!.basis} <button className="ml-2 text-red" onClick={() => set((x) => void delete x.calibration[k])}>Remove</button></div>}
            </Card>
          );
        })}
      </div>

      <Card className={dirty ? "sticky bottom-24 z-10 space-y-3 border-red/40 shadow-2xl lg:bottom-4" : "space-y-3"}>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <TextField label="Change note" value={note} onChange={setNote} placeholder="e.g. Raised warehouse inspection rate after field timing" />
          <TextField label="Effective date" type="date" value={effective} onChange={setEffective} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!dirty} onClick={publish}>Publish new version</button>
          <button className="btn-ghost" disabled={!dirty} onClick={() => setA(cloneAssumptions(active.assumptions))}>Discard changes</button>
          <button className="btn-ghost" onClick={() => confirm("Load factory defaults into the editor? Nothing is published until you tap Publish.") && setA(cloneAssumptions(DEFAULT_ASSUMPTIONS))}>Load defaults</button>
        </div>
      </Card>

      <SectionTitle>Version history</SectionTitle>
      <Card pad={false} className="divide-hair overflow-hidden">
        {versions?.map((v) => (
          <div key={v.id} className="px-4 py-2.5 text-[13px]">
            <div className="font-medium">{v.note} {v.id === active.id && <span className="text-ok">· active</span>}</div>
            <div className="text-ink3">Effective {v.effectiveDate} · {formatMoney(v.assumptions.laborRateCentsPerHour)}/hr · Tin Cat {v.assumptions.tinCatServiceMinutes} min · station {v.assumptions.baitStationServiceMinutes} min</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
