import type { HistoricalPrice, Proposal } from "../types";
import { priceProposal, type ProgramPricingResult } from "../engine/pricing";
import { explainPricing, relevantHistorical } from "../engine/explain";
import { runQC, qcSummary } from "../qc";
import { formatDateLong } from "./model";

export interface InternalModel {
  proposal: Proposal;
  results: ProgramPricingResult[];
  explanations: string[][];
  historical: HistoricalPrice[][];
  qc: ReturnType<typeof qcSummary>;
  qcIssues: { label: string; status: string; detail: string }[];
  dateLabel: string;
}

export function buildInternalModel(p: Proposal, historical: HistoricalPrice[]): InternalModel {
  const results = priceProposal(p);
  const checks = runQC(p);
  return {
    proposal: p,
    results,
    explanations: p.programs.map((pr, i) => explainPricing(p, pr, results[i])),
    historical: p.programs.map((pr) => relevantHistorical(historical, p, pr)),
    qc: qcSummary(checks),
    qcIssues: checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
    dateLabel: formatDateLong(new Date().toISOString()),
  };
}
