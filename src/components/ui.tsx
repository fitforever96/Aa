"use client";

import clsx from "clsx";
import { ChevronLeft, Loader2, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Provenance } from "@/lib/types";
import { dollarsToCents } from "@/lib/engine/money";

export function Wordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={clsx("font-display font-extrabold leading-none tracking-[0.01em] text-red", className)} style={{ fontSize: size }} aria-label="Orkin">
      ORKIN
    </span>
  );
}

export function PageHeader({ title, eyebrow, back, actions, children }: { title: ReactNode; eyebrow?: ReactNode; back?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b hairline bg-bg/85 backdrop-blur-xl">
      <div className="px-safe mx-auto flex max-w-6xl items-center gap-3 py-3">
        {back && (
          <Link href={back} className="-ml-2 rounded-full p-1.5 text-ink2 hover:bg-surface2 hover:text-ink" aria-label="Back">
            <ChevronLeft size={22} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="eyebrow mb-0.5 truncate">{eyebrow}</div>}
          <h1 className="truncate text-[19px] font-semibold tracking-tight">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={clsx("px-safe mx-auto max-w-6xl pb-40 pt-4 lg:pb-16", className)}>{children}</main>;
}

export function Card({ children, className, pad = true, as: As = "div" }: { children: ReactNode; className?: string; pad?: boolean; as?: "div" | "section" }) {
  return <As className={clsx("card", pad && "card-pad", className)}>{children}</As>;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-2.5 mt-6 flex items-end justify-between gap-3 first:mt-0", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink3">{hint}</span>}
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, type = "text", autoComplete, className, inputMode }: { label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; type?: string; autoComplete?: string; className?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input className="input" type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, rows = 4, placeholder, hint, className }: { label?: ReactNode; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: ReactNode; className?: string }) {
  const el = <textarea className="input resize-y leading-relaxed" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  return label ? (
    <Field label={label} hint={hint} className={className}>
      {el}
    </Field>
  ) : (
    <div className={className}>{el}</div>
  );
}

/** Numeric input that keeps the raw string while typing (no jumpy reformatting). */
export function NumberField({ label, value, onChange, min = 0, max, step = 1, suffix, hint, allowNull, stepper, className, decimal }: { label?: ReactNode; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; hint?: ReactNode; allowNull?: boolean; stepper?: boolean; className?: string; decimal?: boolean }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setRaw(value == null ? "" : String(value));
  }, [value]);
  const commit = (s: string) => {
    setRaw(s);
    const clean = s.replace(/,/g, "").trim();
    if (clean === "") return onChange(allowNull ? null : min);
    const n = Number(clean);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max ?? Infinity, Math.max(min, n)));
  };
  const bump = (d: number) => {
    const n = Math.min(max ?? Infinity, Math.max(min, Math.round(((value ?? 0) + d) * 1000) / 1000));
    setRaw(String(n));
    onChange(n);
  };
  const input = (
    <div className="relative flex items-stretch">
      {stepper && (
        <button type="button" className="btn-secondary !rounded-r-none !px-3" onClick={() => bump(-step)} aria-label="Decrease">
          <Minus size={16} />
        </button>
      )}
      <input
        className={clsx("input num", stepper && "!rounded-none text-center", suffix && "pr-14")}
        inputMode={decimal || step < 1 ? "decimal" : "numeric"}
        value={raw}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setRaw(value == null ? "" : String(value));
        }}
        onChange={(e) => commit(e.target.value)}
      />
      {suffix && !stepper && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink3">{suffix}</span>}
      {stepper && (
        <button type="button" className="btn-secondary !rounded-l-none !px-3" onClick={() => bump(step)} aria-label="Increase">
          <Plus size={16} />
        </button>
      )}
    </div>
  );
  return label ? (
    <Field label={label} hint={hint} className={className}>
      {input}
    </Field>
  ) : (
    <div className={className}>{input}</div>
  );
}

export function MoneyField({ label, cents, onChange, hint, placeholder, className }: { label?: ReactNode; cents: number | null; onChange: (c: number | null) => void; hint?: ReactNode; placeholder?: string; className?: string }) {
  const [raw, setRaw] = useState(cents == null ? "" : (cents / 100).toFixed(2));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setRaw(cents == null ? "" : (cents / 100).toFixed(2));
  }, [cents]);
  const el = (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3">$</span>
      <input
        className="input num pl-7"
        inputMode="decimal"
        placeholder={placeholder ?? "0.00"}
        value={raw}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setRaw(cents == null ? "" : (cents / 100).toFixed(2));
        }}
        onChange={(e) => {
          setRaw(e.target.value);
          if (e.target.value.trim() === "") return onChange(null);
          const c = dollarsToCents(e.target.value);
          if (c != null && c >= 0) onChange(c);
        }}
      />
    </div>
  );
  return label ? (
    <Field label={label} hint={hint} className={className}>
      {el}
    </Field>
  ) : (
    <div className={className}>{el}</div>
  );
}

export function Select<T extends string>({ label, value, onChange, options, hint, className }: { label?: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: ReactNode; className?: string }) {
  const el = (
    <select className="input appearance-none bg-[length:16px] pr-9" value={value} onChange={(e) => onChange(e.target.value as T)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888'%3E%3Cpath stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return label ? (
    <Field label={label} hint={hint} className={className}>
      {el}
    </Field>
  ) : (
    el
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={clsx("flex items-start justify-between gap-4 py-2.5", disabled && "opacity-50")}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <div className="text-[15px] font-medium">{label}</div>
        {description && <div className="mt-0.5 text-[13px] leading-snug text-ink3">{description}</div>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={clsx("relative mt-0.5 h-[30px] w-[50px] shrink-0 rounded-full transition", checked ? "bg-red" : "bg-surface3")}>
        <span className={clsx("absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-[23px]" : "left-[3px]")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={clsx("flex rounded-xl bg-surface2 p-1 border hairline", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={clsx("flex-1 whitespace-nowrap rounded-lg font-semibold transition", size === "sm" ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]", value === o.value ? "bg-surface3 text-ink shadow-sm" : "text-ink3 hover:text-ink2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className={clsx("relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-3xl border hairline bg-surface sm:animate-rise sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-3.5">
          <div className="text-[16px] font-semibold">{title}</div>
          <button className="rounded-full p-1.5 text-ink3 hover:bg-surface2 hover:text-ink" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t hairline px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const PROV: Record<Provenance, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-ok/15 text-ok" },
  user: { label: "Measured", cls: "bg-info/15 text-info" },
  estimate: { label: "Estimate", cls: "bg-warn/15 text-warn" },
  calibrated: { label: "Calibrated", cls: "bg-info/15 text-info" },
};
export function ProvenanceBadge({ p }: { p: Provenance }) {
  return <span className={clsx("pill", PROV[p].cls)}>{PROV[p].label}</span>;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "red" | "ok" | "warn" | "info"; className?: string }) {
  const t = { neutral: "bg-surface3 text-ink2", red: "bg-red/15 text-red", ok: "bg-ok/15 text-ok", warn: "bg-warn/15 text-warn", info: "bg-info/15 text-info" }[tone];
  return <span className={clsx("pill", t, className)}>{children}</span>;
}

export function Stat({ label, value, sub, accent, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; accent?: boolean; className?: string }) {
  return (
    <div className={clsx("card relative overflow-hidden p-4", className)}>
      {accent && <span className="absolute inset-y-0 left-0 w-[3px] bg-red" />}
      <div className="eyebrow">{label}</div>
      <div className="num mt-1.5 font-display text-[28px] font-bold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-ink3">{sub}</div>}
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx("animate-spin", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink3">{icon}</div>}
      <div className="text-[16px] font-semibold">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[14px] text-ink3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Row({ label, value, sub, className, strong }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; strong?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-2", className)}>
      <div className="min-w-0">
        <div className={clsx("text-[14px]", strong ? "font-semibold text-ink" : "text-ink2")}>{label}</div>
        {sub && <div className="mt-0.5 text-[12px] leading-snug text-ink3">{sub}</div>}
      </div>
      <div className={clsx("num shrink-0 text-right text-[15px]", strong ? "font-semibold" : "text-ink")}>{value}</div>
    </div>
  );
}

export function Callout({ tone = "info", children, title, className }: { tone?: "info" | "warn" | "red" | "ok"; children: ReactNode; title?: ReactNode; className?: string }) {
  const t = { info: "border-info/30 bg-info/[0.07]", warn: "border-warn/30 bg-warn/[0.08]", red: "border-red/40 bg-red/[0.08]", ok: "border-ok/30 bg-ok/[0.07]" }[tone];
  return (
    <div className={clsx("rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed", t, className)}>
      {title && <div className="mb-0.5 font-semibold text-ink">{title}</div>}
      <div className="text-ink2">{children}</div>
    </div>
  );
}
