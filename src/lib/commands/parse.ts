import type { CoverStyle, FrequencySpec, PropertyModel, SectionType, ServiceCategory } from "../types";
import type { Op } from "./ops";
import { dollarsToCents } from "../engine/money";
import { CONFIRMED_DEVICE_IDS } from "../engine/catalogIds";

/**
 * Deterministic natural-language parser for dictation intake and assistant commands.
 * Works fully offline. When AI is configured, the server can return richer ops, but
 * this parser is always available and its output goes through the same approval gate.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Convert spelled-out numbers ("thirty-five", "two hundred fifty thousand") to digits. */
export function normalizeNumberWords(text: string): string {
  const words = Object.keys(UNITS).concat(Object.keys(TENS), ["hundred", "thousand", "a"]);
  const re = new RegExp(`\\b((?:${words.join("|")})(?:[\\s-]+(?:and[\\s-]+)?(?:${words.join("|")}))*)\\b`, "gi");
  return text.replace(re, (m) => {
    const parts = m.toLowerCase().split(/[\s-]+/).filter((w) => w !== "and");
    if (parts.length === 1 && parts[0] === "a") return m;
    let total = 0;
    let cur = 0;
    let any = false;
    for (const w of parts) {
      if (w === "a") {
        cur = cur || 1;
        continue;
      }
      if (w in UNITS) (cur += UNITS[w]), (any = true);
      else if (w in TENS) (cur += TENS[w]), (any = true);
      else if (w === "hundred") (cur = (cur || 1) * 100), (any = true);
      else if (w === "thousand") {
        total += (cur || 1) * 1000;
        cur = 0;
        any = true;
      }
    }
    return any ? String(total + cur) : m;
  });
}

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : NaN);

export function parseFrequency(text: string): FrequencySpec | null {
  const t = text.toLowerCase();
  if (/five\s*days?\s*(a|per)\s*week|5\s*days?\s*(a|per)\s*week|monday\s*(through|to|-)\s*friday/.test(t)) return { kind: "five_day_weekly" };
  if (/twice[\s-]*(a|per)?[\s-]*month|twice[\s-]*monthly|semi[\s-]*monthly|2x\s*(a|per)?\s*month|two times (a|per) month/.test(t)) return { kind: "twice_monthly" };
  if (/bi[\s-]*weekly|every\s*(two|2|other)\s*weeks?|fortnight/.test(t)) return { kind: "biweekly" };
  if (/\bweekly\b|every\s*week|once\s*(a|per)\s*week/.test(t)) return { kind: "weekly" };
  if (/every\s*other\s*month|bi[\s-]*monthly/.test(t)) return { kind: "bimonthly" };
  if (/quarterly|every\s*(three|3)\s*months/.test(t)) return { kind: "quarterly" };
  if (/semi[\s-]*annual|twice\s*(a|per)\s*year/.test(t)) return { kind: "semiannual" };
  if (/\bmonthly\b|every\s*month|once\s*(a|per)\s*month/.test(t)) return { kind: "monthly" };
  if (/\bannual(ly)?\b|once\s*(a|per)\s*year/.test(t)) return { kind: "annual" };
  if (/one[\s-]*time|single\s*service/.test(t)) return { kind: "one_time" };
  const m = t.match(/every\s*(\d+)\s*days/);
  if (m) return { kind: "custom", customIntervalDays: Number(m[1]) };
  const season = t.match(/(april|may|march)\s*(through|to|-|–)\s*(september|october|november)/);
  if (/seasonal/.test(t) || season) {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const a = season ? months.indexOf(season[1]) + 1 : 4;
    const b = season ? months.indexOf(season[3]) + 1 : 10;
    return { kind: "seasonal", seasonalMonths: Array.from({ length: b - a + 1 }, (_, i) => a + i), seasonalBase: "monthly" };
  }
  return null;
}

export function detectModel(text: string, sqft: number | null): PropertyModel | null {
  const t = text.toLowerCase();
  if (/apartment|multifamily|multi-family|community|communities|residential units/.test(t)) return "multifamily";
  if (/restaurant|kitchen|food service|cafe|bakery|bar\b/.test(t)) return "restaurant";
  if (/hospital|senior living|nursing|assisted living|clinic|medical/.test(t)) return "healthcare";
  if (/government|municipal|federal|county|city of|state agency|courthouse/.test(t)) return "government";
  if (/campus|university|college|school district/.test(t)) return "campus";
  if (/warehouse|distribution|fulfillment|logistics/.test(t)) return "warehouse";
  if (/manufactur|industrial|plant|engineering center|factory|production/.test(t)) return "large_industrial";
  if (/exterior[\s-]*only|perimeter only/.test(t)) return "exterior_only";
  if (/office/.test(t)) return sqft && sqft > 25000 ? "medium_commercial" : "small_office";
  if (/retail|shopping|medical office|mixed use/.test(t)) return "medium_commercial";
  return null;
}

export function detectServices(text: string): ServiceCategory[] {
  const t = text.toLowerCase();
  const s = new Set<ServiceCategory>();
  if (/\b(mice|mouse|rodents?|rats?)\b|tin\s*cats?|bait\s*stations?/.test(t)) s.add("rodent");
  if (/german\s*cockroach/.test(t)) s.add("german_cockroach");
  else if (/american\s*cockroach|palmetto/.test(t)) s.add("american_cockroach");
  else if (/cockroach|roach/.test(t)) s.add("german_cockroach");
  if (/canine/.test(t)) s.add("canine_bed_bug");
  else if (/heat\s*treat/.test(t)) s.add("bed_bug_heat");
  else if (/bed\s*bugs?/.test(t)) s.add("bed_bug");
  if (/small\s*fl(y|ies)|drain\s*fl(y|ies)|fruit\s*fl(y|ies)|\bfl(y|ies)\b/.test(t)) s.add("fly");
  if (/drain/.test(t)) s.add("drain");
  if (/\bants?\b/.test(t)) s.add("ant");
  if (/mosquito/.test(t)) s.add("mosquito");
  if (/\bbirds?\b|pigeon/.test(t)) s.add("bird");
  if (/wildlife|raccoon|squirrel|opossum|skunk/.test(t)) s.add("wildlife");
  if (/sewer/.test(t)) s.add("sewer_baiting");
  if (/burrow/.test(t)) s.add("burrow");
  if (/general pest|spiders?|occasional invaders/.test(t)) s.add("general_pest");
  if (/wasps?|hornets?|yellow\s*jackets?|stinging/.test(t)) s.add("stinging_insect");
  if (/fleas?\b/.test(t)) s.add("flea");
  if (/inspection program|consult/.test(t)) s.add("consulting");
  return [...s];
}

export interface IntakeExtraction {
  propertyName: string | null;
  model: PropertyModel | null;
  propertyType: string | null;
  squareFeet: number | null;
  buildings: number | null;
  floors: number | null;
  apartments: number | null;
  apartmentsPerVisit: number | null;
  tinCats: number | null;
  exteriorStations: number | null;
  technicians: number | null;
  frequency: FrequencySpec | null;
  services: ServiceCategory[];
  activityAreas: string[];
  activityLevel: "low" | "moderate" | "high" | "severe" | null;
  wantsEstimate: boolean;
  wantsPricing: boolean;
  raw: string;
}

export function parseIntake(input: string): IntakeExtraction {
  const text = normalizeNumberWords(input);
  const t = text.toLowerCase();
  let sqft: number | null = null;
  const sq = t.match(/([\d][\d,\.]*)\s*(k|thousand)?[\s-]*(square[\s-]*f(?:oo|ee)t|sq\.?\s*ft\.?|sf\b)/);
  if (sq) {
    sqft = num(sq[1]);
    if (sq[2]) sqft *= 1000;
  }
  const tc = t.match(/(\d[\d,]*)\s*tin[\s-]*cats?/);
  const st = t.match(/(\d[\d,]*)\s*(?:exterior\s*)?(?:rodent\s*)?(?:bait\s*stations?|exterior\s*(?:rodent\s*)?(?:devices?|stations?)|stations?)/);
  const bld = t.match(/(\d+)\s*(?:separate\s*)?buildings?/);
  const fl = t.match(/(\d+)[\s-]*(?:story|stories|floors?)/);
  const apt = t.match(/(\d[\d,]*)[\s-]*(?:apartments?|units|apartment homes|doors)(?!\s*(?:per|a|each)\s*(?:visit|week|service))/);
  const apv = t.match(/(\d+)\s*(?:apartments?|units)\s*(?:per|a|each)\s*(?:visit|week|service)/);
  const tech = t.match(/(\d+)\s*(?:technicians?|techs?)/);
  const areas: string[] = [];
  for (const a of ["loading docks", "loading dock", "office entrances", "break room", "kitchen", "dumpster", "warehouse floor", "production area", "receiving", "cafeteria", "basement", "trash room", "exterior perimeter", "common areas"])
    if (t.includes(a) && !areas.some((x) => x.startsWith(a.slice(0, 8)))) areas.push(a);
  const typeMatch = text.match(/(?:for|at)\s+(?:a|an)\s+(?:[\d,\.]+[\s-]*(?:k|thousand)?[\s-]*(?:square[\s-]*f(?:oo|ee)t|sq\.?\s*ft\.?)\s+)?([a-z][a-z\s-]{2,40}?)(?=[\.,]|\s+with|\s+we\b|\s+that|$)/i);
  const nameMatch = text.match(/(?:proposal|program)\s+for\s+([A-Z][\w&'\.-]*(?:\s+[A-Z][\w&'\.-]*){0,5})/);
  const sev = /severe|heavy infestation|major infestation/.test(t) ? "severe" : /high activity|heavy activity|significant/.test(t) ? "high" : /activity|we have|seeing|signs of/.test(t) ? "moderate" : null;
  const model = detectModel(t, sqft);
  return {
    propertyName: nameMatch ? nameMatch[1].trim() : null,
    model,
    propertyType: typeMatch ? typeMatch[1].trim().replace(/\s+/g, " ") : null,
    squareFeet: sqft,
    buildings: bld ? num(bld[1]) : null,
    floors: fl ? num(fl[1]) : null,
    apartments: apt && model === "multifamily" ? num(apt[1]) : apt && /infest|cockroach|bed bug/.test(t) ? num(apt[1]) : null,
    apartmentsPerVisit: apv ? num(apv[1]) : null,
    tinCats: tc ? num(tc[1]) : null,
    exteriorStations: st ? num(st[1]) : null,
    technicians: tech ? num(tech[1]) : null,
    frequency: parseFrequency(t),
    services: detectServices(t),
    activityAreas: areas,
    activityLevel: sev,
    wantsEstimate: /labor|how long|estimate|time/.test(t),
    wantsPricing: /pric|quote|recommend/.test(t),
    raw: input,
  };
}

const SECTION_WORDS: [RegExp, SectionType][] = [
  [/executive|overview|summary/, "executive_overview"],
  [/\bipm\b|integrated pest|a\.?i\.?m/, "ipm"],
  [/triple guarantee|guarantee/, "triple_guarantee"],
  [/exclusion/, "exclusions"],
  [/responsibilit/, "customer_responsibilities"],
  [/implementation|rollout|onboarding/, "implementation"],
  [/methodology|approach/, "service_methodology"],
  [/assessment|property overview/, "property_assessment"],
  [/objective/, "program_objectives"],
  [/equipment/, "equipment_allocation"],
  [/frequency|schedule/, "service_frequency"],
  [/documentation|reporting|insite/, "documentation"],
  [/review|milestone/, "review_milestones"],
  [/specialty/, "specialty_services"],
  [/coverage|covered pests/, "coverage"],
  [/photo/, "photos"],
  [/floor plan/, "floor_plans"],
];

function sectionFrom(t: string): SectionType | null {
  for (const [re, s] of SECTION_WORDS) if (re.test(t)) return s;
  return null;
}

export interface ParsedCommand {
  ops: Op[];
  intake: IntakeExtraction | null;
  understood: boolean;
}

export function parseCommand(input: string): ParsedCommand {
  const text = normalizeNumberWords(input.trim());
  const t = text.toLowerCase();
  const ops: Op[] = [];

  // New program / intake style
  if (/^(create|build|new|start|draft)\b.*\b(program|proposal|plan)\b/.test(t) && /\d/.test(t) && !/government bid|rfp/.test(t)) {
    return { ops, intake: parseIntake(text), understood: true };
  }

  const rate = t.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:an|per|\/)\s*(?:hour|hr)/);
  if (rate && /(what|show|price would be|at \$)/.test(t) && !/use|set|change the rate/.test(t)) ops.push({ op: "show_price_at_rate", cents: dollarsToCents(rate[1])! });
  else if (rate && /(use|set|change).*rate/.test(t)) ops.push({ op: "set_labor_rate", cents: dollarsToCents(rate[1])! });

  if (/(change|switch|move|set|make).*(service|frequency|visits?|it)\b.*\bto\b/.test(t) || /^(weekly|monthly|quarterly|twice monthly)/.test(t)) {
    const f = parseFrequency(t.split(/\bto\b/).slice(1).join(" to ") || t);
    if (f) ops.push({ op: "set_frequency", frequency: f });
  }

  const lock = t.match(/(lock|set|approve|make)\s+(?:the\s+)?(recurring|initial|weekly|monthly|per[\s-]visit)?\s*(?:service\s+)?(?:price|charge|rate)?\s*(?:at|to)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (lock && !rate) ops.push({ op: "set_price_override", phase: lock[2] === "initial" ? "initial" : "recurring", cents: dollarsToCents(lock[3])!, lock: /lock|approve/.test(lock[1]) });

  const qty = t.match(/(?:set|change|make|update)\s+(?:the\s+)?(tin\s*cats?|exterior\s*(?:bait\s*)?stations?|bait\s*stations?|stations?)\s*(?:count\s*)?(?:to|=)\s*(\d+)/) ?? t.match(/(?:use|need)\s+(\d+)\s+(tin\s*cats?|(?:exterior\s*)?(?:bait\s*)?stations?)/);
  if (qty) {
    const [a, b] = /\d/.test(qty[1]) ? [qty[2], qty[1]] : [qty[1], qty[2]];
    ops.push({ op: "set_equipment_qty", match: /tin/.test(a) ? "tin cat" : "bait station", quantity: Number(b) });
  }
  const addEq = t.match(/add\s+(\d+)\s+(tin\s*cats?|(?:exterior\s*)?(?:bait\s*)?stations?)/);
  if (addEq) ops.push({ op: "add_equipment", catalogItemId: /tin/.test(addEq[2]) ? CONFIRMED_DEVICE_IDS.tinCat : CONFIRMED_DEVICE_IDS.baitStation, quantity: Number(addEq[1]) });

  const techs = t.match(/(\d+)\s*(?:technicians?|techs?)/);
  if (techs && /(assign|use|with|set)/.test(t)) ops.push({ op: "set_technicians", technicians: Number(techs[1]) });

  if (/triple guarantee/.test(t)) ops.push({ op: "toggle_guarantee", enabled: !/remove|delete|drop|without/.test(t) });
  else if (/\b(add|include|insert)\b/.test(t) && /(page|section)/.test(t)) {
    const s = sectionFrom(t);
    if (s) ops.push({ op: "add_section", sectionType: s });
  } else if (/\b(remove|delete|drop)\b/.test(t) && /(page|section)/.test(t)) {
    const s = sectionFrom(t);
    if (s) ops.push({ op: "remove_section", sectionType: s });
  }

  if (/quarterly inspection/.test(t) && /add/.test(t)) ops.push({ op: "add_program", services: ["consulting"], frequency: { kind: "quarterly" }, name: "Quarterly inspection component" });

  if (/(labor minutes|internal|minutes from the customer|hide.*(rate|minutes))/.test(t) && /(remove|hide|exclude|don'?t show)/.test(t)) ops.push({ op: "hide_internal_details" });
  if (/how long|calculate.*(time|labor)|labor estimate/.test(t)) ops.push({ op: "explain_estimate" });

  const pages = t.match(/(?:reduce|condense|shorten|cut).*?(\d+)\s*pages?/);
  if (pages) ops.push({ op: "condense", maxPages: Number(pages[1]) });

  const cover: CoverStyle | null = /charcoal|dark cover/.test(t) ? "executive_charcoal" : /corporate white|white cover/.test(t) ? "corporate_white" : /showcase|property photo cover/.test(t) ? "property_showcase" : null;
  if (cover) ops.push({ op: "set_cover", style: cover });

  const title = text.match(/(?:change|set|rename)\s+(?:the\s+)?title\s+to\s+["“]?([^"”]+)["”]?/i);
  if (title) ops.push({ op: "set_title", title: title[1].trim() });

  if (!ops.some((o) => o.op === "condense" || o.op === "set_cover" || o.op === "add_section") || /redesign|rewrite|stronger|more (comprehensive|persuasive|concise|technical)|government bid|rfp/.test(t)) {
    if (/redesign|rewrite|stronger|improve|more (comprehensive|persuasive|concise|technical|detailed)|polish|government bid|rfp response|tone|professional layout/.test(t)) {
      const target = /executive|overview/.test(t) ? "executive_overview" : sectionFrom(t) && !/every page|all|whole|entire|proposal/.test(t) ? sectionFrom(t)! : "all";
      ops.push({ op: "rewrite", target, instruction: text });
    }
  }

  return { ops, intake: null, understood: ops.length > 0 };
}
