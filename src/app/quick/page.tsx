"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Bug, CalendarClock, Check, DollarSign, FileText, MapPin, PencilLine, Sparkles, Store } from "lucide-react";
import { BuildSequence, type BuildChip } from "@/components/BuildSequence";
import { parseBrief } from "@/lib/quick/brief";
import { playBuildDone, playBuildStart, prepareBuildSounds } from "@/lib/chime";
import { SERVICE_LABELS } from "@/lib/engine/assumptions";
import { Badge, Callout, Card, Page, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { LengthPicker } from "@/components/LengthPicker";
import { db } from "@/lib/db";
import type { DocLength } from "@/lib/types";
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

/** Minimum time each build step stays on screen. */
const STEP_MS = 1300;

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
  const [lengthPick, setLengthPick] = useState<DocLength | null>(null);
  const length: DocLength = lengthPick ?? settings?.defaults.docLength ?? "two_page";
  const chooseLength = (v: DocLength) => {
    setLengthPick(v);
    // Remember the choice for the next proposal.
    if (settings) void db().settings.put({ ...settings, defaults: { ...settings.defaults, docLength: v } });
  };

  const [chips, setChips] = useState<BuildChip[] | null>(null);
  const [pending, setPending] = useState<QuickResult | null>(null);
  const [log, setLog] = useState<Record<string, string[]>>({});
  useEffect(() => prepareBuildSounds(), []);

  const build = async () => {
    // Sound must start inside the tap for iPhone to allow it.
    playBuildStart();
    setError(null);
    setResult(null);
    setPending(null);
    setChips(briefChips(text));
    setLog(buildLog(text, useAI, length));
    // Each step stays on screen long enough to read, even when the build itself is instant.
    let chain = Promise.resolve();
    let last = 0;
    const paced = (st: QuickStep) => {
      chain = chain.then(async () => {
        const wait = Math.max(0, STEP_MS - (performance.now() - last));
        if (last) await new Promise((r) => setTimeout(r, wait));
        last = performance.now();
        setStep(st);
      });
    };
    try {
      const r = await quickBuild(text, useAI, paced, length);
      await chain;
      await new Promise((res) => setTimeout(res, Math.max(0, STEP_MS - (performance.now() - last))));
      setPending(r);
      playBuildDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the proposal.");
      setChips(null);
      setStep(null);
    }
  };

  const finish = useCallback(() => {
    setResult(pending);
    setPending(null);
    setChips(null);
    setStep(null);
  }, [pending]);

  if (result) return <Done r={result} onOpen={(s) => router.push(`/proposal?id=${result.proposal.id}&step=${s}`)} onAgain={() => (setResult(null), setText(""))} />;

  const steps = STEPS.filter((s) => useAI || !s.ai);

  return (
    <>
      {chips && <BuildSequence mode={useAI ? "ai" : "offline"} steps={steps} current={step} done={!!pending} chips={chips} log={log} onFinished={finish} />}
      <PageHeader title="Build a Proposal" eyebrow="Quick build" back="/" />
      <Page>
        <Card>
          <div className="mb-2 text-[15px] font-semibold">Tell me the basics</div>
          <p className="mb-3 text-[13.5px] leading-relaxed text-ink2">Just the address, the pest problem and your price. Say it or type it. I’ll fill in the rest and write the whole proposal.</p>
          <VoiceInput value={text} onChange={setText} rows={4} placeholder="e.g. Riverside Foods, 1234 Woodward Ave, Detroit MI. Mice in the back room and around the loading dock. $350 a visit." />
          <div className="mt-3 text-[13px] font-semibold">How long?</div>
          <LengthPicker value={length} onChange={chooseLength} className="mt-1.5" />
          <button className="btn-primary cta-sheen mt-3 w-full !py-3.5 text-[16px]" disabled={text.trim().length < 6 || !!step} onClick={build}>
            {step ? <Spinner /> : <Sparkles size={18} />} {step ? "Building…" : "Build my proposal"}
          </button>
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
  const shownPrice = useCountUp(point?.finalCents ?? 0);
  const rows = planRows(r.plan);
  const checks = [...r.plan.fieldVerification, ...r.issues.map((c) => `${c.label}: ${c.detail}`)];
  return (
    <>
      <PageHeader title="Proposal Ready" eyebrow="Quick build" back="/" />
      <Page>
        <SuccessMark />
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
              <span className="num font-display text-[34px] font-bold leading-none">{formatMoney(shownPrice)}</span>
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
        <div className="stagger card divide-hair overflow-hidden">
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
              <ul className="stagger space-y-2 text-[14px] leading-relaxed">
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

/** Animated check that draws itself when the proposal is ready. */
function SuccessMark() {
  return (
    <div className="mb-4 flex flex-col items-center pt-2">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="check-pulse absolute inset-0 rounded-full bg-ok/30" />
        <svg viewBox="0 0 64 64" className="check-ring relative h-16 w-16">
          <circle cx="32" cy="32" r="30" className="fill-ok" />
          <path d="M20 33 l8 8 l16 -18" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="check-path" />
        </svg>
      </div>
      <div className="mt-2 animate-rise text-[13px] font-semibold uppercase tracking-[0.2em] text-ok">Ready to send</div>
    </div>
  );
}

/** Counts up to a cents value once, for the price reveal. */
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(k < 1 ? Math.round(target * eased) : target);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** What was read from the note, shown as chips flying into the build screen. */
function briefChips(text: string): BuildChip[] {
  const b = parseBrief(text);
  const out: BuildChip[] = [];
  if (b.customerName) out.push({ icon: <Store size={13} />, text: b.customerName });
  if (b.address) out.push({ icon: <MapPin size={13} />, text: [b.address.line1, b.address.city].filter(Boolean).join(", ") });
  if (b.pestsBasis === "stated") out.push({ icon: <Bug size={13} />, text: b.services.slice(0, 2).map((x) => SERVICE_LABELS[x]).join(" + ") });
  if (b.priceCents != null) out.push({ icon: <DollarSign size={13} />, text: `${formatMoney(b.priceCents)}${b.priceBasis === "per_month" ? " / month" : b.priceBasis === "one_time" ? " one time" : " / visit"}` });
  if (b.frequencyBasis === "stated") out.push({ icon: <CalendarClock size={13} />, text: frequencyLabel(b.frequency) });
  return out;
}

/** Engine log lines shown during the build, from what was read in the note. */
function buildLog(text: string, useAI: boolean, length: DocLength): Record<string, string[]> {
  const b = parseBrief(text);
  const up = (x: string) => x.toUpperCase();
  const addr = b.address ? up([b.address.line1, b.address.city].filter(Boolean).join(", ")) : "NOT STATED";
  return {
    read: [`PARSE › ${text.trim().length} CHARS · ${text.trim().split(/\s+/).length} TOKENS`, `ADDR  › ${addr}`, `PEST  › ${up(b.services.map((x) => SERVICE_LABELS[x]).join(" + "))}`, `PRICE › ${b.priceCents != null ? `${formatMoney(b.priceCents)} ${b.priceBasis === "per_month" ? "/ MONTH" : "/ VISIT"} · LOCKED` : "CALCULATE @ LABOR RATE"}`],
    lookup: ["GEO   › QUERYING PUBLIC RECORDS", "WEB   › ORKIN · EPA · EXTENSION SOURCES", "SITE  › CLASSIFYING FACILITY TYPE"],
    plan: [`MODEL › ${up(b.propertyType)}`, `FREQ  › ${up(frequencyLabel(b.frequency))}`, "LAYOUT› SIZING INTERIOR + PERIMETER DEVICES", "PRICE › INTEGER-CENT ENGINE · NO HIDDEN ROUNDING"],
    write: ["CLAUDE› COMPOSING SITE-SPECIFIC NARRATIVE", "GUARD › PRICES BY KEY ONLY · TERMS VERBATIM"],
    check: [`QC    › LEGAL · FINANCIAL · DOCUMENT`, `PDF   › PORTRAIT · ${length === "one_page" ? "1 PAGE" : length === "two_page" ? "2 PAGES" : length === "short" ? "SHORT" : "FULL"}`, useAI ? "LINK  › CLAUDE SESSION CLOSED" : "MODE  › OFFLINE ENGINE"],
  };
}
