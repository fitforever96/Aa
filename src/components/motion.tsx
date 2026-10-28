"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { reducedMotion } from "@/lib/motion";

/** Smooth expand/collapse to the content's natural height (no fixed heights). */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) setRender(true);
    else {
      const t = setTimeout(() => setRender(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);
  return (
    <div className={clsx("collapse-grid", open && "collapse-open", className)} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">{render ? children : null}</div>
    </div>
  );
}

/** A number that rolls from its previous value to the new one. */
export function useRollingNumber(target: number, ms = 380): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion() || from.current === target) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(k < 1 ? Math.round(a + (target - a) * e) : target);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return v;
}

export function Rolling({ value, format }: { value: number; format: (n: number) => string }) {
  return <>{format(useRollingNumber(value))}</>;
}
