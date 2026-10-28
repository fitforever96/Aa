"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUp, Calculator, FileUp, Plus, Settings as Cog, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { relTime, useAIStatus, useOnline, useSettings } from "@/lib/client";
import { Badge, Card, EmptyState, Page, SectionTitle, Wordmark } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, createProposal } from "@/lib/actions";
import { STARTER_TEMPLATES } from "@/lib/templates";
import { priceProposal } from "@/lib/engine/pricing";
import { formatMoney } from "@/lib/engine/money";
import { frequencyLabel } from "@/lib/engine/frequency";
import { useToast } from "@/components/shell/Toast";
import { openWithTransition } from "@/lib/motion";
import { UnlockPrivateData } from "@/components/UnlockPrivateData";
import { playBuildStart, prepareBuildSounds } from "@/lib/chime";

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const proposals = useLiveQuery(() => db().proposals.orderBy("updatedAt").reverse().toArray(), []);
  const historicalCount = useLiveQuery(() => db().historical.count(), []);
  const first = settings?.profile.name.split(" ")[0] ?? "";
  // Time-based text is set after mount: the page is pre-rendered at build time.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const hour = now?.getHours() ?? 9;
  const greet = !now ? "Welcome back" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const counts = {
    draft: proposals?.filter((p) => p.status === "draft" || p.status === "in_review").length ?? 0,
    awaiting: proposals?.filter((p) => p.status === "awaiting_approval").length ?? 0,
    done: proposals?.filter((p) => ["approved", "sent", "active"].includes(p.status)).length ?? 0,
  };

  const start = async (template?: string) => {
    try {
      const p = await createProposal({ template });
      router.push(`/proposal?id=${p.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create proposal", "error");
    }
  };

  return (
    <>
      <header className="pt-safe px-safe mx-auto flex max-w-6xl items-center justify-between pb-1 pt-4">
        <div className="lg:hidden">
          <Wordmark size={24} />
        </div>
        <div className="hidden lg:block" />
        <Link href="/settings" className="rounded-full p-2 text-ink2 hover:bg-surface2 lg:hidden" aria-label="Settings">
          <Cog size={21} />
        </Link>
      </header>
      <Page className="!pt-2">
        <div className="animate-rise">
          <div className="text-[13px] text-ink3">{now ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "\u00a0"}</div>
          <h1 className="mt-0.5 font-display text-[34px] font-bold uppercase leading-[1.02] tracking-tight sm:text-[42px]">
            {greet}
            {first ? "," : ""} <span className="text-red">{first}</span>
          </h1>
        </div>

        <CommandBar />

        <div className="stagger mt-3 grid grid-cols-3 gap-2.5">
          <button onClick={() => start()} className="card press flex flex-col items-start gap-2 p-3.5 text-left">
            <Plus size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Step by step</span>
          </button>
          <Link href="/estimates" className="card press flex flex-col items-start gap-2 p-3.5">
            <Calculator size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Quick estimate</span>
          </Link>
          <Link href="/import" className="card press flex flex-col items-start gap-2 p-3.5">
            <FileUp size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Import proposal</span>
          </Link>
        </div>

        {historicalCount === 0 && (
          <div className="mt-3">
            <UnlockPrivateData />
          </div>
        )}

        <div className="stagger mt-6 grid grid-cols-3 gap-2.5">
          {[
            ["Drafts", counts.draft],
            ["Awaiting approval", counts.awaiting],
            ["Completed", counts.done],
          ].map(([l, v]) => (
            <Link key={l as string} href={`/library?filter=${l === "Drafts" ? "draft" : l === "Completed" ? "done" : "awaiting"}`} className="card relative overflow-hidden p-3.5">
              <div className="num font-display text-[30px] font-bold leading-none">{v as number}</div>
              <div className="mt-1.5 text-[12px] font-medium leading-tight text-ink3">{l}</div>
            </Link>
          ))}
        </div>

        <SectionTitle action={<Link href="/library" className="text-[13px] font-medium text-red">All proposals</Link>}>Recently edited</SectionTitle>
        {proposals && proposals.length === 0 && <EmptyState icon={<Sparkles size={28} />} title="No proposals yet" body="Create your first proposal, dictate a job, or import a completed proposal to reuse its pricing and structure." />}
        <div className="stagger card divide-hair overflow-hidden">
          {(proposals ?? []).slice(0, 6).map((p) => {
            const r = priceProposal(p)[0];
            const price = r?.recurring?.finalCents ?? r?.initial.finalCents;
            return (
              <Link
                key={p.id}
                href={p.chat?.length ? `/compose?id=${p.id}` : `/proposal?id=${p.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  // Proposals made in the chat reopen in the chat; the rest in the editor.
                  openWithTransition(router.push, p.chat?.length ? `/compose?id=${p.id}` : `/proposal?id=${p.id}`, e.currentTarget);
                }}
                className="row-press flex items-center gap-3 px-4 py-3.5 hover:bg-surface2/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{p.customer.name || p.property.name || p.title}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-ink3">
                    {p.property.name && p.customer.name !== p.property.name ? `${p.property.name} · ` : ""}
                    {p.programs[0] ? frequencyLabel(p.programs[0].frequency) : ""} · {relTime(p.updatedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {price ? <span className="num text-[14px] font-semibold">{formatMoney(price)}</span> : null}
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </div>
              </Link>
            );
          })}
        </div>

        <SectionTitle>{settings?.recentTemplates.length ? "Recently used templates" : "Start from a template"}</SectionTitle>
        <div className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
          {(settings?.recentTemplates.length ? settings.recentTemplates.map((k) => STARTER_TEMPLATES.find((t) => t.key === k)!).filter(Boolean) : STARTER_TEMPLATES.slice(1, 6)).map((t) => (
            <button key={t.key} onClick={() => start(t.key)} className="card w-[200px] shrink-0 p-4 text-left transition active:scale-[0.98]">
              <div className="text-[14px] font-semibold leading-tight">{t.name}</div>
              <div className="mt-1 text-[12px] leading-snug text-ink3">{t.description}</div>
            </button>
          ))}
          <Link href="/new" className="card flex w-[140px] shrink-0 items-center justify-center p-4 text-[13px] font-semibold text-red">
            All templates
          </Link>
        </div>
        <Card className="mt-6 !p-4 text-[12px] leading-relaxed text-ink3">
          Data is stored on this device (IndexedDB). It is not cloud-synced or encrypted by the app. Use Settings › Backup to export a JSON backup.
        </Card>
      </Page>
    </>
  );
}

/** The main way in: ask for a proposal in plain words; the proposal engine builds it right away. */
function CommandBar() {
  const router = useRouter();
  const settings = useSettings();
  const ai = useAIStatus();
  const online = useOnline();
  const [q, setQ] = useState("");
  const linked = !!ai?.configured && !!settings?.ai.consent && online;
  // Ready the build sounds after the intro so the tap can play them instantly.
  useEffect(() => {
    const t = setTimeout(prepareBuildSounds, 5500);
    return () => clearTimeout(t);
  }, []);
  const go = () => {
    const text = q.trim();
    if (!text) return router.push("/compose");
    playBuildStart();
    router.push(`/compose?q=${encodeURIComponent(text)}&go=1`);
  };
  return (
    <div className="mt-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="card card-hud dock-panel animate-rise flex items-end gap-1.5 p-1.5"
      >
        <span className="mb-[11px] ml-2.5 shrink-0 text-red">
          <Sparkles size={19} />
        </span>
        <textarea
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              go();
            }
          }}
          placeholder="What do you need? A proposal, a price, findings to enhance…"
          className="min-h-[52px] flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-[1.35] text-ink outline-none placeholder:text-ink3"
          aria-label="Describe the proposal you need"
        />
        <button type="submit" data-silent className={q.trim() ? "send-ready flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red text-white shadow-lg shadow-red/25" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface3 text-ink2"} aria-label={q.trim() ? "Build it" : "Open the proposal engine"}>
          <ArrowUp size={21} strokeWidth={2.4} />
        </button>
      </form>
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="hud-mono flex items-center gap-1.5 text-[10px] uppercase text-ink3">
          <span className={linked ? "h-1.5 w-1.5 rounded-full bg-ok" : "h-1.5 w-1.5 rounded-full bg-ink3"} />
          Proposal engine · {linked ? "Claude linked" : "Local"}
        </span>
        <Link href="/compose" className="text-[12.5px] font-medium text-red">
          Attach photos or files
        </Link>
      </div>
    </div>
  );
}
