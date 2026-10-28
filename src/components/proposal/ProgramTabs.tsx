"use client";

import clsx from "clsx";
import { Plus } from "lucide-react";
import { newProgram } from "@/lib/factories";
import type { StepProps } from "./types";

export function ProgramTabs({ proposal, update, programIdx, setProgramIdx, allowAdd = true }: StepProps & { allowAdd?: boolean }) {
  if (proposal.programs.length <= 1 && !allowAdd) return null;
  return (
    <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
      {proposal.programs.map((p, i) => (
        <button key={p.id} onClick={() => setProgramIdx(i)} className={clsx("chip shrink-0", i === programIdx && "chip-on")}>
          {p.name || `Program ${i + 1}`}
        </button>
      ))}
      {allowAdd && (
        <button
          className="chip shrink-0 border-dashed"
          onClick={() => {
            update((d) => {
              const np = newProgram(["general_pest"], { kind: "quarterly" }, d.programs[0]?.technicians ?? 1);
              np.name = `Program ${d.programs.length + 1}`;
              d.programs.push(np);
            });
            setProgramIdx(proposal.programs.length);
          }}
        >
          <Plus size={14} /> Add program
        </button>
      )}
    </div>
  );
}
