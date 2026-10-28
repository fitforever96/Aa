"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { db } from "@/lib/db";
import { Badge, Callout, Card, MoneyField, Select, Sheet, TextArea, TextField } from "@/components/ui";
import { formatMoney } from "@/lib/engine/money";
import { uid, nowISO } from "@/lib/ids";
import type { HistoricalPrice, HistoricalStatus } from "@/lib/types";

export const HIST_STATUS: { value: HistoricalStatus; label: string; tone: "neutral" | "ok" | "warn" | "info" | "red" }[] = [
  { value: "customer_specific", label: "Customer-specific historical price", tone: "neutral" },
  { value: "approved_standard", label: "Approved active standard", tone: "ok" },
  { value: "unverified_extracted", label: "Unverified extracted price", tone: "warn" },
  { value: "manual_override", label: "Manually overridden price", tone: "info" },
  { value: "archived", label: "Archived or superseded", tone: "neutral" },
];

export function HistoricalTab() {
  const rows = useLiveQuery(() => db().historical.toArray(), []);
  const [cat, setCat] = useState("All");
  const [edit, setEdit] = useState<HistoricalPrice | null>(null);
  const cats = useMemo(() => ["All", ...new Set((rows ?? []).map((r) => r.category))], [rows]);
  const list = (rows ?? []).filter((r) => cat === "All" || r.category === cat);

  const save = async () => {
    if (!edit) return;
    const prev = await db().historical.get(edit.id);
    if (edit.status === "approved_standard" && prev?.status !== "approved_standard" && !confirm("Promote to an approved active standard? Approved standards may be offered automatically for new proposals. Customer-specific promises are not universal Orkin standards.")) return;
    await db().historical.put(edit);
    if (edit.status === "approved_standard" && edit.category === "Equipment" && confirm("Also set this as the approved catalog price for the matching equipment item?")) {
      const id = /tin cat/i.test(edit.program) ? "eq_tin_cat" : /exterior/i.test(edit.program) ? "eq_exterior_bait_station" : null;
      const item = id ? await db().equipment.get(id) : null;
      if (item) await db().equipment.put({ ...item, priceHistory: [...item.priceHistory, { cents: item.unitPriceCents, effectiveDate: item.effectiveDate, note: "Superseded" }], unitPriceCents: edit.priceCents, approvalStatus: "approved_active", effectiveDate: nowISO().slice(0, 10) });
    }
    setEdit(null);
  };

  return (
    <div className="space-y-3">
      <Callout tone="warn">Historical prices are comparison examples tied to specific customers, scopes and negotiations. Only items you mark <b>Approved active standard</b> may apply to new proposals — and the app never invents a price that isn’t here.</Callout>
      <div className="flex items-center justify-between gap-2">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {cats.map((c) => (
            <button key={c} className={clsx("chip shrink-0", cat === c && "chip-on")} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <button className="btn-secondary btn-sm shrink-0" onClick={() => setEdit({ id: uid("hist"), customer: "", program: "", category: "Commercial", description: "", priceCents: null, priceHighCents: null, basis: "per visit", frequency: "", status: "customer_specific", source: "Manual entry", version: "", effectiveDate: nowISO().slice(0, 10), notes: "", tags: [], metrics: {} })}><Plus size={14} /> Add</button>
      </div>
      <Card pad={false} className="divide-hair overflow-hidden">
        {list.map((h) => {
          const st = HIST_STATUS.find((s) => s.value === h.status)!;
          return (
            <button key={h.id} className="w-full px-4 py-3 text-left hover:bg-surface2/50" onClick={() => setEdit(structuredClone(h))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{h.customer}</div>
                  <div className="text-[13px] text-ink2">{h.program}</div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] text-ink3">{h.description}</div>
                </div>
                <div className="num shrink-0 text-right text-[14px] font-semibold">
                  {formatMoney(h.priceCents)}{h.priceHighCents ? `–${formatMoney(h.priceHighCents)}` : ""}
                  <div className="text-[11px] font-normal text-ink3">{h.basis}</div>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge tone={st.tone}>{st.label}</Badge>{h.frequency && <Badge>{h.frequency}</Badge>}{h.version && <Badge>{h.version}</Badge>}</div>
            </button>
          );
        })}
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Historical price" footer={<div className="flex justify-between gap-2"><button className="btn-ghost text-red" onClick={async () => { if (edit && confirm("Delete this historical record?")) { await db().historical.delete(edit.id); setEdit(null); } }}>Delete</button><button className="btn-primary" onClick={save}>Save</button></div>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Customer" value={edit.customer} onChange={(v) => setEdit({ ...edit, customer: v })} />
            <TextField label="Program" value={edit.program} onChange={(v) => setEdit({ ...edit, program: v })} />
            <TextField label="Category" value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} />
            <TextField label="Frequency" value={edit.frequency} onChange={(v) => setEdit({ ...edit, frequency: v })} />
            <MoneyField label="Price" cents={edit.priceCents} onChange={(c) => setEdit({ ...edit, priceCents: c })} />
            <MoneyField label="Range high" cents={edit.priceHighCents} onChange={(c) => setEdit({ ...edit, priceHighCents: c })} placeholder="—" />
            <TextField label="Basis" value={edit.basis} onChange={(v) => setEdit({ ...edit, basis: v })} />
            <TextField label="Version label" value={edit.version} onChange={(v) => setEdit({ ...edit, version: v })} placeholder="e.g. v2 — revised Mar 2026" />
            <Select label="Status" value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} options={HIST_STATUS.map((s) => ({ value: s.value, label: s.label }))} className="sm:col-span-2" />
            <TextArea label="Description" rows={3} value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} className="sm:col-span-2" />
            <TextField label="Source" value={edit.source} onChange={(v) => setEdit({ ...edit, source: v })} />
            <TextField label="Tags (comma-separated)" value={edit.tags.join(", ")} onChange={(v) => setEdit({ ...edit, tags: v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })} />
            <TextArea label="Notes" rows={2} value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} className="sm:col-span-2" />
          </div>
        )}
      </Sheet>
    </div>
  );
}
