/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { PdfModel, PdfProgram } from "./model";
import type { ProposalSection, SectionType } from "../types";
import { C } from "./theme";
import { condenseAll, firstSentences } from "./condense";

/**
 * Shorter customer PDFs. Same information as the full proposal (every enabled section is
 * represented), set densely: section headings sit beside their content instead of
 * taking a page each. `level` comes from the fit loop (see condense.ts).
 */

const pad2 = (n: number) => String(n).padStart(2, "0");
const DISPLAY = "RobotoCondensed";

function Bullet({ size = 4 }: { size?: number }) {
  return <View style={{ width: size, height: size, backgroundColor: C.red, transform: "rotate(45deg)", marginTop: 3.2, marginRight: 6 }} />;
}

function priceCards(p: PdfProgram) {
  return [
    p.recurring ? { label: p.monthly ? "Monthly service" : "Per service visit", value: p.monthly ?? p.recurring, sub: p.monthly ? `${p.frequency.toLowerCase()} service, billed monthly` : p.frequency } : null,
    p.initial ? { label: "Initial service", value: p.initial, sub: "one-time" } : null,
    p.equipmentTotal ? { label: "Equipment", value: p.equipmentTotal, sub: "one-time" } : null,
  ].filter(Boolean) as { label: string; value: string; sub: string }[];
}

// ───────────────────────── Compact multi-page ─────────────────────────

/** Every price as a card, labeled with its program when there are several. */
const allCards = (m: PdfModel) => m.programs.flatMap((p) => priceCards(p).map((c) => ({ ...c, prog: m.programs.length > 1 ? p.name : "" })));
/** The summary band holds up to four prices; anything beyond that is listed in the pricing section. */
const bandShowsAll = (m: PdfModel) => allCards(m).length <= 4;

function SummaryBand({ m }: { m: PdfModel }) {
  return (
    <View wrap={false} style={{ backgroundColor: C.dark, borderRadius: 4, padding: 12, paddingHorizontal: 18, flexDirection: "row", gap: 18, marginBottom: 10 }}>
      <View style={{ flex: 1.25 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: C.mint, letterSpacing: 0.25, textTransform: "uppercase" }}>{m.customer ? `Prepared for ${m.customer}` : "Commercial proposal"}</Text>
        <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: C.white, textTransform: "uppercase", marginTop: 4, lineHeight: 1.05 }}>{m.title}</Text>
        <Text style={{ fontSize: 8.5, color: "#BDBDC4", marginTop: 6 }}>{[m.property !== m.customer ? m.property : "", m.address, m.dateLabel].filter(Boolean).join("   ·   ")}</Text>
        <Text style={{ fontSize: 8, color: "#BDBDC4", marginTop: 8 }}>
          Prepared by {m.preparedBy.map((p) => [p.name, p.title, p.phone].filter(Boolean).join(", ")).join("; ")}
        </Text>
      </View>
      <View style={{ flex: allCards(m).length > 3 ? 1.35 : 1, flexDirection: "row", gap: 7, alignItems: "stretch" }}>
        {(bandShowsAll(m) ? allCards(m) : m.programs.map((p) => ({ ...priceCards(p)[0], prog: m.programs.length > 1 ? p.name : "" })).filter((c) => c.value).slice(0, 4)).map((c, i, arr) => (
          <View key={i} style={{ flex: 1, backgroundColor: C.white, borderRadius: 3, padding: 9, borderTopWidth: 3, borderTopColor: i === 0 ? C.red : C.ink3 }}>
            <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.3, color: C.red, textTransform: "uppercase", letterSpacing: 0.25 }}>{c.prog || c.label}</Text>
            <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: arr.length > 3 ? 16 : 19, color: C.ink, marginTop: 3 }}>{c.value}</Text>
            <Text style={{ fontSize: 6.8, color: C.ink3, marginTop: 2 }}>{c.prog ? `${c.label.toLowerCase()} · ${c.sub}` : c.sub}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Items({ items, cols, size }: { items: { title: string; body: string }[]; cols: number; size: number }) {
  if (!items.length) return null;
  const w = cols === 1 ? "100%" : cols === 2 ? "48.5%" : "31.8%";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 4, marginTop: 4 }}>
      {items.map((it, i) => (
        <View key={i} style={{ width: w, flexDirection: "row" }} wrap={false}>
          <Bullet />
          <Text style={{ flex: 1, fontSize: size, lineHeight: 1.38, color: C.ink2 }}>
            {it.body ? <Text style={{ fontFamily: "Lato", fontWeight: 700, color: C.ink }}>{it.title}</Text> : it.title}
            {it.body ? `  ${it.body}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MiniTable({ cols, rows, size }: { cols: { label: string; w: string; right?: boolean }[]; rows: string[][]; size: number }) {
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 5 }}>
      <View style={{ flexDirection: "row", backgroundColor: C.darker, paddingVertical: 4, paddingHorizontal: 7, borderTopLeftRadius: 3, borderTopRightRadius: 3 }}>
        {cols.map((c, i) => (
          <Text key={i} style={{ width: c.w, textAlign: c.right ? "right" : "left", fontFamily: "Lato", fontWeight: 900, fontSize: 6.5, color: C.white, textTransform: "uppercase", letterSpacing: 0.25 }}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 7, backgroundColor: i % 2 ? C.card2 : C.white, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          {r.map((cell, j) => (
            <Text key={j} style={{ width: cols[j].w, textAlign: cols[j].right ? "right" : "left", fontSize: size - 0.5, color: C.ink2 }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const deviceRows = (m: PdfModel) => m.programs.flatMap((p) => p.equipment.map((e) => [e.name, e.location, String(e.quantity + e.reserve), e.total ?? "—"]));
const DEVICE_COLS = [
  { label: "Device", w: "50%" },
  { label: "Location", w: "18%" },
  { label: "Qty", w: "12%", right: true },
  { label: "Price", w: "20%", right: true },
];

function PriceRow({ m, size }: { m: PdfModel; size: number }) {
  return (
    <View>
      {m.programs.map((p, i) => (
        <View key={i} wrap={false} style={{ marginTop: 4 }}>
          {m.programs.length > 1 && <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 1.5, color: C.ink, textTransform: "uppercase" }}>{p.name}</Text>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 3 }}>
            {priceCards(p).map((c, j) => (
              <View key={j} style={{ flex: 1, backgroundColor: C.card, borderRadius: 3, padding: 8, borderLeftWidth: 3, borderLeftColor: j === 0 ? C.red : C.dark }}>
                <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.5, color: C.red, textTransform: "uppercase", letterSpacing: 0.25 }}>{c.label}</Text>
                <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: C.ink, marginTop: 2 }}>{c.value}</Text>
                <Text style={{ fontSize: 7, color: C.ink3 }}>{c.sub}</Text>
              </View>
            ))}
          </View>
          {(p.terms || p.contractTotal) && <Text style={{ fontSize: size - 1, color: C.ink3, marginTop: 3 }}>{[p.terms, p.contractTotal ? `Contract-period total (recurring): ${p.contractTotal}.` : ""].filter(Boolean).join(" ")}</Text>}
        </View>
      ))}
    </View>
  );
}

/** Prices the summary band leaves out (initial and equipment charges per program), in one row. */
function PriceStrip({ m, size }: { m: PdfModel; size: number }) {
  const cards = m.programs.flatMap((p) => priceCards(p).slice(1).map((c) => ({ ...c, prog: p.name })));
  return (
    <View>
      {cards.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
          {cards.map((c, i) => (
            <View key={i} wrap={false} style={{ width: "23.5%", backgroundColor: C.card, borderRadius: 3, padding: 7, borderLeftWidth: 3, borderLeftColor: C.dark }}>
              <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.3, color: C.red, textTransform: "uppercase", letterSpacing: 0.25 }}>{c.prog}</Text>
              <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 1 }}>{c.value}</Text>
              <Text style={{ fontSize: 6.8, color: C.ink3 }}>
                {c.label.toLowerCase()} · {c.sub}
              </Text>
            </View>
          ))}
        </View>
      )}
      {m.programs.filter((p) => p.terms || p.contractTotal).map((p, i) => (
        <Text key={i} style={{ fontSize: size - 1, color: C.ink3, marginTop: 3 }}>
          {m.programs.length > 1 ? `${p.name}: ` : ""}
          {[p.terms, p.contractTotal ? `Contract-period total (recurring): ${p.contractTotal}.` : ""].filter(Boolean).join(" ")}
        </Text>
      ))}
    </View>
  );
}

function CompactBody({ s, m, size, band, narrow }: { s: ProposalSection; m: PdfModel; size: number; band: boolean; narrow?: boolean }) {
  const text = (t: string, muted?: boolean) =>
    t
      ? t.split(/\n{2,}/).map((para, i) => (
          <Text key={i} style={{ fontSize: size, lineHeight: 1.42, color: muted ? C.ink3 : C.ink2, marginBottom: 3 }}>
            {para.replace(/\n/g, " ")}
          </Text>
        ))
      : null;
  const callout = s.callout ? (
    <View style={{ backgroundColor: C.card, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 8, marginTop: 5 }}>
      <Text style={{ fontSize: size - 0.8, color: C.ink2, lineHeight: 1.38 }}>{s.callout}</Text>
    </View>
  ) : null;
  const cols = narrow ? 1 : s.items.every((i) => i.title.length + i.body.length < 90) && s.items.length >= 3 ? 3 : 2;
  switch (s.type) {
    case "equipment_allocation":
      return (
        <View>
          {text(s.body)}
          <MiniTable cols={DEVICE_COLS} rows={deviceRows(m)} size={size} />
          <Items items={s.items} cols={cols} size={size - 0.4} />
        </View>
      );
    case "service_frequency":
      return (
        <View>
          {text(s.body)}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 }}>
            {m.programs.map((p, i) => (
              <View key={i} style={{ borderWidth: 0.75, borderColor: C.line, borderTopWidth: 2.5, borderTopColor: C.red, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 8 }}>
                <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 1.5, color: C.ink, textTransform: "uppercase" }}>
                  {m.programs.length > 1 ? `${p.name}: ` : ""}
                  <Text style={{ color: C.red }}>{p.frequency}</Text>
                </Text>
                <Text style={{ fontSize: size - 1.2, color: C.ink3 }}>{p.billingLabel === "one-time service" ? "One-time service" : `Billed ${p.monthly ? "monthly" : "per completed service visit"}`}</Text>
              </View>
            ))}
          </View>
          {callout}
        </View>
      );
    case "investment":
      return (
        <View>
          {text(s.body)}
          {!band && <PriceRow m={m} size={size} />}
          {band && !bandShowsAll(m) && <PriceStrip m={m} size={size} />}
          {band && bandShowsAll(m) && m.programs.some((p) => p.terms || p.contractTotal) && <PriceRow m={{ ...m, programs: m.programs.map((p) => ({ ...p, recurring: null, initial: null, equipmentTotal: null, monthly: null })) }} size={size} />}
          {m.programs.some((p) => p.equipment.some((e) => e.unit)) && !m.sections.some((x) => x.type === "equipment_allocation") && <MiniTable cols={DEVICE_COLS} rows={deviceRows(m).filter((r) => r[3] !== "—" && r[3] !== "Included")} size={size} />}
          {callout}
        </View>
      );
    case "specialty_services":
      return (
        <View>
          {text(s.body)}
          <MiniTable cols={[{ label: "Service", w: "72%" }, { label: "Price / basis", w: "28%", right: true }]} rows={m.specialty.map((x) => [x.name, x.price])} size={size} />
          {callout}
        </View>
      );
    case "portfolio_schedules":
      return (
        <View>
          {text(s.body)}
          {m.schedules.map((sch, i) => (
            <View key={i}>
              <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 1, color: C.ink, marginTop: 4, textTransform: "uppercase" }}>
                Schedule {sch.code}: {sch.title}
              </Text>
              <MiniTable
                cols={[{ label: "Property", w: "46%" }, { label: "Units", w: "12%", right: true }, { label: "Rot./mo.", w: "14%", right: true }, { label: "Apts/visit", w: "14%", right: true }, { label: sch.rateLabel, w: "14%", right: true }]}
                rows={sch.rows.map((r) => [r.name, r.units, r.rot, r.apv, r.rate])}
                size={size}
              />
            </View>
          ))}
        </View>
      );
    case "photos":
    case "floor_plans": {
      const pics = s.type === "photos" ? m.photos : m.floorPlans;
      return (
        <View>
          {text(s.body)}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {pics.slice(0, 4).map((ph, i) => (
              <View key={i} style={{ width: "24%" }} wrap={false}>
                <Image src={ph.src} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 2 }} />
                {!!ph.caption && <Text style={{ fontSize: 6.5, color: C.ink3, marginTop: 2 }}>{ph.caption}</Text>}
              </View>
            ))}
          </View>
        </View>
      );
    }
    case "ipm":
      return (
        <View>
          {text(s.body)}
          <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 0.5, color: C.red, letterSpacing: 0.25, marginTop: 2 }}>ASSESS · IMPLEMENT · MONITOR</Text>
          <Items items={s.items} cols={narrow ? 1 : 3} size={size - 0.4} />
          {callout}
        </View>
      );
    default:
      return (
        <View>
          {text(s.body)}
          <Items items={s.items} cols={cols} size={size - 0.4} />
          {callout}
        </View>
      );
  }
}

/** Rough rendered height (pt) of a condensed section at a given width, used to pack rows and balance columns. */
export function estimateCompact(s: ProposalSection, m: PdfModel, width: number, size: number, stacked: boolean, withHeadline = true): number {
  const cpl = Math.max(20, width / (size * 0.5));
  const lines = (t: string, w = cpl) => (t ? t.split(/\n{2,}/).reduce((a, p) => a + Math.ceil(p.length / w), 0) : 0);
  const lh = size * 1.42;
  let h = stacked ? size * 1.4 + (withHeadline && (s.headline || s.headlineAccent) ? (size + 2) * 1.3 * Math.ceil((s.headline.length + s.headlineAccent.length + 1) / (cpl * 0.8)) : 0) : 0;
  h += lines(s.body) * lh;
  const cols = width > 420 ? (s.items.every((i) => i.title.length + i.body.length < 90) && s.items.length >= 3 ? 3 : 2) : 1;
  const rows: number[] = [];
  s.items.forEach((it, idx) => {
    const r = Math.floor(idx / cols);
    rows[r] = Math.max(rows[r] ?? 0, Math.ceil((it.title.length + it.body.length + 2) / (cpl / cols - 3)));
  });
  h += rows.reduce((a, b) => a + b, 0) * size * 1.38 + rows.length * 4;
  if (s.callout) h += lines(s.callout) * lh + 10;
  const devices = m.programs.reduce((a, p) => a + p.equipment.length, 0);
  if (s.type === "equipment_allocation") h += 16 + devices * 13;
  if (s.type === "investment") h += m.programs.length * 52;
  if (s.type === "service_frequency") h += 30;
  if (s.type === "specialty_services") h += 16 + m.specialty.length * 13;
  if (s.type === "portfolio_schedules") h += m.schedules.reduce((a, x) => a + 30 + x.rows.length * 13, 0);
  if (s.type === "photos" || s.type === "floor_plans") h += 105;
  return h + 10;
}

function Heading({ s, n, size, labelOnly }: { s: ProposalSection; n: number; size: number; labelOnly?: boolean }) {
  if (labelOnly)
    return (
      <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 1.5, color: C.ink, textTransform: "uppercase", marginBottom: 2 }}>
        <Text style={{ color: C.red }}>{pad2(n)} </Text>
        {s.eyebrow || s.type.replace(/_/g, " ")}
      </Text>
    );
  return (
    <>
      <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.8, color: C.red, letterSpacing: 0.25, textTransform: "uppercase" }}>
        {pad2(n)} / {s.eyebrow || s.type.replace(/_/g, " ")}
      </Text>
      {(s.headline || s.headlineAccent) && (
        <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 3, color: C.ink, textTransform: "uppercase", lineHeight: 1.08, marginTop: 2, marginBottom: 3 }}>
          {s.headline} {!!s.headlineAccent && <Text style={{ color: C.red }}>{s.headlineAccent}</Text>}
        </Text>
      )}
    </>
  );
}

type Row = { cells: { s: ProposalSection; n: number }[]; wide: boolean };

/** Full-width sections keep the heading on the left; short ones share a row, stacked heading over content. */
function packRows(sections: ProposalSection[], m: PdfModel, contentW: number, size: number, level: number): Row[] {
  const perRow = level >= 1 ? 3 : 2;
  const cellW = (contentW - 14 * (perRow - 1)) / perRow;
  const ALWAYS_WIDE: SectionType[] = ["investment", "equipment_allocation", "portfolio_schedules", "photos", "floor_plans", "specialty_services"];
  const rows: Row[] = [];
  let pending: { s: ProposalSection; n: number }[] = [];
  const halfW = (contentW - 14) / 2;
  let pair: { s: ProposalSection; n: number }[] = [];
  sections.forEach((s) => {
    const small = !ALWAYS_WIDE.includes(s.type) && estimateCompact(s, m, cellW, size, true) <= (level >= 2 ? 150 : 115);
    const medium = !small && level >= 1 && !ALWAYS_WIDE.includes(s.type) && estimateCompact(s, m, halfW, size, true) <= (level >= 3 ? 270 : 210);
    if (medium) {
      // Medium sections share a two-column row.
      if (!pair.length) rows.push({ cells: pair, wide: false });
      pair.push({ s, n: 0 });
      if (pair.length === 2) pair = [];
      return;
    }
    if (!small) {
      // A wide section goes in now; short sections already waiting keep filling the next shared row.
      rows.push({ cells: [{ s, n: 0 }], wide: true });
      return;
    }
    if (!pending.length) rows.push({ cells: pending, wide: false });
    pending.push({ s, n: 0 });
    if (pending.length === perRow) pending = [];
  });
  // Number sections in the order they appear on the page.
  let n = 0;
  for (const r of rows) for (const c of r.cells) c.n = ++n;
  return rows.filter((r) => r.cells.length);
}

function CompactRow({ row, m, size, band, keep, first, labelOnly }: { row: Row; m: PdfModel; size: number; band: boolean; keep: boolean; first: boolean; labelOnly: boolean }) {
  const border = { paddingTop: 8, paddingBottom: 8, borderTopWidth: first ? 0 : 0.75, borderTopColor: C.line };
  if (row.wide) {
    const { s, n } = row.cells[0];
    return (
      <View wrap={!keep} minPresenceAhead={40} style={{ flexDirection: "row", gap: 16, ...border }}>
        <View style={{ width: labelOnly ? 120 : 140 }}>
          <Heading s={s} n={n} size={size} labelOnly={labelOnly} />
        </View>
        <View style={{ flex: 1 }}>
          <CompactBody s={s} m={m} size={size} band={band} />
        </View>
      </View>
    );
  }
  return (
    <View wrap={false} style={{ flexDirection: "row", gap: 14, ...border }}>
      {row.cells.map(({ s, n }, i) => (
        <View key={s.id} style={{ flex: 1, ...(i ? { borderLeftWidth: 0.6, borderLeftColor: C.line, paddingLeft: 12 } : {}) }}>
          <Heading s={s} n={n} size={size} labelOnly={labelOnly} />
          <CompactBody s={{ ...s, items: s.items }} m={m} size={size - 0.2} band={band} narrow />
        </View>
      ))}
      {Array.from({ length: Math.max(0, (row.cells.length === 1 ? 2 : row.cells.length) - row.cells.length) }).map((_, i) => (
        <View key={`pad${i}`} style={{ flex: 1 }} />
      ))}
    </View>
  );
}

function ChromeFixed({ m }: { m: PdfModel }) {
  return (
    <>
      <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: C.red }} />
      <View fixed style={{ position: "absolute", top: 16, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 5 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text style={{ fontFamily: DISPLAY, fontWeight: 800, color: C.red, fontSize: 14 }}>ORKIN</Text>
          <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.5, color: C.ink3, letterSpacing: 0.25, marginLeft: 10, marginBottom: 1.5 }}>/ COMMERCIAL SERVICES</Text>
        </View>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.5, color: C.ink3, letterSpacing: 0.25, marginBottom: 1.5 }}>{[m.customer, m.title].filter(Boolean).join("   |   ").toUpperCase()}</Text>
      </View>
      <View fixed style={{ position: "absolute", bottom: 16, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 5 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.5, color: C.ink3, letterSpacing: 0.25 }}>TERMS, GUARANTEES AND EXCLUSIONS ARE GOVERNED BY THE EXECUTED ORKIN SERVICE AGREEMENT.</Text>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.5, color: C.ink3, letterSpacing: 0.25 }} render={({ pageNumber }) => `${m.dateLabel.toUpperCase()}   /   ${pad2(pageNumber)}`} />
      </View>
    </>
  );
}

/** "2 pages" (band, no cover) and "Short" (cover + compact pages). */
export function CompactPages({ m, level, W, H, band }: { m: PdfModel; level: number; W: number; H: number; band: boolean }) {
  const size = [9.2, 8.8, 8.4, 8.0, 7.6][Math.min(4, level)];
  // With the summary band showing every price, a pricing section with nothing else to add is not repeated.
  const redundant = (x: ProposalSection) => band && bandShowsAll(m) && x.type === "investment" && level >= 1 && !m.programs.some((p) => p.terms || p.contractTotal || p.equipment.some((e) => e.unit));
  const sections = condenseAll(m.sections, level).filter((x) => !redundant(x));
  const rows = packRows(sections, m, W - 76, size, level);
  return (
    <Page size={[W, H]} style={{ fontFamily: "Lato", paddingTop: 48, paddingBottom: 38, paddingHorizontal: 38, backgroundColor: C.white }} wrap>
      <ChromeFixed m={m} />
      {band && <SummaryBand m={m} />}
      {rows.map((row, i) => (
        <CompactRow key={row.cells[0].s.id} row={row} m={m} size={size} band={band} keep={level > 0} first={i === 0} labelOnly={level >= 3} />
      ))}
    </Page>
  );
}

// ───────────────────────── One page ─────────────────────────

function Block({ label, children, size }: { label: string; children: React.ReactNode; size: number }) {
  return (
    <View style={{ marginBottom: size * 0.9 }} wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2.5 }}>
        <View style={{ width: 8, height: 2, backgroundColor: C.red, marginRight: 5 }} />
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.8, color: C.red, letterSpacing: 0.25, textTransform: "uppercase" }}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function P({ t, size, muted }: { t: string; size: number; muted?: boolean }) {
  if (!t) return null;
  return <Text style={{ fontSize: size, lineHeight: 1.36, color: muted ? C.ink3 : C.ink2, marginBottom: 1.5 }}>{t.replace(/\n+/g, " ")}</Text>;
}

function List({ items, size, titlesOnly }: { items: { title: string; body: string }[]; size: number; titlesOnly?: boolean }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 1.5 }}>
          <Bullet size={3.5} />
          <Text style={{ flex: 1, fontSize: size, lineHeight: 1.34, color: C.ink2 }}>
            {it.body && !titlesOnly ? <Text style={{ fontFamily: "Lato", fontWeight: 700, color: C.ink }}>{it.title}</Text> : it.title}
            {!titlesOnly && it.body ? `: ${it.body}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const COL_A: SectionType[] = ["executive_overview", "property_assessment", "program_objectives", "pest_specific", "coverage", "photos", "floor_plans"];
const COL_C: SectionType[] = ["investment", "specialty_services", "triple_guarantee", "customer_responsibilities", "exclusions", "authorization", "conclusion"];

/** "1 page": every section represented on a single landscape page, in three columns. */
/** Height (pt) of a block exactly as OnePage lays it out. */
function onePageHeight(s: ProposalSection, m: PdfModel, colW: number, size: number, level: number): number {
  const cpl = colW / (size * 0.49);
  const lh = size * 1.36;
  const lines = (t: string, w = cpl) => (t ? Math.ceil(t.replace(/\n+/g, " ").length / w) : 0);
  const label = 11 + size * 0.9;
  const para = (t: string) => (t ? lines(t) * lh + 1.5 : 0);
  const list = (items: { title: string; body: string }[], titles = false) => items.reduce((a, it) => a + lines(titles ? it.title : `${it.title}: ${it.body}`, cpl - 6) * size * 1.34 + 1.5, 0);
  switch (s.type) {
    case "investment":
      return 30 + m.programs.reduce((a, p) => a + (m.programs.length > 1 ? 14 : 0) + priceCards(p).length * 17 + (p.terms ? lines(p.terms) * 9 : 0) + (p.contractTotal ? 10 : 0), 0) + size;
    case "equipment_allocation":
      return label + para(firstSentences(s.body, 1)) + 18 + m.programs.reduce((a, p) => a + p.equipment.length, 0) * 12.5;
    case "service_frequency":
      return label + m.programs.length * (size + 2) * 1.3 + para(s.body);
    case "specialty_services":
      return label + list(m.specialty.map((x) => ({ title: x.name, body: x.price })));
    case "portfolio_schedules":
      return label + lh * 2;
    case "implementation":
    case "review_milestones":
      return label + para(s.body) + lines(s.items.map((it) => `00 ${it.title} ${it.body}   `).join("")) * lh;
    case "conclusion":
    case "authorization":
      return label + para(s.body);
    default:
      return label + para(s.body) + list(s.items, level >= 3 && !["exclusions", "customer_responsibilities"].includes(s.type)) + (s.callout ? lines(s.callout) * (size - 0.6) * 1.36 + 1.5 : 0);
  }
}

/** Column split variants tried for the one-page layout before condensing further. */
export const ONE_PAGE_VARIANTS = [1.0, 0.92, 1.1];

export function OnePage({ m, level, W, H, variant = 0 }: { m: PdfModel; level: number; W: number; H: number; variant?: number }) {
  const size = [8.8, 8.6, 8.2, 7.8, 7.4, 7.0][Math.min(5, level)];
  const secs = condenseAll(m.sections, level).filter((s) => s.type !== "photos" && s.type !== "floor_plans");
  // Reading order: situation and site, then the program, then price and terms; split into three balanced columns.
  const rank = (s: ProposalSection) => (COL_A.includes(s.type) ? 0 : COL_C.includes(s.type) ? (s.type === "investment" ? 2 : 3) : 1);
  const ordered = secs.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  const colW = (W - 48 - 28) / 3;
  const heights = ordered.map((s) => onePageHeight(s, m, colW, size, level));
  const total = heights.reduce((a, b) => a + b, 0);
  const share = (total / 3) * ONE_PAGE_VARIANTS[variant % ONE_PAGE_VARIANTS.length];
  const cols: ProposalSection[][] = [[], [], []];
  let c = 0;
  let acc = 0;
  ordered.forEach((s, i) => {
    // Move to the next column when this block would end past the column's share (more than half of it over).
    if (c < 2 && cols[c].length && acc + heights[i] / 2 > share) {
      c++;
      acc = 0;
    }
    cols[c].push(s);
    acc += heights[i];
  });
  const [colA, colB, colC] = cols;
  const label = (s: ProposalSection) => s.eyebrow || s.type.replace(/_/g, " ");

  const render = (s: ProposalSection) => {
    switch (s.type) {
      case "photos":
      case "floor_plans":
        return null;
      case "investment":
        return (
          <View key={s.id} wrap={false} style={{ backgroundColor: C.dark, borderRadius: 4, padding: 10, marginBottom: size }}>
            <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.8, color: C.mint, letterSpacing: 0.25, textTransform: "uppercase" }}>{label(s)}</Text>
            {m.programs.map((p, i) => (
              <View key={i} style={{ marginTop: 5 }}>
                {m.programs.length > 1 && <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 1, color: C.white, textTransform: "uppercase" }}>{p.name}</Text>}
                {priceCards(p).map((c, j) => (
                  <View key={j} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: j ? 2 : 0 }}>
                    <Text style={{ fontSize: size - 0.6, color: "#C9C9CF" }}>
                      {c.label} <Text style={{ color: "#8E8E96" }}>· {c.sub}</Text>
                    </Text>
                    <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: j === 0 ? 20 : 12, color: C.white }}>{c.value}</Text>
                  </View>
                ))}
                {!!p.terms && <Text style={{ fontSize: size - 1.2, color: "#A9A9B0", marginTop: 2 }}>{p.terms}</Text>}
                {!!p.contractTotal && <Text style={{ fontSize: size - 1.2, color: "#A9A9B0", marginTop: 2 }}>Contract-period total (recurring): {p.contractTotal}.</Text>}
              </View>
            ))}
          </View>
        );
      case "equipment_allocation":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <P t={firstSentences(s.body, 1)} size={size} />
            <MiniTable cols={DEVICE_COLS} rows={deviceRows(m)} size={size} />
          </Block>
        );
      case "service_frequency":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            {m.programs.map((p, i) => (
              <Text key={i} style={{ fontSize: size, color: C.ink2 }}>
                <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 2, color: C.red, textTransform: "uppercase" }}>{p.frequency}</Text>
                {m.programs.length > 1 ? `  ${p.name}` : ""} · {p.billingLabel === "one-time service" ? "one-time service" : `billed ${p.monthly ? "monthly" : "per completed visit"}`}
              </Text>
            ))}
            <P t={s.body} size={size} />
          </Block>
        );
      case "specialty_services":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <List items={m.specialty.map((x) => ({ title: x.name, body: x.price }))} size={size} />
          </Block>
        );
      case "portfolio_schedules":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <P t={m.schedules.map((sch) => `Schedule ${sch.code}: ${sch.rows.length} properties${sch.homes ? `, ${sch.homes.toLocaleString()} apartment homes` : ""}`).join(". ") + ". Property rates are listed in the schedules."} size={size} />
          </Block>
        );
      case "implementation":
      case "review_milestones":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <P t={s.body} size={size} />
            <Text style={{ fontSize: size, color: C.ink2, lineHeight: 1.36 }}>
              {s.items.map((it, i) => (
                <Text key={i}>
                  <Text style={{ fontFamily: DISPLAY, fontWeight: 700, color: C.red }}>{pad2(i + 1)} </Text>
                  <Text style={{ fontWeight: 700, color: C.ink }}>{it.title}</Text>
                  {it.body ? ` ${it.body}` : ""}
                  {i < s.items.length - 1 ? "   " : ""}
                </Text>
              ))}
            </Text>
          </Block>
        );
      case "conclusion":
      case "authorization":
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <P t={s.body} size={size} />
          </Block>
        );
      default:
        return (
          <Block key={s.id} label={label(s)} size={size}>
            <P t={s.body} size={size} />
            {s.items.length > 0 && <List items={s.items} size={size} titlesOnly={level >= 3 && !["exclusions", "customer_responsibilities"].includes(s.type)} />}
            {!!s.callout && <P t={s.callout} size={size - 0.6} muted />}
          </Block>
        );
    }
  };

  return (
    <Page size={[W, H]} style={{ fontFamily: "Lato", padding: 24, paddingBottom: 34, backgroundColor: C.white }} wrap>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: C.red }} fixed />
      <View wrap={false} style={{ backgroundColor: C.dark, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18, color: C.red }}>ORKIN</Text>
            <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.5, color: "#BDBDC4", letterSpacing: 0.25, marginLeft: 8, marginBottom: 2 }}>COMMERCIAL SERVICES</Text>
          </View>
          <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: C.white, textTransform: "uppercase", marginTop: 4, lineHeight: 1.05 }}>{m.title}</Text>
        </View>
        <View style={{ width: 260, alignItems: "flex-end" }}>
          {!!m.customer && <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 9, color: C.white, textTransform: "uppercase", textAlign: "right" }}>Prepared for {m.customer}</Text>}
          {!!m.address && <Text style={{ fontSize: 7.5, color: "#BDBDC4", marginTop: 2, textAlign: "right" }}>{m.address}</Text>}
          <Text style={{ fontSize: 7.5, color: "#BDBDC4", marginTop: 2, textAlign: "right" }}>
            {m.dateLabel}   ·   Prepared by {m.preparedBy.map((p) => [p.name, p.phone].filter(Boolean).join(", ")).join("; ")}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ flex: 1 }}>{colA.map(render)}</View>
        <View style={{ width: 0.6, backgroundColor: C.line }} />
        <View style={{ flex: 1 }}>{colB.map(render)}</View>
        <View style={{ width: 0.6, backgroundColor: C.line }} />
        <View style={{ flex: 1 }}>
          {colC.map(render)}

        </View>
      </View>
      <View fixed style={{ position: "absolute", bottom: 14, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 4 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.2, color: C.ink3, letterSpacing: 0.25 }}>TERMS, GUARANTEES, EXCLUSIONS AND ELIGIBILITY ARE GOVERNED BY THE EXECUTED ORKIN SERVICE AGREEMENT.</Text>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 6.2, color: C.ink3, letterSpacing: 0.25 }}>{m.dateLabel.toUpperCase()}</Text>
      </View>
    </Page>
  );
}

export function compactTitle(m: PdfModel) {
  return `${m.title}${m.customer ? ` — ${m.customer}` : ""}`;
}

export function OnePageDocument({ m, level, variant = 0 }: { m: PdfModel; level: number; variant?: number }) {
  const [W, H] = m.orientation === "landscape" ? [792, 612] : [612, 792];
  return (
    <Document title={compactTitle(m)} author={m.preparedBy.map((p) => p.name).join(", ")} creator="Orkin Proposal Studio" producer="Orkin Proposal Studio" language="en-US">
      <OnePage m={m} level={level} W={W} H={H} variant={variant} />
    </Document>
  );
}
