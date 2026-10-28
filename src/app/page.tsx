"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Calculator, FileUp, Mic, Plus, Settings as Cog, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { relTime, useSettings } from "@/lib/client";
import { Badge, Card, EmptyState, Page, SectionTitle, Wordmark } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, createProposal } from "@/lib/actions";
import { STARTER_TEMPLATES } from "@/lib/templates";
import { priceProposal } from "@/lib/engine/pricing";
import { formatMoney } from "@/lib/engine/money";
import { frequencyLabel } from "@/lib/engine/frequency";
import { useToast } from "@/components/shell/Toast";

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const proposals = useLiveQuery(() => db().proposals.orderBy("updatedAt").reverse().toArray(), []);
  const historicalCount = useLiveQuery(() => db().historical.count(), []);
  const first = settings?.profile.name.split(" ")[0] ?? "";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
          <div className="text-[13px] text-ink3">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="mt-0.5 font-display text-[34px] font-bold uppercase leading-[1.02] tracking-tight sm:text-[42px]">
            {greet}
            {first ? "," : ""} <span className="text-red">{first}</span>
          </h1>
        </div>

        <button onClick={() => start()} className="group mt-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-red p-5 text-left text-white shadow-xl shadow-red/20 transition active:scale-[0.99]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Plus size={26} strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[22px] font-bold uppercase leading-tight tracking-wide">New Proposal</span>
            <span className="block text-[13px] text-white/80">Customer → scope → labor → price → PDF</span>
          </span>
          <ArrowRight className="shrink-0 transition group-hover:translate-x-1" />
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Link href="/new?mode=voice" className="card flex flex-col items-start gap-2 p-3.5 transition active:scale-[0.98]">
            <Mic size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Dictate a job</span>
          </Link>
          <Link href="/estimates" className="card flex flex-col items-start gap-2 p-3.5 transition active:scale-[0.98]">
            <Calculator size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Quick estimate</span>
          </Link>
          <Link href="/import" className="card flex flex-col items-start gap-2 p-3.5 transition active:scale-[0.98]">
            <FileUp size={20} className="text-red" />
            <span className="text-[13px] font-semibold leading-tight">Import proposal</span>
          </Link>
        </div>

        {historicalCount === 0 && (
          <Link href="/settings#backup" className="card mt-3 flex items-center gap-3 border-warn/30 p-4">
            <FileUp size={20} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Load your private data pack</span>
              <span className="block text-[12.5px] text-ink3">Historical pricing and precedents are kept out of the public app. Settings › Restore from backup › Merge.</span>
            </span>
          </Link>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2.5">
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
        <div className="card divide-hair overflow-hidden">
          {(proposals ?? []).slice(0, 6).map((p) => {
            const r = priceProposal(p)[0];
            const price = r?.recurring?.finalCents ?? r?.initial.finalCents;
            return (
              <Link key={p.id} href={`/proposal?id=${p.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface2/60">
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
