"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, FileUp, ScanText, Sparkles } from "lucide-react";
import { Badge, Callout, Card, Page, PageHeader, SectionTitle, Spinner, Toggle } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { aiFetch, shareOrDownload, safeFileName, useAIStatus, useSettings } from "@/lib/client";
import { IMPORT_ACCEPT, pdfPagesToPng, readImportFile, type ReadResult } from "@/lib/import/files";
import { extractFromText, fromAI, type Extraction, type ExtractedItem } from "@/lib/import/extract";
import { historicalFromExtraction, proposalFromExtraction } from "@/lib/import/apply";
import { activeAssumptionVersion, db, saveProposal, snapshotVersion } from "@/lib/db";
import { chunkText } from "@/lib/retrieval";
import { uid, nowISO } from "@/lib/ids";
import { formatMoney } from "@/lib/engine/money";
import type { CoverStyle, ImportMode, Proposal } from "@/lib/types";

const MODES: { value: ImportMode; label: string; desc: string }[] = [
  { value: "redesign", label: "Redesign this proposal", desc: "New premium layout. Every approved price and commitment is preserved and locked." },
  { value: "improve", label: "Improve this proposal", desc: "Same scope and prices; stronger writing and structure." },
  { value: "template", label: "Use this as a template", desc: "Structure and services only — no customer, prices or quantities." },
  { value: "historical", label: "Import pricing as historical reference", desc: "Adds confirmed charges to the Historical library as unverified, customer-specific prices." },
  { value: "cover_only", label: "Keep everything exactly the same except the cover", desc: "Original pages untouched; a new premium cover replaces page 1." },
  { value: "comprehensive", label: "Convert into a comprehensive proposal", desc: "Expanded sections (methodology, IPM, documentation, milestones) with preserved pricing." },
];

function ItemRow<T>({ it, render, onToggle }: { it: ExtractedItem<T>; render: (v: T) => React.ReactNode; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-2.5 text-left">
      <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", it.confirmed ? "border-ok bg-ok text-black" : "hairline-strong")}>{it.confirmed && <Check size={13} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{render(it.value)}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink3">“{it.evidence}”</span>
      </span>
      <Badge tone={it.confidence === "high" ? "ok" : it.confidence === "medium" ? "info" : "warn"}>{it.confidence}</Badge>
    </button>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const ai = useAIStatus();
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [x, setX] = useState<Extraction | null>(null);
  const [mode, setMode] = useState<ImportMode>("redesign");
  const [busy, setBusy] = useState<string | null>(null);
  const [addToKnowledge, setAddToKnowledge] = useState(true);
  const [cover, setCover] = useState<CoverStyle>("executive_charcoal");

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setX(null);
    setBusy("read");
    try {
      const r = await readImportFile(f);
      if (r.kind === "json") {
        const j = JSON.parse(r.text);
        if (j?.format !== "orkin-proposal-studio-proposal" || !j.proposal?.id) throw new Error("This JSON isn’t a Proposal Studio proposal export. Use Settings › Restore for full backups.");
        const p: Proposal = { ...j.proposal, id: uid("pro"), updatedAt: nowISO() };
        await saveProposal(p);
        toast("Proposal imported from JSON");
        router.push(`/proposal?id=${p.id}`);
        return;
      }
      setRead(r);
      setX(extractFromText(r.text, r.kind === "pdf" ? "pdf_text" : r.kind === "docx" ? "docx" : "plain_text"));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read file", "error");
    } finally {
      setBusy(null);
    }
  };

  const runAI = async (ocr: boolean) => {
    if (!read || !file) return;
    setBusy(ocr ? "ocr" : "ai");
    try {
      const body = ocr ? { fileName: file.name, images: await pdfPagesToPng(read.bytes, 6) } : { fileName: file.name, text: read.text.slice(0, 280000) };
      const r = await aiFetch<{ extraction: unknown; method: "ai_text" | "ai_ocr" }>("/api/ai/extract", body, settings);
      setX(fromAI(r.extraction, r.method));
      toast(ocr ? "OCR extraction complete — verify every value" : "AI extraction complete — review before saving", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI extraction failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (path: keyof Extraction, id?: string) =>
    setX((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      const v = next[path] as unknown;
      if (Array.isArray(v)) {
        const it = v.find((i: ExtractedItem<unknown>) => i.id === id);
        if (it) it.confirmed = !it.confirmed;
      } else if (v && typeof v === "object" && "confirmed" in (v as object)) (v as ExtractedItem).confirmed = !(v as ExtractedItem).confirmed;
      return next;
    });
  const confirmAll = (on: boolean) =>
    setX((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      for (const k of Object.keys(next) as (keyof Extraction)[]) {
        const v = next[k] as unknown;
        if (Array.isArray(v)) v.forEach((i) => i && typeof i === "object" && "confirmed" in i && (i.confirmed = on));
        else if (v && typeof v === "object" && "confirmed" in (v as object)) (v as ExtractedItem).confirmed = on;
      }
      return next;
    });

  const execute = async () => {
    if (!x || !file || !read || !settings) return;
    setBusy("exec");
    try {
      let docId: string | null = null;
      if (addToKnowledge && read.text.trim()) {
        docId = uid("doc");
        await db().knowledge.add({ id: docId, name: file.name, mime: file.type || read.kind, size: file.size, uploadedAt: nowISO(), text: read.text.slice(0, 2_000_000), chunks: chunkText(read.text), facts: [], extractionMethod: x.method === "ai_ocr" ? "ai_ocr" : read.kind === "pdf" ? "pdf_text" : read.kind === "docx" ? "docx" : "plain_text", notes: "Imported proposal" });
      }
      if (mode === "historical") {
        const rows = historicalFromExtraction(x, file.name, x.customer?.confirmed ? x.customer.value : "");
        if (!rows.length) throw new Error("Confirm at least one charge to import as a historical reference.");
        await db().historical.bulkAdd(rows);
        toast(`${rows.length} historical price(s) added as unverified, customer-specific references`);
        router.push("/knowledge?tab=historical");
        return;
      }
      const [version, catalog, capabilities] = await Promise.all([activeAssumptionVersion(), db().equipment.toArray(), db().capabilities.toArray()]);
      const p = proposalFromExtraction(x, mode, { settings, version, catalog, capabilities, fileName: file.name, docId, fullText: read.text });
      if (mode === "cover_only") {
        if (read.kind !== "pdf") throw new Error("Cover replacement needs the original PDF.");
        p.document.coverStyle = cover;
        const { replaceCover } = await import("@/lib/pdf/client");
        const blob = await replaceCover(read.bytes, p, [], "replace");
        await saveProposal(p);
        await snapshotVersion(p, "Created from cover-only import");
        await shareOrDownload(blob, `${safeFileName(file.name.replace(/\.pdf$/i, ""))}_new_cover.pdf`, p.title);
        toast("New cover applied — all other pages are unchanged from the original");
        return;
      }
      await saveProposal(p);
      await snapshotVersion(p, `Imported (${mode}) from ${file.name}`);
      router.push(`/proposal?id=${p.id}&step=${mode === "improve" || mode === "comprehensive" ? 6 : 0}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const sparse = read?.kind === "pdf" && read.text.replace(/\s/g, "").length / Math.max(1, read.pages ?? 1) < 120;

  return (
    <>
      <PageHeader title="Import proposal" eyebrow="PDF · Word · text" back="/library" />
      <Page>
        <Card hud className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed hairline-strong px-4 py-8 text-center transition hover:bg-surface2/50">
            {busy === "read" ? <Spinner size={26} /> : <FileUp size={28} className="text-red" />}
            <span className="text-[15px] font-semibold">{file ? file.name : "Choose a completed proposal"}</span>
            <span className="text-[12.5px] text-ink3">PDF, DOCX, TXT or Proposal Studio JSON · up to 25 MB · processed on this device</span>
            <input type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {read && (
            <div className="text-[12.5px] text-ink3">
              Extracted {read.text.length.toLocaleString()} characters{read.pages ? ` from ${read.pages} pages` : ""} using {x?.method.replace("_", " ")}.
            </div>
          )}
          {sparse && <Callout tone="warn" title="Looks like a scanned document">Little selectable text was found. {ai?.configured ? "Use AI OCR below; every OCR value is marked for verification." : "Reading scanned pages needs Claude: connect it in Settings › AI & Research."}</Callout>}
          {read && ai?.configured && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => runAI(false)}>{busy === "ai" ? <Spinner size={14} /> : <Sparkles size={14} />} AI extraction</button>
              {read.kind === "pdf" && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => runAI(true)}>{busy === "ocr" ? <Spinner size={14} /> : <ScanText size={14} />} AI OCR (scanned)</button>}
            </div>
          )}
        </Card>

        {x && (
          <>
            {x.warnings.map((w, i) => (
              <Callout key={i} tone="warn" className="mt-3">{w}</Callout>
            ))}
            <SectionTitle action={<div className="flex gap-2 text-[13px]"><button className="text-red" onClick={() => confirmAll(true)}>Confirm all</button><button className="text-ink3" onClick={() => confirmAll(false)}>Clear</button></div>}>Review extracted information</SectionTitle>
            <Callout className="mb-3">Tick only what you’ve verified against the document. Unconfirmed items are never saved as facts.</Callout>
            <div className="space-y-3">
              {[
                ["Customer & site", [x.customer, x.propertyName, x.address, x.contact, x.duration].filter(Boolean) as ExtractedItem[], (k: string) => toggle(k as keyof Extraction), ["customer", "propertyName", "address", "contact", "duration"]],
              ].map(([title, items, , keys]) =>
                (items as ExtractedItem[]).length ? (
                  <Card key={title as string} pad={false} className="divide-hair overflow-hidden">
                    <div className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-ink3">{title as string}</div>
                    {(keys as (keyof Extraction)[]).map((k) => {
                      const it = x[k] as ExtractedItem | null;
                      return it ? <ItemRow key={k} it={it} render={(v) => <><span className="text-ink3">{String(k).replace(/([A-Z])/g, " $1").toLowerCase()}: </span>{v}</>} onToggle={() => toggle(k)} /> : null;
                    })}
                  </Card>
                ) : null,
              )}
              {(
                [
                  ["Charges & prices", "charges", (v: { label: string; kind: string; cents: number | null; basis: string }) => <><Badge tone={v.kind === "other" ? "neutral" : "info"}>{v.kind}</Badge> {formatMoney(v.cents)} <span className="text-ink3">{v.basis}</span> — {v.label}</>],
                  ["Equipment", "equipment", (v: { name: string; quantity: number | null; unitCents: number | null }) => <>{v.quantity ?? "?"} × {v.name}{v.unitCents != null ? ` @ ${formatMoney(v.unitCents)}` : ""}</>],
                  ["Frequencies", "frequencies", (v: string) => v],
                  ["Service scope", "scope", (v: string) => v],
                  ["Exclusions", "exclusions", (v: string) => v],
                  ["Guarantees", "guarantees", (v: string) => v],
                  ["Customer responsibilities", "responsibilities", (v: string) => v],
                ] as [string, keyof Extraction, (v: never) => React.ReactNode][]
              ).map(([title, key, render]) => {
                const list = x[key] as ExtractedItem<never>[];
                if (!list.length) return null;
                return (
                  <Card key={key} pad={false} className="divide-hair overflow-hidden">
                    <div className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-ink3">{title} · {list.filter((i) => i.confirmed).length}/{list.length} confirmed</div>
                    {list.map((it) => (
                      <ItemRow key={it.id} it={it} render={render} onToggle={() => toggle(key, it.id)} />
                    ))}
                  </Card>
                );
              })}
            </div>

            <SectionTitle>What should happen?</SectionTitle>
            <div className="space-y-2">
              {MODES.map((m) => (
                <button key={m.value} onClick={() => setMode(m.value)} className={clsx("card flex w-full items-start gap-3 p-4 text-left transition", mode === m.value && "!border-red ring-2 ring-red/25")}>
                  <span className={clsx("mt-0.5 h-5 w-5 shrink-0 rounded-full border-2", mode === m.value ? "border-red bg-red shadow-[inset_0_0_0_3px_rgb(var(--surface))]" : "hairline-strong")} />
                  <span>
                    <span className="block text-[15px] font-semibold">{m.label}</span>
                    <span className="block text-[12.5px] text-ink3">{m.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode === "cover_only" && (
              <Card className="mt-3">
                <span className="field-label">New cover style</span>
                <div className="flex flex-wrap gap-2">
                  {(["executive_charcoal", "corporate_white", "property_showcase"] as CoverStyle[]).map((c) => (
                    <button key={c} className={clsx("chip", cover === c && "chip-on")} onClick={() => setCover(c)}>{c.replace(/_/g, " ")}</button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-ink3">Cover text uses only the customer, property and title you confirmed above.</p>
              </Card>
            )}
            <Card className="mt-3">
              <Toggle checked={addToKnowledge} onChange={setAddToKnowledge} label="Add document to Knowledge Library" description="Stored on this device for retrieval when writing future proposals. Facts keep their source and unverified status." />
            </Card>
            <button className="btn-primary mt-4 w-full" disabled={!!busy} onClick={execute}>
              {busy === "exec" ? <Spinner /> : null} {MODES.find((m) => m.value === mode)!.label}
            </button>
          </>
        )}
      </Page>
    </>
  );
}
