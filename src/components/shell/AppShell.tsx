"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/motion";
import { playUi, prepareUiSounds, type UiSound } from "@/lib/chime";
import { BookOpen, Calculator, FolderOpen, Home, Plus, Settings as Cog, WifiOff } from "lucide-react";
import { ToastProvider } from "./Toast";
import { useOnline, useSeeded, useSettings } from "@/lib/client";
import { Wordmark } from "../ui";
import { withBase } from "@/lib/base";
import { Intro } from "./Intro";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/estimates", label: "Estimates", icon: Calculator },
  { href: "/quick", label: "New", icon: Plus, primary: true },
  { href: "/library", label: "Library", icon: FolderOpen },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
];

/** How deep a screen sits: going deeper slides in from the right, going back from the left. */
function depth(path: string) {
  if (path === "/") return 0;
  if (path.startsWith("/proposal")) return 2;
  return 1;
}

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/library") return path.startsWith("/library") || path.startsWith("/proposal") || path.startsWith("/import");
  return path.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const { ready, error } = useSeeded();
  const settings = useSettings();
  const online = useOnline();
  const [entered, setEntered] = useState(false);
  const prevPath = useRef(path);
  const poppedBack = useRef(false);
  const [dir, setDir] = useState<"forward" | "back" | "same">("same");

  useEffect(() => {
    const onPop = () => (poppedBack.current = true);
    // A short vibration on primary actions where the device supports it (Android).
    const onDown = (e: PointerEvent) => (e.target as HTMLElement | null)?.closest?.(".btn-primary") && haptic();
    // High-tech interface clicks: one listener classifies every tap.
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest || el.closest("input, textarea, select, [data-silent]")) return;
      let kind: UiSound | null = null;
      if (el.closest('nav[aria-label="Primary"] a, aside nav a')) kind = "nav";
      else if (el.closest(".btn-primary")) kind = "confirm";
      else if (el.closest('[role="tab"], [role="radio"], [role="switch"], .chip')) kind = "toggle";
      else if (el.closest("button, a, .card")) kind = "tick";
      if (kind) playUi(kind);
    };
    const idle = setTimeout(() => void prepareUiSounds(), 1500);
    window.addEventListener("popstate", onPop);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("click", onClick, { capture: true, passive: true });
    return () => {
      clearTimeout(idle);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (prevPath.current === path) return;
    const a = depth(prevPath.current);
    const b = depth(path);
    setDir(poppedBack.current || b < a ? "back" : b > a ? "forward" : "same");
    poppedBack.current = false;
    prevPath.current = path;
  }, [path]);
  const onIntroExit = useCallback(() => setEntered(true), []);

  // Dark mode only: clear the light-theme preference older versions may have stored.
  useEffect(() => {
    try {
      localStorage.removeItem("ops-theme");
    } catch {}
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register(withBase("/sw.js"), { scope: withBase("/") })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // Hand already-loaded scripts, styles and fonts to the worker so the app opens offline.
          const urls = [window.location.href, ...performance.getEntriesByType("resource").map((e) => e.name)];
          reg.active?.postMessage({ type: "cache-urls", urls });
        })
        .catch(() => {});
    }
  }, []);

  return (
    <ToastProvider>
      <Intro ready={ready} error={error} onExit={onIntroExit} />
      <div className={clsx("lg:pl-[232px]", entered && "app-enter")}>
        <aside className="pt-safe fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r hairline bg-surface/60 px-3 pb-4 backdrop-blur-xl lg:flex">
          <div className="px-3 pb-6 pt-6">
            <Wordmark size={28} />
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-ink3">Proposal Studio</div>
          </div>
          <Link href="/quick" className="btn-primary mb-4 w-full">
            <Plus size={18} /> New Proposal
          </Link>
          <nav className="flex flex-col gap-0.5">
            {NAV.filter((n) => !n.primary).map((n) => (
              <Link key={n.href} href={n.href} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition", active(path, n.href) ? "bg-surface2 text-ink" : "text-ink2 hover:bg-surface2/60 hover:text-ink")}>
                <n.icon size={18} className={active(path, n.href) ? "text-red" : ""} /> {n.label}
              </Link>
            ))}
            <Link href="/settings" className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition", path.startsWith("/settings") ? "bg-surface2 text-ink" : "text-ink2 hover:bg-surface2/60 hover:text-ink")}>
              <Cog size={18} className={path.startsWith("/settings") ? "text-red" : ""} /> Settings
            </Link>
          </nav>
          <div className="mt-auto px-3 text-[12px] leading-snug text-ink3">
            {settings?.profile.name}
            <br />
            {settings?.profile.title}
          </div>
        </aside>
        {!online && (
          <div className="pt-safe fixed inset-x-0 top-0 z-[70] flex justify-center">
            <div className="mt-1 flex items-center gap-1.5 rounded-full bg-warn/20 px-3 py-1 text-[12px] font-medium text-warn backdrop-blur">
              <WifiOff size={13} /> Offline — drafts save locally
            </div>
          </div>
        )}
        {ready ? (
          <div key={path} className={dir === "forward" ? "page-forward" : dir === "back" ? "page-back" : "page-enter"}>
            {children}
          </div>
        ) : null}
      </div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t hairline bg-bg/85 backdrop-blur-xl lg:hidden" aria-label="Primary">
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-2 pt-1.5">
          {NAV.map((n) =>
            n.primary ? (
              <Link key={n.href} href={n.href} className="-mt-0.5 flex flex-col items-center px-2" aria-label="New proposal">
                <span className="cta-sheen flex h-11 w-11 items-center justify-center rounded-2xl bg-red text-white shadow-lg shadow-red/30 transition active:scale-90">
                  <Plus size={24} strokeWidth={2.4} />
                </span>
              </Link>
            ) : (
              <Link key={n.href} href={n.href} className={clsx("flex min-w-[58px] flex-col items-center gap-0.5 px-1 py-1 text-[10.5px] font-medium", active(path, n.href) ? "text-ink" : "text-ink3")}>
                <n.icon key={active(path, n.href) ? "on" : "off"} size={22} className={active(path, n.href) ? "tab-pop text-red" : "transition-colors"} strokeWidth={active(path, n.href) ? 2.2 : 1.8} />
                {n.label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </ToastProvider>
  );
}
