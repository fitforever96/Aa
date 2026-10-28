import type { CoverStyle, FrequencySpec, Proposal, ProposalSection, SectionType, ServiceCategory } from "../types";
import { customerPriceMap } from "../engine/pricing";
import { frequencyLabel } from "../engine/frequency";
import { formatMoney } from "../engine/money";
import { nowISO, uid } from "../ids";
import { SEED_EQUIPMENT } from "../seed";
import { allocationFromCatalog, newProgram } from "../factories";

/**
 * Structured change operations produced from natural-language commands (rules or AI).
 * Every op is classified. Writing/design ops apply directly; financial, scope and
 * contractual ops require explicit user approval before they are applied.
 */

export type OpCategory = "writing" | "design" | "analysis" | "financial" | "scope" | "contractual";

export type Op =
  | { op: "set_frequency"; programIndex?: number; frequency: FrequencySpec }
  | { op: "set_equipment_qty"; programIndex?: number; match: string; quantity: number }
  | { op: "add_equipment"; programIndex?: number; catalogItemId: string; quantity: number }
  | { op: "set_price_override"; programIndex?: number; phase: "recurring" | "initial"; cents: number; lock: boolean }
  | { op: "set_labor_rate"; cents: number }
  | { op: "set_technicians"; programIndex?: number; technicians: number }
  | { op: "add_program"; services: ServiceCategory[]; frequency: FrequencySpec; name: string }
  | { op: "add_section"; sectionType: SectionType }
  | { op: "remove_section"; sectionType: SectionType }
  | { op: "toggle_guarantee"; enabled: boolean }
  | { op: "set_cover"; style: CoverStyle }
  | { op: "set_title"; title: string }
  | { op: "rewrite"; target: "all" | SectionType; instruction: string }
  | { op: "condense"; maxPages: number }
  | { op: "show_price_at_rate"; cents: number }
  | { op: "explain_estimate" }
  | { op: "hide_internal_details" };

export function categorize(op: Op): OpCategory {
  switch (op.op) {
    case "set_frequency":
    case "set_equipment_qty":
    case "add_equipment":
    case "set_technicians":
    case "add_program":
      return "scope";
    case "set_price_override":
    case "set_labor_rate":
      return "financial";
    case "toggle_guarantee":
      return "contractual";
    case "remove_section":
      return CONTRACTUAL_SECTIONS.includes(op.sectionType) ? "contractual" : "design";
    case "add_section":
      return CONTRACTUAL_SECTIONS.includes(op.sectionType) ? "contractual" : "writing";
    case "set_cover":
    case "condense":
      return "design";
    case "set_title":
    case "rewrite":
      return "writing";
    case "show_price_at_rate":
    case "explain_estimate":
    case "hide_internal_details":
      return "analysis";
  }
}

export const CONTRACTUAL_SECTIONS: SectionType[] = ["exclusions", "triple_guarantee", "customer_responsibilities", "investment", "specialty_services", "portfolio_schedules", "authorization", "equipment_allocation", "service_frequency"];

export function requiresApproval(op: Op): boolean {
  const c = categorize(op);
  return c === "financial" || c === "scope" || c === "contractual";
}

export function describeOp(op: Op, p: Proposal): string {
  const prog = (i?: number) => p.programs[i ?? 0]?.name ?? "program";
  switch (op.op) {
    case "set_frequency":
      return `Change ${prog(op.programIndex)} frequency to ${frequencyLabel(op.frequency)}`;
    case "set_equipment_qty":
      return `Set “${op.match}” quantity to ${op.quantity} in ${prog(op.programIndex)}`;
    case "add_equipment":
      return `Add ${op.quantity} × ${SEED_EQUIPMENT.find((e) => e.id === op.catalogItemId)?.name ?? op.catalogItemId}`;
    case "set_price_override":
      return `${op.lock ? "Lock" : "Set"} ${op.phase} price at ${formatMoney(op.cents)} for ${prog(op.programIndex)}`;
    case "set_labor_rate":
      return `Use ${formatMoney(op.cents)}/hr labor rate for this proposal`;
    case "set_technicians":
      return `Assign ${op.technicians} technician(s) to ${prog(op.programIndex)}`;
    case "add_program":
      return `Add program “${op.name}” (${frequencyLabel(op.frequency)})`;
    case "add_section":
      return `Add section: ${op.sectionType.replace(/_/g, " ")}`;
    case "remove_section":
      return `Remove section: ${op.sectionType.replace(/_/g, " ")}`;
    case "toggle_guarantee":
      return `${op.enabled ? "Include" : "Remove"} Triple Guarantee section`;
    case "set_cover":
      return `Switch cover to ${op.style.replace(/_/g, " ")}`;
    case "set_title":
      return `Change title to “${op.title}”`;
    case "rewrite":
      return `Rewrite ${op.target === "all" ? "all sections" : op.target.replace(/_/g, " ")}: ${op.instruction}`;
    case "condense":
      return `Condense to about ${op.maxPages} pages without removing essential scope`;
    case "show_price_at_rate":
      return `Show price at ${formatMoney(op.cents)}/hr (analysis only — no change)`;
    case "explain_estimate":
      return "Explain how long this service should take";
    case "hide_internal_details":
      return "Confirm internal labor minutes and rates are excluded from the customer proposal";
  }
}

export interface ApplyResult {
  proposal: Proposal;
  applied: Op[];
  pending: Op[];
  messages: string[];
  needsWriting: Op[]; // ops that require the writer (rewrite/condense)
}

/**
 * Apply ops. Ops requiring approval are only applied when their index is in
 * `approved`. Locked prices can only change through an approved set_price_override.
 */
export function applyOps(proposal: Proposal, ops: Op[], approved: Set<number> = new Set()): ApplyResult {
  let p: Proposal = structuredClone(proposal);
  const applied: Op[] = [];
  const pending: Op[] = [];
  const messages: string[] = [];
  const needsWriting: Op[] = [];
  const pricesBefore = customerPriceMap(proposal);

  ops.forEach((op, i) => {
    if (requiresApproval(op) && !approved.has(i)) {
      pending.push(op);
      return;
    }
    const prog = p.programs[op.op !== "set_labor_rate" && "programIndex" in op && op.programIndex != null ? op.programIndex : 0];
    switch (op.op) {
      case "set_frequency":
        if (prog) {
          prog.frequency = op.frequency;
          prog.chargeType = op.frequency.kind === "one_time" ? "one_time" : "recurring";
        }
        break;
      case "set_equipment_qty": {
        const m = op.match.toLowerCase();
        const a = prog?.equipment.find((e) => e.name.toLowerCase().includes(m) || e.category.toLowerCase().includes(m));
        if (a) a.quantity = op.quantity;
        else messages.push(`No equipment matching “${op.match}” — nothing changed.`);
        break;
      }
      case "add_equipment": {
        const item = SEED_EQUIPMENT.find((e) => e.id === op.catalogItemId);
        if (prog && item) prog.equipment.push(allocationFromCatalog(item, op.quantity));
        break;
      }
      case "set_price_override":
        if (prog) {
          const o = { cents: op.cents, locked: op.lock, lockedAt: op.lock ? nowISO() : null, note: "Approved via assistant command" };
          if (op.phase === "recurring") prog.pricing.recurringOverride = o;
          else prog.pricing.initialOverride = o;
        }
        break;
      case "set_labor_rate":
        p.laborRateOverrideCents = op.cents;
        break;
      case "set_technicians":
        if (prog) prog.technicians = Math.max(1, Math.round(op.technicians));
        break;
      case "add_program": {
        const np = newProgram(op.services, op.frequency, 1);
        np.name = op.name;
        p.programs.push(np);
        break;
      }
      case "add_section":
        if (!p.document.sections.some((s) => s.type === op.sectionType && s.enabled)) {
          const existing = p.document.sections.find((s) => s.type === op.sectionType);
          if (existing) existing.enabled = true;
          else needsWriting.push(op);
        }
        break;
      case "remove_section": {
        const s = p.document.sections.find((x) => x.type === op.sectionType && x.enabled);
        if (s) {
          s.enabled = false;
          const loss = materialContentLost(s);
          if (loss) messages.push(loss);
        }
        break;
      }
      case "toggle_guarantee": {
        const s = p.document.sections.find((x) => x.type === "triple_guarantee");
        if (s) s.enabled = op.enabled;
        else if (op.enabled) needsWriting.push({ op: "add_section", sectionType: "triple_guarantee" });
        break;
      }
      case "set_cover":
        p.document.coverStyle = op.style;
        break;
      case "set_title":
        p.title = op.title;
        break;
      case "rewrite":
      case "condense":
        needsWriting.push(op);
        break;
      case "show_price_at_rate":
      case "explain_estimate":
      case "hide_internal_details":
        break;
    }
    applied.push(op);
  });

  // Safety net: if no financial op was approved, prices must be identical.
  const financialApproved = ops.some((op, i) => approved.has(i) && (categorize(op) === "financial" || categorize(op) === "scope"));
  if (!financialApproved) {
    const diffs = diffPrices(pricesBefore, customerPriceMap(p));
    if (diffs.length) {
      messages.push("Blocked: a non-financial change attempted to alter approved pricing. No changes were applied.");
      return { proposal, applied: [], pending, messages, needsWriting: [] };
    }
  }
  p.updatedAt = nowISO();
  return { proposal: p, applied, pending, messages, needsWriting };
}

export function materialContentLost(s: ProposalSection): string | null {
  if (!s.contractual && !CONTRACTUAL_SECTIONS.includes(s.type)) return null;
  const what: Partial<Record<SectionType, string>> = {
    exclusions: "service exclusions",
    triple_guarantee: "guarantee terms and the agreement-control disclaimer",
    customer_responsibilities: "customer responsibilities",
    investment: "approved pricing",
    specialty_services: "specialty pricing",
    portfolio_schedules: "property schedules and rates",
    authorization: "authorization / signature terms",
    equipment_allocation: "equipment quantities",
    service_frequency: "service frequency commitments",
  };
  return `Removing “${s.headline || s.type}” removes ${what[s.type] ?? "contractual content"} from the customer proposal.`;
}

export function diffPrices(a: Record<string, number>, b: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) if (a[k] !== b[k]) out.push(`${k}: ${a[k] ?? "—"} → ${b[k] ?? "—"}`);
  return out;
}

// ─────────────── AI writing revisions (text only) ───────────────

export interface WritingRevision {
  sectionId?: string;
  sectionType?: SectionType;
  eyebrow?: string;
  headline?: string;
  headlineAccent?: string;
  body?: string;
  items?: { title: string; body: string }[];
  callout?: string;
}

/**
 * Merge AI-generated writing into sections. Only text fields are touched; any
 * other keys an AI response contains (pricing, equipment, frequency…) are ignored.
 * Contractual sections are only rewritten when `allowContractual` is true.
 */
export function applyWritingRevisions(
  proposal: Proposal,
  revisions: unknown[],
  opts: { allowContractual?: boolean; source?: "ai" | "template" } = {},
): { proposal: Proposal; changed: string[]; skipped: string[] } {
  const p: Proposal = structuredClone(proposal);
  const changed: string[] = [];
  const skipped: string[] = [];
  const pricesBefore = customerPriceMap(proposal);
  for (const raw of revisions) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as WritingRevision;
    const s = p.document.sections.find((x) => (r.sectionId && x.id === r.sectionId) || (!r.sectionId && r.sectionType && x.type === r.sectionType));
    if (!s) {
      skipped.push(`No matching section for ${r.sectionId ?? r.sectionType}`);
      continue;
    }
    if ((s.contractual || CONTRACTUAL_SECTIONS.includes(s.type)) && !opts.allowContractual) {
      skipped.push(`“${s.headline || s.type}” contains contractual content and was not rewritten without approval.`);
      continue;
    }
    const str = (v: unknown, max = 6000) => (typeof v === "string" ? v.slice(0, max) : undefined);
    const eyebrow = str(r.eyebrow, 120);
    const headline = str(r.headline, 160);
    const accent = str(r.headlineAccent, 160);
    const body = str(r.body);
    const callout = str(r.callout, 800);
    if (eyebrow !== undefined) s.eyebrow = eyebrow;
    if (headline !== undefined) s.headline = headline;
    if (accent !== undefined) s.headlineAccent = accent;
    if (body !== undefined) s.body = body;
    if (callout !== undefined) s.callout = callout;
    if (Array.isArray(r.items)) s.items = r.items.filter((it) => it && typeof it.title === "string").slice(0, 12).map((it) => ({ title: String(it.title).slice(0, 120), body: String(it.body ?? "").slice(0, 800) }));
    s.source = opts.source ?? "ai";
    s.updatedAt = nowISO();
    changed.push(s.id);
  }
  // Defensive invariant: writing never changes money.
  if (diffPrices(pricesBefore, customerPriceMap(p)).length) throw new Error("Invariant violated: writing revision changed pricing");
  return { proposal: p, changed, skipped };
}

export function newSection(type: SectionType, partial: Partial<ProposalSection> = {}): ProposalSection {
  return {
    id: uid("sec"),
    type,
    eyebrow: "",
    headline: "",
    headlineAccent: "",
    body: "",
    items: [],
    callout: "",
    enabled: true,
    contractual: CONTRACTUAL_SECTIONS.includes(type),
    source: "template",
    sourceRefs: [],
    updatedAt: nowISO(),
    ...partial,
  };
}
