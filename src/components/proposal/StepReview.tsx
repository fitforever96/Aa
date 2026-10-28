"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileDown, History, RotateCcw, Save, Share, XCircle } from "lucide-react";
import { Badge, Callout, Card, SectionTitle, Spinner, TextArea } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { runQC, qcSummary, type PdfQAResult, type QCCheck, type QCGroup } from "@/lib/qc";
import { db, restoreVersion, snapshotVersion } from "@/lib/db";
import { STATUS_LABEL, withStatus } from "@/lib/actions";
import { downloadBlob, relTime, safeFileName, shareOrDownload } from "@/lib/client";
import type { ProposalStatus } from "@/lib/types";
import type { Fitted } from "@/lib/pdf/fit";
import { LengthPicker } from "@/components/LengthPicker";
import type { StepProps } from "./types";

const GROUP_LABEL: Record<QCGroup, string> = { financial: "Financial", operational: "Operational", legal: "Legal & technical", document: "Document", visual: "Rendered PDF inspection" };

function StatusIcon({ s }: { s: QCCheck["status"] }) {
  if (s === "pass") return <CheckCircle2 size={16} className="shrink-0 text-ok" />;
  if (s === "warn") return <AlertTriangle size={16} className="shrink-0 text-warn" />;
  if (s === "fail") return <XCircle size={16} className="shrink-0 text-red" />;
  return <CircleDashed size={16} className="shrink-0 text-ink3" />;
}

export function StepReview(props: StepProps) {
  const { proposal: p, replace, update, goStep } = props;
  const toast = useToast();
  const [pdf, setPdf] = useState<{ blob: Blob; previews: string[]; qa: PdfQAResult; at: string; fit?: Fitted } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const versions = useLiveQuery(() => db().versions.where("proposalId").equals(p.id).reverse().sortBy("versionNumber"), [p.id]);
  const checks = useMemo(() => runQC(p, pdf?.qa ?? null), [p, pdf]);
  const sum = qcSummary(checks);
  const stale = pdf && new Date(p.updatedAt).getTime() > new Date(pdf.at).getTime() + 1000;
  const fileBase = safeFileName(`${p.customer.name || p.property.name} ${p.title}`);

  const generate = async () => {
    setBusy("generate");
    try {
      const { generateCustomerPdf, inspectPdf, renderPreviews } = await import("@/lib/pdf/client");
      const assets = await db().assets.where("proposalId").equals(p.id).toArray();
      const blob = await generateCustomerPdf(p, assets);
      const [qa, previews] = await Promise.all([inspectPdf(blob), renderPreviews(blob, 820)]);
      setPdf({ blob, previews, qa, at: new Date().toISOString(), fit: blob.fit });
      const bad = qa.checks.filter((c) => c.status === "fail").length;
      toast(bad ? `PDF generated — ${bad} layout issue(s) found` : `PDF generated (${qa.pageCount} ${qa.pageCount === 1 ? "page" : "pages"}) and inspected`, bad ? "warn" : "ok");
    } catch (e) {
      toast(e instanceof Error ? `PDF generation failed: ${e.message}` : "PDF generation failed", "error");
    } finally {
      setBusy(null);
    }
  };

  // Changing the length re-renders an existing preview right away.
  const length = p.document.options.length ?? "full";
  const lastLength = useRef(length);
  useEffect(() => {
    if (lastLength.current === length) return;
    lastLength.current = length;
    if (pdf && !busy) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  const exportPdf = async (mode: "share" | "download") => {
    if (!pdf || stale) return toast("Regenerate the PDF first — the proposal changed.", "warn");
    if (sum.fail && !confirm(`${sum.fail} quality check(s) failed. Export anyway?`)) return;
    await snapshotVersion(p, "Exported customer PDF");
    const name = `${fileBase}.pdf`;
    if (mode === "download") downloadBlob(pdf.blob, name);
    else {
      const r = await shareOrDownload(pdf.blob, name, p.title);
      if (r === "downloaded") toast("Sharing isn’t available here — the PDF was downloaded instead.", "info");
    }
  };

  const internal = async () => {
    setBusy("internal");
    try {
      const { generateInternalPdf } = await import("@/lib/pdf/client");
      const blob = await generateInternalPdf(p, await db().historical.toArray());
      await shareOrDownload(blob, `${fileBase}_INTERNAL_estimate.pdf`, "Internal estimate");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (s: ProposalStatus) => {
    if (s === "approved" && sum.fail && !confirm(`${sum.fail} quality check(s) failed. Approve anyway?`)) return;
    const next = withStatus(p, s);
    replace(next);
    await snapshotVersion(next, `Status → ${STATUS_LABEL[s]}`);
    toast(s === "approved" ? "Approved — prices are snapshotted and tracked by QC" : `Status: ${STATUS_LABEL[s]}`);
  };

  const groups = (["financial", "operational", "legal", "document", "visual"] as QCGroup[]).map((g) => ({ g, items: checks.filter((c) => c.group === g) }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2">
        {[
          ["Failed", sum.fail, "text-red"],
          ["Warnings", sum.warn, "text-warn"],
          ["Passed", sum.pass, "text-ok"],
          ["Not run", sum.notRun, "text-ink3"],
        ].map(([l, v, c]) => (
          <div key={l as string} className="card p-3 text-center">
            <div className={clsx("num font-display text-[26px] font-bold leading-none", c as string)}>{v as number}</div>
            <div className="mt-1 text-[11px] font-medium text-ink3">{l}</div>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle action={<button className="text-[13px] font-medium text-red" onClick={() => setShowPassed(!showPassed)}>{showPassed ? "Hide passed" : "Show all"}</button>}>Quality control</SectionTitle>
        <div className="space-y-3">
          {groups.map(({ g, items }) => {
            const shown = items.filter((c) => showPassed || c.status !== "pass");
            if (!shown.length) return null;
            return (
              <Card key={g} pad={false} className="overflow-hidden">
                <div className="border-b hairline px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink3">{GROUP_LABEL[g]}</div>
                <div className="divide-hair">
                  {shown.map((c) => (
                    <div key={c.id} className="flex gap-2.5 px-4 py-2.5">
                      <StatusIcon s={c.status} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium">{c.label}</div>
                        <div className="text-[12.5px] leading-snug text-ink3">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {sum.fail + sum.warn === 0 && !showPassed && <Card className="text-[13px] text-ok">All executed checks passed.</Card>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <button className="text-red" onClick={() => goStep(0)}>Fix customer info</button>·<button className="text-red" onClick={() => goStep(5)}>Fix pricing</button>·<button className="text-red" onClick={() => goStep(6)}>Edit document</button>
        </div>
      </div>

      <div>
        <SectionTitle>Customer proposal PDF</SectionTitle>
        <Card className="space-y-3">
          <LengthPicker value={length} onChange={(v) => update((d) => void (d.document.options.length = v))} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!!busy || !p.document.sections.length} onClick={generate}>
              {busy === "generate" ? <Spinner /> : <FileDown size={18} />} {pdf ? "Regenerate PDF" : "Generate PDF"}
            </button>
            <button className="btn-secondary" disabled={!pdf || !!stale} onClick={() => exportPdf("share")}><Share size={16} /> Share / Save to Files</button>
            <button className="btn-ghost" disabled={!pdf || !!stale} onClick={() => exportPdf("download")}><Download size={16} /> Download</button>
          </div>
          {!p.document.sections.length && <Callout tone="warn">Generate the document on the Document step first.</Callout>}
          {stale && <Callout tone="warn">The proposal changed after this PDF was generated. Regenerate before exporting.</Callout>}
          {pdf && (
            <>
              {pdf.fit && !pdf.fit.fits && (
                <Callout tone="warn">
                  This proposal needs {pdf.fit.pages} pages even at its tightest, so it can’t fit in {pdf.fit.target}. Nothing was left out. Long property schedules or a large scope take the extra room; choose a longer option or turn off a section on the Document step.
                </Callout>
              )}
              <div className="text-[12.5px] text-ink3">{pdf.qa.pageCount} {pdf.qa.pageCount === 1 ? "page" : "pages"} · {(pdf.blob.size / 1024).toFixed(0)} KB · searchable text with embedded fonts · inspected {relTime(pdf.at)}</div>
              <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
                {pdf.previews.map((src, i) => (
                  <div key={i} className="w-[86%] shrink-0 snap-center sm:w-[60%] lg:w-[44%]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Page ${i + 1}`} className="w-full rounded-lg border hairline bg-white shadow-lg" />
                    <div className="mt-1 flex items-center justify-between text-[11.5px] text-ink3">
                      <span>Page {i + 1}</span>
                      {pdf.qa.pages[i]?.issues.length ? <span className="text-warn">{pdf.qa.pages[i].issues.join(", ")}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="border-t hairline pt-3">
            <button className="btn-ghost btn-sm" disabled={!!busy} onClick={internal}>{busy === "internal" ? <Spinner size={14} /> : <FileDown size={14} />} Internal estimate PDF</button>
            <p className="mt-1 text-[12px] text-ink3">Internal workbook with minutes, labor rate, yields, assumptions and historical comparisons. Clearly marked not for customer distribution.</p>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Approval status</SectionTitle>
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["draft", "in_review", "awaiting_approval", "approved", "sent", "active", "archived"] as ProposalStatus[]).map((s) => (
              <button key={s} className={clsx("chip", p.status === s && "chip-on")} onClick={() => setStatus(s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {p.approvedSnapshot && <div className="text-[12.5px] text-ink3">Approved {new Date(p.approvedSnapshot.approvedAt).toLocaleString()} · {Object.keys(p.approvedSnapshot.prices).length} prices frozen for QC comparison.</div>}
          <TextArea label="Internal notes (never in customer PDF)" rows={3} value={p.internalNotes} onChange={(v) => update((d) => void (d.internalNotes = v))} />
        </Card>
      </div>

      <div>
        <SectionTitle action={<button className="btn-secondary btn-sm" onClick={async () => { await snapshotVersion(p, "Manual save", prompt("Version label (optional)") ?? ""); toast("Version saved"); }}><Save size={14} /> Save version</button>}>Version history</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {!versions?.length && <div className="p-4 text-[13px] text-ink3">No versions yet. Versions are saved automatically on export, approval and before AI revisions.</div>}
          {versions?.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium"><History size={14} className="text-ink3" /> {v.label} <Badge>{STATUS_LABEL[v.snapshot.status]}</Badge></div>
                <div className="truncate text-[12px] text-ink3">{v.reason} · {relTime(v.createdAt)}</div>
              </div>
              <button
                className="btn-ghost btn-sm shrink-0"
                onClick={async () => {
                  if (!confirm(`Restore ${v.label}? The current state is saved as a new version first.`)) return;
                  const r = await restoreVersion(v.id);
                  replace(r);
                  setPdf(null);
                  toast(`Restored ${v.label}`);
                }}
              >
                <RotateCcw size={14} /> Restore
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
