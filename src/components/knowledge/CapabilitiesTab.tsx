"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Callout, Card, Sheet, TextArea, TextField, Toggle } from "@/components/ui";
import type { VerifiedCapability } from "@/lib/types";
import { nowISO } from "@/lib/ids";

export function CapabilitiesTab() {
  const caps = useLiveQuery(() => db().capabilities.toArray(), []);
  const [edit, setEdit] = useState<VerifiedCapability | null>(null);
  return (
    <div className="space-y-3">
      <Callout>Official Orkin programs, guarantees and branded systems (Triple Guarantee, A.I.M.®, InSite®). Verify against current orkin.com/commercial materials and mark verified. The writer uses this wording; it never expands guarantee terms.</Callout>
      <Card pad={false} className="divide-hair overflow-hidden">
        {caps?.map((c) => (
          <button key={c.id} className="w-full px-4 py-3 text-left hover:bg-surface2/50" onClick={() => setEdit(structuredClone(c))}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">{c.name}</div>
              <Badge tone={c.status === "verified" ? "ok" : "warn"}>{c.status === "verified" ? `Verified ${c.lastVerified?.slice(0, 10)}` : "Needs verification"}</Badge>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink3">{c.customerFacingText}</div>
          </button>
        ))}
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ""} footer={<div className="flex justify-end"><button className="btn-primary" onClick={async () => { await db().capabilities.put(edit!); setEdit(null); }}>Save</button></div>}>
        {edit && (
          <div className="space-y-3">
            <TextArea label="Customer-facing text" rows={5} value={edit.customerFacingText} onChange={(v) => setEdit({ ...edit, customerFacingText: v })} />
            <TextArea label="Internal notes" rows={4} value={edit.internalNotes} onChange={(v) => setEdit({ ...edit, internalNotes: v })} />
            <TextField label="Source URL" value={edit.sourceUrl} onChange={(v) => setEdit({ ...edit, sourceUrl: v })} />
            {edit.sourceUrl && <a className="flex items-center gap-1 text-[13px] text-info" href={edit.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open source</a>}
            <Toggle checked={edit.status === "verified"} onChange={(v) => setEdit({ ...edit, status: v ? "verified" : "needs_verification", lastVerified: v ? nowISO() : edit.lastVerified })} label="I verified this against current official Orkin material" />
          </div>
        )}
      </Sheet>
    </div>
  );
}
