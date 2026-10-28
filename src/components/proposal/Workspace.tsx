"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Cloud, CloudOff, MessageSquare, Sparkles } from "lucide-react";
import { useProposal } from "@/lib/useProposal";
import { Badge, EmptyState, Page, PageHeader, Spinner } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/actions";
import { StepCustomer } from "./StepCustomer";
import { StepServices } from "./StepServices";
import { StepConditions } from "./StepConditions";
import { StepEquipment } from "./StepEquipment";
import { StepLabor } from "./StepLabor";
import { StepPricing } from "./StepPricing";
import { StepDocument } from "./StepDocument";
import { StepReview } from "./StepReview";
import { Assistant } from "./Assistant";
import { LiveEstimateBar, LiveEstimatePanel } from "./LiveEstimate";
import type { StepProps } from "./types";

const STEPS = ["Customer", "Services", "Conditions", "Equipment", "Labor", "Pricing", "Document", "Review"];

export function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const { proposal, missing, update, replace, pricing, saveState } = useProposal(id);
  const [step, setStep] = useState(() => Number(params.get("step") ?? -1));
  const [programIdx, setProgramIdx] = useState(0);
  const [assistant, setAssistant] = useState(false);
  const dir = useRef<"next" | "prev">("next");
  // A checkmark pops in briefly each time an edit finishes saving.
  const [savedTick, setSavedTick] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const lastSave = useRef(saveState);
  useEffect(() => {
    if (lastSave.current === "saving" && saveState === "saved") {
      setSavedTick((n) => n + 1);
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1400);
      lastSave.current = saveState;
      return () => clearTimeout(t);
    }
    lastSave.current = saveState;
  }, [saveState]);

  useEffect(() => {
    if (proposal && step < 0) setStep(proposal.wizardStep ?? 0);
  }, [proposal, step]);

  const goStep = (n: number) => {
    const s = Math.max(0, Math.min(STEPS.length - 1, n));
    dir.current = s < step ? "prev" : "next";
    setStep(s);
    update((d) => void (d.wizardStep = s));
    const u = new URL(window.location.href);
    u.searchParams.set("step", String(s));
    router.replace(`/proposal${u.search}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!id || missing)
    return (
      <>
        <PageHeader title="Proposal" back="/library" />
        <Page>
          <EmptyState title="Proposal not found" body="It may have been deleted or exists on another device." />
        </Page>
      </>
    );
  if (!proposal || step < 0)
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Spinner size={22} />
      </div>
    );

  const pi = Math.min(programIdx, proposal.programs.length - 1);
  const props: StepProps = { proposal, update, replace, pricing, programIdx: pi, setProgramIdx, goStep };
  const r = pricing[pi];
  const showEstimate = step >= 1 && step <= 5;
  const View = [StepCustomer, StepServices, StepConditions, StepEquipment, StepLabor, StepPricing, StepDocument, StepReview][step];

  return (
    <>
      <PageHeader
        vtTarget
        back="/library"
        eyebrow={
          <span className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[proposal.status]}>{STATUS_LABEL[proposal.status]}</Badge>
            <span className="flex items-center gap-1 normal-case tracking-normal">
              {saveState === "saving" ? <Spinner size={11} /> : saveState === "error" ? <CloudOff size={12} className="text-red" /> : justSaved ? <Check key={savedTick} size={12} className="save-pop text-ok" /> : <Cloud size={12} />}
              {saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Saved on device"}
            </span>
          </span>
        }
        title={proposal.customer.name || proposal.property.name || proposal.title}
        actions={
          <>
            <Link href={`/compose?id=${proposal.id}`} className="btn-secondary btn-sm" aria-label="Open in the proposal engine chat">
              <MessageSquare size={15} className="text-red" /> <span className="hidden sm:inline">Chat</span>
            </Link>
            <button className="btn-secondary btn-sm" onClick={() => setAssistant(true)} aria-label="Assistant">
              <Sparkles size={15} className="text-red" /> <span className="hidden sm:inline">Assistant</span>
            </button>
          </>
        }
      >
        <nav className="scrollbar-none px-safe mx-auto flex max-w-6xl gap-1 overflow-x-auto pb-2.5" aria-label="Proposal steps">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => goStep(i)} className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition", i === step ? "step-on bg-red text-white" : i < step ? "text-ink2 hover:bg-surface2" : "text-ink3 hover:bg-surface2")}>
              <span className={clsx("flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]", i === step ? "bg-white/25" : "bg-surface3")}>{i < step ? <Check size={11} /> : i + 1}</span>
              {s}
            </button>
          ))}
        </nav>
      </PageHeader>
      <Page className={showEstimate ? "!pb-56 lg:!pb-16" : ""}>
        <div className={clsx(showEstimate && "lg:grid lg:grid-cols-[1fr_320px] lg:gap-6")}>
          <div key={step} className={clsx("min-w-0", dir.current === "prev" ? "step-prev" : "step-next")}>
            <View {...props} />
            <div className="mt-8 flex justify-between gap-3">
              <button className="btn-secondary" disabled={step === 0} onClick={() => goStep(step - 1)}>
                <ChevronLeft size={18} /> {STEPS[step - 1] ?? "Back"}
              </button>
              {step < STEPS.length - 1 && (
                <button className="btn-primary" onClick={() => goStep(step + 1)}>
                  {STEPS[step + 1]} <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
          {showEstimate && r && (
            <aside className="hidden lg:block">
              <div className="card card-pad sticky top-[132px]">
                <LiveEstimatePanel r={r} program={proposal.programs[pi]} />
              </div>
            </aside>
          )}
        </div>
      </Page>
      {showEstimate && r && <LiveEstimateBar r={r} program={proposal.programs[pi]} />}
      <Assistant open={assistant} onClose={() => setAssistant(false)} {...props} />
    </>
  );
}
