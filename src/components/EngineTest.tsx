"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { Callout, Spinner } from "@/components/ui";
import { aiFetch, useSettings } from "@/lib/client";
import { BUILD_ID } from "@/lib/build";
import type { ComposeSpecT } from "@/lib/ai/tasks/compose";

/** One tap: send a small real request through the proposal engine and show exactly what happened. */
export function EngineTest() {
  const settings = useSettings();
  const [state, setState] = useState<{ busy?: boolean; ok?: string; err?: string }>({});
  const run = async () => {
    setState({ busy: true });
    const t0 = Date.now();
    try {
      const r = await aiFetch<ComposeSpecT>(
        "/api/ai/compose",
        { request: "Engine test: one-page general pest proposal for a small office at 100 Main St, Troy MI 48084. $95 a month.", transcript: [], current: null, lookupNotes: null, attachments: [], defaults: { length: "one_page", laborRate: "$80.00/hr" } },
        settings,
      );
      setState({ ok: `The proposal engine works. Claude answered in ${Math.round((Date.now() - t0) / 1000)} s with ${r.story.blocks.length} sections.` });
    } catch (e) {
      setState({ err: `${e instanceof Error ? e.message : "The test failed."} (after ${Math.round((Date.now() - t0) / 1000)} s)` });
    }
  };
  return (
    <div className="rounded-xl border hairline p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium">Test the proposal engine</div>
          <div className="hud-mono mt-0.5 text-[10px] uppercase text-ink3">Build {BUILD_ID}</div>
        </div>
        <button className="btn-secondary btn-sm shrink-0" onClick={run} disabled={state.busy}>
          {state.busy ? <Spinner size={14} /> : <Activity size={15} />} {state.busy ? "Testing…" : "Run test"}
        </button>
      </div>
      {state.busy && <p className="mt-2 text-[12.5px] text-ink3">Sends a small sample request to Claude (no customer data). Takes about a minute; keep this screen open.</p>}
      {state.ok && <Callout tone="ok" className="mt-2">{state.ok}</Callout>}
      {state.err && (
        <Callout tone="red" className="mt-2">
          <span className="whitespace-pre-wrap break-words">{state.err}</span>
        </Callout>
      )}
    </div>
  );
}
