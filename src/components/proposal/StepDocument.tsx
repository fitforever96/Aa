"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, Check, ChevronDown, ExternalLink, FileText, ImagePlus, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { Badge, Callout, Card, SectionTitle, Segmented, Sheet, Spinner, TextArea, TextField, Toggle } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { aiFetch, useAIStatus, useSettings } from "@/lib/client";
import { aiRewrite, templateRegenerate } from "@/lib/aiActions";
import { generateDocument, generateSection, SECTION_TITLES } from "@/lib/writer/generate";
import { suggestedResearchTopics, writerContext } from "@/lib/writer/aiPayload";
import { materialContentLost } from "@/lib/commands/ops";
import { db } from "@/lib/db";
import { uid, nowISO } from "@/lib/ids";
import { imageFileToDataUrl } from "@/lib/images";
import type { CoverStyle, ResearchFinding, SectionType } from "@/lib/types";
import type { StepProps } from "./types";

const COVERS: { value: CoverStyle; label: string; desc: string }[] = [
  { value: "executive_charcoal", label: "Executive Charcoal", desc: "Graphite, red accents, dramatic type" },
  { value: "corporate_white", label: "Corporate White", desc: "White, black type, disciplined red" },
  { value: "property_showcase", label: "Property Showcase", desc: "Authentic property photo" },
];

function CoverThumb({ style, image }: { style: CoverStyle; image?: string | null }) {
  if (style === "corporate_white")
    return (
      <div className="relative aspect-[11/8.5] overflow-hidden rounded-lg bg-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#E4002B]" />
        <div className="absolute bottom-0 left-0 top-1 w-1 bg-[#232326]" />
        <div className="absolute left-3 top-3 font-display text-[9px] font-extrabold text-[#E4002B]">ORKIN</div>
        <div className="absolute left-3 top-[38%] space-y-0.5">
          <div className="h-1.5 w-16 bg-[#232325]" />
          <div className="h-1.5 w-12 bg-[#232325]" />
          <div className="mt-1 h-1 w-8 bg-[#E4002B]" />
        </div>
      </div>
    );
  if (style === "property_showcase")
    return (
      <div className="relative aspect-[11/8.5] overflow-hidden rounded-lg bg-white">
        <div className="absolute inset-x-0 top-0 h-[64%] bg-gradient-to-b from-[#3a3a40] to-[#111]" style={image ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.8)), url(${image})`, backgroundSize: "cover", backgroundPosition: "center" } : {}} />
        <div className="absolute inset-x-0 top-[64%] h-0.5 bg-[#E4002B]" />
        <div className="absolute left-2 top-[42%] h-1.5 w-16 bg-white" />
        <div className="absolute left-2 top-[72%] h-1 w-10 bg-[#E4002B]" />
      </div>
    );
  return (
    <div className="relative aspect-[11/8.5] overflow-hidden rounded-lg bg-[#1E1E21]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#E4002B]" />
      <div className="absolute inset-y-0 right-0 w-[48%] bg-[#26262A] [clip-path:polygon(25%_0,100%_0,100%_100%,0_100%)]" style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover" } : {}} />
      <div className="absolute left-2 top-3 font-display text-[9px] font-extrabold text-[#E4002B]">ORKIN</div>
      <div className="absolute left-2 top-[40%] space-y-0.5">
        <div className="h-1.5 w-14 bg-white" />
        <div className="h-1.5 w-10 bg-white" />
      </div>
      <div className="absolute bottom-0 right-2 h-3 w-16 bg-[#E4002B]" />
    </div>
  );
}

export function StepDocument(props: StepProps) {
  const { proposal: p, update, replace } = props;
  const settings = useSettings();
  const capabilities = useLiveQuery(() => db().capabilities.toArray(), []);
  const assets = useLiveQuery(() => db().assets.where("proposalId").equals(p.id).toArray(), [p.id]);
  const ai = useAIStatus();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [allowContractual, setAllowContractual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [topics, setTopics] = useState<string>("");
  const ctx = settings && capabilities ? { settings, capabilities, includeGuarantee: p.document.sections.some((s) => s.type === "triple_guarantee" && s.enabled) || (!p.document.sections.length && settings.guarantee.includeByDefault), includeReporting: p.document.sections.some((s) => s.type === "reporting_capability" && s.enabled) } : null;
  const sections = p.document.sections;
  const coverImage = assets?.find((a) => a.id === p.document.coverImageAssetId)?.dataUrl;

  const generateAll = () => {
    if (!ctx) return;
    if (sections.length && !confirm("Regenerate every section from the template writer? Your edits to section text will be replaced. Pricing and scope are not affected.")) return;
    update((d) => void (d.document.sections = generateDocument(d, ctx)));
    toast("Proposal document generated");
  };

  const rewrite = async (target: "all" | string[]) => {
    if (!ctx) return;
    setBusy("rewrite");
    try {
      const useAI = ai?.configured && settings?.ai.consent;
      const r = useAI ? await aiRewrite(p, settings, { instruction: instruction || "Make this proposal more specific, persuasive and technically precise for this customer.", target, allowContractual }) : templateRegenerate(p, ctx, target);
      replace(r.proposal);
      toast(`${r.mode === "ai" ? "AI rewrote" : "Regenerated"} ${r.changed.length} section(s). Pricing unchanged.${r.skipped.length ? ` ${r.skipped.length} protected section(s) skipped.` : ""}`, r.skipped.length ? "warn" : "ok");
      setSelected([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rewrite failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const addSection = (type: SectionType) => {
    if (!ctx) return;
    update((d) => void d.document.sections.push(generateSection(type, d, ctx)));
    setAddOpen(false);
  };

  const uploadAsset = async (files: FileList | null, kind: "photo" | "floor_plan" | "cover") => {
    if (!files?.length) return;
    try {
      for (const f of Array.from(files).slice(0, 12)) {
        const dataUrl = await imageFileToDataUrl(f);
        const id = uid("ast");
        await db().assets.add({ id, proposalId: p.id, kind, name: f.name.slice(0, 120), mime: "image/jpeg", dataUrl, caption: "", createdAt: nowISO() });
        if (kind === "cover") update((d) => void (d.document.coverImageAssetId = id));
      }
      if (kind !== "cover") {
        const type: SectionType = kind === "photo" ? "photos" : "floor_plans";
        if (!p.document.sections.some((s) => s.type === type) && ctx) update((d) => void d.document.sections.splice(Math.max(0, d.document.sections.findIndex((s) => s.type === "investment")), 0, generateSection(type, d, ctx)));
      }
      toast("Image added");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    }
  };

  const runResearch = async () => {
    const list = (topics || suggestedResearchTopics(p).join("\n")).split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 6);
    setBusy("research");
    try {
      const r = await aiFetch<{ findings: { topic: string; summary: string; relevance: string; sources: { url: string; title: string; retrievedAt: string }[]; unverifiedUrls: string[] }[]; searches: number; parsed: boolean }>("/api/ai/research", { topics: list, context: JSON.stringify(writerContext(p)).slice(0, 3800) }, settings);
      if (!r.findings.length) toast(r.parsed ? "Research returned no findings." : "Research completed but results could not be structured. Try again.", "warn");
      update((d) =>
        void d.research.push(
          ...r.findings.map<ResearchFinding>((f) => ({ id: uid("res"), topic: f.topic, summary: f.summary, relevance: f.relevance + (f.unverifiedUrls.length ? ` (${f.unverifiedUrls.length} cited URL(s) were not returned by search and were removed.)` : ""), sources: f.sources, status: "pending", createdAt: nowISO() })),
        ),
      );
      toast(`Research complete: ${r.findings.length} finding(s) from ${r.searches} search(es)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Research failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const move = (i: number, d: -1 | 1) => update((x) => {
    const s = x.document.sections;
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
  });

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Cover design</SectionTitle>
        <div className="grid grid-cols-3 gap-2.5">
          {COVERS.map((c) => (
            <button key={c.value} onClick={() => update((d) => void (d.document.coverStyle = c.value))} className={clsx("card p-2 text-left transition", p.document.coverStyle === c.value && "!border-red ring-2 ring-red/30")}>
              <CoverThumb style={c.value} image={coverImage} />
              <div className="mt-2 px-0.5 text-[12.5px] font-semibold leading-tight">{c.label}</div>
              <div className="px-0.5 text-[11px] leading-tight text-ink3">{c.desc}</div>
            </button>
          ))}
        </div>
        <Card className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField label="Cover badge" value={p.document.coverBadge} onChange={(v) => update((d) => void (d.document.coverBadge = v))} placeholder={p.customer.name ? `Prepared for ${p.customer.name}` : "Exclusive proposal"} />
          <TextField label="Cover tagline" value={p.document.coverTagline} onChange={(v) => update((d) => void (d.document.coverTagline = v))} placeholder="A stronger standard of pest management…" />
          <div>
            <span className="field-label">Property photo (authentic images only)</span>
            <div className="flex items-center gap-2">
              <label className="btn-secondary btn-sm cursor-pointer">
                <ImagePlus size={14} /> {coverImage ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAsset(e.target.files, "cover")} />
              </label>
              {coverImage && (
                <button className="btn-ghost btn-sm" onClick={() => update((d) => void (d.document.coverImageAssetId = null))}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <span className="field-label">Page orientation</span>
            <Segmented value={p.document.options.pageOrientation} onChange={(v) => update((d) => void (d.document.options.pageOrientation = v))} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} />
          </div>
          <TextField label="Proposal date" type="date" value={p.document.date} onChange={(v) => update((d) => void (d.document.date = v))} />
          <Toggle checked={p.document.options.showCoverStats} onChange={(v) => update((d) => void (d.document.options.showCoverStats = v))} label="Show key figures" description="Square feet, buildings, devices or homes." />
          <div className="sm:col-span-2">
            <span className="field-label">Prepared by</span>
            <div className="flex flex-wrap gap-2">
              {[{ name: settings?.profile.name ?? "", title: settings?.profile.title ?? "", phone: settings?.profile.phone ?? "", email: settings?.profile.email ?? "" }, ...(settings?.profile.coAuthors ?? [])].filter((a) => a.name).map((a) => {
                const on = p.document.preparedBy.some((x) => x.name === a.name);
                return (
                  <button key={a.name} className={clsx("chip", on && "chip-on")} onClick={() => update((d) => void (d.document.preparedBy = on ? d.document.preparedBy.filter((x) => x.name !== a.name) : [...d.document.preparedBy, a]))}>
                    {on && <Check size={13} />} {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle action={<div className="flex gap-1.5"><button className="btn-ghost btn-sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Section</button><button className="btn-secondary btn-sm" onClick={generateAll}><RefreshCw size={14} /> {sections.length ? "Regenerate" : "Generate"}</button></div>}>Proposal sections</SectionTitle>
        {sections.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <FileText size={28} className="text-ink3" />
            <div className="text-[15px] font-semibold">Generate the written proposal</div>
            <div className="max-w-sm text-[13px] text-ink3">Sections are chosen for this proposal type and written from the confirmed scope. Pricing renders from the engine — it’s never typed into prose.</div>
            <button className="btn-primary" onClick={generateAll} disabled={!ctx}>Generate document</button>
          </Card>
        ) : (
          <Card pad={false} className="divide-hair overflow-hidden">
            {sections.map((s, i) => {
              const isOpen = open === s.id;
              const sel = selected.includes(s.id);
              return (
                <div key={s.id} className={clsx(!s.enabled && "opacity-55")}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button onClick={() => setSelected(sel ? selected.filter((x) => x !== s.id) : [...selected, s.id])} className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", sel ? "border-red bg-red text-white" : "hairline-strong")} aria-label="Select section">
                      {sel && <Check size={13} />}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : s.id)}>
                      <div className="truncate text-[14px] font-medium">{s.headline || SECTION_TITLES[s.type]}</div>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink3">
                        {SECTION_TITLES[s.type]} {s.contractual && <Badge tone="warn">Contractual</Badge>} {s.source === "ai" && <Badge tone="info">AI</Badge>} {s.source === "manual" && <Badge>Edited</Badge>}
                      </div>
                    </button>
                    <button className="btn-ghost btn-sm !px-1.5" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                    <button className="btn-ghost btn-sm !px-1.5" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
                    <button
                      className={clsx("relative h-[26px] w-[44px] shrink-0 rounded-full transition", s.enabled ? "bg-red" : "bg-surface3")}
                      role="switch"
                      aria-checked={s.enabled}
                      aria-label="Include section"
                      onClick={() => {
                        if (s.enabled) {
                          const loss = materialContentLost(s);
                          if (loss && !confirm(`${loss} Remove it from the customer proposal?`)) return;
                        }
                        update((d) => void (d.document.sections[i].enabled = !s.enabled));
                      }}
                    >
                      <span className={clsx("absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all", s.enabled ? "left-[21px]" : "left-[3px]")} />
                    </button>
                    <ChevronDown size={16} className={clsx("shrink-0 text-ink3 transition", isOpen && "rotate-180")} />
                  </div>
                  {isOpen && (
                    <div className="animate-rise space-y-3 bg-surface2/40 px-3 pb-4 pt-1">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => update((d) => void ((d.document.sections[i].eyebrow = v), (d.document.sections[i].source = "manual")))} />
                        <TextField label="Headline" value={s.headline} onChange={(v) => update((d) => void ((d.document.sections[i].headline = v), (d.document.sections[i].source = "manual")))} />
                        <TextField label="Accent line" value={s.headlineAccent} onChange={(v) => update((d) => void ((d.document.sections[i].headlineAccent = v), (d.document.sections[i].source = "manual")))} />
                      </div>
                      <TextArea label="Body — blank line between paragraphs; “- ” for bullets" rows={6} value={s.body} onChange={(v) => update((d) => void ((d.document.sections[i].body = v), (d.document.sections[i].source = "manual")))} />
                      <div>
                        <span className="field-label">Cards</span>
                        <div className="space-y-2">
                          {s.items.map((it, k) => (
                            <div key={k} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border hairline bg-surface p-2.5 sm:grid-cols-[200px_1fr_auto]">
                              <input className="input !py-2" value={it.title} placeholder="Title" onChange={(e) => update((d) => void (d.document.sections[i].items[k].title = e.target.value))} />
                              <button className="btn-ghost btn-sm sm:order-last" onClick={() => update((d) => void d.document.sections[i].items.splice(k, 1))} aria-label="Remove card"><X size={14} /></button>
                              <input className="input col-span-2 !py-2 sm:col-span-1" value={it.body} placeholder="Body" onChange={(e) => update((d) => void (d.document.sections[i].items[k].body = e.target.value))} />
                            </div>
                          ))}
                          <button className="btn-ghost btn-sm" onClick={() => update((d) => void d.document.sections[i].items.push({ title: "", body: "" }))}><Plus size={14} /> Card</button>
                        </div>
                      </div>
                      <TextArea label="Callout" rows={2} value={s.callout} onChange={(v) => update((d) => void (d.document.sections[i].callout = v))} />
                      {["investment", "specialty_services", "portfolio_schedules", "equipment_allocation"].includes(s.type) && <Callout>Tables in this section render automatically from approved pricing and scope data — edit numbers on the Equipment and Pricing steps.</Callout>}
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-secondary btn-sm" onClick={() => ctx && replace(templateRegenerate(p, ctx, [s.id]).proposal)}><RefreshCw size={14} /> Regenerate (template)</button>
                        {ai?.configured && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => rewrite([s.id])}>{busy ? <Spinner size={14} /> : <Sparkles size={14} />} AI rewrite</button>}
                        <button
                          className="btn-ghost btn-sm text-red"
                          onClick={() => {
                            const loss = materialContentLost(s);
                            if (!confirm(loss ? `${loss} Delete this section?` : "Delete this section?")) return;
                            update((d) => void d.document.sections.splice(i, 1));
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {sections.length > 0 && (
        <div>
          <SectionTitle>{ai?.configured ? "AI writing" : "Regenerate writing"}</SectionTitle>
          <Card className="space-y-3">
            {ai?.configured ? (
              <>
                <TextArea rows={2} value={instruction} onChange={setInstruction} placeholder="e.g. Give me a stronger executive overview. Make the methodology more technical for a plant manager." />
                <Toggle checked={allowContractual} onChange={setAllowContractual} label="Allow rewording contractual sections" description="Exclusions, responsibilities, guarantees and pricing pages are skipped unless enabled. Commitments must be preserved; review afterwards." />
                {!settings?.ai.consent && <Callout tone="warn">AI is configured but you haven’t authorized sending proposal content. Enable it in Settings › AI & Research.</Callout>}
              </>
            ) : (
              <Callout>AI writing is off. <Link href="/settings#ai" className="font-semibold text-red">Connect Claude in Settings</Link> to turn it on. Until then, the offline writer regenerates sections from your structured scope.</Callout>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!!busy} onClick={() => rewrite(selected.length ? selected : "all")}>
                {busy === "rewrite" ? <Spinner /> : <Sparkles size={16} />} {selected.length ? `Rewrite ${selected.length} selected` : "Rewrite all sections"}
              </button>
            </div>
            <p className="text-[12px] text-ink3">Writing changes never alter prices, equipment counts or frequencies — those are enforced in code and re-verified after every revision. A version is saved before each AI revision.</p>
          </Card>
        </div>
      )}

      <div>
        <SectionTitle>Photos & floor plans</SectionTitle>
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary btn-sm cursor-pointer"><ImagePlus size={14} /> Site photos<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadAsset(e.target.files, "photo")} /></label>
            <label className="btn-secondary btn-sm cursor-pointer"><ImagePlus size={14} /> Floor plans<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadAsset(e.target.files, "floor_plan")} /></label>
          </div>
          {assets && assets.filter((a) => a.kind !== "cover").length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {assets.filter((a) => a.kind !== "cover").map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border hairline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.dataUrl} alt={a.caption || a.name} className="aspect-[4/3] w-full object-cover" />
                  <div className="space-y-1.5 p-2">
                    <input className="input !py-1.5 !text-[13px]" placeholder="Caption" defaultValue={a.caption} onBlur={(e) => db().assets.update(a.id, { caption: e.target.value })} />
                    <div className="flex items-center justify-between">
                      <Badge>{a.kind === "photo" ? "Photo" : "Floor plan"}</Badge>
                      <button className="btn-ghost btn-sm !px-1.5" onClick={() => db().assets.delete(a.id)} aria-label="Remove image"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] text-ink3">Images stay on this device and are embedded only in your PDF. Use authentic property images — no stock or decorative imagery.</p>
        </Card>
      </div>

      <div>
        <SectionTitle>Research</SectionTitle>
        <Card className="space-y-3">
          {!ai?.research ? (
            <Callout>Live research needs Claude. <Link href="/settings#ai" className="font-semibold text-red">Connect Claude in Settings</Link>. No research has been performed, and the app will not claim otherwise.</Callout>
          ) : (
            <>
              <TextArea rows={3} value={topics} onChange={setTopics} placeholder={suggestedResearchTopics(p).join("\n")} hint="One topic per line. Orkin Commercial is consulted first, then EPA, CDC, USDA, OSHA and university extension sources." />
              <button className="btn-secondary" disabled={!!busy} onClick={runResearch}>{busy === "research" ? <Spinner /> : <Search size={16} />} Research these topics</button>
            </>
          )}
          {p.research.length > 0 && (
            <div className="space-y-2.5">
              {p.research.map((r, k) => (
                <div key={r.id} className={clsx("rounded-xl border p-3", r.status === "accepted" ? "border-ok/40" : r.status === "rejected" ? "hairline opacity-50" : "hairline")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[14px] font-semibold">{r.topic}</div>
                    <Badge tone={r.status === "accepted" ? "ok" : r.status === "rejected" ? "neutral" : "warn"}>{r.status}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink2">{r.summary}</p>
                  <p className="mt-1 text-[12px] text-ink3">Relevance: {r.relevance}</p>
                  <div className="mt-2 space-y-1">
                    {r.sources.length === 0 && <div className="text-[12px] text-warn">No verifiable source returned.</div>}
                    {r.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] text-info">
                        <ExternalLink size={12} className="shrink-0" /> <span className="truncate">{s.title}</span> <span className="shrink-0 text-ink3">· {new Date(s.retrievedAt).toLocaleDateString()}</span>
                      </a>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-secondary btn-sm" onClick={() => update((d) => void (d.research[k].status = "accepted"))}><Check size={14} /> Accept</button>
                    <button className="btn-ghost btn-sm" onClick={() => update((d) => void (d.research[k].status = "rejected"))}><X size={14} /> Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add section">
        <div className="divide-hair">
          {(Object.keys(SECTION_TITLES) as SectionType[]).map((t) => (
            <button key={t} className="flex w-full items-center justify-between py-3 text-left text-[14px]" onClick={() => addSection(t)}>
              {SECTION_TITLES[t]}
              {sections.some((s) => s.type === t) && <Badge>In proposal</Badge>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
