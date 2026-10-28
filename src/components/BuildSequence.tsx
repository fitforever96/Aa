"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";
import { playBuildStep } from "@/lib/chime";

export interface BuildChip {
  icon: ReactNode;
  text: string;
}

const SEGMENTS = 72;

/** Smoothly animates a number toward a moving target (for the percent readout and ring). */
function useEased(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const x = from + (target - from) * (1 - Math.pow(1 - k, 3));
      cur.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function clock(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Reactor({ progress, done, pulseKey }: { progress: number; done: boolean; pulseKey: string }) {
  const lit = Math.round(progress * SEGMENTS);
  return (
    <div className="hud-in relative h-[min(64vw,31vh,280px)] w-[min(64vw,31vh,280px)] shrink-0">
      <div className={clsx("hud-sweep absolute inset-[9%] rounded-full", done && "opacity-0 transition-opacity duration-700")} />
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full overflow-visible">
        {/* Segmented progress ring */}
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const a = (i / SEGMENTS) * 360 - 90;
          const on = i < lit;
          return (
            <rect
              key={i}
              x="147.5"
              y="6"
              width="5"
              height="15"
              rx="1"
              transform={`rotate(${a + 90} 150 150)`}
              fill={done ? "rgb(var(--ok))" : on ? "#E4002B" : "rgba(255,255,255,0.09)"}
              style={{ transition: `fill 0.25s ease ${done ? i * 8 : 0}ms`, filter: on && !done ? "drop-shadow(0 0 3px rgba(228,0,43,0.9))" : undefined }}
            />
          );
        })}
        <g className="hud-r1" style={{ transformOrigin: "150px 150px" }}>
          <circle cx="150" cy="150" r="124" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const long = i % 5 === 0;
            return <line key={i} x1={150 + Math.cos(a) * (long ? 116 : 120)} y1={150 + Math.sin(a) * (long ? 116 : 120)} x2={150 + Math.cos(a) * 124} y2={150 + Math.sin(a) * 124} stroke={long ? "rgba(255,51,85,0.9)" : "rgba(255,255,255,0.25)"} strokeWidth={long ? 1.2 : 0.6} />;
          })}
        </g>
        <g className={clsx("hud-r2", done && "build-settle")} style={{ transformOrigin: "150px 150px" }}>
          <circle cx="150" cy="150" r="104" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeDasharray="60 16 6 16" />
        </g>
        <g className={clsx("hud-r3", done && "build-settle")} style={{ transformOrigin: "150px 150px" }}>
          <circle cx="150" cy="150" r="90" fill="none" stroke={done ? "rgb(var(--ok))" : "#E4002B"} strokeWidth="3" strokeLinecap="round" strokeDasharray="28 66" />
        </g>
        <g className={clsx("build-orbit", done && "build-settle")} style={{ transformOrigin: "150px 150px" }}>
          <circle cx="150" cy="40" r="3.4" fill="#FF3355" />
          <circle cx="150" cy="260" r="2.3" fill="rgba(255,255,255,0.8)" />
          <line x1="150" y1="44" x2="150" y2="70" stroke="rgba(255,51,85,0.5)" strokeWidth="0.8" />
        </g>
        <g className="hud-r4" style={{ transformOrigin: "150px 150px" }}>
          <polygon points={Array.from({ length: 6 }, (_, i) => `${150 + Math.cos((i * Math.PI) / 3) * 70},${150 + Math.sin((i * Math.PI) / 3) * 70}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        </g>
      </svg>
      {/* A shockwave on every locked step */}
      <div key={pulseKey} className="hud-shock-step absolute inset-[22%] rounded-full" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={clsx("build-core relative flex h-[92px] w-[92px] items-center justify-center rounded-full", done ? "bg-ok build-core-done" : "bg-red")}>
          {done ? <Check size={42} strokeWidth={3} className="save-pop text-white" /> : <Sparkles size={36} className="text-white" />}
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen build sequence: a HUD "proposal engine". The reactor's 72-segment ring fills as
 * each real build step completes, a live log types out what the engine is doing with your data,
 * and each locked step fires a shockwave and a lock sound. On completion the ring turns green,
 * the core locks, and the screen blasts away into the result.
 */
export function BuildSequence({ mode, steps, current, done, chips, log, onFinished }: { mode: "ai" | "offline"; steps: { key: string; label: string }[]; current: string | null; done: boolean; chips: BuildChip[]; log: Record<string, string[]>; onFinished: () => void }) {
  const [exiting, setExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const idx = Math.max(0, steps.findIndex((s) => s.key === current));
  // Long steps (Claude writing for a minute or two) keep creeping forward instead of stalling.
  const [stepAge, setStepAge] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    setStepAge(0);
    const t = setInterval(() => setStepAge((performance.now() - t0) / 1000), 1000);
    return () => clearInterval(t);
  }, [idx]);
  useEffect(() => {
    if (done) return;
    const t0 = performance.now();
    const t = setInterval(() => setElapsed((performance.now() - t0) / 1000), 1000);
    return () => clearInterval(t);
  }, [done]);
  const within = 0.35 + 0.55 * (1 - Math.exp(-stepAge / 25));
  const target = done ? 1 : Math.min(0.97, (idx + within) / steps.length);
  const progress = useEased(target, done ? 700 : 1300);
  const pct = Math.round(progress * 100);

  // A lock sound each time a step completes.
  const lastIdx = useRef(-1);
  useEffect(() => {
    if (current && idx > lastIdx.current && lastIdx.current >= 0) playBuildStep();
    lastIdx.current = idx;
  }, [idx, current]);

  useEffect(() => {
    if (!done) return;
    const a = setTimeout(() => setExiting(true), 2100);
    const b = setTimeout(onFinished, 2100 + 750);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [done, onFinished]);

  // Log lines for every step reached so far; the current step's lines arrive one at a time.
  const lines = steps.slice(0, done ? steps.length : idx + 1).flatMap((s, i) => {
    const all = log[s.key] ?? [];
    const n = done || i < idx ? all.length : Math.min(all.length, 1 + Math.floor(stepAge / 2.4));
    return all.slice(0, n).map((l) => ({ key: `${s.key}:${l}`, l }));
  });
  const shown = [...lines, ...(done ? [{ key: "done", l: "STATUS › ALL SYSTEMS NOMINAL" }] : [])].slice(-6);
  const label = done ? "Proposal ready" : steps[idx]?.label ?? "Initializing";

  if (!mounted) return null;
  return createPortal(
    <div className={clsx("intro hud fixed inset-0 z-[90] flex flex-col items-center overflow-y-auto overflow-x-hidden px-5 [&>*]:shrink-0", exiting && "hud-exit pointer-events-none")} role="status" aria-live="polite" aria-label={label}>
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="hud-scan pointer-events-none absolute inset-0" />
      <div className="build-scan" />
      {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "left-3 bottom-3 border-l-2 border-b-2", "right-3 bottom-3 border-r-2 border-b-2"].map((c, i) => (
        <span key={c} className={`hud-corner pointer-events-none absolute h-6 w-6 border-red/70 ${c}`} style={{ animationDelay: `${i * 0.07}s` }} />
      ))}

      {/* Header */}
      <div className="pt-safe relative mt-4 flex w-full max-w-md items-start justify-between">
        <div>
          <div className="hud-mono hud-type text-[10px] font-semibold text-red">PROPOSAL ENGINE // ORKIN</div>
          <div className="hud-fade mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1" style={{ animationDelay: "0.15s" }}>
            <span className={clsx("relative flex h-2 w-2", mode === "ai" ? "text-ok" : "text-white/50")}>
              {mode === "ai" && <span className="build-ping absolute inset-0 rounded-full bg-current" />}
              <span className="relative h-2 w-2 rounded-full bg-current" />
            </span>
            <span className="hud-mono text-[9.5px] font-semibold text-white/85">{mode === "ai" ? "CLAUDE LINK · CONNECTED" : "LOCAL ENGINE · ONLINE"}</span>
          </div>
        </div>
        <div className="text-right">
          <div className={clsx("num font-display text-[44px] font-bold leading-none", done ? "text-ok" : "text-white")}>
            {pct}
            <span className="text-[20px] text-white/50">%</span>
          </div>
          <div className="hud-mono mt-1 text-[9px] text-white/50">{done ? "COMPLETE" : `STEP ${idx + 1}/${steps.length} · T+${clock(elapsed)}`}</div>
        </div>
      </div>

      {/* Data chips */}
      <div className="relative mt-3 w-full max-w-md overflow-hidden [mask-image:linear-gradient(90deg,black_85%,transparent)]">
        <div className="build-marquee flex w-max gap-1.5">
        {chips.map((c, i) => (
          <span key={c.text} className="build-chip flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-red/30 bg-red/[0.08] px-2 py-1 text-[11.5px] font-medium text-white/90" style={{ animationDelay: `${0.3 + i * 0.13}s` }}>
            <span className="text-red">{c.icon}</span>
            {c.text}
          </span>
        ))}
        </div>
      </div>

      {/* Live log */}
      <div className="hud-mono relative mt-3 h-[86px] w-full max-w-md overflow-hidden rounded-md border border-white/[0.07] bg-black/30 px-3 py-2 text-[9.5px] leading-[13px] text-white/60">
        {shown.map(({ key, l }, i) => (
          <div key={key} className={clsx("hud-type truncate", i === shown.length - 1 && !done && "text-white", key === "done" && "text-ok")}>
            {l}
          </div>
        ))}
        {!done && <span className="hud-blink text-red">▌</span>}
      </div>

      {/* Reactor */}
      <div className="relative mt-3">
        <Reactor progress={progress} done={done} pulseKey={done ? "done" : String(idx)} />
      </div>

      {/* Current step */}
      <div className="relative mt-3 h-8 w-full max-w-md text-center">
        <div key={label} className="hud-swap absolute inset-x-0 whitespace-nowrap font-display text-[min(5.4vw,23px)] font-bold uppercase tracking-wide text-white">
          {label}
        </div>
      </div>

      <ol className="relative mt-3 w-full max-w-[320px] space-y-1">
        {steps.map((s, i) => {
          const state = done || i < idx ? "done" : i === idx ? "now" : "next";
          return (
            <li key={s.key} className={clsx("flex items-center gap-2.5 text-[12.5px] transition-colors duration-500", state === "next" ? "text-white/35" : state === "now" ? "text-white" : "text-white/70")}>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? <Check size={14} className="save-pop text-ok" /> : state === "now" ? <span className="build-ping-dot h-2 w-2 rounded-full bg-red" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/25" />}
              </span>
              <span className="flex-1">{s.label}</span>
              <span className={clsx("hud-mono text-[9px]", state === "done" ? "text-ok" : state === "now" ? "text-red" : "text-white/30")}>{state === "done" ? "LOCKED" : state === "now" ? "ACTIVE" : "QUEUED"}</span>
            </li>
          );
        })}
      </ol>

      {mode === "ai" && !done && <div className="pb-safe relative mb-5 mt-auto pt-4 text-center text-[11px] text-white/45">Claude is researching and writing. This takes 1 to 3 minutes.</div>}
      {exiting && <div className="hud-flash pointer-events-none absolute inset-0" />}
    </div>,
    document.body,
  );
}
