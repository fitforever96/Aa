"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensureSeeded } from "./db";
import type { Settings } from "./types";
import { STATIC_BUILD, withBase } from "./base";

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db().settings.get("settings"), []);
}

export interface AIStatus {
  configured: boolean;
  model: string | null;
  passcodeRequired: boolean;
  research: boolean;
  reachable: boolean;
  mode: "server" | "direct" | "none";
}

let serverStatus: AIStatus | null = null;
export function useAIStatus(): AIStatus | null {
  const settings = useSettings();
  const [srv, setSrv] = useState<AIStatus | null>(serverStatus);
  useEffect(() => {
    if (serverStatus) return;
    if (STATIC_BUILD) {
      serverStatus = { configured: false, model: null, passcodeRequired: false, research: false, reachable: true, mode: "none" };
      setSrv(serverStatus);
      return;
    }
    fetch(withBase("/api/ai/status"))
      .then((r) => r.json())
      .then((j) => {
        serverStatus = { ...j, reachable: true, mode: j.configured ? "server" : "none" };
        setSrv(serverStatus);
      })
      .catch(() => setSrv({ configured: false, model: null, passcodeRequired: false, research: false, reachable: false, mode: "none" }));
  }, []);
  if (srv?.configured) return srv;
  if (settings?.ai.apiKey) return { configured: true, model: "claude-opus-5-5", passcodeRequired: false, research: true, reachable: true, mode: "direct" };
  return srv;
}

export class AIError extends Error {}

/**
 * Calls an AI task. Uses the server when one is configured; otherwise calls Claude
 * directly from this device with the user's own key. Enforces explicit consent.
 */
export async function aiFetch<T>(path: string, body: unknown, settings: Settings | undefined): Promise<T> {
  if (!settings?.ai.consent) throw new AIError("AI features are off. Enable “Allow sending proposal content to the AI provider” in Settings › AI & Research.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new AIError("You are offline. AI and research features need a connection; everything else keeps working.");
  if (!serverStatus?.configured) {
    if (!settings.ai.apiKey) throw new AIError("Add your Claude API key in Settings › AI & Research to turn on AI features.");
    const { runDirect } = await import("./ai/direct");
    try {
      return await runDirect<T>(path, body, settings);
    } catch (e) {
      throw new AIError(e instanceof Error ? e.message : "AI request failed.");
    }
  }
  const res = await fetch(withBase(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(settings.ai.accessToken ? { "x-studio-token": settings.ai.accessToken } : {}) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new AIError(j.error ?? `Request failed (${res.status})`);
  return j as T;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useSeeded() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ensureSeeded()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : "Storage unavailable"));
  }, []);
  return { ready, error };
}

export function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** iOS share sheet (Save to Files, Mail, AirDrop…) with download fallback. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function safeFileName(s: string) {
  return (s || "Proposal").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "Proposal";
}
