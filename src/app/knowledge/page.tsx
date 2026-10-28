"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Page, PageHeader } from "@/components/ui";
import { EquipmentTab } from "@/components/knowledge/EquipmentTab";
import { AssumptionsTab } from "@/components/knowledge/AssumptionsTab";
import { HistoricalTab } from "@/components/knowledge/HistoricalTab";
import { CapabilitiesTab } from "@/components/knowledge/CapabilitiesTab";
import { DocumentsTab } from "@/components/knowledge/DocumentsTab";
import { CalibrationTab } from "@/components/knowledge/CalibrationTab";

const TABS = [
  ["equipment", "Equipment & prices", EquipmentTab],
  ["assumptions", "Time standards", AssumptionsTab],
  ["historical", "Historical pricing", HistoricalTab],
  ["capabilities", "Orkin terminology", CapabilitiesTab],
  ["documents", "Proposal library", DocumentsTab],
  ["calibration", "Calibration", CalibrationTab],
] as const;

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "equipment";
  const T = TABS.find((t) => t[0] === tab) ?? TABS[0];
  const View = T[2];
  return (
    <>
      <PageHeader title="Knowledge & Pricing" eyebrow="Standards, references & learning">
        <div className="scrollbar-none px-safe mx-auto flex max-w-6xl gap-1.5 overflow-x-auto pb-2.5">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => router.replace(`/knowledge?tab=${k}`, { scroll: false })} className={clsx("chip shrink-0", T[0] === k && "chip-on")}>
              {l}
            </button>
          ))}
        </div>
      </PageHeader>
      <Page>
        <View />
      </Page>
    </>
  );
}

export default function Knowledge() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
