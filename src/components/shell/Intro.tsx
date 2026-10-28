"use client";

import { useEffect, useRef, useState } from "react";
import { introSoundEnabled, playChime, prepareChime } from "@/lib/chime";

const SEEN_KEY = "ops-intro-seen";
const MIN_MS = 3200;
const EXIT_MS = 600;

function seenThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Launch animation: the ORKIN letters rise in, a red bar sweeps, "Proposal Studio" opens up,
 * then the screen lifts away into the app. Plays once per app launch. Tap to skip.
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
    <div onPointerDown={tap} className={`intro fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden ${phase === "exit" ? "intro-exit pointer-events-none" : ""}`} role="presentation">
      <div className="intro-glow" />
      <div className="relative flex flex-col items-center">
        <div className="intro-shine font-display text-[64px] font-extrabold leading-none tracking-[0.02em] text-red" aria-label="Orkin">
          {"ORKIN".split("").map((ch, i) => (
            <span key={i} className="intro-letter" style={{ animationDelay: `${0.12 + i * 0.11}s` }}>
              {ch}
            </span>
          ))}
        </div>
        <div className="intro-bar mt-3 w-[210px]" />
        <div className="intro-sub mt-4 pl-[0.42em] text-[12px] font-semibold uppercase text-white/70">Proposal Studio</div>
      </div>
      <div className="intro-credit absolute inset-x-0 text-center text-[10.5px] font-medium uppercase text-white/80" style={{ bottom: "calc(env(safe-area-inset-bottom) + 48px)" }}>
        Designed by Anthony Acosta
      </div>
      {error && <div className="absolute bottom-24 max-w-xs px-6 text-center text-[13px] text-red">Local storage is unavailable ({error}). Private browsing can block IndexedDB.</div>}
    </div>
  );
}
