"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowUp, Check, ChevronDown, Download, FileText, Image as ImageIcon, Maximize2, Mic, Paperclip, PencilLine, RotateCcw, Share, Square, SquarePen, X } from "lucide-react";
import { BuildSequence, type BuildChip } from "@/components/BuildSequence";
import { briefChips, composeLog } from "@/components/buildSequenceData";
import { Card, PageHeader, Spinner } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { getRecognition, type Rec } from "@/components/VoiceInput";
import { db, restoreVersion, saveProposal, snapshotVersion } from "@/lib/db";
import { downloadBlob, safeFileName, shareOrDownload, useAIStatus, useOnline, useSettings } from "@/lib/client";
import { composeTurn, prepareAttachment, wantsLookup, type ComposeStep, type PreparedAttachment } from "@/lib/composer/run";
import { playBuildDone, playBuildStart, playBuildStep, prepareBuildSounds, unlockBuildSounds } from "@/lib/chime";
import { LENGTH_OPTIONS } from "@/lib/pdf/condense";
import type { ChatTurn, DocLength, Proposal } from "@/lib/types";

/** Same id the on-device AI uses for the governing proposal standard. */
const MASTER_MEMORY_ID = "doc_master_memory";

const EXAMPLES = [
  "Create a 2-page rodent proposal for Riverside Foods, 1234 Woodward Ave, Detroit MI. $350 a visit, weekly. Justify the frequency.",
  "Detailed German cockroach proposal for a 120-unit apartment building. Here are my findings, enhance them: heavy activity in kitchens on floors 2 and 3, harborage behind appliances.",
  "One-page general pest proposal for a small office, $95 a month.",
  "Mice in a warehouse. 40 exterior bait stations, monthly service. Make it detailed.",
];

const STEP_LABEL: Record<ComposeStep, string> = {
  read: "Reading your request",
  lookup: "Researching the site and pest",
  compose: "Claude is writing the proposal",
  apply: "Applying pricing and guardrails",
  check: "Checking core information",
};

interface Working {
  request: string;
  attachments: PreparedAttachment[];
  steps: { key: ComposeStep; label: string }[];
  step: ComposeStep | null;
  first: boolean;
  startedAt: number;
  resolved?: boolean;
}

function stepsFor(useAI: boolean, first: boolean, lookup: boolean): Working["steps"] {
  if (!useAI) return [
    { key: "read", label: STEP_LABEL.read },
    { key: "compose", label: first ? "Building with the local engine" : "Applying your change" },
    { key: "check", label: STEP_LABEL.check },
  ];
  return (["read", ...(lookup ? ["lookup"] : []), "compose", "apply", "check"] as ComposeStep[]).map((k) => ({ key: k, label: k === "compose" && !first ? "Claude is revising the proposal" : STEP_LABEL[k] }));
}

export default function ComposePage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}

function Composer() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const settings = useSettings();
  const ai = useAIStatus();
  const online = useOnline();
  const useAI = !!ai?.configured && !!settings?.ai.consent && online;
  // The AI status hook reads settings on its own; wait until it agrees with them before auto-sending.
  const aiReady = !!settings && !!ai && (!settings.ai.apiKey || ai.configured);

  const [localId, setLocalId] = useState<string | null>(null);
  const id = localId ?? params.get("id");
  // undefined while loading, null when there is no such proposal.
  const loaded = useLiveQuery(async () => (id ? ((await db().proposals.get(id)) ?? null) : null), [id]);
  const proposal = loaded ?? undefined;
  const memory = useLiveQuery(() => db().knowledge.get(MASTER_MEMORY_ID), []);
  const memoryWords = memory?.text ? memory.text.trim().split(/\s+/).length : 0;

  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<PreparedAttachment[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [working, setWorking] = useState<Working | null>(null);
  const [failed, setFailed] = useState<{ request: string; attachments: PreparedAttachment[]; message: string } | null>(null);
  // Replies that arrive after this moment animate in.
  const [freshSince, setFreshSince] = useState<number | null>(null);
  const [chips, setChips] = useState<BuildChip[] | null>(null);
  const [log, setLog] = useState<Record<string, string[]>>({});
  const [buildDone, setBuildDone] = useState(false);
  const [lengthPick, setLengthPick] = useState<DocLength | null>(null);
  const length: DocLength = proposal?.document.options.length ?? lengthPick ?? settings?.defaults.docLength ?? "two_page";
  const busy = !!working && !working.resolved;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<((retry?: { request: string; attachments: PreparedAttachment[] }, opts?: { soundPlayed?: boolean }) => Promise<void>) | null>(null);
  useEffect(() => prepareBuildSounds(), []);
  useWakeLock(busy);

  const chat = useMemo(() => proposal?.chat ?? [], [proposal?.chat]);
  const lastAssistant = [...chat].reverse().find((t) => t.role === "assistant");

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    if (!chat.length && !busy && !failed) return;
    const t = setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }), 60);
    return () => clearTimeout(t);
  }, [chat.length, busy, failed]);

  const send = async (retry?: { request: string; attachments: PreparedAttachment[] }, opts: { soundPlayed?: boolean; local?: boolean } = {}) => {
    if (busy) return;
    const typed = draft.trim();
    const request = retry?.request ?? (answering && typed ? `Answering your question "${answering}": ${typed}` : typed || (files.length ? "Build the proposal from the attached files." : ""));
    const attachments = retry?.attachments ?? files;
    if (!request) return;
    const first = !proposal;
    const withAI = useAI && !opts.local;
    // Sounds must start inside the tap for iPhone to allow them later.
    if (first) {
      if (!opts.soundPlayed) playBuildStart();
    } else unlockBuildSounds();
    const steps = stepsFor(withAI, first, withAI && wantsLookup(request, first));
    setFailed(null);
    setDraft("");
    setFiles([]);
    setAnswering(null);
    setWorking({ request, attachments, steps, step: "read", first, startedAt: Date.now() });
    setFreshSince(Date.now() - 1000);
    if (first) {
      setChips(briefChips(request));
      setLog(composeLog(request, withAI, length, { attachments: attachments.length, memoryWords: withAI ? memoryWords : 0 }));
      setBuildDone(false);
    }
    // Each step stays on screen long enough to read, even when it finishes instantly.
    const minMs = first ? 1300 : 700;
    let chain = Promise.resolve();
    let last = 0;
    const known = new Set(steps.map((s) => s.key));
    const paced = (st: ComposeStep) => {
      if (!known.has(st)) return;
      chain = chain.then(async () => {
        if (last) await new Promise((r) => setTimeout(r, Math.max(0, minMs - (performance.now() - last))));
        last = performance.now();
        setWorking((w) => (w ? { ...w, step: st } : w));
      });
    };
    try {
      const r = await composeTurn({ proposalId: proposal?.id ?? null, request, attachments, useAI: withAI, length, onStep: paced });
      await chain;
      await new Promise((res) => setTimeout(res, Math.max(0, minMs - (performance.now() - last))));
      if (first) {
        setLocalId(r.proposal.id);
        router.replace(`/compose?id=${r.proposal.id}`);
        setWorking((w) => (w ? { ...w, resolved: true } : w));
        setBuildDone(true);
        playBuildDone();
      } else {
        setWorking(null);
        playBuildStep();
      }
    } catch (e) {
      await chain;
      setWorking(null);
      setChips(null);
      setFailed({ request, attachments, message: e instanceof Error ? e.message : "The engine couldn't finish that request." });
    }
  };

  const finishBuild = useCallback(() => {
    setChips(null);
    setWorking(null);
    setBuildDone(false);
  }, []);

  // ?q= fills the box; go=1 sends it right away (from the dashboard command bar).
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || !aiReady) return;
    const q = params.get("q");
    if (!q) return;
    autoSent.current = true;
    if (params.get("go") === "1" && !params.get("id")) {
      router.replace("/compose");
      // The dashboard tap already played the start sound.
      void sendRef.current?.({ request: q, attachments: [] }, { soundPlayed: true });
    } else setDraft(q);
  }, [aiReady, params, router]);
  sendRef.current = send;

  const chooseLength = async (v: DocLength) => {
    setLengthPick(v);
    if (settings) void db().settings.put({ ...settings, defaults: { ...settings.defaults, docLength: v } });
    // On an existing proposal the length changes the document right away: same information, condensed to fit.
    if (proposal && !busy) await saveProposal({ ...proposal, document: { ...proposal.document, options: { ...proposal.document.options, length: v } } });
  };

  const undo = async (t: ChatTurn) => {
    if (!t.beforeVersionId) return;
    try {
      await restoreVersion(t.beforeVersionId);
      setFreshSince(null);
      toast("Undone. The proposal is back to how it was before that request.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't undo", "error");
    }
  };

  const newChat = () => {
    setLocalId(null);
    setFailed(null);
    setDraft("");
    setFiles([]);
    setFreshSince(null);
    router.push("/compose");
  };

  const ask = (q: string) => {
    setAnswering(q);
    inputRef.current?.focus();
  };

  const title = proposal ? proposal.customer.name || proposal.property.name || proposal.title : "Proposal Engine";
  const showEmpty = !proposal && !busy && !failed && loaded !== undefined;
  const overlay = !!chips && !!working?.first;
  const isFresh = (t: ChatTurn) => freshSince != null && new Date(t.at).getTime() >= freshSince;

  return (
    <>
      {overlay && working && chips && <BuildSequence mode={working.steps.some((x) => x.key === "apply") ? "ai" : "offline"} steps={working.steps} current={working.step} done={buildDone} chips={chips} log={log} onFinished={finishBuild} />}
      <PageHeader
        vtTarget
        title={title}
        eyebrow={<EngineStatus useAI={useAI} online={online} memoryWords={memoryWords} />}
        back="/"
        actions={
          <>
            {proposal && (
              <Link href={`/proposal?id=${proposal.id}&step=0`} className="btn-secondary !px-3 !py-2 text-[13px]" aria-label="Edit details">
                <PencilLine size={15} /> <span className="hidden sm:inline">Edit details</span>
              </Link>
            )}
            {(proposal || chat.length > 0) && (
              <button className="rounded-full p-2 text-ink2 hover:bg-surface2 hover:text-ink" onClick={newChat} aria-label="New proposal">
                <SquarePen size={19} />
              </button>
            )}
          </>
        }
      />
      <ChatBody
        dock={
          <Dock
            inputRef={inputRef}
            draft={draft}
            setDraft={setDraft}
            files={files}
            setFiles={setFiles}
            answering={answering}
            clearAnswering={() => setAnswering(null)}
            busy={busy}
            useAI={useAI}
            length={length}
            onLength={chooseLength}
            onSend={() => void send()}
            isNew={!proposal}
          />
        }
      >
        {showEmpty && <EmptyHero useAI={useAI} online={online} memoryWords={memoryWords} onPick={(t) => (setDraft(t), inputRef.current?.focus())} />}

        {proposal && chat.length === 0 && !busy && (
          <AssistantShell label="ENGINE · READY">
            <p className="text-[15px] leading-relaxed">
              Loaded <span className="font-semibold">{proposal.title}</span>. Tell me what to change: prices, frequency, findings, scope, tone or length. I’ll update the proposal and the PDF.
            </p>
          </AssistantShell>
        )}

        <div className="space-y-3">
          {chat.map((t) =>
            t.role === "user" ? (
              <UserBubble key={t.id} text={t.text} attachments={t.attachments ?? []} />
            ) : (
              <AssistantCard key={t.id} t={t} fresh={isFresh(t)} hold={overlay} latest={t.id === lastAssistant?.id && !busy} onAsk={ask} onUndo={() => void undo(t)} />
            ),
          )}
          {busy && working && <UserBubble text={working.request} attachments={working.attachments.map((a) => ({ name: a.name, kind: a.kind }))} previews={working.attachments.map((a) => a.preview)} />}
          {busy && working && !working.first && <WorkingCard working={working} />}
          {failed && (
            <AssistantShell label="ENGINE · FAULT" tone="red">
              <p className="text-[14.5px] leading-relaxed">{failed.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary !py-2 text-[13.5px]" onClick={() => void send(failed)}>
                  <RotateCcw size={15} /> Try again
                </button>
                {useAI && (
                  <button className="btn-ghost !py-2 text-[13.5px]" onClick={() => void send(failed, { local: true })}>
                    Use the local engine instead
                  </button>
                )}
              </div>
            </AssistantShell>
          )}
        </div>

        {proposal && <DocPanel proposal={proposal} paused={busy} fresh={freshSince != null} />}
      </ChatBody>
    </>
  );
}

// ─────────────────────────── Layout ───────────────────────────

/** Conversation column plus a dock that sits above the keyboard on iPhone. */
function ChatBody({ children, dock }: { children: React.ReactNode; dock: React.ReactNode }) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(140);
  const inset = useKeyboardInset();
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <main className="px-safe mx-auto max-w-3xl pt-4" style={{ paddingBottom: dockH + 24 }}>
        {children}
      </main>
      <div ref={dockRef} className="dock-fade fixed inset-x-0 bottom-0 z-40 lg:left-[232px]" style={inset ? { transform: `translateY(-${inset}px)` } : undefined}>
        {dock}
      </div>
    </>
  );
}

/** How far the on-screen keyboard covers the bottom of the layout viewport (iOS doesn't resize it). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => {
      const v = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(v > 60 ? v : 0);
    };
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    on();
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return inset;
}

function EngineStatus({ useAI, online, memoryWords }: { useAI: boolean; online: boolean; memoryWords: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx("relative inline-flex h-1.5 w-1.5", useAI ? "text-ok" : "text-ink3")}>
        {useAI && <span className="build-ping absolute inset-0 rounded-full bg-current" />}
        <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {useAI ? "Claude" : online ? "Local engine" : "Offline"}
      <span className="text-ink3/60">·</span>
      <span className={memoryWords ? "" : "text-warn"}>{memoryWords ? "Memory loaded" : "No memory"}</span>
    </span>
  );
}

// ─────────────────────────── Empty state ───────────────────────────

function EmptyHero({ useAI, online, memoryWords, onPick }: { useAI: boolean; online: boolean; memoryWords: number; onPick: (t: string) => void }) {
  return (
    <div className="pt-4">
      <div className="flex flex-col items-center text-center">
        <EngineEmblem />
        <h2 className="hud-title mt-5 font-display text-[30px] font-bold uppercase leading-none tracking-tight">What do you need?</h2>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink2">Ask for a proposal the way you would in a chat. Short or detailed, with findings, photos or PDFs. You’ll get a customer-ready document right away, then refine it by replying.</p>
      </div>

      <div className="stagger mt-5 flex flex-wrap justify-center gap-1.5">
        {[
          useAI ? ["ok", "Claude linked"] : ["neutral", online ? "Local engine" : "Offline"],
          memoryWords ? ["ok", `Master memory · ${memoryWords.toLocaleString()} words`] : ["warn", "Master memory not loaded"],
          ["neutral", "Prices only as you state them"],
          ["neutral", "Terms verbatim"],
        ].map(([tone, label]) => (
          <span key={label} className={clsx("hud-mono rounded-md border px-2 py-1 text-[10px] uppercase", tone === "ok" ? "border-ok/30 text-ok" : tone === "warn" ? "border-warn/40 text-warn" : "border-white/10 text-ink3")}>
            {label}
          </span>
        ))}
      </div>

      {!memoryWords && (
        <p className="mt-3 text-center text-[12.5px] text-ink3">
          Your proposal instructions live in the master memory.{" "}
          <Link href="/settings#private" className="font-medium text-red">
            Unlock your private data
          </Link>{" "}
          to load it.
        </p>
      )}
      {!useAI && (
        <p className="mt-3 text-center text-[12.5px] text-ink3">
          Without Claude, the local engine builds a standard proposal from the basics.{" "}
          <Link href="/settings#ai" className="font-medium text-red">
            Connect Claude
          </Link>{" "}
          for research, findings and custom writing.
        </p>
      )}

      <div className="hud-section mt-7">Try</div>
      <div className="stagger mt-2.5 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((t) => (
          <button key={t} onClick={() => onPick(t)} className="card press p-3.5 text-left text-[13.5px] leading-snug text-ink2 hover:text-ink">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small idle reactor: the same language as the build sequence, at rest. */
function EngineEmblem() {
  return (
    <div className="hud-in relative h-28 w-28">
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full overflow-visible">
        <g className="hud-r1" style={{ transformOrigin: "60px 60px" }}>
          <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2;
            const long = i % 3 === 0;
            return <line key={i} x1={60 + Math.cos(a) * (long ? 50 : 52.5)} y1={60 + Math.sin(a) * (long ? 50 : 52.5)} x2={60 + Math.cos(a) * 56} y2={60 + Math.sin(a) * 56} stroke={long ? "rgba(255,51,85,0.75)" : "rgba(255,255,255,0.22)"} strokeWidth={long ? 1 : 0.5} />;
          })}
        </g>
        <g className="hud-r2" style={{ transformOrigin: "60px 60px" }}>
          <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="26 8 3 8" />
        </g>
        <g className="hud-r4" style={{ transformOrigin: "60px 60px" }}>
          <circle cx="60" cy="60" r="33" fill="none" stroke="#E4002B" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 38" />
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="engine-core h-9 w-9 rounded-full bg-red" />
      </div>
    </div>
  );
}

// ─────────────────────────── Messages ───────────────────────────

function UserBubble({ text, attachments, previews }: { text: string; attachments: { name: string; kind: "image" | "pdf" | "text" }[]; previews?: (string | undefined)[] }) {
  return (
    <div className="msg-user flex justify-end">
      <div className="max-w-[86%]">
        {attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
            {attachments.map((a, i) =>
              previews?.[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.name + i} src={previews[i]} alt={a.name} className="h-16 w-16 rounded-xl border border-white/10 object-cover" />
              ) : (
                <span key={a.name + i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface2 px-2 py-1 text-[12px] text-ink2">
                  {a.kind === "image" ? <ImageIcon size={13} /> : <FileText size={13} />}
                  <span className="max-w-[160px] truncate">{a.name}</span>
                </span>
              ),
            )}
          </div>
        )}
        <div className="whitespace-pre-wrap rounded-[20px] rounded-br-md bg-red/90 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-lg shadow-red/10">{text}</div>
      </div>
    </div>
  );
}

function AssistantShell({ label, children, tone, time }: { label: string; children: React.ReactNode; tone?: "red"; time?: string }) {
  return (
    <Card hud className={clsx("msg-in", tone === "red" && "border-red/40")}>
      <div className="hud-eyebrow mb-2 flex items-center gap-2">
        <span className={clsx("h-1.5 w-1.5 rounded-full", tone === "red" ? "bg-red" : "bg-ok")} />
        {label}
        {time && <span className="ml-auto">{time}</span>}
      </div>
      {children}
    </Card>
  );
}

function AssistantCard({ t, fresh, hold, latest, onAsk, onUndo }: { t: ChatTurn; fresh: boolean; hold: boolean; latest: boolean; onAsk: (q: string) => void; onUndo: () => void }) {
  const [text, revealed] = useReveal(t.text, fresh, hold);
  const time = new Date(t.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <AssistantShell label={`ENGINE · ${t.mode === "offline" ? "LOCAL" : "CLAUDE"}`} time={time}>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
        {text}
        {!revealed && <span className="hud-blink ml-0.5 text-red">▌</span>}
      </p>
      {revealed && (
        <div className={clsx(fresh && "stagger")}>
          {!!t.changes?.length && (
            <div className="mt-3">
              <div className="hud-mono mb-1.5 text-[10px] uppercase text-ink3">Changes</div>
              <ul className="space-y-1">
                {t.changes.map((c) => (
                  <li key={c} className="flex gap-2 text-[13.5px] leading-snug text-ink2">
                    <span className="hud-mono shrink-0 text-red">Δ</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!t.assumptions?.length && (
            <div className="mt-3">
              <div className="hud-mono mb-1.5 text-[10px] uppercase text-ink3">Assumed · verify before sending</div>
              <ul className="space-y-1">
                {t.assumptions.map((c) => (
                  <li key={c} className="flex gap-2 text-[13.5px] leading-snug text-ink2">
                    <span className="hud-mono mt-[3px] shrink-0 self-start rounded border border-warn/40 px-1 text-[9px] uppercase leading-[14px] text-warn">Est</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!t.guards?.length && (
            <div className="mt-3">
              <div className="hud-mono mb-1.5 text-[10px] uppercase text-ink3">Guardrails</div>
              <ul className="space-y-1">
                {t.guards.map((c) => (
                  <li key={c} className="flex gap-2 text-[13.5px] leading-snug text-ink2">
                    <span className="hud-mono mt-[3px] shrink-0 self-start rounded border border-info/40 px-1 text-[9px] uppercase leading-[14px] text-info">Guard</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!t.questions?.length && (
            <div className="mt-3">
              <div className="hud-mono mb-1.5 text-[10px] uppercase text-ink3">Need from you</div>
              <div className="flex flex-col gap-1.5">
                {t.questions.map((q) => (
                  <button key={q} onClick={() => onAsk(q)} className="rounded-xl border border-white/10 bg-surface2/70 px-3 py-2 text-left text-[13.5px] leading-snug transition hover:border-red/40">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!!t.core?.length && <CoreStrip core={t.core} />}
          {latest && t.beforeVersionId && (
            <button className="hud-mono mt-3 flex items-center gap-1.5 text-[11px] uppercase text-ink3 hover:text-ink" onClick={onUndo}>
              <RotateCcw size={12} /> Undo this change
            </button>
          )}
        </div>
      )}
    </AssistantShell>
  );
}

/** Reveals a new reply word by word (about a second and a half). `hold` waits, e.g. behind the build screen. */
function useReveal(text: string, active: boolean, hold: boolean): [string, boolean] {
  const parts = useMemo(() => text.split(/(\s+)/), [text]);
  const [n, setN] = useState(active ? 0 : parts.length);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(parts.length);
    setN(0);
    if (hold) return;
    const per = Math.max(10, Math.min(36, 1500 / parts.length));
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setN(i);
      if (i >= parts.length) clearInterval(t);
    }, per * 2);
    return () => clearInterval(t);
  }, [active, hold, parts]);
  return [parts.slice(0, n).join(""), n >= parts.length];
}

/** Core information every proposal must carry, as a segmented readout. */
function CoreStrip({ core }: { core: NonNullable<ChatTurn["core"]> }) {
  const [open, setOpen] = useState(false);
  const ok = core.filter((c) => c.ok).length;
  const all = ok === core.length;
  return (
    <div className="mt-3 border-t hairline pt-2.5">
      <button className="flex w-full items-center gap-2.5" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="hud-mono text-[10px] font-semibold uppercase text-ink3">Core</span>
        <span className="flex flex-1 gap-[3px]">
          {core.map((c, i) => (
            <span key={c.item} className={clsx("core-seg h-[5px] flex-1 rounded-[1px]", c.ok ? "bg-ok/80" : "bg-warn")} style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </span>
        <span className={clsx("num hud-mono text-[11px] font-semibold", all ? "text-ok" : "text-warn")}>
          {ok}/{core.length}
        </span>
        <ChevronDown size={14} className={clsx("text-ink3 transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div className={clsx("collapse-grid", open && "collapse-open")}>
        <div className="overflow-hidden">
          <ul className="grid gap-1 pt-2.5 sm:grid-cols-2">
            {core.map((c) => (
              <li key={c.item} className="flex gap-2 text-[12.5px] leading-snug">
                {c.ok ? <Check size={14} className="mt-px shrink-0 text-ok" /> : <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />}
                <span>
                  <span className={c.ok ? "text-ink2" : "text-ink"}>{c.item}</span>
                  {c.note && <span className="block text-ink3">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function WorkingCard({ working }: { working: Working }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - working.startedAt) / 1000));
  const idx = Math.max(0, working.steps.findIndex((x) => x.key === working.step));
  const label = working.steps[idx]?.label ?? "Working";
  return (
    <Card hud className="msg-in overflow-hidden">
      <div className="hud-eyebrow flex items-center gap-2">
        <span className="build-ping-dot h-1.5 w-1.5 rounded-full bg-red" />
        Engine · working
        <span className="num ml-auto">T+{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>
      </div>
      <div key={label} className="hud-swap mt-2 text-[15px] font-semibold" aria-live="polite">
        {label}
      </div>
      <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-white/10">
        <div className="work-bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-red to-transparent" />
      </div>
      <ol className="mt-3 flex gap-1">
        {working.steps.map((x, i) => (
          <li key={x.key} className="flex-1">
            <div className={clsx("h-[3px] rounded-full transition-colors duration-500", i < idx ? "bg-ok/80" : i === idx ? "bg-red" : "bg-white/10")} />
          </li>
        ))}
      </ol>
      {working.steps.some((x) => x.key === "compose") && idx <= working.steps.findIndex((x) => x.key === "compose") && <div className="mt-2 text-[12px] text-ink3">Claude rewrites the full proposal on each change. This can take a minute or two.</div>}
    </Card>
  );
}

// ─────────────────────────── Document ───────────────────────────

function DocPanel({ proposal, paused, fresh }: { proposal: Proposal; paused: boolean; fresh: boolean }) {
  const toast = useToast();
  const [pdf, setPdf] = useState<{ key: string; blob: Blob; previews: string[] } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const key = `${proposal.id}:${proposal.updatedAt}`;
  const fileBase = safeFileName(`${proposal.customer.name || proposal.property.name} ${proposal.title}`);

  useEffect(() => {
    if (paused || pdf?.key === key) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const { generateCustomerPdf, renderPreviews } = await import("@/lib/pdf/client");
        const assets = await db().assets.where("proposalId").equals(proposal.id).toArray();
        const blob = await generateCustomerPdf(proposal, assets);
        const previews = await renderPreviews(blob, 760);
        if (!cancelled) setPdf({ key, blob, previews });
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? `PDF: ${e.message}` : "Couldn't render the PDF", "error");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setRendering(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, paused]);

  const exportPdf = async (mode: "share" | "download") => {
    if (!pdf) return;
    await snapshotVersion(proposal, "Exported customer PDF");
    const name = `${fileBase}.pdf`;
    if (mode === "download") return downloadBlob(pdf.blob, name);
    const r = await shareOrDownload(pdf.blob, name, proposal.title);
    if (r === "downloaded") toast("Sharing isn’t available here. The PDF was downloaded instead.", "info");
  };

  const pages = pdf?.previews ?? [];
  const lengthLabel = LENGTH_OPTIONS.find((o) => o.value === (proposal.document.options.length ?? "full"))?.label ?? "";
  return (
    <section className="mt-5">
      <div className="hud-section mb-2.5 flex items-center">
        <span>Document</span>
        <span className="ml-auto flex items-center gap-1.5 font-normal normal-case tracking-normal">
          {rendering ? (
            <>
              <Spinner size={12} /> <span className="hud-mono text-[10px] uppercase">Rendering</span>
            </>
          ) : (
            pdf && <span className="hud-mono text-[10px] uppercase">{pages.length} {pages.length === 1 ? "page" : "pages"} · portrait · {lengthLabel === `${pages.length} ${pages.length === 1 ? "page" : "pages"}` ? "fitted" : lengthLabel}</span>
          )}
        </span>
      </div>
      <Card hud pad={false} className="overflow-hidden">
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto p-3 [scrollbar-width:none]">
          {pages.length === 0 &&
            [0, 1].map((i) => (
              <div key={i} className="doc-skeleton relative aspect-[8.5/11] w-[46%] shrink-0 overflow-hidden rounded-lg bg-surface2 sm:w-[32%]" />
            ))}
          {pages.map((src, i) => (
            <button key={`${pdf?.key}:${i}`} onClick={() => setViewer(i)} className={clsx("doc-page relative w-[46%] shrink-0 snap-start overflow-hidden rounded-lg border border-white/10 bg-white sm:w-[32%]", fresh && "doc-scan")} style={{ animationDelay: `${i * 90}ms` }} aria-label={`Open page ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Page ${i + 1}`} className={clsx("block w-full transition-opacity duration-300", rendering && "opacity-40")} />
              <span className="hud-mono absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/85">{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-t hairline p-3">
          <button className="btn-primary !py-3" disabled={!pdf || rendering} onClick={() => void exportPdf("share")}>
            <Share size={17} /> Send PDF
          </button>
          <button className="btn-secondary !px-3.5" disabled={!pdf || rendering} onClick={() => void exportPdf("download")} aria-label="Download PDF">
            <Download size={17} />
          </button>
          <button className="btn-secondary !px-3.5" disabled={!pdf} onClick={() => setViewer(0)} aria-label="View full size">
            <Maximize2 size={17} />
          </button>
        </div>
      </Card>
      <p className="mt-2 text-center text-[12px] text-ink3">
        Want to set something by hand?{" "}
        <Link href={`/proposal?id=${proposal.id}&step=0`} className="font-medium text-red">
          Edit details
        </Link>{" "}
        ·{" "}
        <Link href={`/proposal?id=${proposal.id}&step=7`} className="font-medium text-red">
          Full quality check
        </Link>
      </p>
      {viewer != null && pages.length > 0 && <PageViewer pages={pages} start={viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}

function PageViewer({ pages, start, onClose }: { pages: string[]; start: number; onClose: () => void }) {
  const refs = useRef<(HTMLImageElement | null)[]>([]);
  useEffect(() => {
    refs.current[start]?.scrollIntoView({ block: "start" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [start, onClose]);
  return (
    <div className="viewer-in fixed inset-0 z-[85] overflow-y-auto bg-black/92 backdrop-blur-md" role="dialog" aria-label="Proposal pages">
      <div className="pt-safe sticky top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-4 pt-3">
        <span className="hud-mono text-[10px] uppercase text-white/60">{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
        <button className="rounded-full bg-white/10 p-2 text-white" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="pb-safe mx-auto max-w-2xl space-y-3 px-3 pb-8">
        {pages.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} ref={(el) => void (refs.current[i] = el)} src={src} alt={`Page ${i + 1}`} className="doc-page block w-full rounded-md bg-white shadow-2xl" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Dock ───────────────────────────

function Dock(props: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (v: string | ((s: string) => string)) => void;
  files: PreparedAttachment[];
  setFiles: (f: PreparedAttachment[] | ((f: PreparedAttachment[]) => PreparedAttachment[])) => void;
  answering: string | null;
  clearAnswering: () => void;
  busy: boolean;
  useAI: boolean;
  length: DocLength;
  onLength: (v: DocLength) => void;
  onSend: () => void;
  isNew: boolean;
}) {
  const { inputRef, draft, setDraft, files, setFiles, answering, busy, useAI } = props;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = useState(false);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => setMicOk(!!getRecognition()), []);

  // The box grows with the text, up to about a third of the screen.
  const placeholder = busy ? "Working…" : props.isNew ? "Describe the proposal…" : "Ask for a change…";
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.34))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [draft, placeholder, inputRef]);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setAttaching(true);
    for (const f of Array.from(list).slice(0, Math.max(0, 12 - files.length))) {
      try {
        const a = await prepareAttachment(f);
        setFiles((x) => [...x, a]);
        if (!useAI && a.kind !== "text") toast("Claude isn’t connected, so photos and PDFs are saved with the proposal but not read.", "info");
      } catch (e) {
        toast(e instanceof Error ? e.message : `Couldn't read ${f.name}`, "error");
      }
    }
    setAttaching(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    const base = draft ? `${draft.trimEnd()} ` : "";
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setDraft((base + said).replace(/\s+/g, " "));
    };
    r.onerror = (e) => {
      setListening(false);
      toast(e.error === "not-allowed" ? "Microphone permission was denied. Use the keyboard dictation key instead." : `Dictation stopped (${e.error}).`, "warn");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      toast("Couldn't start dictation.", "error");
    }
  };

  const canSend = !busy && !attaching && (draft.trim().length > 0 || files.length > 0);
  const send = () => {
    if (!canSend) return;
    if (listening) rec.current?.stop();
    props.onSend();
  };

  return (
    <div className="pb-safe mx-auto max-w-3xl px-3 pt-6">
      {answering && (
        <div className="msg-in mb-2 flex items-start gap-2 rounded-xl border border-red/30 bg-red/[0.07] px-3 py-2 text-[12.5px] leading-snug">
          <span className="hud-mono shrink-0 text-[10px] uppercase text-red">Answering</span>
          <span className="min-w-0 flex-1 text-ink2">{answering}</span>
          <button onClick={props.clearAnswering} className="text-ink3 hover:text-ink" aria-label="Cancel answer">
            <X size={15} />
          </button>
        </div>
      )}
      {(files.length > 0 || attaching) && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {files.map((f, i) => (
            <span key={f.name + i} className="msg-in relative flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-surface2 py-1 pl-1 pr-7 text-[12px] text-ink2">
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface3 text-ink3">
                  <FileText size={15} />
                </span>
              )}
              <span className="max-w-[130px] truncate">{f.name}</span>
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink3 hover:text-ink" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={14} />
              </button>
            </span>
          ))}
          {attaching && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[12px] text-ink3">
              <Spinner size={12} /> Reading
            </span>
          )}
        </div>
      )}
      <div className={clsx("dock-panel flex items-end gap-1 rounded-[24px] border border-white/10 bg-surface/95 p-1.5 backdrop-blur-xl", busy && "dock-busy")}>
        <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf,.pdf,.docx,.txt,.md,.csv" onChange={(e) => void addFiles(e.target.files)} />
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink2 transition hover:bg-surface2 hover:text-ink" onClick={() => fileRef.current?.click()} aria-label="Attach photos or files" disabled={busy}>
          <Paperclip size={19} />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="max-h-[34vh] min-h-[40px] flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[16px] leading-[1.35] text-ink outline-none placeholder:text-ink3"
          aria-label="Message the proposal engine"
        />
        {micOk && (
          <button className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition", listening ? "mic-live bg-red/15 text-red" : "text-ink2 hover:bg-surface2 hover:text-ink")} onClick={toggleMic} aria-label={listening ? "Stop dictation" : "Dictate"} disabled={busy}>
            {listening ? <Square size={15} fill="currentColor" /> : <Mic size={19} />}
          </button>
        )}
        <button data-silent className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition duration-300", canSend ? "send-ready bg-red text-white" : "bg-surface3 text-ink3")} onClick={send} disabled={!canSend} aria-label="Send">
          {busy ? <Spinner size={16} /> : <ArrowUp size={20} strokeWidth={2.4} />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 px-2 pb-2">
        <LengthMenu value={props.length} onChange={props.onLength} disabled={busy} />
        <span className="hud-mono ml-auto truncate text-[10px] uppercase text-ink3">{listening ? <span className="text-red">Listening…</span> : useAI ? "Prices only as you state them" : "Local engine"}</span>
      </div>
    </div>
  );
}

/** Compact length control for the dock: a HUD menu that opens upward. */
function LengthMenu({ value, onChange, disabled }: { value: DocLength; onChange: (v: DocLength) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const label = LENGTH_OPTIONS.find((o) => o.value === value)?.label ?? "";
  return (
    <div ref={ref} className="relative">
      <button className="hud-mono flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase text-ink2 transition hover:border-white/20" onClick={() => setOpen(!open)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
        <span className="text-ink3">Length</span>
        <span className="font-semibold text-ink">{label}</span>
        <ChevronDown size={11} className={clsx("text-ink3 transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="menu-up absolute bottom-full left-0 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-surface/95 p-1 shadow-2xl backdrop-blur-xl">
          {LENGTH_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition", o.value === value ? "bg-red/[0.12]" : "hover:bg-surface2")}
            >
              <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", o.value === value ? "bg-red shadow-[0_0_6px_rgba(228,0,43,0.9)]" : "bg-white/20")} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">{o.label}</span>
                <span className="block text-[11.5px] leading-snug text-ink3">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Keeps the screen on while Claude writes: iPhone drops the connection when the screen locks. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let done = false;
    const take = () =>
      nav.wakeLock
        ?.request("screen")
        .then((l) => (done ? void l.release() : (lock = l)))
        .catch(() => {});
    void take();
    // The lock is released when the page is hidden; take it again on return.
    const onVis = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
