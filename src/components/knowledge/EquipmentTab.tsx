"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Callout, Card, MoneyField, NumberField, ProvenanceBadge, Select, Sheet, TextArea, TextField } from "@/components/ui";
import { formatMoney } from "@/lib/engine/money";
import { uid, nowISO } from "@/lib/ids";
import type { ApprovalStatus, EquipmentItem } from "@/lib/types";
import { CONFIRMED_DEVICE_IDS } from "@/lib/engine/catalogIds";

const STATUS: { value: ApprovalStatus; label: string }[] = [
  { value: "approved_active", label: "Approved active default" },
  { value: "draft", label: "Draft / not approved" },
  { value: "historical_reference", label: "Historical reference only" },
  { value: "archived", label: "Archived" },
];

export function EquipmentTab() {
  const items = useLiveQuery(() => db().equipment.toArray(), []);
  const [edit, setEdit] = useState<EquipmentItem | null>(null);
  const confirmedIds = Object.values(CONFIRMED_DEVICE_IDS) as string[];

  const save = async () => {
    if (!edit) return;
    const prev = await db().equipment.get(edit.id);
    const next = { ...edit };
    if (prev && prev.unitPriceCents !== edit.unitPriceCents) {
      next.priceHistory = [...prev.priceHistory, { cents: prev.unitPriceCents, effectiveDate: prev.effectiveDate, note: "Superseded" }];
      next.effectiveDate = nowISO().slice(0, 10);
    }
    await db().equipment.put(next);
    setEdit(null);
  };

  return (
    <div className="space-y-3">
      <Callout>Prices apply to new proposals only when an item is an <b>approved active default</b> with a price. Existing proposals keep the price captured when equipment was added. Service times marked Confirmed are your standards.</Callout>
      <div className="flex justify-end">
        <button className="btn-secondary btn-sm" onClick={() => setEdit({ id: uid("eq"), name: "", category: "", description: "", unitPriceCents: null, purchaseCostCents: null, installMinutes: 0, installSource: "user", serviceMinutes: 0, serviceSource: "user", defaultLocation: "interior", pests: [], defaultUsage: "", notes: "", effectiveDate: nowISO().slice(0, 10), approvalStatus: "draft", priceHistory: [] })}>
          <Plus size={14} /> Equipment item
        </button>
      </div>
      <Card pad={false} className="divide-hair overflow-hidden">
        {items?.map((e) => (
          <button key={e.id} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface2/50" onClick={() => setEdit(structuredClone(e))}>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{e.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink3">
                <ProvenanceBadge p={e.serviceSource} /> {e.serviceMinutes} min service · {e.installMinutes} min install · {e.category}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-[14px] font-semibold">{e.unitPriceCents != null ? formatMoney(e.unitPriceCents) : "No price"}</div>
              <Badge tone={e.approvalStatus === "approved_active" ? "ok" : e.approvalStatus === "archived" ? "neutral" : "warn"}>{STATUS.find((s) => s.value === e.approvalStatus)?.label.split(" ")[0]}</Badge>
            </div>
          </button>
        ))}
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.name || "Equipment item"} footer={<div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={!edit?.name}>Save</button></div>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} className="sm:col-span-2" />
            <TextField label="Category" value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} />
            <Select label="Default location" value={edit.defaultLocation} onChange={(v) => setEdit({ ...edit, defaultLocation: v })} options={[{ value: "interior", label: "Interior" }, { value: "exterior", label: "Exterior" }]} />
            <TextArea label="Description" rows={2} value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} className="sm:col-span-2" />
            <MoneyField label="Unit sales price" cents={edit.unitPriceCents} onChange={(c) => setEdit({ ...edit, unitPriceCents: c })} placeholder="Not set" />
            <MoneyField label="Purchase cost (internal)" cents={edit.purchaseCostCents} onChange={(c) => setEdit({ ...edit, purchaseCostCents: c })} placeholder="—" />
            <NumberField
              label={<span className="flex items-center gap-1.5">Recurring service min <ProvenanceBadge p={edit.serviceSource} /></span>}
              value={edit.serviceMinutes}
              decimal
              onChange={(v) => {
                if (edit.serviceSource === "confirmed" && !confirm("This is a confirmed time standard. Changing it here alters the catalog for future equipment additions only — proposals use the versioned assumption values. Continue?")) return;
                setEdit({ ...edit, serviceMinutes: v ?? 0, serviceSource: confirmedIds.includes(edit.id) && edit.serviceSource === "confirmed" ? "confirmed" : "user" });
              }}
            />
            <NumberField label={<span className="flex items-center gap-1.5">Installation min <ProvenanceBadge p={edit.installSource} /></span>} value={edit.installMinutes} decimal onChange={(v) => setEdit({ ...edit, installMinutes: v ?? 0, installSource: "user" })} />
            <TextField label="Applicable pests (comma-separated)" value={edit.pests.join(", ")} onChange={(v) => setEdit({ ...edit, pests: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <TextField label="Effective date" type="date" value={edit.effectiveDate} onChange={(v) => setEdit({ ...edit, effectiveDate: v })} />
            <TextArea label="Default usage" rows={2} value={edit.defaultUsage} onChange={(v) => setEdit({ ...edit, defaultUsage: v })} />
            <TextArea label="Notes" rows={2} value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} />
            <Select label="Approval status" value={edit.approvalStatus} onChange={(v) => setEdit({ ...edit, approvalStatus: v })} options={STATUS} className="sm:col-span-2" />
            {edit.priceHistory.length > 0 && (
              <div className="sm:col-span-2">
                <span className="field-label">Price history</span>
                {edit.priceHistory.map((h, i) => (
                  <div key={i} className="text-[13px] text-ink3">{h.effectiveDate}: {formatMoney(h.cents)} — {h.note}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
