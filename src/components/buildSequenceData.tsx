"use client";

import { Bug, CalendarClock, DollarSign, MapPin, Store } from "lucide-react";
import type { BuildChip } from "@/components/BuildSequence";
import type { DocLength } from "@/lib/types";
import { parseBrief } from "@/lib/quick/brief";
import { SERVICE_LABELS } from "@/lib/engine/assumptions";
import { formatMoney } from "@/lib/engine/money";
import { frequencyLabel } from "@/lib/engine/frequency";

/** What was read from the note, shown as chips flying into the build screen. */
export function briefChips(text: string): BuildChip[] {
  const b = parseBrief(text);
  const out: BuildChip[] = [];
  if (b.customerName) out.push({ icon: <Store size={13} />, text: b.customerName });
  if (b.address) out.push({ icon: <MapPin size={13} />, text: [b.address.line1, b.address.city].filter(Boolean).join(", ") });
  if (b.pestsBasis === "stated") out.push({ icon: <Bug size={13} />, text: b.services.slice(0, 2).map((x) => SERVICE_LABELS[x]).join(" + ") });
  if (b.priceCents != null) out.push({ icon: <DollarSign size={13} />, text: `${formatMoney(b.priceCents)}${b.priceBasis === "per_month" ? " / month" : b.priceBasis === "one_time" ? " one time" : " / visit"}` });
  if (b.frequencyBasis === "stated") out.push({ icon: <CalendarClock size={13} />, text: frequencyLabel(b.frequency) });
  return out;
}

/** Engine log lines shown during the build, from what was read in the note. */
export function buildLog(text: string, useAI: boolean, length: DocLength): Record<string, string[]> {
  const b = parseBrief(text);
  const up = (x: string) => x.toUpperCase();
  const addr = b.address ? up([b.address.line1, b.address.city].filter(Boolean).join(", ")) : "NOT STATED";
  return {
    read: [`PARSE › ${text.trim().length} CHARS · ${text.trim().split(/\s+/).length} TOKENS`, `ADDR  › ${addr}`, `PEST  › ${up(b.services.map((x) => SERVICE_LABELS[x]).join(" + "))}`, `PRICE › ${b.priceCents != null ? `${formatMoney(b.priceCents)} ${b.priceBasis === "per_month" ? "/ MONTH" : "/ VISIT"} · LOCKED` : "CALCULATE @ LABOR RATE"}`],
    lookup: ["GEO   › QUERYING PUBLIC RECORDS", "WEB   › ORKIN · EPA · EXTENSION SOURCES", "SITE  › CLASSIFYING FACILITY TYPE"],
    plan: [`MODEL › ${up(b.propertyType)}`, `FREQ  › ${up(frequencyLabel(b.frequency))}`, "LAYOUT› SIZING INTERIOR + PERIMETER DEVICES", "PRICE › INTEGER-CENT ENGINE · NO HIDDEN ROUNDING"],
    write: ["CLAUDE› COMPOSING SITE-SPECIFIC NARRATIVE", "GUARD › PRICES BY KEY ONLY · TERMS VERBATIM"],
    check: [`QC    › LEGAL · FINANCIAL · DOCUMENT`, `PDF   › PORTRAIT · ${length === "one_page" ? "1 PAGE" : length === "two_page" ? "2 PAGES" : length === "short" ? "SHORT" : "FULL"}`, useAI ? "LINK  › CLAUDE SESSION CLOSED" : "MODE  › OFFLINE ENGINE"],
  };
}

const LENGTH_TAG: Record<DocLength, string> = { one_page: "1 PAGE", two_page: "2 PAGES", short: "SHORT", full: "FULL" };

/** Engine log for the proposal engine (chat): what is happening at each stage of a turn. */
export function composeLog(text: string, useAI: boolean, length: DocLength, opts: { attachments: number; memoryWords: number }): Record<string, string[]> {
  const b = parseBrief(text);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    read: [`PARSE › ${words} WORDS${opts.attachments ? ` · ${opts.attachments} ATTACHMENT${opts.attachments > 1 ? "S" : ""}` : ""}`, `PRICE › ${b.priceCents != null ? `${formatMoney(b.priceCents)} STATED · LOCKED` : "NONE STATED · ENGINE CALCULATES"}`, opts.memoryWords ? `MEMORY› MASTER STANDARD · ${opts.memoryWords.toLocaleString()} WORDS` : "MEMORY› GENERIC STANDARD"],
    lookup: ["WEB   › QUERYING PUBLIC SOURCES", "SITE  › CLASSIFYING FACILITY TYPE", "PEST  › EPA · EXTENSION · ORKIN GUIDANCE"],
    compose: useAI
      ? ["CLAUDE› READING REQUEST + CONTEXT", "CLAUDE› CLASSIFYING THE CONDITION", "CLAUDE› WRITING THE ASSESSMENT", "CLAUDE› JUSTIFYING SERVICE FREQUENCY", "CLAUDE› BUILDING SCOPE + DEVICE PLAN", `CLAUDE› FITTING TO ${LENGTH_TAG[length]}`, "CLAUDE› FINAL PASS"]
      : ["LOCAL › STANDARD WRITER", "LOCAL › SIZING DEVICES + LABOR", "PRICE › INTEGER-CENT ENGINE"],
    apply: ["GUARD › AMOUNTS CHECKED AGAINST YOUR MESSAGES", "GUARD › CONTACTS NEVER INVENTED", "TERMS › APPROVED WORDING · VERBATIM"],
    check: ["CORE  › 13-POINT INFORMATION CHECK", `PDF   › PORTRAIT · ${LENGTH_TAG[length]}`],
  };
}
