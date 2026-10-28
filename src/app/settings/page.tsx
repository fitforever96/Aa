"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Download, Plus, Trash2, Upload } from "lucide-react";
import { db, exportBackup, importBackup } from "@/lib/db";
import { downloadBlob, useAIStatus, useSettings } from "@/lib/client";
import { Badge, Callout, Card, Page, PageHeader, SectionTitle, Segmented, Select, Spinner, TextField, Toggle, NumberField } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { formatMoney } from "@/lib/engine/money";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const s = useSettings();
  const ai = useAIStatus();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const version = useLiveQuery(async () => (s ? db().assumptionVersions.get(s.activeAssumptionsVersionId) : undefined), [s?.activeAssumptionsVersionId]);
  const counts = useLiveQuery(async () => ({ proposals: await db().proposals.count(), docs: await db().knowledge.count(), assets: await db().assets.count() }), []);
  if (!s) return null;
  const save = (fn: (x: Settings) => void) => {
    const n = structuredClone(s);
    fn(n);
    n.updatedAt = new Date().toISOString();
    db().settings.put(n);
  };

  const backup = async () => {
    setBusy("backup");
    try {
      const b = await exportBackup();
      downloadBlob(new Blob([JSON.stringify(b)], { type: "application/json" }), `orkin-proposal-studio-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast("Backup downloaded. Store it somewhere safe — it contains customer and pricing data.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return toast("Backup file too large.", "error");
    const mode = confirm("Merge backup into current data?\n\nOK = merge (keeps existing items, updates matching ones)\nCancel = choose replace") ? "merge" : confirm("Replace ALL data on this device with the backup? This cannot be undone.") ? "replace" : null;
    if (!mode) return;
    setBusy("restore");
    try {
      const r = await importBackup(JSON.parse(await f.text()), mode);
      toast(`Restored: ${r.counts.proposals ?? 0} proposals, ${r.counts.knowledge ?? 0} documents (${mode})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Restore failed", "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <PageHeader title="Settings" eyebrow="Preferences, pricing & data" back="/" />
      <Page>
        <SectionTitle>Profile & branding</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          <TextField label="Name" value={s.profile.name} onChange={(v) => save((x) => void (x.profile.name = v))} />
          <TextField label="Professional title" value={s.profile.title} onChange={(v) => save((x) => void (x.profile.title = v))} />
          <TextField label="Phone" type="tel" value={s.profile.phone} onChange={(v) => save((x) => void (x.profile.phone = v))} />
          <TextField label="Email (shown on proposals)" type="email" value={s.profile.email} onChange={(v) => save((x) => void (x.profile.email = v))} />
          <TextField label="Company line" value={s.profile.company} onChange={(v) => save((x) => void (x.profile.company = v))} />
          <TextField label="Branch" value={s.profile.branch} onChange={(v) => save((x) => void (x.profile.branch = v))} />
          <div className="sm:col-span-2">
            <span className="field-label">Co-authors available on proposals</span>
            {s.profile.coAuthors.map((c, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="input" value={c.name} placeholder="Name" onChange={(e) => save((x) => void (x.profile.coAuthors[i].name = e.target.value))} />
                <input className="input" value={c.title} placeholder="Title" onChange={(e) => save((x) => void (x.profile.coAuthors[i].title = e.target.value))} />
                <button className="btn-ghost btn-sm" onClick={() => save((x) => void x.profile.coAuthors.splice(i, 1))} aria-label="Remove co-author"><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => save((x) => void x.profile.coAuthors.push({ name: "", title: "", phone: "", email: "" }))}><Plus size={14} /> Co-author</button>
          </div>
          <p className="text-[12px] text-ink3 sm:col-span-2">The ORKIN text wordmark is used throughout. The circular Orkin logo is not included unless you provide and authorize it.</p>
        </Card>

        <SectionTitle>Appearance</SectionTitle>
        <Card>
          <Segmented value={s.theme} onChange={(v) => save((x) => void (x.theme = v))} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        </Card>

        <SectionTitle>Pricing & time standards</SectionTitle>
        <Link href="/knowledge?tab=assumptions" className="card flex items-center justify-between p-4">
          <div>
            <div className="text-[15px] font-semibold">Default labor rate {version ? `${formatMoney(version.assumptions.laborRateCentsPerHour)}/hr` : ""}</div>
            <div className="text-[12.5px] text-ink3">Tin Cat {version?.assumptions.tinCatServiceMinutes} min · Exterior station {version?.assumptions.baitStationServiceMinutes} min · inspection, walking, setup & documentation assumptions · minimum charge · effective-dated versions</div>
          </div>
          <ChevronRight className="shrink-0 text-ink3" />
        </Link>
        <Link href="/knowledge?tab=equipment" className="card mt-2 flex items-center justify-between p-4">
          <div>
            <div className="text-[15px] font-semibold">Equipment prices & service times</div>
            <div className="text-[12.5px] text-ink3">Catalog, approval status and price history</div>
          </div>
          <ChevronRight className="shrink-0 text-ink3" />
        </Link>

        <SectionTitle>Proposal defaults</SectionTitle>
        <Card className="grid gap-3 sm:grid-cols-2">
          <Select label="Default cover" value={s.defaults.coverStyle} onChange={(v) => save((x) => void (x.defaults.coverStyle = v))} options={[{ value: "executive_charcoal", label: "Executive Charcoal" }, { value: "corporate_white", label: "Corporate White" }, { value: "property_showcase", label: "Property Showcase" }]} />
          <Select label="Default billing method" value={s.defaults.billingMethod} onChange={(v) => save((x) => void (x.defaults.billingMethod = v))} options={[{ value: "per_visit", label: "Per completed visit" }, { value: "fixed_monthly", label: "Fixed monthly (requires approval per proposal)" }]} />
          <NumberField label="Default technicians" value={s.defaults.technicians} min={1} stepper onChange={(v) => save((x) => void (x.defaults.technicians = v ?? 1))} />
          <Select label="PDF orientation" value={s.defaults.pageOrientation} onChange={(v) => save((x) => void (x.defaults.pageOrientation = v))} options={[{ value: "landscape", label: "Landscape (letter)" }, { value: "portrait", label: "Portrait (letter)" }]} />
          <div className="sm:col-span-2">
            <Toggle checked={s.guarantee.includeByDefault} onChange={(v) => save((x) => void (x.guarantee.includeByDefault = v))} label="Include Triple Guarantee section by default" description="Only when applicable to the actual agreement. Terms are governed by the executed Orkin agreement and are never expanded." />
          </div>
          <div className="sm:col-span-2">
            <span className="field-label">Default exclusions</span>
            {s.defaultExclusions.map((e, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <textarea className="input min-h-[60px]" value={e} onChange={(ev) => save((x) => void (x.defaultExclusions[i] = ev.target.value))} />
                <button className="btn-ghost btn-sm" onClick={() => save((x) => void x.defaultExclusions.splice(i, 1))} aria-label="Remove exclusion"><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => save((x) => void x.defaultExclusions.push(""))}><Plus size={14} /> Exclusion</button>
          </div>
        </Card>

        <SectionTitle>Writing standards</SectionTitle>
        <Card className="space-y-2 text-[13.5px] leading-relaxed text-ink2">
          <p><b className="text-ink">Master memory applied.</b> Your Orkin proposal-development master memory governs AI writing, recommendations and command interpretation (server-side; it is not sent to the browser). Its rules are also built into the offline writer and quality control:</p>
          <ul className="list-inside list-disc space-y-0.5 text-[13px] text-ink3">
            <li>No hour-specific response promises (the rejected 24-hour on-site language is blocked everywhere)</li>
            <li>No eradication, compliance, refund or unlimited-service promises; no National Accounts claims for multistate work</li>
            <li>No automatic signature/authorization pages or annualized totals</li>
            <li>Site-specific frequency rationale and verified rotation arithmetic</li>
            <li>60-day rodent review milestones; consulting deliverables kept separate from treatment</li>
            <li>Nonlethal bird deterrence; no goose roundup/relocation; wildlife methods require legal review</li>
            <li>RFP requirements matrix for government and procurement proposals</li>
            <li>Plain, direct style: no buzzwords, excessive em dashes or exclamation marks</li>
          </ul>
          <p className="text-[12px] text-ink3">Project precedents (NRP structure, GM rebate, Dearborn, Wayne County, U-M, price protection) are in Knowledge › Historical pricing as customer-specific references.</p>
        </Card>

        <SectionTitle>AI & research</SectionTitle>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[14px]">Server AI provider</div>
            {ai === null ? <Spinner size={14} /> : ai.configured ? <Badge tone="ok">Configured · {ai.model}</Badge> : ai.reachable ? <Badge tone="warn">Not configured</Badge> : <Badge>Offline</Badge>}
          </div>
          {!ai?.configured && ai?.reachable && <Callout>Set <code>ANTHROPIC_API_KEY</code> on the server (see README). Everything except AI writing, research, OCR and AI interpretation works without it.</Callout>}
          <Toggle checked={s.ai.consent} onChange={(v) => save((x) => void (x.ai.consent = v))} label="Allow sending proposal content to the AI provider" description="Required before any AI or research request. Off by default." />
          <Toggle checked={s.ai.researchEnabled} onChange={(v) => save((x) => void (x.ai.researchEnabled = v))} label="Enable web research" description="Searches orkin.com/commercial first, then EPA, CDC, USDA, OSHA and university extension sites." />
          {ai?.passcodeRequired && <TextField label="Access passcode" type="password" value={s.ai.accessToken} onChange={(v) => save((x) => void (x.ai.accessToken = v))} hint="Matches APP_ACCESS_TOKEN on the server. Stored on this device only; excluded from backups." />}
          <Callout title="What stays on this device / what is sent">
            Proposals, prices, estimates, documents, photos and settings are stored locally in this browser (IndexedDB) and are not cloud-synced or encrypted by the app. When you use an AI feature, only that request is sent over HTTPS to this app’s server and on to Anthropic: writing requests include customer-facing proposal facts and section text (never internal rates, minutes or yields); research sends topics and a short property summary; import/OCR sends the document text or page images you chose. API keys never reach the browser, and the server does not log proposal content.
          </Callout>
        </Card>

        <SectionTitle>Backup & restore</SectionTitle>
        <Card className="space-y-3">
          <div className="text-[13px] text-ink3">{counts ? `${counts.proposals} proposals · ${counts.docs} knowledge documents · ${counts.assets} images on this device` : ""}</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!!busy} onClick={backup}>{busy === "backup" ? <Spinner /> : <Download size={16} />} Export JSON backup</button>
            <button className="btn-secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "restore" ? <Spinner /> : <Upload size={16} />} Restore from backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          </div>
          <p className="text-[12px] text-ink3">Backups are plain (unencrypted) JSON containing customer and pricing data. Save them to a secure location such as a protected iCloud Drive folder. The AI passcode is never included.</p>
        </Card>

        <SectionTitle>Install on iPhone</SectionTitle>
        <Card className="space-y-1.5 text-[13.5px] leading-relaxed text-ink2">
          <p>1. Open this app’s HTTPS address in Safari.</p>
          <p>2. Tap the Share button, then <b>Add to Home Screen</b>.</p>
          <p>3. Launch Proposal Studio from the Home Screen — it opens full-screen and works offline for saved drafts, estimates and PDF export.</p>
        </Card>
      </Page>
    </>
  );
}
