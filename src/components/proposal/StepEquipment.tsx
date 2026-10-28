"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { History, Lock, Plus, Trash2, Unlock } from "lucide-react";
import clsx from "clsx";
import { Badge, Callout, Card, MoneyField, NumberField, ProvenanceBadge, SectionTitle, Segmented, Sheet, Toggle } from "@/components/ui";
import { db } from "@/lib/db";
import { allocationFromCatalog, treatmentFromPreset, zoneFromPreset } from "@/lib/factories";
import { TREATMENT_PRESETS, ZONE_PRESETS } from "@/lib/engine/assumptions";
import { deviceServiceMinutes } from "@/lib/engine/estimator";
import { formatMoney, fmtNum } from "@/lib/engine/money";
import { planRotation } from "@/lib/engine/rotation";
import { ProgramTabs } from "./ProgramTabs";
import { prog, type StepProps } from "./types";

export function StepEquipment(props: StepProps) {
  const { proposal: p, update, programIdx } = props;
  const pr = prog(p, programIdx);
  const idx = p.programs.indexOf(pr);
  const set = (fn: (x: typeof pr) => void) => update((d) => fn(d.programs[idx]));
  const catalog = useLiveQuery(() => db().equipment.toArray(), []);
  const historicalEquip = useLiveQuery(() => db().historical.where("category").equals("Equipment").toArray(), []);
  const [sheet, setSheet] = useState<null | "equipment" | "zone" | "treatment">(null);
  const [priceFor, setPriceFor] = useState<number | null>(null);
  const [rot, setRot] = useState({ units: p.property.apartmentCount ?? 0, cycle: 12 });
  const plan = rot.units > 0 ? planRotation(rot.units, rot.cycle, pr.frequency) : null;
  const sortedTreatments = [...TREATMENT_PRESETS].sort((a, b) => Number(b.services.some((s) => pr.services.includes(s))) - Number(a.services.some((s) => pr.services.includes(s))));

  return (
    <div className="space-y-5">
      <ProgramTabs {...props} />

      {(p.property.model === "multifamily" || p.kind === "multifamily_rotation") && (
        <div>
          <SectionTitle>Apartment rotation</SectionTitle>
          <Card className="space-y-3">
            <NumberField label="Apartments serviced per visit" value={pr.apartmentsPerVisit} allowNull stepper onChange={(v) => set((x) => void (x.apartmentsPerVisit = v))} hint="Multifamily labor is driven by this number, not total square footage." />
            <div className="rounded-xl bg-surface2 p-3">
              <div className="mb-2 text-[13px] font-semibold">Rotation planner</div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Units in community" value={rot.units} onChange={(v) => setRot((r) => ({ ...r, units: v ?? 0 }))} />
                <NumberField label="Cycle (months)" value={rot.cycle} min={1} max={24} onChange={(v) => setRot((r) => ({ ...r, cycle: v ?? 12 }))} />
              </div>
              {plan && (
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div className="text-[12.5px] text-ink2">
                    <span className="num">{plan.formula}</span>
                  </div>
                  <button className="btn-secondary btn-sm shrink-0" onClick={() => set((x) => void (x.apartmentsPerVisit = plan.aptsPerVisit))}>
                    Use {plan.aptsPerVisit}
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <div>
        <SectionTitle action={<button className="btn-secondary btn-sm" onClick={() => setSheet("equipment")}><Plus size={14} /> Equipment</button>}>Equipment</SectionTitle>
        {pr.equipment.length === 0 && <Card className="text-[13px] text-ink3">No equipment. Add Tin Cats, exterior bait stations, fly lights or monitors from your catalog.</Card>}
        <div className="space-y-2.5">
          {pr.equipment.map((e, k) => {
            const minutes = deviceServiceMinutes(e, p.assumptions);
            const confirmed = e.serviceTimeSource === "confirmed";
            return (
              <Card key={e.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold leading-tight">{e.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink3">
                      <ProvenanceBadge p={e.serviceTimeSource} />
                      <span className="num">{fmtNum(minutes, minutes % 1 ? 2 : 0)} min/device/visit</span>
                      <span>·</span>
                      <span className="num">= {fmtNum(minutes * e.quantity * e.servicedFraction, 1)} min</span>
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => set((x) => void x.equipment.splice(k, 1))} aria-label="Remove equipment">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberField label="Quantity" value={e.quantity} stepper onChange={(v) => set((x) => void (x.equipment[k].quantity = v ?? 0))} />
                  <NumberField label="Reserve / supplemental" value={e.reserveQuantity} hint="Sold, not serviced each visit" onChange={(v) => set((x) => void (x.equipment[k].reserveQuantity = v ?? 0))} />
                  <div>
                    <span className="field-label">Location</span>
                    <Segmented size="sm" value={e.location} onChange={(v) => set((x) => void (x.equipment[k].location = v))} options={[{ value: "interior", label: "Interior" }, { value: "exterior", label: "Exterior" }]} />
                  </div>
                  <NumberField label="Serviced per visit %" value={Math.round(e.servicedFraction * 100)} max={100} onChange={(v) => set((x) => void (x.equipment[k].servicedFraction = (v ?? 100) / 100))} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <span className="field-label flex items-center gap-1">Service min/device {confirmed ? <Lock size={11} /> : null}</span>
                    {confirmed ? (
                      <div className="flex items-center gap-2">
                        <div className="input num flex-1 !bg-surface3/60">{minutes}</div>
                        <button className="btn-ghost btn-sm" title="Override for this proposal" onClick={() => { if (confirm("Override your confirmed time standard for this proposal only? The catalog standard stays unchanged.")) set((x) => void ((x.equipment[k].serviceTimeSource = "user"), (x.equipment[k].serviceMinutesEach = minutes))); }}>
                          <Unlock size={14} />
                        </button>
                      </div>
                    ) : (
                      <NumberField value={e.serviceMinutesEach} step={0.25} decimal onChange={(v) => set((x) => void ((x.equipment[k].serviceMinutesEach = v ?? 0), (x.equipment[k].serviceTimeSource = "user")))} />
                    )}
                  </div>
                  <NumberField label="Install min/device" value={e.installMinutesEach} step={0.5} decimal onChange={(v) => set((x) => void ((x.equipment[k].installMinutesEach = v ?? 0), (x.equipment[k].installTimeSource = "user")))} hint={<span className="inline-flex items-center gap-1"><ProvenanceBadge p={e.installTimeSource} /> 0 = existing devices</span>} />
                  <div className="col-span-2">
                    <Toggle checked={e.billable} onChange={(v) => set((x) => void (x.equipment[k].billable = v))} label="Equipment billed to customer" description="Priced separately from labor." />
                  </div>
                </div>
                {e.billable && (
                  <div className="flex flex-wrap items-end gap-3">
                    <MoneyField label="Unit price" className="w-36" cents={e.unitPriceCents} onChange={(v) => set((x) => void ((x.equipment[k].unitPriceCents = v), (x.equipment[k].priceSource = v == null ? "not_set" : "manual")))} placeholder="Not set" />
                    <div className="pb-2.5">
                      <Badge tone={e.priceSource === "not_set" ? "red" : e.priceSource === "historical_reference" ? "warn" : e.priceSource === "catalog_approved" ? "ok" : "info"}>{e.priceSource.replace(/_/g, " ")}</Badge>
                    </div>
                    <button className="btn-ghost btn-sm mb-1.5" onClick={() => setPriceFor(k)}>
                      <History size={14} /> Price options
                    </button>
                    {e.unitPriceCents != null && <div className="num mb-2.5 ml-auto text-[14px] font-semibold">{formatMoney(e.unitPriceCents * (e.quantity + e.reserveQuantity))}</div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle action={<button className="btn-secondary btn-sm" onClick={() => setSheet("zone")}><Plus size={14} /> Area</button>}>Inspection areas</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {pr.zones.length === 0 && <div className="p-4 text-[13px] text-ink3">No inspection areas. Add covered square footage, docks, kitchens, common areas, trash rooms…</div>}
          {pr.zones.map((z, k) => (
            <div key={z.id} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3.5 sm:grid-cols-[1fr_120px_120px_auto]">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">{z.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink3">
                  <ProvenanceBadge p={z.source} /> {z.interior ? "Interior" : "Exterior"}
                </div>
              </div>
              <button className="btn-ghost btn-sm sm:order-last" onClick={() => set((x) => void x.zones.splice(k, 1))} aria-label="Remove area">
                <Trash2 size={15} />
              </button>
              <NumberField value={z.quantity} suffix={z.unit === "sqft" ? "sq ft" : z.unit === "linear_ft" ? "ft" : "qty"} onChange={(v) => set((x) => void (x.zones[k].quantity = v ?? 0))} />
              <NumberField value={z.zoneType === "general_area" && z.source === "estimate" ? Math.round(p.assumptions.models[p.property.model].generalInspectionSqFtPerMin) : z.unit === "each" ? z.minutesPerUnit : Math.round(1 / z.minutesPerUnit)} suffix={z.unit === "each" ? "min ea" : "per min"} decimal onChange={(v) => set((x) => void ((x.zones[k].minutesPerUnit = z.unit === "each" ? v ?? 0 : 1 / Math.max(1, v ?? 1)), (x.zones[k].source = "user")))} />
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionTitle action={<button className="btn-secondary btn-sm" onClick={() => setSheet("treatment")}><Plus size={14} /> Activity</button>}>Treatment activities</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {pr.treatments.length === 0 && <div className="p-4 text-[13px] text-ink3">No treatment activities. Add crack-and-crevice work, gel baiting, perimeter treatment, drains, burrows…</div>}
          {pr.treatments.map((t, k) => (
            <div key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3.5 sm:grid-cols-[1fr_110px_110px_150px_auto]">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">{t.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink3">
                  <ProvenanceBadge p={t.source} /> per {t.unit}
                </div>
              </div>
              <button className="btn-ghost btn-sm sm:order-last" onClick={() => set((x) => void x.treatments.splice(k, 1))} aria-label="Remove activity">
                <Trash2 size={15} />
              </button>
              <NumberField value={t.quantity} suffix="qty" decimal onChange={(v) => set((x) => void (x.treatments[k].quantity = v ?? 0))} />
              <NumberField value={t.minutesPerUnit} suffix="min" decimal onChange={(v) => set((x) => void ((x.treatments[k].minutesPerUnit = v ?? 0), (x.treatments[k].source = "user")))} />
              <Segmented size="sm" className="col-span-2 sm:col-span-1" value={t.phase} onChange={(v) => set((x) => void (x.treatments[k].phase = v))} options={[{ value: "initial", label: "Initial" }, { value: "recurring", label: "Recur." }, { value: "both", label: "Both" }]} />
            </div>
          ))}
        </Card>
        <Callout className="mt-3">Times marked <b>Estimate</b> are app-generated planning assumptions, not Orkin production standards. Editing a value marks it <b>Measured</b> for this proposal.</Callout>
      </div>

      <Sheet open={sheet === "equipment"} onClose={() => setSheet(null)} title="Add equipment">
        <div className="divide-hair">
          {(catalog ?? []).filter((c) => c.approvalStatus !== "archived").map((c) => (
            <button key={c.id} className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => { set((x) => void x.equipment.push(allocationFromCatalog(c, 0))); setSheet(null); }}>
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{c.name}</div>
                <div className="text-[12px] text-ink3">{c.category} · {c.serviceMinutes} min service ({c.serviceSource})</div>
              </div>
              <div className="num shrink-0 text-[13px] text-ink2">{c.unitPriceCents != null && c.approvalStatus === "approved_active" ? formatMoney(c.unitPriceCents) : "No price"}</div>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "zone"} onClose={() => setSheet(null)} title="Add inspection area">
        <div className="divide-hair">
          {ZONE_PRESETS.map((z) => (
            <button key={z.key} className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => { set((x) => void x.zones.push(zoneFromPreset(z, z.key === "general_area" && p.property.squareFeet ? Math.round(p.property.squareFeet * (p.property.interiorCoverage ?? p.assumptions.models[p.property.model].interiorCoverage)) : z.unit === "each" ? 1 : 0))); setSheet(null); }}>
              <div>
                <div className="text-[14px] font-medium">{z.label}</div>
                {z.hint && <div className="text-[12px] text-ink3">{z.hint}</div>}
              </div>
              <span className="num text-[12px] text-ink3">{z.unit === "each" ? `${z.minutesPerUnit} min` : `${Math.round(1 / z.minutesPerUnit)}/min`}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "treatment"} onClose={() => setSheet(null)} title="Add treatment activity">
        <div className="divide-hair">
          {sortedTreatments.map((t) => (
            <button key={t.key} className={clsx("flex w-full items-center justify-between gap-3 py-3 text-left", !t.services.some((s) => pr.services.includes(s)) && "opacity-60")} onClick={() => { set((x) => void x.treatments.push(treatmentFromPreset(t, 1))); setSheet(null); }}>
              <div>
                <div className="text-[14px] font-medium">{t.label}</div>
                <div className="text-[12px] text-ink3">per {t.unit} · {t.phase}</div>
              </div>
              <span className="num text-[12px] text-ink3">{t.minutesPerUnit} min</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={priceFor != null} onClose={() => setPriceFor(null)} title="Equipment price options">
        {priceFor != null && pr.equipment[priceFor] && (() => {
          const e = pr.equipment[priceFor];
          const cat = catalog?.find((c) => c.id === e.catalogItemId);
          const hist = (historicalEquip ?? []).filter((h) => (e.location === "interior" ? /tin cat/i.test(h.program) : /exterior/i.test(h.program)));
          return (
            <div className="space-y-3">
              {cat?.unitPriceCents != null && cat.approvalStatus === "approved_active" ? (
                <button className="card flex w-full items-center justify-between p-3.5 text-left" onClick={() => { set((x) => void ((x.equipment[priceFor].unitPriceCents = cat.unitPriceCents), (x.equipment[priceFor].priceSource = "catalog_approved"))); setPriceFor(null); }}>
                  <span><b>Approved catalog price</b><br /><span className="text-[12px] text-ink3">Effective {cat.effectiveDate}</span></span>
                  <span className="num font-semibold">{formatMoney(cat.unitPriceCents)}</span>
                </button>
              ) : (
                <Callout tone="warn">No approved active catalog price for this item. Set one in Knowledge & Pricing › Equipment, or enter a customer-specific price.</Callout>
              )}
              {hist.map((h) => (
                <button key={h.id} className="card flex w-full items-center justify-between p-3.5 text-left" onClick={() => { set((x) => void ((x.equipment[priceFor].unitPriceCents = h.priceCents), (x.equipment[priceFor].priceSource = "historical_reference"))); setPriceFor(null); }}>
                  <span><b>{h.customer}</b><br /><span className="text-[12px] text-warn">Customer-specific historical price — use only by choice</span></span>
                  <span className="num font-semibold">{formatMoney(h.priceCents)}</span>
                </button>
              ))}
              <MoneyField label="Customer-specific override" cents={e.unitPriceCents} onChange={(v) => set((x) => void ((x.equipment[priceFor].unitPriceCents = v), (x.equipment[priceFor].priceSource = v == null ? "not_set" : "customer_override")))} />
            </div>
          );
        })()}
      </Sheet>
    </div>
  );
}
