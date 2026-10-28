"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound } from "lucide-react";
import { Spinner } from "@/components/ui";
import { db } from "@/lib/db";
import type { Settings } from "@/lib/types";

/** Paste-once Claude API key for on-device AI. The key stays in this device's local database only. */
export function ClaudeKeySetup({ settings }: { settings: Settings }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = !!settings.ai.apiKey;

  const connect = async () => {
    const k = key.trim();
    if (!/^sk-ant-/.test(k)) return setMsg({ ok: false, text: "That doesn’t look like a Claude API key. It starts with “sk-ant-”." });
    setBusy(true);
    setMsg(null);
    try {
      const { testKey } = await import("@/lib/ai/direct");
      const text = await testKey(k);
      await db().settings.put({ ...settings, ai: { ...settings.ai, apiKey: k, consent: true }, updatedAt: new Date().toISOString() });
      setKey("");
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn’t connect." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {saved ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-ok/10 px-3.5 py-3">
          <span className="flex items-center gap-2 text-[14px] font-medium text-ok">
            <CheckCircle2 size={17} /> Claude is connected on this device
          </span>
          <button className="btn-ghost btn-sm" onClick={() => confirm("Remove the Claude API key from this device? AI features will turn off.") && db().settings.put({ ...settings, ai: { ...settings.ai, apiKey: "" } })}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <div className="text-[13.5px] leading-relaxed text-ink2">
            Paste your Claude API key once to turn on AI writing, research, scanned-document reading and the assistant. Get it at{" "}
            <a className="inline-flex items-center gap-0.5 text-info" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com <ExternalLink size={12} />
            </a>{" "}
            › API Keys › Create Key.
          </div>
          <div className="flex gap-2">
            <input className="input font-mono" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Claude API key" onKeyDown={(e) => e.key === "Enter" && key && connect()} />
            <button className="btn-primary shrink-0" disabled={busy || !key.trim()} onClick={connect}>
              {busy ? <Spinner /> : <KeyRound size={16} />} Connect
            </button>
          </div>
        </>
      )}
      {msg && <div className={msg.ok ? "text-[13px] text-ok" : "text-[13px] text-red"}>{msg.text}</div>}
    </div>
  );
}
