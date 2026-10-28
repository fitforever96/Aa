"use client";

import clsx from "clsx";
import type { DocLength } from "@/lib/types";
import { LENGTH_OPTIONS } from "@/lib/pdf/condense";

/** Proposal length: same information at every length, condensed to fit. */
export function LengthPicker({ value, onChange, className }: { value: DocLength; onChange: (v: DocLength) => void; className?: string }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-surface2 p-1" role="radiogroup" aria-label="Proposal length">
        {LENGTH_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx("rounded-xl px-1 py-2 text-[13.5px] font-semibold transition", value === o.value ? "bg-red text-white shadow-md shadow-red/25" : "text-ink2 active:bg-surface")}
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
