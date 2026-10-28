"use client";

import { Rolling } from "@/components/motion";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Calculator } from "lucide-react";
import clsx from "clsx";
import { db } from "@/lib/db";
import { Badge, Card, MoneyField, NumberField, Page, PageHeader, Row, SectionTitle, Spinner } from "@/components/ui";
import { formatHours, formatMinutes, formatMoney, laborCents } from "@/lib/engine/money";
import { priceProposal } from "@/lib/engine/pricing";
import { createProposal } from "@/lib/actions";
import { parseIntake } from "@/lib/commands/parse";
import { useSettings } from "@/lib/client";

export default function Estimates() {
  const router = useRouter();
  const settings = useSettings();
  const version = useLiveQuery(async () => (settings ? db().assumptionVersions.get(settings.activeAssumptionsVersionId) : undefined), [settings?.activeAssumptionsVersionId]);
  const proposals = useLiveQuery(() => db().proposals.orderBy("updatedAt").reverse().toArray(), []);
  const [tin, setTin] = useState<number>(40);
  const [st, setSt] = useState<number>(30);
  const [rate, setRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const a = version?.assumptions;
  const r = rate ?? a?.laborRateCentsPerHour ?? 21000;
  const tinMin = tin * (a?.tinCatServiceMinutes ?? 1);
  const stMin = st * (a?.baitStationServiceMinutes ?? 2);

  const openFull = async () => {
    setBusy(true);
    const x = parseIntake(`${tin} tin cats ${st} exterior bait stations weekly rodent`);
    const p = await createProposal({ template: "office_rodent", intake: { ...x, tinCats: tin, exteriorStations: st }, title: "Quick estimate" });
    router.push(`/proposal?id=${p.id}&step=0`);
  };

  return (
    <>
      <PageHeader title="Estimates" eyebrow="Labor & pricing" />
      <Page>
        <SectionTitle>Device labor calculator</SectionTitle>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField label="Tin Cats" value={tin} stepper onChange={(v) => setTin(v ?? 0)} hint={`${a?.tinCatServiceMinutes ?? 1} min each · confirmed`} />
            <NumberField label="Exterior bait stations" value={st} stepper onChange={(v) => setSt(v ?? 0)} hint={`${a?.baitStationServiceMinutes ?? 2} min each · confirmed`} />
            <MoneyField label="Rate / hour" cents={rate} onChange={setRate} placeholder={((a?.laborRateCentsPerHour ?? 21000) / 100).toFixed(2)} className="col-span-2 sm:col-span-1" />
          </div>
          <div className="divide-hair rounded-xl border hairline px-3.5">
            <Row label={`${tin} Tin Cats × ${a?.tinCatServiceMinutes ?? 1} min`} value={formatMinutes(tinMin)} />
            <Row label={`${st} stations × ${a?.baitStationServiceMinutes ?? 2} min`} value={formatMinutes(stMin)} />
            <Row strong label="Device-service labor" value={formatMinutes(tinMin + stMin)} />
            <Row strong label={`At ${formatMoney(r)}/hr`} value={<span className="font-display text-[22px] font-bold"><Rolling value={laborCents(tinMin + stMin, r)} format={(c) => formatMoney(c)} /></span>} sub={`${tinMin + stMin} min ÷ 60 × ${formatMoney(r)}`} />
          </div>
          <p className="text-[12px] text-ink3">Equipment handling only. Walking, inspection, treatment, setup and documentation are estimated in the full estimator.</p>
          <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={openFull}>
            {busy ? <Spinner /> : <Calculator size={17} />} Full physical-service estimate <ArrowRight size={17} />
          </button>
        </Card>

        <SectionTitle>Estimates by proposal</SectionTitle>
        <Card pad={false} className="divide-hair overflow-hidden">
          {proposals?.length === 0 && <div className="p-4 text-[13px] text-ink3">No proposals yet.</div>}
          {proposals?.map((p) => {
            const rs = priceProposal(p);
            const rec = rs.find((x) => x.recurring);
            const pt = rec?.recurring ?? rs[0]?.initial;
            const mins = rec ? rec.estimate.recurring.technicianMinutes : rs[0]?.estimate.initial.technicianMinutes ?? 0;
            return (
              <Link key={p.id} href={`/proposal?id=${p.id}&step=4`} className="block px-4 py-3 transition hover:bg-surface2/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{p.customer.name || p.property.name || p.title}</div>
                    <div className="text-[12px] text-ink3">{p.programs.length} program{p.programs.length > 1 ? "s" : ""} · {formatHours(mins)} technician time · {rs[0]?.estimate.confidence.level} confidence</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num text-[15px] font-semibold">{pt ? formatMoney(pt.finalCents) : "—"}</div>
                    {pt?.overrideCents != null && <div className={clsx("num text-[11.5px]", pt.belowTarget ? "text-warn" : "text-ink3")}>{formatMoney(pt.effectiveHourlyYieldCents)}/hr yield</div>}
                    {pt?.overrideCents == null && <Badge>Calculated</Badge>}
                  </div>
                </div>
              </Link>
            );
          })}
        </Card>
      </Page>
    </>
  );
}
