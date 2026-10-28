import type { Proposal, ServiceProgram } from "@/lib/types";
import type { ProgramPricingResult } from "@/lib/engine/pricing";

export interface StepProps {
  proposal: Proposal;
  update: (fn: (d: Proposal) => void | Proposal) => void;
  replace: (p: Proposal) => void;
  pricing: ProgramPricingResult[];
  programIdx: number;
  setProgramIdx: (i: number) => void;
  goStep: (n: number) => void;
}

export function prog(p: Proposal, i: number): ServiceProgram {
  return p.programs[Math.min(i, p.programs.length - 1)];
}
