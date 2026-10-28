"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";

export interface BuildChip {
  icon: ReactNode;
  text: string;
}

const R = 90;
const CIRC = 2 * Math.PI * R;

/**
 * Full-screen build animation, in the style of the launch intro: an engine core whose ring fills
 * as each real build step completes, the details read from your note flying in as chips, and a
 * "Claude connected" status. On completion the core turns green and the screen lifts away.
 */
export function BuildSequence({ mode, steps, current, done, chips, onFinished }: { mode: "ai" | "offline"; steps: { key: string; label: string }[]; current: string | null; done: boolean; chips: BuildChip[]; onFinished: () => void }) {
  const [exiting, setExiting] = useState(false);
  const idx = Math.max(0, steps.findIndex((s) => s.key === current));
  const progress = done ? 1 : Math.min(0.94, (idx + 0.55) / steps.length);

  useEffect(() => {
    if (!done) return;
    const a = setTimeout(() => setExiting(true), 1150);
    const b = setTimeout(onFinished, 1150 + 560);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [done, onFinished]);

  const label = done ? "Proposal ready" : steps[idx]?.label ?? "Starting";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Rendered at the document root so no page layer (or the tab bar) can sit above it.
  if (!mounted) return null;

  return createPortal(
    <div className={clsx("intro fixed inset-0 z-[90] flex flex-col items-center overflow-y-auto overflow-x-hidden px-6 [&>*]:shrink-0", exiting && "intro-exit pointer-events-none")} role="status" aria-live="polite" aria-label={label}>
      <div className="build-scan" />
      <div className="intro-glow" style={{ top: "22%" }} />

      <div className="pt-safe relative mt-6 flex flex-col items-center">
        <div className="build-fade text-[11px] font-semibold uppercase tracking-[0.34em] text-white/60">Building your proposal</div>
        <div className="build-fade mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5" style={{ animationDelay: "0.1s" }}>
          <span className={clsx("relative flex h-2 w-2", mode === "ai" ? "text-ok" : "text-white/50")}>
            {mode === "ai" && <span className="build-ping absolute inset-0 rounded-full bg-current" />}
            <span className="relative h-2 w-2 rounded-full bg-current" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">{mode === "ai" ? "Claude connected" : "Built-in engine"}</span>
        </div>
        <div className="mt-3 flex max-w-sm flex-wrap justify-center gap-1.5">
          {chips.map((c, i) => (
            <span key={c.text} className="build-chip flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-white/90" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
              <span className="text-red">{c.icon}</span>
              {c.text}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-5 flex h-[180px] w-[180px] items-center justify-center">
        <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full">
          <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke={done ? "rgb(var(--ok))" : "#E4002B"}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 110 110)"
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease" }}
          />
          <g className={clsx("build-spin", done && "build-settle")} style={{ transformOrigin: "110px 110px" }}>
            <circle cx="110" cy="110" r="74" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeDasharray="2 9" />
          </g>
          <g className={clsx("build-spin-rev", done && "build-settle")} style={{ transformOrigin: "110px 110px" }}>
            <circle cx="110" cy="110" r="60" fill="none" stroke="rgba(228,0,43,0.55)" strokeWidth="2" strokeLinecap="round" strokeDasharray="46 331" />
          </g>
          <g className={clsx("build-orbit", done && "build-settle")} style={{ transformOrigin: "110px 110px" }}>
            <circle cx="110" cy="20" r="3.2" fill="#FF3355" />
            <circle cx="110" cy="200" r="2.2" fill="rgba(255,255,255,0.7)" />
          </g>
        </svg>
        <div className={clsx("build-core relative flex h-[84px] w-[84px] items-center justify-center rounded-full", done ? "bg-ok build-core-done" : "bg-red")}>
          {done ? <Check size={38} strokeWidth={3} className="save-pop text-white" /> : <Sparkles size={34} className="text-white" />}
        </div>
      </div>

      <div className="relative mt-5 h-8 w-full max-w-sm text-center">
        <div key={label} className="build-swap absolute inset-x-0 font-display text-[22px] font-bold uppercase tracking-wide text-white">
          {label}
        </div>
      </div>

      <ol className="relative mt-3 w-full max-w-[290px] space-y-1.5">
        {steps.map((s, i) => {
          const state = done || i < idx ? "done" : i === idx ? "now" : "next";
          return (
            <li key={s.key} className={clsx("flex items-center gap-2.5 text-[13px] transition-colors duration-500", state === "next" ? "text-white/35" : state === "now" ? "text-white" : "text-white/70")}>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? <Check size={14} className="save-pop text-ok" /> : state === "now" ? <span className="build-ping-dot h-2 w-2 rounded-full bg-red" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/25" />}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>

      {mode === "ai" && !done && <div className="relative mt-auto pb-safe mb-6 pt-4 text-center text-[11.5px] text-white/45">Claude is researching and writing. This takes 1 to 3 minutes.</div>}
    </div>,
    document.body,
  );
}
