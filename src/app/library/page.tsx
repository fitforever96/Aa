"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import { Copy, Download, FileUp, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, EmptyState, Page, PageHeader, Sheet } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, deleteProposal, duplicateProposal } from "@/lib/actions";
import { downloadBlob, relTime, safeFileName } from "@/lib/client";
import { priceProposal } from "@/lib/engine/pricing";
import { formatMoney } from "@/lib/engine/money";
import { useToast } from "@/components/shell/Toast";
import type { Proposal } from "@/lib/types";

const FILTERS = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["awaiting", "Awaiting approval"],
  ["done", "Completed"],
  ["active", "Active accounts"],
  ["archived", "Archived"],
] as const;

function match(p: Proposal, f: string) {
  if (f === "all") return p.status !== "archived";
  if (f === "draft") return p.status === "draft" || p.status === "in_review";
  if (f === "awaiting") return p.status === "awaiting_approval";
  if (f === "done") return ["approved", "sent", "active"].includes(p.status);
  return p.status === f;
}

function LibraryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<Proposal | null>(null);
  const proposals = useLiveQuery(() => db().proposals.orderBy("updatedAt").reverse().toArray(), []);
  const versionCounts = useLiveQuery(async () => {
    const m: Record<string, number> = {};
    await db().versions.each((v) => void (m[v.proposalId] = (m[v.proposalId] ?? 0) + 1));
    return m;
  }, []);
  const list = useMemo(() => (proposals ?? []).filter((p) => match(p, filter) && (!q || `${p.title} ${p.customer.name} ${p.property.name} ${p.property.address.city}`.toLowerCase().includes(q.toLowerCase()))), [proposals, filter, q]);

  return (
    <>
      <PageHeader title="Proposal Library" eyebrow="Proposals, drafts & versions" actions={<Link href="/import" className="btn-secondary btn-sm"><FileUp size={15} /> Import</Link>}>
        <div className="px-safe mx-auto max-w-6xl space-y-2.5 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
            <input className="input pl-10" placeholder="Search customer, property, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
            {FILTERS.map(([k, l]) => (
              <button key={k} className={clsx("chip shrink-0", filter === k && "chip-on")} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>
      <Page>
        {proposals && list.length === 0 && <EmptyState title="Nothing here" body={q ? "No proposals match your search." : "No proposals in this view."} action={<Link href="/new" className="btn-primary">New proposal</Link>} />}
        <div className="card divide-hair overflow-hidden">
          {list.map((p) => {
            const r = priceProposal(p)[0];
            const price = r?.recurring?.finalCents ?? r?.initial.finalCents;
            return (
              <div key={p.id} className="flex items-center gap-2 pr-2">
                <Link href={`/proposal?id=${p.id}`} className="min-w-0 flex-1 px-4 py-3.5 transition hover:bg-surface2/50">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.customer.name || p.property.name || "Untitled"}</span>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-ink3">
                    {p.title} · {relTime(p.updatedAt)}
                    {versionCounts?.[p.id] ? ` · ${versionCounts[p.id]} version${versionCounts[p.id] > 1 ? "s" : ""}` : ""}
                    {p.importedFrom ? ` · imported` : ""}
                  </div>
                </Link>
                {price ? <span className="num hidden text-[14px] font-semibold sm:block">{formatMoney(price)}</span> : null}
                <button className="btn-ghost btn-sm !px-2" onClick={() => setMenu(p)} aria-label="More actions">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            );
          })}
        </div>
      </Page>
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.customer.name || menu?.title || "Proposal"}>
        {menu && (
          <div className="divide-hair">
            <button className="flex w-full items-center gap-3 py-3 text-[15px]" onClick={async () => { const c = await duplicateProposal(menu.id); setMenu(null); router.push(`/proposal?id=${c.id}`); }}>
              <Copy size={18} /> Duplicate as new draft
            </button>
            <button className="flex w-full items-center gap-3 py-3 text-[15px]" onClick={async () => { const versions = await db().versions.where("proposalId").equals(menu.id).toArray(); downloadBlob(new Blob([JSON.stringify({ format: "orkin-proposal-studio-proposal", version: 1, proposal: menu, versions }, null, 2)], { type: "application/json" }), `${safeFileName(menu.customer.name || menu.title)}.json`); setMenu(null); }}>
              <Download size={18} /> Export proposal (JSON)
            </button>
            <button className="flex w-full items-center gap-3 py-3 text-[15px] text-red" onClick={async () => { if (!confirm("Delete this proposal, its versions and images from this device? This can’t be undone unless you have a backup.")) return; await deleteProposal(menu.id); setMenu(null); toast("Proposal deleted"); }}>
              <Trash2 size={18} /> Delete
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export default function Library() {
  return (
    <Suspense>
      <LibraryInner />
    </Suspense>
  );
}
