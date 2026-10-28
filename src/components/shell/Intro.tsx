"use client";

import { useEffect, useRef, useState } from "react";
import { introSoundEnabled, playChime, prepareChime } from "@/lib/chime";

const SEEN_KEY = "ops-intro-seen";
const MIN_MS = 5400;
const EXIT_MS = 750;

function seenThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

const BOOT = [
  "ORKIN // PROPOSAL STUDIO",
  "BOOT SEQUENCE ............ 0x2A9F",
  "› ESTIMATING CORE ........ ONLINE",
  "› PRICING ENGINE ......... ONLINE",
  "› PDF COMPOSER ........... ONLINE",
  "› AI LINK ................ ARMED",
  "› BRANCH 693 · DETROIT ... LINKED",
  "ALL SYSTEMS NOMINAL",
];

/** Rising counter for HUD readouts. */
function useCounter(to: number, startMs: number, durMs: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + startMs;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / durMs));
      setV(Math.round(to * (1 - Math.pow(1 - k, 2))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, startMs, durMs]);
  return v;
}

function Hud() {
  const ticks = Array.from({ length: 120 }, (_, i) => i);
  const nodes = [18, 77, 133, 201, 256, 318];
  return (
    <div className="hud-wrap relative h-[min(86vw,360px)] w-[min(86vw,360px)]">
      <div className="hud-sweep absolute inset-[6%] rounded-full" />
      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full overflow-visible">
        <g className="hud-r1" style={{ transformOrigin: "160px 160px" }}>
          <circle cx="160" cy="160" r="150" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
          {ticks.map((i) => {
            const a = (i / 120) * Math.PI * 2;
            const long = i % 10 === 0;
            const r1 = long ? 141 : 146;
            return <line key={i} x1={160 + Math.cos(a) * r1} y1={160 + Math.sin(a) * r1} x2={160 + Math.cos(a) * 150} y2={160 + Math.sin(a) * 150} stroke={long ? "#E4002B" : "rgba(255,255,255,0.28)"} strokeWidth={long ? 1.4 : 0.6} />;
          })}
          {nodes.map((d, i) => (
            <circle key={d} className="hud-node" style={{ animationDelay: `${0.6 + i * 0.37}s` }} cx={160 + Math.cos((d * Math.PI) / 180) * 150} cy={160 + Math.sin((d * Math.PI) / 180) * 150} r="2.6" fill="#FF3355" />
          ))}
        </g>
        <circle className="hud-draw" cx="160" cy="160" r="156" fill="none" stroke="#E4002B" strokeWidth="1.6" strokeDasharray="980" strokeDashoffset="980" transform="rotate(-90 160 160)" />
        <g className="hud-r2" style={{ transformOrigin: "160px 160px" }}>
          <circle cx="160" cy="160" r="128" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.3" strokeDasharray="70 18 8 18" />
        </g>
        <g className="hud-r3" style={{ transformOrigin: "160px 160px" }}>
          <circle cx="160" cy="160" r="112" fill="none" stroke="#E4002B" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="34 83" />
        </g>
        <g className="hud-r4" style={{ transformOrigin: "160px 160px" }}>
          <polygon points={Array.from({ length: 6 }, (_, i) => `${160 + Math.cos((i * Math.PI) / 3) * 92},${160 + Math.sin((i * Math.PI) / 3) * 92}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
          <circle cx="160" cy="160" r="98" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeDasharray="2 6" />
        </g>
        <g stroke="rgba(255,255,255,0.12)" strokeWidth="0.6">
          <line x1="0" y1="160" x2="40" y2="160" />
          <line x1="280" y1="160" x2="320" y2="160" />
          <line x1="160" y1="0" x2="160" y2="40" />
          <line x1="160" y1="280" x2="160" y2="320" />
        </g>
        {[
          ["000", 160, -6],
          ["090", 330, 164],
          ["180", 160, 334],
          ["270", -12, 164],
        ].map(([t, x, y]) => (
          <text key={t as string} x={x as number} y={y as number} textAnchor="middle" className="hud-mono" fill="rgba(255,255,255,0.35)" fontSize="8">
            {t}
          </text>
        ))}
      </svg>
      <div className="hud-shock absolute inset-[18%] rounded-full" />
    </div>
  );
}

/**
 * Launch sequence: a HUD boot. Boot log types in, reactor rings spin up with a radar
 * sweep, a servo "lock" shockwave lands the ORKIN wordmark (synced to the sound), readouts
 * count up, then everything blasts outward into the app. Once per launch; tap to skip.
 */
export function Intro({ ready, error, onExit }: { ready: boolean; error: string | null; onExit: () => void }) {
  // Decided after mount (session storage isn't available while the page is pre-rendered).
  const [full, setFull] = useState<boolean | null>(null);
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    const f = !seenThisLaunch();
    setFull(f);
    if (!f) setMinDone(true);
  }, []);
  const [phase, setPhase] = useState<"show" | "exit" | "gone">("show");
  const soundPending = useRef(false);

  useEffect(() => {
    if (!full) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const t = setTimeout(() => setMinDone(true), MIN_MS);
    if (introSoundEnabled()) {
      soundPending.current = true;
      prepareChime()
        .then(() => playChime())
        .then((ok) => {
          if (ok) soundPending.current = false;
        });
    }
    return () => clearTimeout(t);
  }, [full]);

  useEffect(() => {
    if (!ready || !minDone || phase !== "show") return;
    setPhase("exit");
    onExit();
  }, [ready, minDone, phase, onExit]);

  useEffect(() => {
    if (phase !== "exit") return;
    const t = setTimeout(() => setPhase("gone"), full ? EXIT_MS : 250);
    return () => clearTimeout(t);
  }, [phase, full]);

  if (phase === "gone") return null;

  const tap = () => {
    // iOS blocks sound until the first tap: the first tap plays it, the next one skips.
    if (soundPending.current) {
      soundPending.current = false;
      void playChime();
      return;
    }
    setMinDone(true);
  };

  if (!full)
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-bg transition-opacity duration-200 ${phase === "exit" ? "pointer-events-none opacity-0" : ""}`}>
        <span className="font-display text-[46px] font-extrabold leading-none text-red">ORKIN</span>
      </div>
    );

  return (
    <div onPointerDown={tap} className={`intro hud fixed inset-0 z-[100] flex items-center justify-center overflow-hidden ${phase === "exit" ? "hud-exit pointer-events-none" : ""}`} role="presentation">
      <IntroLayers />
      {error && <div className="absolute bottom-24 max-w-xs px-6 text-center text-[13px] text-red">Local storage is unavailable ({error}). Private browsing can block IndexedDB.</div>}
      {phase === "exit" && <div className="hud-flash pointer-events-none absolute inset-0" />}
    </div>
  );
}

function IntroLayers() {
  const pct = useCounter(100, 1600, 3000);
  const sys = useCounter(100, 200, 1400);
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setMs(performance.now() - t0), 47);
    return () => clearInterval(id);
  }, []);
  const clock = `T+${String(Math.floor(ms / 1000)).padStart(2, "0")}:${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
  return (
    <>
      <div className="hud-grid absolute inset-0" />
      <div className="hud-scan absolute inset-0" />
      <div className="intro-glow" />
      {/* Corner brackets */}
      {["left-4 top-4 border-l-2 border-t-2", "right-4 top-4 border-r-2 border-t-2", "left-4 bottom-4 border-l-2 border-b-2", "right-4 bottom-4 border-r-2 border-b-2"].map((c, i) => (
        <span key={c} className={`hud-corner pointer-events-none absolute h-7 w-7 border-red/70 ${c}`} style={{ animationDelay: `${0.1 + i * 0.08}s`, marginTop: c.includes("top") ? "env(safe-area-inset-top)" : undefined, marginBottom: c.includes("bottom") ? "env(safe-area-inset-bottom)" : undefined }} />
      ))}
      {/* Boot log */}
      <div className="hud-mono pt-safe absolute left-6 top-8 space-y-[3px] text-[9.5px] leading-tight text-white/60">
        {BOOT.map((l, i) => (
          <div key={l} className={`hud-type ${i === 0 ? "text-red" : i === BOOT.length - 1 ? "text-ok" : ""}`} style={{ animationDelay: `${0.15 + i * 0.16}s` }}>
            {l}
          </div>
        ))}
      </div>
      {/* Readouts */}
      <div className="hud-mono pt-safe absolute right-6 top-8 text-right text-[9.5px] leading-tight text-white/60">
        <div className="hud-type" style={{ animationDelay: "0.2s" }}>
          SYS <span className="text-white">{String(sys).padStart(3, "0")}%</span>
        </div>
        <div className="hud-type" style={{ animationDelay: "0.35s" }}>
          LINK <span className="hud-blink text-ok">●</span>
        </div>
        <div className="hud-type text-white/80" style={{ animationDelay: "0.5s" }}>
          {clock}
        </div>
      </div>

      <div className="relative flex flex-col items-center">
        <div className="hud-in">
          <Hud />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-[60px] font-extrabold leading-none tracking-[0.02em] text-red" aria-label="Orkin">
            {"ORKIN".split("").map((ch, i) => (
              <span key={i} className="hud-letter inline-block" style={{ animationDelay: `${1.55 + i * 0.07}s` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="intro-bar mt-3 w-[190px]" style={{ animationDelay: "2.05s" }} />
          <div className="intro-sub mt-3 pl-[0.42em] text-[11px] font-semibold uppercase text-white/75" style={{ animationDelay: "2.3s" }}>
            Proposal Studio
          </div>
        </div>
      </div>

      {/* Bottom: init progress, coordinates, credit */}
      <div className="pb-safe absolute inset-x-6 bottom-10 flex flex-col items-center gap-3">
        <div className="hud-fade w-full max-w-[300px]" style={{ animationDelay: "1.6s" }}>
          <div className="hud-mono mb-1 flex justify-between text-[9px] text-white/55">
            <span>{pct < 100 ? "INITIALIZING" : "READY"}</span>
            <span className="text-white">{String(pct).padStart(3, "0")}%</span>
          </div>
          <div className="h-[2px] w-full overflow-hidden rounded bg-white/10">
            <div className="h-full bg-red shadow-[0_0_8px_rgba(228,0,43,0.9)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="intro-credit text-center text-[10.5px] font-medium uppercase text-white/80" style={{ animationDelay: "3.1s" }}>
          Designed by Anthony Acosta
        </div>
        <div className="hud-mono hud-fade text-[8.5px] text-white/35" style={{ animationDelay: "2.6s" }}>
          42.3314° N · 83.0458° W · DETROIT COMMERCIAL
        </div>
      </div>
    </>
  );
}
