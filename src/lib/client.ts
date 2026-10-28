"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensureSeeded } from "./db";
import type { Settings } from "./types";

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db().settings.get("settings"), []);
}

export interface AIStatus {
  configured: boolean;
  model: string | null;
  passcodeRequired: boolean;
  research: boolean;
  reachable: boolean;
}

let statusCache: AIStatus | null = null;
export function useAIStatus(): AIStatus | null {
  const [s, setS] = useState<AIStatus | null>(statusCache);
  useEffect(() => {
    if (statusCache) return;
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j) => {
        statusCache = { ...j, reachable: true };
        setS(statusCache);
      })
      .catch(() => setS({ configured: false, model: null, passcodeRequired: false, research: false, reachable: false }));
  }, []);
  return s;
}

export class AIError extends Error {}

/** Calls an AI route. Enforces the user's explicit authorization to share content with the AI provider. */
export async function aiFetch<T>(path: string, body: unknown, settings: Settings | undefined): Promise<T> {
  if (!settings?.ai.consent) throw new AIError("AI features are off. Enable “Allow sending proposal content to the AI provider” in Settings › AI & Research.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new AIError("You are offline. AI and research features need a connection; everything else keeps working.");
  const res = await fetch(path, {
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
