"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, saveProposal } from "./db";
import type { Proposal } from "./types";
import { priceProposal, type ProgramPricingResult } from "./engine/pricing";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Loads a proposal and keeps an in-memory working copy that is auto-saved to
 * IndexedDB (debounced) — drafts survive refreshes, app switches and offline use.
 */
export function useProposal(id: string | null) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pending = useRef<Proposal | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    db()
      .proposals.get(id)
      .then((p) => {
        if (cancelled) return;
        if (p) setProposal(p);
        else setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await saveProposal(p);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (draft: Proposal) => void | Proposal) => {
      setProposal((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        const res = fn(draft);
        const next = res ?? draft;
        pending.current = next;
        setSaveState("saving");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 350);
        return next;
      });
    },
    [flush],
  );

  const replace = useCallback(
    (next: Proposal) => {
      setProposal(next);
      pending.current = next;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 50);
    },
    [flush],
  );

  const pricing: ProgramPricingResult[] = useMemo(() => (proposal ? priceProposal(proposal) : []), [proposal]);

  return { proposal, missing, update, replace, flush, saveState, pricing };
}
