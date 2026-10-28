"use client";

import clsx from "clsx";
import type { DocLength } from "@/lib/types";
import { LENGTH_OPTIONS } from "@/lib/pdf/condense";

/** Proposal length: same information at every length, condensed to fit. */
export function LengthPicker({ value, onChange, className }: { value: DocLength; onChange: (v: DocLength) => void; className?: string }) {
  return (
    <div className={className}>
      <div className="relative grid grid-cols-4 gap-1.5 rounded-2xl bg-surface2 p-1" role="radiogroup" aria-label="Proposal length">
        {/* The red highlight slides to the chosen length. */}
        <span aria-hidden className="seg-thumb absolute bottom-1 left-1 top-1 rounded-xl bg-red shadow-md shadow-red/25" style={{ width: "calc((100% - 8px - 18px) / 4)", transform: `translateX(calc(${Math.max(0, LENGTH_OPTIONS.findIndex((o) => o.value === value))} * (100% + 6px)))` }} />
        {LENGTH_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx("relative rounded-xl px-1 py-2 text-[13.5px] font-semibold transition-colors duration-300", value === o.value ? "text-white" : "text-ink2")}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-ink3">
        {LENGTH_OPTIONS.find((o) => o.value === value)?.hint}. Every length includes the same information; shorter ones are written more tightly.
      </p>
    </div>
  );
}
