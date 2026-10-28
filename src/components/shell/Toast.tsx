"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Tone = "ok" | "warn" | "info" | "error";
interface ToastItem { id: number; msg: string; tone: Tone }
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((msg: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "error" ? 6500 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto flex max-w-md animate-rise items-start gap-2.5 rounded-2xl border hairline bg-surface2/95 px-4 py-3 text-[14px] shadow-2xl backdrop-blur-xl")}>
            {t.tone === "ok" ? <CheckCircle2 size={18} className="mt-px shrink-0 text-ok" /> : t.tone === "info" ? <Info size={18} className="mt-px shrink-0 text-info" /> : <AlertTriangle size={18} className={clsx("mt-px shrink-0", t.tone === "error" ? "text-red" : "text-warn")} />}
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
