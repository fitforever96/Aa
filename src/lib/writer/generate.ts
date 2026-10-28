import type { Proposal, ProposalKind, ProposalSection, SectionType, ServiceCategory, Settings, VerifiedCapability } from "../types";
import { MODEL_CONTEXT, SERVICE_COPY } from "./library";
import { newSection } from "../commands/ops";
import { frequencyLabel } from "../engine/frequency";
import { SERVICE_LABELS } from "../engine/assumptions";
import { frequencyRationale, rotationCheck, rotationSentence } from "./rationale";

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
  small_commercial: ["executive_overview", "coverage", "service_methodology", "ipm", "equipment_allocation", "service_frequency", "investment", "specialty_services", "customer_responsibilities", "implementation", "exclusions", "conclusion"],
  multifamily_rotation: ["executive_overview", "property_assessment", "coverage", "ipm", "service_frequency", "implementation", "investment", "specialty_services", "portfolio_schedules", "customer_responsibilities", "exclusions", "conclusion"],
  intensive_treatment: ["executive_overview", "property_assessment", "program_objectives", "pest_specific", "service_methodology", "service_frequency", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "conclusion"],
  industrial: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "conclusion"],
  government: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "investment", "specialty_services", "customer_responsibilities", "exclusions", "conclusion"],
  rfp: ["executive_overview", "property_assessment", "program_objectives", "service_methodology", "equipment_allocation", "ipm", "documentation", "service_frequency", "implementation", "review_milestones", "investment", "specialty_services", "customer_responsibilities", "exclusions", "conclusion"],
  portfolio: ["executive_overview", "property_assessment", "coverage", "ipm", "service_frequency", "implementation", "investment", "specialty_services", "portfolio_schedules", "customer_responsibilities", "exclusions", "conclusion"],
  consulting: ["executive_overview", "program_objectives", "service_methodology", "review_milestones", "documentation", "investment", "exclusions", "conclusion"],
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
  conclusion: "Conclusion & Next Step",
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
        headline: "A program built for",
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
          `${site}${facts.length ? ` (${list(facts)})` : ""}${p.property.operatingEnvironment ? ` operates as ${p.property.operatingEnvironment.toLowerCase()}` : ""}. Service planning reflects the areas that carry the most pest risk rather than treating every square foot the same.`,
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
      if (p.kind === "consulting")
        return s({
          eyebrow: "Engagement Approach",
          headline: "Assessment first.",
          headlineAccent: "Findings you can act on.",
          body: "This is an advisory engagement. It covers assessment, inspection, findings and written recommendations; pest-control treatments are not included unless listed in this proposal. Conclusions are based on what is observed during the assessment and are not determined in advance.",
          items: [
            { title: "Assess", body: "Inspect the defined areas, including restricted or lower-level spaces where access is provided." },
            { title: "Document", body: "Record conditions, evidence of activity and contributing factors." },
            { title: "Recommend", body: "Prioritized structural, sanitation and program recommendations in the agreed report format." },
          ],
        });
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
          ? `Equipment is allocated to intercept pests along the routes they travel: exterior devices at the perimeter, interior devices at entry points, wall lines and risk areas. Final placement is confirmed on site and mapped during installation.`
          : "No equipment is included in the current scope.",
      });
    case "service_frequency": {
      const lines = p.programs.map((pr) => `- ${pr.name}: ${frequencyLabel(pr.frequency)}${pr.billing.method === "fixed_monthly" && pr.billing.fixedMonthlyApproved ? ", billed monthly" : pr.chargeType === "recurring" ? ", billed per completed service visit" : ""}`);
      const rationale = p.programs.map((pr) => (p.programs.length > 1 ? `${pr.name}: ` : "") + frequencyRationale(p.property, pr));
      const rot = p.programs.map((pr) => rotationCheck(p.property, pr)).find(Boolean);
      return s({
        eyebrow: "Service Frequency",
        headline: "The right frequency.",
        headlineAccent: p.kind === "multifamily_rotation" ? "The right apartment allocation." : "For the pressure on site.",
        body: [
          p.kind === "portfolio" ? "Each participating property’s visit frequency, rotation minimum, apartment allocation and price appear in the attached schedules." : "",
          ...rationale,
          rot ? rotationSentence(rot) : "",
          lines.join("\n"),
          p.programs.some((pr) => pr.frequency.kind === "weekly") ? "Weekly service follows the calendar, so some months include five scheduled visits." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        callout: p.kind === "multifamily_rotation" || p.kind === "portfolio" ? "Rotation targets are subject to resident access, reported pest activity and property-specific service priorities." : "",
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
    case "review_milestones": {
      const rodent = svc.some((x) => x === "rodent" || x === "exterior_baiting" || x === "interior_trapping");
      const items =
        p.kind === "consulting" || p.programs.every((pr) => pr.services.every((x) => x === "consulting"))
          ? [
              { title: "Kickoff", body: "Confirm objectives, areas in scope, access, contacts and reporting format." },
              { title: "Assessment", body: "Inspection of the defined areas and documentation of conditions observed." },
              { title: "Interim findings", body: "Preliminary observations and priority recommendations shared with stakeholders." },
              { title: "Final report", body: "Draft for review, then a final report with findings and recommendations." },
            ]
          : rodent
            ? [
                { title: "Initial service", body: "Baseline inspection, device installation and mapping, and priority recommendations." },
                { title: "60-day review", body: "Activity and capture trends, device performance, recurring problem areas and status of structural and sanitation items." },
                { title: "Ongoing evaluation", body: "Frequency and placement are adjusted only on documented findings and by mutual agreement." },
              ]
            : [
                { title: "Initial service", body: "Baseline findings and priority recommendations." },
                { title: "First review", body: "Activity trends and status of recommended corrections." },
                { title: "Program review", body: "Formal review of results; any frequency or scope change requires written agreement." },
              ];
      return s({
        eyebrow: "Review Milestones",
        headline: "Results reviewed.",
        headlineAccent: "Program adjusted on findings.",
        body: "Review milestones are structured evaluation points, not guaranteed outcomes. They keep frequency and scope matched to the conditions actually documented on site.",
        items,
      });
    }
    case "triple_guarantee": {
      const cap = ctx.capabilities.find((c) => c.id === "cap_triple_guarantee");
      return s({
        eyebrow: "Orkin Commercial Triple Guarantee",
        headline: "Protection you can count on.",
        body: cap?.customerFacingText ?? "",
        // Master memory §14: no hour-specific response commitments; terms come only from the executed agreement.
        items: [
          { title: "Response assurance", body: "Orkin’s commitments for responding to service requests, as defined in the executed Orkin agreement." },
          { title: "Regulatory fine protection", body: "Provisions for eligible regulatory fines resulting from pest activity, subject to the published terms and the executed agreement." },
          { title: "Satisfaction provisions", body: "Satisfaction-related remedies as defined by the current Orkin Commercial Triple Guarantee terms and the executed agreement." },
        ],
        callout: "Guarantee terms, eligibility, limitations and remedies apply only as expressly stated in the executed Orkin service agreement.",
        contractual: true,
      });
    }
    case "exclusions":
      return s({
        eyebrow: "Exclusions",
        headline: "What is not included.",
        body: [...new Set([...ctx.settings.defaultExclusions, ...svc.flatMap((x) => SERVICE_COPY[x].exclusions), ...(svc.some((x) => ["bed_bug", "german_cockroach", "bed_bug_heat"].includes(x)) ? ["Scheduled service visits, planned follow-ups, callbacks between visits and additional billable treatments are distinct; their scope and limits are defined in the service agreement."] : [])])].map((e) => `- ${e}`).join("\n"),
        contractual: true,
      });
    case "authorization":
      return s({
        eyebrow: "Program Authorization",
        headline: "Next steps.",
        body: `To proceed, ${cust} approves the scope and pricing in this proposal and executes the applicable Orkin service agreement. Start dates, guarantees, taxes and amendments follow the executed agreement.`,
        contractual: true,
      });
    case "conclusion": {
      const who = p.customer.contactName || cust;
      return s({
        eyebrow: "Next Step",
        headline: "A program built around",
        headlineAccent: `${site}.`,
        body: [
          `This program pairs scheduled ${freq} service with documented inspection, monitoring and recommendations so pest activity at ${site} is identified early and addressed in a consistent way. Its results depend on collaboration between the Orkin Pro and the site team.`,
          `The next step is to confirm the scope and schedule with ${who} so the servicing branch can finalize the agreement and schedule the initial service.`,
        ].join("\n\n"),
      });
    }
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
