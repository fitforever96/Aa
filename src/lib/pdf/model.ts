import type { Asset, CoverStyle, DocLength, Proposal, ProposalSection } from "../types";
import { priceProposal } from "../engine/pricing";
import { formatMoney } from "../engine/money";
import { frequencyLabel } from "../engine/frequency";

/**
 * Customer-facing PDF view model. This is the ONLY data the customer document
 * receives: approved scope and prices in the approved billing model. Internal
 * minutes, labor rates, yields, per-door math and notes are never copied here.
 */

export interface PdfPriceLine {
  label: string;
  detail: string;
  amount: string;
  emphasis?: boolean;
}

export interface PdfProgram {
  name: string;
  frequency: string;
  billingLabel: string;
  initial: string | null;
  recurring: string | null;
  recurringBasis: string;
  monthly: string | null;
  equipment: { name: string; location: string; quantity: number; reserve: number; unit: string | null; total: string | null }[];
  equipmentTotal: string | null;
  contractTotal: string | null;
  terms: string;
  services: string[];
}

export interface PdfModel {
  title: string;
  subtitle: string;
  customer: string;
  property: string;
  address: string;
  contact: string;
  dateLabel: string;
  cover: { style: CoverStyle; badge: string; tagline: string; image: string | null; stats: { value: string; label: string }[] };
  preparedBy: { name: string; title: string; phone: string; email: string }[];
  sections: ProposalSection[];
  programs: PdfProgram[];
  specialty: { name: string; description: string; price: string }[];
  schedules: { code: string; title: string; subtitle: string; rateLabel: string; rows: { name: string; address: string; metro: string; units: string; rot: string; apv: string; rate: string }[]; homes: number }[];
  photos: { src: string; caption: string }[];
  floorPlans: { src: string; caption: string }[];
  orientation: "landscape" | "portrait";
  accent: string;
  length: DocLength;
}

export function formatDateLong(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function coverStats(p: Proposal): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  if (p.portfolioSchedules.length) {
    const communities = p.portfolioSchedules.reduce((s, x) => s + x.rows.length, 0);
    const homes = p.portfolioSchedules.reduce((s, x) => s + x.rows.reduce((a, r) => a + (r.units ?? 0), 0), 0);
    out.push({ value: communities.toLocaleString(), label: "Communities" });
    if (homes) out.push({ value: homes.toLocaleString(), label: "Apartment homes" });
    return out;
  }
  if (p.property.apartmentCount) out.push({ value: p.property.apartmentCount.toLocaleString(), label: "Apartment homes" });
  else if (p.property.squareFeet) out.push({ value: p.property.squareFeet.toLocaleString(), label: "Square feet" });
  if (p.property.buildingCount > 1) out.push({ value: String(p.property.buildingCount), label: "Buildings" });
  const devices = p.programs.reduce((s, x) => s + x.equipment.reduce((a, e) => a + e.quantity + (e.reserveQuantity || 0), 0), 0);
  if (devices) out.push({ value: devices.toLocaleString(), label: "Protection devices" });
  if (out.length < 2 && p.programs[0]) out.push({ value: frequencyLabel(p.programs[0].frequency).toUpperCase(), label: "Service" });
  return out.slice(0, 3);
}

export function buildPdfModel(p: Proposal, assets: Asset[]): PdfModel {
  const results = priceProposal(p);
  const a = p.property.address;
  const programs: PdfProgram[] = p.programs.map((pr, i) => {
    const r = results[i];
    const billing = r.billing;
    const monthly = billing?.method === "fixed_monthly" && billing.fixedMonthlyCents != null ? formatMoney(billing.fixedMonthlyCents) : null;
    return {
      name: pr.name,
      frequency: frequencyLabel(pr.frequency),
      billingLabel: billing?.customerLabel ?? (pr.chargeType === "one_time" ? "one-time service" : "per completed service visit"),
      initial: r.initial.finalCents > 0 ? formatMoney(r.initial.finalCents) : null,
      recurring: r.recurring ? formatMoney(r.recurring.finalCents) : null,
      recurringBasis: billing?.method === "fixed_monthly" && monthly ? "per month" : "per completed service visit",
      monthly,
      equipment: pr.equipment
        .filter((e) => e.quantity + (e.reserveQuantity || 0) > 0)
        .map((e) => ({
          name: e.name,
          location: e.location === "interior" ? "Interior" : "Exterior",
          quantity: e.quantity,
          reserve: e.reserveQuantity || 0,
          unit: e.billable && e.unitPriceCents != null ? formatMoney(e.unitPriceCents) : null,
          total: e.billable && e.unitPriceCents != null ? formatMoney(e.unitPriceCents * (e.quantity + (e.reserveQuantity || 0))) : e.billable ? null : "Included",
        })),
      equipmentTotal: r.equipment.lines.length && !r.equipment.unpriced.length ? formatMoney(r.equipment.totalCents) : null,
      contractTotal: r.contractTotal ? `${formatMoney(r.contractTotal.cents)} over ${r.contractTotal.months} months` : null,
      terms: pr.billing.terms,
      services: pr.services,
    };
  });
  const enabled = p.document.sections.filter((s) => s.enabled);
  const byKind = (k: Asset["kind"]) => assets.filter((x) => x.kind === k && x.proposalId === p.id).map((x) => ({ src: x.dataUrl, caption: x.caption }));
  const cover = assets.find((x) => x.id === p.document.coverImageAssetId);
  return {
    title: p.title || "Commercial Pest Management Proposal",
    subtitle: p.subtitle,
    customer: p.customer.name || p.property.name,
    property: p.property.name,
    address: [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" ").replace(/ (\d{5})$/, " $1"),
    contact: [p.customer.contactName, p.customer.contactTitle].filter(Boolean).join(", "),
    dateLabel: formatDateLong(p.document.date),
    cover: {
      style: p.document.coverStyle,
      badge: p.document.coverBadge || (p.customer.name ? `Prepared for ${p.customer.name}` : "Commercial proposal"),
      tagline: p.document.coverTagline,
      image: cover?.dataUrl ?? null,
      stats: p.document.options.showCoverStats ? coverStats(p) : [],
    },
    preparedBy: p.document.preparedBy,
    sections: enabled,
    programs,
    specialty: p.specialtyItems
      .filter((s) => s.approved && s.priceCents != null)
      .map((s) => ({ name: s.name, description: s.description, price: `${s.qualifier ? `${s.qualifier} ` : ""}${formatMoney(s.priceCents)}${s.priceHighCents ? `–${formatMoney(s.priceHighCents)}` : ""}${s.basis ? ` / ${s.basis.replace(/^per /, "")}` : ""}` })),
    schedules: p.portfolioSchedules.map((s) => ({
      code: s.code,
      title: s.title,
      subtitle: s.subtitle,
      rateLabel: s.rateLabel || "Rate / visit",
      homes: s.rows.reduce((x, r) => x + (r.units ?? 0), 0),
      rows: s.rows.map((r) => ({ name: r.name, address: r.address, metro: r.metro, units: r.units?.toLocaleString() ?? "", rot: r.rotationPerMonth?.toString() ?? "", apv: r.aptsPerVisit?.toString() ?? "", rate: r.rateCents != null ? formatMoney(r.rateCents) : "" })),
    })),
    photos: byKind("photo"),
    floorPlans: byKind("floor_plan"),
    orientation: p.document.options.pageOrientation,
    accent: p.document.options.accentHex || "#E4002B",
    length: p.document.options.length ?? "full",
  };
}
