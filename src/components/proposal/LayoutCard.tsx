"use client";

import { useState } from "react";
import clsx from "clsx";
import { RotateCcw, Sparkles } from "lucide-react";
import { Callout, Card, SectionTitle, Spinner } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { aiStory } from "@/lib/aiActions";
import { useAIStatus, useSettings } from "@/lib/client";
import { relTime } from "@/lib/client";
import type { Proposal } from "@/lib/types";

const LAYOUTS = [
  { value: "story", label: "Portrait proposal", desc: "Dense, argument-driven pages like your own proposals. Recommended." },
  { value: "classic", label: "Classic landscape", desc: "Designed cover and one section per block." },
] as const;

/** Layout choice and the Claude-written story for the portrait layout. */
export function LayoutCard({ p, update, replace }: { p: Proposal; update: (fn: (d: Proposal) => void) => void; replace: (p: Proposal) => void }) {
  const settings = useSettings();
  const ai = useAIStatus();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const layout = p.document.options.layout ?? "story";

  const write = async () => {
    setBusy(true);
    try {
      replace(await aiStory(p, settings, instruction || undefined));
      toast("Claude wrote the proposal. Prices and terms come from your approved figures.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Claude couldn't write the proposal", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle>Layout</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {LAYOUTS.map((l) => (
          <button key={l.value} onClick={() => update((d) => void (d.document.options.layout = l.value))} className={clsx("card p-3 text-left transition", layout === l.value && "!border-red ring-2 ring-red/30")}>
            <div className="text-[14px] font-semibold">{l.label}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-ink3">{l.desc}</div>
          </button>
        ))}
      </div>
      {layout === "story" && (
        <Card className="mt-3 space-y-2.5">
          <div className="text-[13.5px] text-ink2">
            {p.story?.source === "ai" ? (
              <>Written by Claude {relTime(p.story.updatedAt)}. Prices, terms and the price summary always come from your approved figures.</>
            ) : (
              <>Written automatically from this proposal’s details and sections. {ai?.configured ? "Have Claude write it for this specific site:" : "Connect Claude in Settings to have it written for this specific site."}</>
            )}
          </div>
          {ai?.configured && (
            <>
              <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Optional direction, e.g. stress the dock doors and night activity" />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy} onClick={write}>
                  {busy ? <Spinner /> : <Sparkles size={16} />} {p.story?.source === "ai" ? "Rewrite with Claude" : "Write with Claude"}
                </button>
                {p.story && (
                  <button className="btn-ghost" disabled={busy} onClick={() => update((d) => void (d.story = null))}>
                    <RotateCcw size={15} /> Use automatic text
                  </button>
                )}
              </div>
            </>
          )}
          {p.story?.source === "ai" && <Callout tone="info">If you change devices, frequency or scope after this, rewrite so the text matches. Prices update on their own.</Callout>}
        </Card>
      )}
    </div>
  );
}
