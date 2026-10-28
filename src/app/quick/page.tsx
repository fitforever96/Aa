"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, FileText, PencilLine, Sparkles } from "lucide-react";
import { Badge, Callout, Card, Page, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { useAIStatus, useOnline, useSettings } from "@/lib/client";
import { quickBuild, type QuickResult, type QuickStep } from "@/lib/quick/run";
import { BASIS_LABEL, planRows, type Basis } from "@/lib/quick/brief";
import { priceProposal } from "@/lib/engine/pricing";
import { formatMoney } from "@/lib/engine/money";
import { frequencyLabel } from "@/lib/engine/frequency";

const STEPS: { key: QuickStep; label: string; ai?: boolean }[] = [
  { key: "read", label: "Reading your notes" },
  { key: "lookup", label: "Looking up the property and the pest", ai: true },
  { key: "plan", label: "Planning service, devices and price" },
  { key: "write", label: "Writing the proposal", ai: true },
  { key: "check", label: "Running quality checks" },
];

const TONE: Record<Basis, "ok" | "info" | "warn"> = { stated: "ok", found_online: "info", estimate: "warn" };

export default function QuickBuild() {
  const router = useRouter();
  const settings = useSettings();
  const ai = useAIStatus();
  const online = useOnline();
  const [text, setText] = useState("");
  const [step, setStep] = useState<QuickStep | null>(null);
  const [result, setResult] = useState<QuickResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useAI = !!ai?.configured && !!settings?.ai.consent && online;

  const build = async () => {
    setError(null);
    setResult(null);
    try {
      setResult(await quickBuild(text, useAI, setStep));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the proposal.");
    } finally {
      setStep(null);
    }
  };

  if (result) return <Done r={result} onOpen={(s) => router.push(`/proposal?id=${result.proposal.id}&step=${s}`)} onAgain={() => (setResult(null), setText(""))} />;

  const steps = STEPS.filter((s) => useAI || !s.ai);
  const at = step ? steps.findIndex((s) => s.key === step) : -1;

  return (
    <>
      <PageHeader title="Build a Proposal" eyebrow="Quick build" back="/" />
      <Page>
        <Card>
          <div className="mb-2 text-[15px] font-semibold">Tell me the basics</div>
          <p className="mb-3 text-[13.5px] leading-relaxed text-ink2">Just the address, the pest problem and your price. Say it or type it. I’ll fill in the rest and write the whole proposal.</p>
          <VoiceInput value={text} onChange={setText} rows={4} placeholder="e.g. Riverside Foods, 1234 Woodward Ave, Detroit MI. Mice in the back room and around the loading dock. $350 a visit." />
          <button className="btn-primary mt-3 w-full !py-3.5 text-[16px]" disabled={text.trim().length < 6 || !!step} onClick={build}>
            {step ? <Spinner /> : <Sparkles size={18} />} {step ? "Building…" : "Build my proposal"}
          </button>
          {step && (
            <ol className="mt-4 space-y-2">
              {steps.map((s, i) => (
                <li key={s.key} className={`flex items-center gap-2.5 text-[14px] ${i > at ? "text-ink3" : ""}`}>
                  <span className="flex h-5 w-5 items-center justify-center">{i < at ? <Check size={16} className="text-ok" /> : i === at ? <Spinner size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-ink3/50" />}</span>
                  {s.label}
                </li>
              ))}
              {useAI && <li className="pl-7 text-[12px] text-ink3">This takes 1 to 3 minutes. Keep the app open.</li>}
            </ol>
          )}
          {error && <Callout tone="red" className="mt-3">{error}</Callout>}
        </Card>

        {!useAI && (
          <Callout tone="info" className="mt-3" title={online ? "Working without Claude" : "You’re offline"}>
            {online ? (
              <>
                I’ll still build the full proposal using built-in estimates and the standard writer. To let Claude look up the property and write it for you,{" "}
                <Link href="/settings#ai" className="font-medium text-info underline">
                  connect Claude in Settings
                </Link>
                .
              </>
            ) : (
              "I’ll build it with built-in estimates and the standard writer. Claude’s lookup and writing need a connection."
            )}
          </Callout>
        )}

        <p className="mt-4 text-center text-[12.5px] text-ink3">
          Want to set everything yourself?{" "}
          <Link href="/new" className="font-medium text-red">
            Step-by-step proposal
          </Link>
        </p>
      </Page>
    </>
  );
}

function Done({ r, onOpen, onAgain }: { r: QuickResult; onOpen: (step: number) => void; onAgain: () => void }) {
  const price = priceProposal(r.proposal)[0];
  const point = price?.recurring ?? price?.initial;
  const rows = planRows(r.plan);
  const checks = [...r.plan.fieldVerification, ...r.issues.map((c) => `${c.label}: ${c.detail}`)];
  return (
    <>
      <PageHeader title="Proposal Ready" eyebrow="Quick build" back="/" />
      <Page>
        <Card className="animate-rise">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold">{r.proposal.customer.name || r.proposal.property.address.line1 || r.proposal.title}</div>
              <div className="mt-0.5 text-[13px] text-ink3">{r.proposal.title}</div>
            </div>
            <Badge tone={r.plan.mode === "ai" ? "info" : "neutral"}>{r.plan.mode === "ai" ? "Claude" : "Built-in"}</Badge>
          </div>
          {point && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="num font-display text-[34px] font-bold leading-none">{formatMoney(point.finalCents)}</span>
              <span className="text-[13px] text-ink3">{r.proposal.programs[0].chargeType === "one_time" ? "one time" : `per visit · ${frequencyLabel(r.proposal.programs[0].frequency).toLowerCase()}`}</span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="btn-primary !py-3.5" onClick={() => onOpen(7)}>
              <FileText size={18} /> See the PDF & send
            </button>
            <button className="btn-secondary !py-3.5" onClick={() => onOpen(0)}>
              <PencilLine size={17} /> Change details
            </button>
          </div>
        </Card>

        {r.priceNote && <Callout tone="warn" className="mt-3">{r.priceNote}</Callout>}
        {r.warnings.map((w) => (
          <Callout key={w} tone="warn" className="mt-3">
            {w}
          </Callout>
        ))}

        <SectionTitle>What I filled in</SectionTitle>
        <div className="card divide-hair overflow-hidden">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 px-4 py-3 text-[14px]">
              <span className="shrink-0 text-ink3">{row.label}</span>
              <span className="min-w-0 text-right">
                <span className="font-medium">{row.value}</span>
                <span className="mt-1 block">
                  <Badge tone={TONE[row.basis]}>{BASIS_LABEL[row.basis]}</Badge>
                </span>
              </span>
            </div>
          ))}
        </div>
        {r.plan.recommended.length > 0 && (
          <>
            <SectionTitle>Recommended for this site</SectionTitle>
            <Card>
              <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed">
                {r.plan.recommended.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {checks.length > 0 && (
          <>
            <SectionTitle>Check before you send</SectionTitle>
            <Card>
              <ul className="space-y-2 text-[14px] leading-relaxed">
                {checks.map((x) => (
                  <li key={x} className="flex gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        <button className="btn-ghost mt-4 w-full" onClick={onAgain}>
          Build another <ArrowRight size={16} />
        </button>
      </Page>
    </>
  );
}
