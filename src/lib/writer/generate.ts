import type { Proposal, ProposalKind, ProposalSection, SectionType, ServiceCategory, Settings, VerifiedCapability } from "../types";
import { MODEL_CONTEXT, SERVICE_COPY } from "./library";
import { newSection } from "../commands/ops";
import { frequencyLabel } from "../engine/frequency";
import { SERVICE_LABELS } from "../engine/assumptions";

/**
 * Offline, deterministic proposal writer. Produces customer-specific sections from
 * structured proposal data. It never writes internal labor minutes, rates or yields,
 * and it never states prices in prose — prices render from the pricing engine in
 * dedicated tables so text and numbers cannot drift apart.
 */

export interface WriterContext {
  settings: Settings;
  capabilities: VerifiedCapability[];
  includeGuarantee: boolean;
  includeReporting: boolean;
}

export const SECTION_PLAN: Record<ProposalKind, SectionType[]> = {
  small_commercial: ["executive_overview", "coverage", "service_methodology", "ipm", "equipment_allocation", "service_frequency", "investment", "specialty_services", "customer_responsibilities", "implementation", "exclusions", "authorization"],
  multifamily_rotation: ["executive_overview", "property_assessment", "coverage", "ipm", "service_frequency", "implementation", "investment", "specialty_services", "portfolio_schedules", "customer_responsibilities", "exclusions", "authorization"],
  intensive_treatment: ["executive_overview", "property_assessment", "program_objectives", "pest_specific", "service_methodology", "service_frequency", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "authorization"],
  industrial: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "authorization"],
  government: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "investment", "specialty_services", "customer_responsibilities", "exclusions", "authorization"],
  rfp: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "authorization"],
  portfolio: ["executive_overview", "property_assessment", "coverage", "ipm", "service_frequency", "implementation", "investment", "specialty_services", "portfolio_schedules", "customer_responsibilities", "exclusions", "authorization"],
  consulting: ["executive_overview", "program_objectives", "service_methodology", "documentation", "service_frequency", "investment", "exclusions", "authorization"],
};

export const SECTION_TITLES: Record<SectionType, string> = {
  executive_overview: "Executive Overview",
  property_assessment: "Property Assessment",
  program_objectives: "Program Objectives",
  coverage: "What Your Program Covers",
  service_methodology: "Service Methodology",
  ipm: "Integrated Pest Management",
  equipment_allocation: "Equipment Allocation",
  service_frequency: "Service Frequency",
  pest_specific: "Treatment Strategy",
  documentation: "Documentation & Monitoring",
  investment: "Service Investment",
  specialty_services: "Separately Authorized Services",
  portfolio_schedules: "Property Schedules",
  customer_responsibilities: "Customer Responsibilities",
  implementation: "Implementation",
  review_milestones: "Review Milestones",
  triple_guarantee: "Orkin Commercial Triple Guarantee",
  reporting_capability: "Service Visibility",
  exclusions: "Exclusions",
  authorization: "Program Authorization",
  photos: "Site Photos",
  floor_plans: "Floor Plans",
  custom: "Custom Section",
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function customerName(p: Proposal) {
  return p.customer.name || p.property.name || "your organization";
}
function siteName(p: Proposal) {
  return p.property.name || p.customer.name || "the property";
}
function services(p: Proposal): ServiceCategory[] {
  const s = new Set<ServiceCategory>();
  p.programs.forEach((pr) => pr.services.forEach((x) => s.add(x)));
  return [...s];
}
function pestWords(p: Proposal) {
  return list(services(p).map((s) => SERVICE_LABELS[s].toLowerCase().replace(/ (control|management|program|treatments?)$/, "")));
}
function deviceSummary(p: Proposal) {
  const parts: string[] = [];
  for (const pr of p.programs)
    for (const e of pr.equipment) if (e.quantity > 0) parts.push(`${e.quantity + (e.reserveQuantity || 0)} ${e.name.toLowerCase()}${e.quantity + (e.reserveQuantity || 0) === 1 ? "" : "s"}`.replace(/(trap|station|device|light|monitor|board)ss$/, "$1s"));
  return parts;
}

export function generateSection(type: SectionType, p: Proposal, ctx: WriterContext): ProposalSection {
  const cust = customerName(p);
  const site = siteName(p);
  const env = MODEL_CONTEXT[p.property.model];
  const svc = services(p);
  const primary = p.programs[0];
  const freq = primary ? frequencyLabel(primary.frequency).toLowerCase() : "scheduled";
  const sqft = p.property.squareFeet ? `${p.property.squareFeet.toLocaleString()}-square-foot ` : "";
  const devices = deviceSummary(p);
  const s = (partial: Partial<ProposalSection>) => newSection(type, { headline: SECTION_TITLES[type], ...partial });

  switch (type) {
    case "executive_overview": {
      const scope = devices.length ? ` The program is built around ${list(devices)}, serviced on a ${freq} schedule,` : ` Service is delivered on a ${freq} schedule,`;
      return s({
        eyebrow: "Executive Overview",
        headline: p.kind === "multifamily_rotation" || p.kind === "portfolio" ? "A program built for" : "A program built for",
        headlineAccent: p.kind === "portfolio" ? `how ${cust} operates.` : `${site}.`,
        body: [
          `Orkin proposes a ${svc.length > 1 ? "coordinated" : "focused"} ${pestWords(p)} program for ${site}${p.property.address.city ? ` in ${p.property.address.city}${p.property.address.state ? `, ${p.property.address.state}` : ""}` : ""}. The approach applies Integrated Pest Management to the specific conditions of this ${sqft}${env.environment}: inspect first, treat where pests live and travel, and document what is found so each visit builds on the last.`,
          `${scope.trim()} with findings and recommendations recorded after every visit. Pricing, frequency and scope are presented in this proposal exactly as approved.`,
        ].join("\n\n"),
        callout: p.property.facilityNotes ? "" : "",
      });
    }
    case "property_assessment": {
      const facts: string[] = [];
      if (p.property.propertyType) facts.push(p.property.propertyType);
      if (p.property.squareFeet) facts.push(`approximately ${p.property.squareFeet.toLocaleString()} sq ft`);
      if (p.property.buildingCount > 1) facts.push(`${p.property.buildingCount} buildings`);
      if (p.property.floorCount > 1) facts.push(`${p.property.floorCount} floors`);
      if (p.property.apartmentCount) facts.push(`${p.property.apartmentCount.toLocaleString()} apartment homes`);
      const conditions = Object.entries(p.property.conditions)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([, v]) => String(v).trim())
        .slice(0, 4);
      return s({
        eyebrow: "Property Assessment",
        headline: "Understanding the site.",
        headlineAccent: "Planning the response.",
        body: [
          `${site}${facts.length ? ` — ${list(facts)}` : ""}${p.property.operatingEnvironment ? ` — operates as ${p.property.operatingEnvironment.toLowerCase()}` : ""}. Service planning reflects the areas that carry the most pest risk rather than treating every square foot the same.`,
          conditions.length ? conditions.map((c) => `- ${c}`).join("\n") : "",
          "Conditions described in this proposal reflect information provided to date. Entry points, activity levels and device locations are confirmed on site during the initial service.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        items: env.risks.slice(0, 3),
      });
    }
    case "program_objectives":
      return s({
        eyebrow: "Program Objectives",
        headline: "Clear objectives.",
        headlineAccent: "Measured follow-through.",
        body: "The program is designed around outcomes that can be observed and documented over time.",
        items: [
          ...svc.slice(0, 4).map((x) => ({ title: SERVICE_COPY[x].coverageTitle, body: SERVICE_COPY[x].objective })),
          { title: "Documented performance", body: "Record activity, conditions and recommendations each visit so program decisions are based on evidence." },
        ].slice(0, 6),
      });
    case "coverage":
      return s({
        eyebrow: "What Your Program Covers",
        headline: "Core protection.",
        headlineAccent: "Clearly defined. Repeated. Documented.",
        body: `Routine service applies to the contracted service areas at ${site}. Treatments are selected based on observed conditions, pest biology and product labels.`,
        items: svc.filter((x) => x !== "custom").slice(0, 6).map((x) => ({ title: SERVICE_COPY[x].coverageTitle, body: SERVICE_COPY[x].card })),
        callout: "Quoted separately: bed bugs, intensive cleanouts, exclusion, specialized equipment and other out-of-scope work require written approval unless listed in this proposal.",
      });
    case "service_methodology":
      return s({
        eyebrow: "Service Methodology",
        headline: "How every visit works.",
        headlineAccent: "",
        body: svc
          .slice(0, 3)
          .map((x) => SERVICE_COPY[x].methodology)
          .join("\n\n"),
        items: [
          { title: "Inspect", body: "Review the scheduled service areas, devices and reported activity." },
          { title: "Treat + service", body: "Service equipment and apply targeted treatments where conditions warrant." },
          { title: "Document", body: "Record findings, conducive conditions and recommendations." },
        ],
      });
    case "ipm": {
      const aim = ctx.capabilities.find((c) => c.id === "cap_aim");
      return s({
        eyebrow: "Orkin A.I.M.®",
        headline: "A better way to keep pests out.",
        body: aim?.customerFacingText ?? "Integrated Pest Management combines ongoing assessment, targeted action and monitoring.",
        items: [
          { title: "Identify the root cause", body: "Inspect the scheduled spaces, identify activity and flag sanitation, moisture, structural, access and environmental risks." },
          { title: "Tailor the response", body: "Use proven prevention methods, appropriate devices and targeted treatments. Recommend repairs and sanitation improvements where needed." },
          { title: "Verify performance", body: "Review monitoring, treatment history, callbacks and recurring conditions; adjust the response according to findings." },
        ],
        callout: "A.I.M. is a continuous service process, not a one-time chemical application. Product selection and use follow approved labels and site conditions.",
      });
    }
    case "equipment_allocation":
      return s({
        eyebrow: "Equipment Allocation",
        headline: "The right device.",
        headlineAccent: "In the right place.",
        body: devices.length
          ? `Equipment is allocated to intercept pests along the routes they travel — exterior devices at the perimeter, interior devices at entry points, wall lines and risk areas. Final placement is confirmed on site and mapped during installation.`
          : "No equipment is included in the current scope.",
      });
    case "service_frequency": {
      const lines = p.programs.map((pr) => `- ${pr.name}: ${frequencyLabel(pr.frequency)}${pr.billing.method === "fixed_monthly" && pr.billing.fixedMonthlyApproved ? " (billed monthly)" : pr.chargeType === "recurring" ? " (billed per completed service visit)" : ""}`);
      return s({
        eyebrow: "Service Frequency",
        headline: "The right frequency.",
        headlineAccent: p.kind === "multifamily_rotation" ? "The right apartment allocation." : "For the pressure on site.",
        body: [
          p.kind === "multifamily_rotation"
            ? "Service is structured to provide consistent inspection opportunities, sufficient unit capacity and follow-up time. Each property’s visit frequency, rotation minimum, unit allocation and price appear in the attached schedules."
            : `Visit frequency reflects the activity, risk areas and equipment at ${site}.`,
          lines.join("\n"),
          primary?.frequency.kind === "weekly" ? "Weekly service follows the calendar; some months include five scheduled visits." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        callout: p.kind === "multifamily_rotation" ? "Rotation targets are subject to resident access, reported pest activity and property-specific service priorities." : "",
      });
    }
    case "pest_specific":
      return s({
        eyebrow: "Treatment Strategy",
        headline: "An intensive start.",
        headlineAccent: "A sustained follow-through.",
        body: svc.map((x) => SERVICE_COPY[x].methodology).join("\n\n"),
        items: [
          { title: "Initial treatment", body: "Concentrated inspection and treatment of affected areas to reduce active populations." },
          { title: "Follow-up", body: "Scheduled follow-up visits verify results and address remaining activity." },
          { title: "Sanitation coordination", body: "Findings are shared with management so contributing conditions are corrected." },
        ],
      });
    case "documentation":
      return s({
        eyebrow: "Documentation & Monitoring",
        headline: "Every visit documented.",
        headlineAccent: "",
        body: "Each service produces a record of the areas serviced, pest activity observed, devices serviced and recommendations for the site team.",
        items: [
          { title: "Service records", body: "Work completed, areas serviced and products applied." },
          { title: "Activity + trends", body: "Device activity and recurring conditions tracked over time." },
          { title: "Recommendations", body: "Sanitation, structural and access items prioritized for management." },
        ],
      });
    case "reporting_capability": {
      const cap = ctx.capabilities.find((c) => c.id === "cap_insite");
      return s({ eyebrow: "Real-Time Service Visibility", headline: "Orkin InSite®", headlineAccent: "Digital pest management intelligence", body: cap?.customerFacingText ?? "", callout: "Platform eligibility, locations, user permissions and reporting configuration are confirmed with the servicing branch." });
    }
    case "investment":
      return s({
        eyebrow: "Service Investment",
        headline: "Clear terms.",
        headlineAccent: "Exact pricing.",
        body: `Pricing below reflects the approved scope for ${site}. Initial service, recurring service and equipment are shown separately.`,
        contractual: true,
      });
    case "specialty_services":
      return s({ eyebrow: "Separately Authorized Services", headline: "Specialty services.", body: "Specialty services are separate from the recurring program and require written authorization before billable work.", callout: "Specialty pricing is subject to verification of site conditions, preparation and access requirements, applicable state requirements and written authorization.", contractual: true });
    case "portfolio_schedules":
      return s({ eyebrow: "Property Schedules", headline: "Property-specific rates.", body: "Each schedule identifies the community, service frequency, rotation minimum, apartments per visit and per-visit pricing.", contractual: true });
    case "customer_responsibilities": {
      const resp = new Set<string>(["Provide access to scheduled service areas and a point of contact for each visit."]);
      svc.forEach((x) => SERVICE_COPY[x].responsibilities.forEach((r) => resp.add(r)));
      return s({ eyebrow: "Customer Responsibilities", headline: "A shared program.", headlineAccent: "Shared accountability.", body: [...resp].slice(0, 8).map((r) => `- ${r}`).join("\n"), contractual: true });
    }
    case "implementation":
      return s({
        eyebrow: "Implementation",
        headline: "Start strong.",
        headlineAccent: "Stay accountable.",
        body: "The program is activated after pricing approval, completion of the applicable agreement and confirmation of site readiness.",
        items: [
          { title: "Approve", body: "Confirm scope, frequency, pricing and site contacts." },
          { title: "Authorize", body: "Execute the Orkin service agreement and confirm access requirements." },
          { title: "Launch", body: devices.length ? "Complete the initial service, install and map equipment." : "Complete the initial service and establish the service route." },
          { title: "Refine", body: "Review activity, access and recommendations with management and adjust the program as needed." },
        ],
      });
    case "review_milestones":
      return s({
        eyebrow: "Review Milestones",
        headline: "Results reviewed.",
        headlineAccent: "Program adjusted.",
        body: "Program performance is reviewed with management at defined points so frequency and scope stay matched to conditions.",
        items: [
          { title: "Initial service", body: "Baseline findings, device map and priority recommendations." },
          { title: "30–60 days", body: "Activity trends and status of recommended corrections." },
          { title: "60–90 days", body: "Formal program review; any frequency or scope change requires written agreement." },
        ],
      });
    case "triple_guarantee": {
      const cap = ctx.capabilities.find((c) => c.id === "cap_triple_guarantee");
      return s({
        eyebrow: "Orkin Commercial Triple Guarantee",
        headline: "Protection you can count on.",
        body: cap?.customerFacingText ?? "",
        // Wording reproduced from Anthony's approved reference proposal; QC requires verification against orkin.com before sending.
        items: [
          { title: "Response Guarantee", body: "Orkin responds to requests within two hours and, when needed, provides an on-site representative within 24 hours, subject to the Orkin customer agreement." },
          { title: "Reimbursement Guarantee", body: "If a regulatory agency imposes a fine due solely to a pest infestation, Orkin provides reimbursement of paid qualifying fines under the terms of the agreement." },
          { title: "360° Satisfaction Guarantee", body: "Startup, ongoing and continued satisfaction protection, including remedy through an alternate provider when applicable, as defined in the agreement." },
        ],
        callout: "Guarantee terms, eligibility, limitations and remedies apply only as expressly stated in the executed Orkin service agreement.",
        contractual: true,
      });
    }
    case "exclusions":
      return s({
        eyebrow: "Exclusions",
        headline: "What is not included.",
        body: [...new Set([...ctx.settings.defaultExclusions, ...svc.flatMap((x) => SERVICE_COPY[x].exclusions)])].map((e) => `- ${e}`).join("\n"),
        contractual: true,
      });
    case "authorization":
      return s({
        eyebrow: "Program Authorization",
        headline: "Next steps.",
        body: `To proceed, ${cust} approves the scope and pricing in this proposal and executes the applicable Orkin service agreement. Start dates, guarantees, taxes and amendments follow the executed agreement.`,
        contractual: true,
      });
    case "photos":
      return s({ eyebrow: "Site Photos", headline: "Site observations.", body: "" });
    case "floor_plans":
      return s({ eyebrow: "Floor Plans", headline: "Service layout.", body: "" });
    case "custom":
      return s({ eyebrow: "", headline: "New section", body: "" });
  }
}

export function generateDocument(p: Proposal, ctx: WriterContext): ProposalSection[] {
  const plan = [...SECTION_PLAN[p.kind]];
  const has = (t: SectionType) => plan.includes(t);
  const anyEquip = p.programs.some((pr) => pr.equipment.some((e) => e.quantity > 0));
  const filtered = plan.filter((t) => {
    if (t === "equipment_allocation" && !anyEquip) return false;
    if (t === "specialty_services" && !p.specialtyItems.length) return false;
    if (t === "portfolio_schedules" && !p.portfolioSchedules.length) return false;
    return true;
  });
  if (ctx.includeReporting && !has("reporting_capability")) filtered.splice(Math.max(0, filtered.indexOf("service_frequency")), 0, "reporting_capability");
  if (ctx.includeGuarantee) filtered.splice(Math.max(0, filtered.indexOf("investment")), 0, "triple_guarantee");
  return filtered.map((t) => generateSection(t, p, ctx));
}

/** Internal checklist: items requiring field verification for the selected services. */
export function fieldVerificationItems(p: Proposal): string[] {
  return [...new Set(services(p).flatMap((s) => SERVICE_COPY[s].verification))];
}
