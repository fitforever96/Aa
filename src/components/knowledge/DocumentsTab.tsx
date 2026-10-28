"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileUp, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Callout, Card, SectionTitle, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { IMPORT_ACCEPT, readImportFile } from "@/lib/import/files";
import { chunkText, search } from "@/lib/retrieval";
import { uid, nowISO } from "@/lib/ids";
import { relTime } from "@/lib/client";
import type { KnowledgeFact } from "@/lib/types";

function extractFacts(docId: string, text: string): KnowledgeFact[] {
  const lines = text.split(/\n|(?<=\.)\s+/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 30 && l.length < 400);
  const cats: [RegExp, string][] = [
    [/\$\s?\d/, "Pricing precedent"],
    [/rotation|apartments? per visit|units? per/i, "Multifamily rotation methodology"],
    [/tin cat|bait station|rodent device|snap trap/i, "Rodent-equipment configuration"],
    [/german cockroach|gel bait|cleanout/i, "German cockroach treatment"],
    [/bed bug|canine|heat/i, "Bed bug procedure"],
    [/exclud|not included|quoted separately/i, "Specialty treatment exclusions"],
    [/integrated pest management|ipm|a\.i\.m/i, "IPM language"],
    [/shall|responsib|requirement/i, "Customer-specific requirement"],
  ];
  const out: KnowledgeFact[] = [];
  for (const l of lines) {
    const c = cats.find(([re]) => re.test(l));
    if (c && out.length < 80) out.push({ id: uid("fact"), docId, category: c[1], statement: l, status: "extracted_unverified", sourceExcerpt: l });
  }
  return out;
}

export function DocumentsTab() {
  const toast = useToast();
  const docs = useLiveQuery(() => db().knowledge.orderBy("uploadedAt").reverse().toArray(), []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const hits = q.trim() && docs ? search(docs, q, 6) : [];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const r = await readImportFile(f);
        if (r.kind === "json") throw new Error("JSON files belong in Import or Backup restore.");
        const id = uid("doc");
        await db().knowledge.add({ id, name: f.name, mime: f.type || r.kind, size: f.size, uploadedAt: nowISO(), text: r.text.slice(0, 2_000_000), chunks: chunkText(r.text), facts: extractFacts(id, r.text), extractionMethod: r.kind === "pdf" ? "pdf_text" : r.kind === "docx" ? "docx" : "plain_text", notes: "" });
      }
      toast("Added to Knowledge Library");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const setFact = async (docId: string, factId: string, status: KnowledgeFact["status"]) => {
    const d = await db().knowledge.get(docId);
    if (!d) return;
    await db().knowledge.put({ ...d, facts: d.facts.map((f) => (f.id === factId ? { ...f, status } : f)) });
  };

  return (
    <div className="space-y-3">
      <Callout>Upload previous proposals to build reusable patterns. Documents stay on this device. Relevant passages are retrieved when writing new proposals; extracted facts keep their source and stay unverified until you promote them.</Callout>
      <div className="flex gap-2">
        <label className="btn-secondary cursor-pointer">
          {busy ? <Spinner /> : <FileUp size={16} />} Upload documents
          <input type="file" multiple accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        <input className="input pl-10" placeholder="Search your proposals (e.g. warehouse dock rodent placement)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {hits.length > 0 && (
        <Card pad={false} className="divide-hair overflow-hidden">
          {hits.map((h) => (
            <div key={h.chunk.id} className="px-4 py-3">
              <div className="text-[12px] font-semibold text-red">{h.docName} · score {h.score.toFixed(1)}</div>
              <div className="mt-0.5 line-clamp-4 text-[13px] text-ink2">{h.chunk.text}</div>
            </div>
          ))}
        </Card>
      )}
      <SectionTitle>Documents</SectionTitle>
      <Card pad={false} className="divide-hair overflow-hidden">
        {docs?.length === 0 && <div className="p-4 text-[13px] text-ink3">No documents yet.</div>}
        {docs?.map((d) => (
          <div key={d.id}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button className="min-w-0 text-left" onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)}>
                <div className="truncate text-[14px] font-semibold">{d.name}</div>
                <div className="text-[12px] text-ink3">{(d.size / 1024).toFixed(0)} KB · {d.chunks.length} passages · {d.facts.length} facts · {d.extractionMethod.replace("_", " ")} · {relTime(d.uploadedAt)}</div>
              </button>
              <button className="btn-ghost btn-sm" onClick={() => confirm("Remove this document from the library?") && db().knowledge.delete(d.id)} aria-label="Delete document"><Trash2 size={15} /></button>
            </div>
            {openDoc === d.id && (
              <div className="divide-hair bg-surface2/40">
                {d.facts.length === 0 && <div className="px-4 py-3 text-[13px] text-ink3">No structured facts detected.</div>}
                {d.facts.map((f) => (
                  <div key={f.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Badge>{f.category}</Badge>
                      <div className="mt-1 text-[13px] text-ink2">{f.statement}</div>
                    </div>
                    <Select
                      value={f.status}
                      onChange={(v) => {
                        if (v === "approved_default" && !confirm("Promote this practice to an approved default? Customer-specific promises should stay customer-specific.")) return;
                        setFact(d.id, f.id, v);
                      }}
                      options={[
                        { value: "extracted_unverified", label: "Unverified" },
                        { value: "customer_specific", label: "Customer-specific" },
                        { value: "approved_default", label: "Approved default" },
                        { value: "rejected", label: "Rejected" },
                      ]}
                      className="sm:w-48"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
