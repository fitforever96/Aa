import type { PropertyModel, Proposal } from "../types";

/**
 * Transparent estimate-vs-actual statistics. Suggestions are medians of observed
 * actual/estimated ratios — no hidden learning. Applying one requires approval and
 * affects only app-estimated components, never confirmed device times.
 */
export interface CalibrationRow {
  proposalId: string;
  customer: string;
  model: PropertyModel;
  frequency: string;
  technicians: number;
  access: string;
  squareFeet: number | null;
  devices: number;
  services: string[];
  estimated: number;
  actual: number;
  ratio: number;
  date: string;
}

export function collectRows(proposals: Proposal[]): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  for (const p of proposals)
    for (const pr of p.programs)
      for (const a of pr.actuals)
        if (a.estimatedTechnicianMinutes > 0)
          rows.push({
            proposalId: p.id,
            customer: p.customer.name || p.property.name,
            model: p.property.model,
            frequency: pr.frequency.kind,
            technicians: a.technicians,
            access: p.property.accessLevel,
            squareFeet: p.property.squareFeet,
            devices: pr.equipment.reduce((s, e) => s + e.quantity, 0),
            services: pr.services,
            estimated: a.estimatedTechnicianMinutes,
            actual: a.actualTechnicianMinutes,
            ratio: a.actualTechnicianMinutes / a.estimatedTechnicianMinutes,
            date: a.date,
          });
  return rows;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface GroupStat {
  key: string;
  n: number;
  medianRatio: number;
  meanRatio: number;
  mape: number;
  suggestion: string | null;
}

export function groupStats(rows: CalibrationRow[], by: (r: CalibrationRow) => string): GroupStat[] {
  const g = new Map<string, CalibrationRow[]>();
  for (const r of rows) g.set(by(r), [...(g.get(by(r)) ?? []), r]);
  return [...g.entries()]
    .map(([key, rs]) => {
      const ratios = rs.map((r) => r.ratio);
      const med = median(ratios);
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      const mape = rs.reduce((s, r) => s + Math.abs(r.actual - r.estimated) / r.actual, 0) / rs.length;
      const suggestion = rs.length >= 3 && Math.abs(med - 1) >= 0.05 ? `Actual time runs ${med > 1 ? "+" : ""}${Math.round((med - 1) * 100)}% vs. estimate (median of ${rs.length} visits). Consider a ${med.toFixed(2)} calibration factor on estimated components.` : rs.length < 3 ? `Need ${3 - rs.length} more observation(s) before suggesting an adjustment.` : null;
      return { key, n: rs.length, medianRatio: med, meanRatio: mean, mape, suggestion };
    })
    .sort((a, b) => b.n - a.n);
}

export function sizeBand(sq: number | null) {
  if (!sq) return "Unknown size";
  if (sq < 10000) return "< 10k sq ft";
  if (sq < 50000) return "10k–50k sq ft";
  if (sq < 200000) return "50k–200k sq ft";
  return "200k+ sq ft";
}
