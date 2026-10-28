"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Calculator, FolderOpen, Home, Plus, Settings as Cog, WifiOff } from "lucide-react";
import { ToastProvider } from "./Toast";
import { useOnline, useSeeded, useSettings } from "@/lib/client";
import { Wordmark } from "../ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/estimates", label: "Estimates", icon: Calculator },
  { href: "/new", label: "New", icon: Plus, primary: true },
  { href: "/library", label: "Library", icon: FolderOpen },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
];

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
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => setSplashDone(true), 350);
      return () => clearTimeout(t);
    }
  }, [ready]);

  useEffect(() => {
    if (settings?.theme) {
      document.documentElement.dataset.theme = settings.theme;
      try {
        localStorage.setItem("ops-theme", settings.theme);
      } catch {}
    }
  }, [settings?.theme]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <ToastProvider>
      {!splashDone && (
        <div className={clsx("fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg transition-opacity duration-300", ready && "opacity-0")}>
          <Wordmark size={46} />
          <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.32em] text-ink3">Proposal Studio</div>
          {error && <div className="mt-6 max-w-xs text-center text-[13px] text-red">Local storage is unavailable ({error}). Private browsing can block IndexedDB.</div>}
        </div>
      )}
      <div className="lg:pl-[232px]">
        <aside className="pt-safe fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r hairline bg-surface/60 px-3 pb-4 backdrop-blur-xl lg:flex">
          <div className="px-3 pb-6 pt-6">
            <Wordmark size={28} />
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-ink3">Proposal Studio</div>
          </div>
          <Link href="/new" className="btn-primary mb-4 w-full">
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
        {ready ? children : null}
      </div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t hairline bg-bg/85 backdrop-blur-xl lg:hidden" aria-label="Primary">
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-2 pt-1.5">
          {NAV.map((n) =>
            n.primary ? (
              <Link key={n.href} href={n.href} className="-mt-0.5 flex flex-col items-center px-2" aria-label="New proposal">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red text-white shadow-lg shadow-red/30 transition active:scale-95">
                  <Plus size={24} strokeWidth={2.4} />
                </span>
              </Link>
            ) : (
              <Link key={n.href} href={n.href} className={clsx("flex min-w-[58px] flex-col items-center gap-0.5 px-1 py-1 text-[10.5px] font-medium", active(path, n.href) ? "text-ink" : "text-ink3")}>
                <n.icon size={22} className={active(path, n.href) ? "text-red" : ""} strokeWidth={active(path, n.href) ? 2.2 : 1.8} />
                {n.label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </ToastProvider>
  );
}
