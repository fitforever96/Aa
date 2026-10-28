/* eslint-disable jsx-a11y/alt-text */
import React, { createContext, useContext } from "react";
import { Document, Font, Image, Page, Path, Polygon, Rect, StyleSheet, Svg, Text, View, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import type { PdfModel } from "./model";
import type { ProposalSection } from "../types";

/**
 * Premium customer-facing proposal PDF. Vector text (searchable/selectable),
 * embedded fonts, repeating table headers, rows that never split, fixed headers
 * and footers with page numbers. Layout language follows the reference proposal:
 * Roboto Condensed display type, Lato body, Orkin red accents, charcoal panels.
 */

let fontsRegistered = false;
export function registerPdfFonts(base: string) {
  if (fontsRegistered) return;
  const f = (n: string) => `${base}/fonts/${n}`;
  Font.register({
    family: "RobotoCondensed",
    fonts: [
      { src: f("roboto-condensed-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("roboto-condensed-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("roboto-condensed-latin-700-normal.woff"), fontWeight: 700 },
      { src: f("roboto-condensed-latin-800-normal.woff"), fontWeight: 800 },
    ],
  });
  Font.register({
    family: "Lato",
    fonts: [
      { src: f("lato-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("lato-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: f("lato-latin-700-normal.woff"), fontWeight: 700 },
      { src: f("lato-latin-900-normal.woff"), fontWeight: 900 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsRegistered = true;
}

const C = {
  red: "#E4002B",
  ink: "#232325",
  ink2: "#46464C",
  ink3: "#76767E",
  line: "#D9DADD",
  card: "#F2F3F5",
  card2: "#F7F7F8",
  dark: "#232326",
  darker: "#1B1D21",
  mint: "#B7CFC8",
  white: "#FFFFFF",
};

const S = StyleSheet.create({
  page: { fontFamily: "Lato", fontSize: 10.5, color: C.ink2, paddingTop: 84, paddingBottom: 58, paddingHorizontal: 44, backgroundColor: C.white },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 7, backgroundColor: C.red },
  header: { position: "absolute", top: 24, left: 44, right: 44, height: 36, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderBottomWidth: 0.75, borderBottomColor: C.line, paddingBottom: 8 },
  wordmark: { fontFamily: "RobotoCondensed", fontWeight: 800, color: C.red, fontSize: 19, letterSpacing: 0.2 },
  headerSub: { fontFamily: "Lato", fontWeight: 700, fontSize: 7.5, color: C.ink3, letterSpacing: 0.25, marginLeft: 22, marginBottom: 2 },
  headerRight: { fontFamily: "Lato", fontWeight: 700, fontSize: 7.5, color: C.ink3, letterSpacing: 0.25, marginBottom: 2 },
  footer: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 8 },
  footerText: { fontFamily: "Lato", fontWeight: 700, fontSize: 7.5, color: C.ink3, letterSpacing: 0.25 },
  eyebrow: { fontFamily: "Lato", fontWeight: 900, fontSize: 9, color: C.red, letterSpacing: 0.25, marginBottom: 8 },
  h1: { fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 28, color: C.ink, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: 0.2 },
  h1Accent: { fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 24, color: C.red, lineHeight: 1.06, textTransform: "uppercase", letterSpacing: 0.2, marginTop: 2 },
  body: { fontSize: 10.5, lineHeight: 1.5, color: C.ink2, marginBottom: 7 },
  bodyLead: { fontSize: 11.5, lineHeight: 1.5, color: C.ink2, marginBottom: 8 },
  cardTitle: { fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 11, color: C.ink, textTransform: "uppercase", letterSpacing: 0.2, marginBottom: 4 },
  cardBody: { fontSize: 9.5, lineHeight: 1.45, color: C.ink3 },
  small: { fontSize: 8, color: C.ink3, lineHeight: 1.4 },
  section: { marginBottom: 20 },
  th: { fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: C.white, letterSpacing: 0.25, textTransform: "uppercase" },
  td: { fontSize: 9, color: C.ink2 },
  num: { fontFamily: "RobotoCondensed", fontWeight: 700 },
});

/** Inside a section that is already kept whole, nested no-wrap/fixed flags are dropped (they confuse pagination). */
const WholeCtx = createContext(false);
function useNoWrap(): { wrap?: boolean } {
  return useContext(WholeCtx) ? {} : { wrap: false };
}
function useFixed(): boolean {
  return !useContext(WholeCtx);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function Diamond({ color = C.red, size = 5.5 }: { color?: string; size?: number }) {
  return <View style={{ width: size, height: size, backgroundColor: color, transform: "rotate(45deg)", marginTop: 4, marginRight: 9 }} />;
}

function RichBody({ text, lead, color }: { text: string; lead?: boolean; color?: string }) {
  const nw = useNoWrap();
  if (!text?.trim()) return null;
  const blocks = text.split(/\n{2,}/);
  return (
    <View>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <View key={i} style={{ marginBottom: 6 }}>
              {lines.map((l, j) => (
                <View key={j} style={{ flexDirection: "row", marginBottom: 4 }} {...nw}>
                  <Diamond />
                  <Text style={[S.body, { marginBottom: 0, flex: 1 }, color ? { color } : {}]}>{l.replace(/^\s*[-•]\s+/, "")}</Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={[i === 0 && lead ? S.bodyLead : S.body, color ? { color } : {}]}>
            {b.replace(/\n/g, " ")}
          </Text>
        );
      })}
    </View>
  );
}

function SectionHead({ n, s }: { n: number; s: ProposalSection }) {
  const nw = useNoWrap();
  return (
    <View {...nw} style={{ marginBottom: 12 }}>
      <Text style={S.eyebrow}>
        {pad2(n)} / {(s.eyebrow || s.type.replace(/_/g, " ")).toUpperCase()}
      </Text>
      {!!s.headline && <Text style={S.h1}>{s.headline}</Text>}
      {!!s.headlineAccent && <Text style={S.h1Accent}>{s.headlineAccent}</Text>}
    </View>
  );
}

function CardGrid({ items, cols = 3, numbered, tall }: { items: { title: string; body: string }[]; cols?: number; numbered?: boolean; tall?: boolean }) {
  const nw = useNoWrap();
  if (!items.length) return null;
  const w = cols === 2 ? "48.9%" : cols === 4 ? "23.6%" : "32.2%";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
      {items.map((it, i) => (
        <View key={i} {...nw} style={{ width: w, backgroundColor: C.card, borderRadius: 4, padding: 12, paddingLeft: numbered ? 14 : 16, minHeight: tall ? 92 : 64, borderLeftWidth: numbered ? 0 : 3.5, borderLeftColor: C.red }}>
          {numbered ? (
            <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 24, color: C.red, marginBottom: 6 }}>{pad2(i + 1)}</Text>
          ) : null}
          <View style={{ flexDirection: "row" }}>
            {!numbered && <Diamond />}
            <Text style={[S.cardTitle, { flex: 1 }]}>{it.title}</Text>
          </View>
          {!!it.body && <Text style={[S.cardBody, !numbered ? { marginLeft: 14.5 } : {}]}>{it.body}</Text>}
        </View>
      ))}
    </View>
  );
}

function DarkPanel({ title, text, accent }: { title?: string; text: string; accent?: string }) {
  const nw = useNoWrap();
  if (!text) return null;
  return (
    <View {...nw} style={{ backgroundColor: C.dark, borderRadius: 4, padding: 14, paddingHorizontal: 18, marginTop: 10 }}>
      {!!title && <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 11, color: accent ?? C.mint, textTransform: "uppercase", marginBottom: 4 }}>{title}</Text>}
      <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: C.white }}>{text}</Text>
    </View>
  );
}

function Note({ text }: { text: string }) {
  const nw = useNoWrap();
  if (!text) return null;
  return (
    <View {...nw} style={{ backgroundColor: C.card, borderRadius: 3, padding: 10, paddingHorizontal: 14, marginTop: 10 }}>
      <Text style={{ fontSize: 9, color: C.ink2, lineHeight: 1.45 }}>{text}</Text>
    </View>
  );
}

function Table({ cols, rows, zebra = true }: { cols: { label: string; w: string; align?: "left" | "right" | "center" }[]; rows: (React.ReactNode | string)[][]; zebra?: boolean }) {
  const nw = useNoWrap();
  const fx = useFixed();
  return (
    <View style={{ marginTop: 6 }}>
      <View fixed={fx} style={{ flexDirection: "row", backgroundColor: C.darker, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingVertical: 8, paddingHorizontal: 10 }}>
        {cols.map((c, i) => (
          <Text key={i} style={[S.th, { width: c.w, textAlign: c.align ?? "left" }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} {...nw} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6.5, paddingHorizontal: 10, backgroundColor: zebra && i % 2 === 1 ? C.card2 : C.white, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          {r.map((cell, j) => (
            <View key={j} style={{ width: cols[j].w, alignItems: cols[j].align === "right" ? "flex-end" : cols[j].align === "center" ? "center" : "flex-start" }}>
              {typeof cell === "string" ? <Text style={[S.td, { textAlign: cols[j].align ?? "left" }]}>{cell}</Text> : cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function StatRow({ stats }: { stats: { value: string; label: string }[] }) {
  const nw = useNoWrap();
  if (!stats.length) return null;
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }} {...nw}>
      {stats.map((s, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: C.card, borderRadius: 4, borderLeftWidth: 4, borderLeftColor: C.red, padding: 12, paddingLeft: 14 }}>
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 28, color: C.ink, lineHeight: 1 }}>{s.value}</Text>
          <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 8.5, color: C.red, textTransform: "uppercase", marginTop: 6, letterSpacing: 0.25 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AIM({ items }: { items: { title: string; body: string }[] }) {
  const nw = useNoWrap();
  return (
    <View {...nw}>
      <View style={{ backgroundColor: C.dark, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 10 }}>
        {[
          ["A", "ASSESS"],
          ["I", "IMPLEMENT"],
          ["M", "MONITOR"],
        ].map(([l, w], i) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center" }}>
            {i > 0 && <View style={{ width: 34, height: 1.5, backgroundColor: C.mint, marginRight: 16 }} />}
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.red, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 19, color: C.white }}>{l}</Text>
            </View>
            <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 17, color: C.white }}>{w}</Text>
          </View>
        ))}
      </View>
      <CardGrid items={items} cols={3} numbered tall />
    </View>
  );
}

function Investment({ m }: { m: PdfModel }) {
  const nw = useNoWrap();
  return (
    <View>
      {m.programs.map((p, i) => (
        <View key={i} {...nw} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.darker, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingVertical: 9, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 12, color: C.white, textTransform: "uppercase" }}>{p.name}</Text>
            <Text style={[S.th, { color: C.mint }]}>{p.frequency}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, backgroundColor: C.card2, padding: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }}>
            {[
              p.initial ? { label: "Initial service", value: p.initial, sub: "one-time, before recurring service" } : null,
              p.recurring ? { label: p.monthly ? "Monthly service" : "Recurring service", value: p.monthly ?? p.recurring, sub: p.monthly ? `${p.frequency.toLowerCase()} service, billed monthly` : p.billingLabel } : null,
              p.equipmentTotal ? { label: "Equipment investment", value: p.equipmentTotal, sub: "one-time, billed separately" } : null,
            ]
              .filter(Boolean)
              .map((c, j) => (
                <View key={j} style={{ flex: 1, backgroundColor: C.white, borderRadius: 4, padding: 12, borderTopWidth: 3, borderTopColor: j === 0 ? C.red : C.dark }}>
                  <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8, color: C.red, textTransform: "uppercase", letterSpacing: 0.25 }}>{c!.label}</Text>
                  <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 26, color: C.ink, marginTop: 5 }}>{c!.value}</Text>
                  <Text style={[S.small, { marginTop: 3 }]}>{c!.sub}</Text>
                </View>
              ))}
          </View>
          {p.equipment.some((e) => e.unit) && (
            <Table
              cols={[
                { label: "Equipment", w: "44%" },
                { label: "Location", w: "16%" },
                { label: "Quantity", w: "12%", align: "right" },
                { label: "Unit price", w: "14%", align: "right" },
                { label: "Total", w: "14%", align: "right" },
              ]}
              rows={p.equipment.map((e) => [e.name, e.location, `${e.quantity + e.reserve}${e.reserve ? ` (incl. ${e.reserve} reserve)` : ""}`, e.unit ?? "—", <Text key="t" style={[S.td, { color: C.red, fontWeight: 700 }]}>{e.total ?? "—"}</Text>])}
            />
          )}
          {(p.terms || p.contractTotal) && <Text style={[S.small, { marginTop: 6 }]}>{[p.terms, p.contractTotal ? `Contract-period total (recurring): ${p.contractTotal}.` : ""].filter(Boolean).join(" ")}</Text>}
        </View>
      ))}
    </View>
  );
}

function EquipmentTable({ m }: { m: PdfModel }) {
  const rows = m.programs.flatMap((p) => p.equipment.map((e) => [e.name, e.location, String(e.quantity), e.reserve ? String(e.reserve) : "—", m.programs.length > 1 ? p.name : p.frequency]));
  if (!rows.length) return null;
  return (
    <Table
      cols={[
        { label: "Device", w: "40%" },
        { label: "Location", w: "16%" },
        { label: "Serviced", w: "12%", align: "right" },
        { label: "Reserve", w: "12%", align: "right" },
        { label: m.programs.length > 1 ? "Program" : "Service", w: "20%", align: "right" },
      ]}
      rows={rows}
    />
  );
}

function FrequencyCards({ m }: { m: PdfModel }) {
  const nw = useNoWrap();
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }} {...nw}>
      {m.programs.map((p, i) => (
        <View key={i} style={{ flex: 1, borderWidth: 0.75, borderColor: C.line, borderRadius: 4, borderTopWidth: 4, borderTopColor: i % 2 ? C.dark : C.red, padding: 14 }}>
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 12, color: C.ink, textTransform: "uppercase" }}>{p.name}</Text>
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 22, color: i % 2 ? C.ink : C.red, marginTop: 6, textTransform: "uppercase" }}>{p.frequency}</Text>
          <Text style={[S.small, { marginTop: 4 }]}>{p.billingLabel === "one-time service" ? "One-time service" : `Billed ${p.monthly ? "monthly" : "per completed service visit"}`}</Text>
        </View>
      ))}
    </View>
  );
}

function PhotoGrid({ photos }: { photos: { src: string; caption: string }[] }) {
  const nw = useNoWrap();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {photos.map((ph, i) => (
        <View key={i} {...nw} style={{ width: photos.length === 1 ? "100%" : "48.9%" }}>
          <Image src={ph.src} style={{ width: "100%", height: photos.length === 1 ? 300 : 190, objectFit: "cover", borderRadius: 3 }} />
          {!!ph.caption && <Text style={[S.small, { marginTop: 4, fontWeight: 700, textTransform: "uppercase" }]}>{ph.caption}</Text>}
        </View>
      ))}
    </View>
  );
}

function Authorization({ m, s }: { m: PdfModel; s: ProposalSection }) {
  const nw = useNoWrap();
  return (
    <View {...nw}>
      <RichBody text={s.body} lead />
      <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
        <View style={{ flex: 1, backgroundColor: C.card, borderTopWidth: 3, borderTopColor: C.red, borderRadius: 3, padding: 14 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: C.red, letterSpacing: 0.25, marginBottom: 8 }}>PREPARED BY</Text>
          {m.preparedBy.map((p, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 10, color: C.ink, textTransform: "uppercase" }}>{p.name}</Text>
              <Text style={S.small}>{[p.title, p.phone, p.email].filter(Boolean).join("  |  ")}</Text>
            </View>
          ))}
          <Text style={[S.small, { marginTop: 4 }]}>Orkin Commercial Services</Text>
        </View>
        <View style={{ flex: 1, borderWidth: 0.75, borderColor: C.line, borderRadius: 3, padding: 14 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: C.red, letterSpacing: 0.25, marginBottom: 14 }}>ACCEPTED BY {m.customer ? `— ${m.customer.toUpperCase()}` : ""}</Text>
          {["Authorized signature", "Printed name & title", "Date"].map((l) => (
            <View key={l} style={{ marginBottom: 12 }}>
              <View style={{ borderBottomWidth: 0.75, borderBottomColor: C.ink3, height: 14 }} />
              <Text style={[S.small, { marginTop: 3 }]}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[S.small, { marginTop: 10, fontWeight: 700, textTransform: "uppercase" }]}>Start dates, guarantees, taxes and amendments follow the applicable executed Orkin agreement.</Text>
    </View>
  );
}

function SectionBody({ s, m }: { s: ProposalSection; m: PdfModel }) {
  const nw = useNoWrap();
  switch (s.type) {
    case "executive_overview":
      return (
        <View>
          <RichBody text={s.body} lead />
          <StatRow stats={m.cover.stats} />
          {m.programs.length > 1 && (
            <View style={{ marginTop: 14 }}>
              <Text style={[S.cardTitle, { fontSize: 10, color: C.ink2 }]}>Program components</Text>
              <CardGrid items={m.programs.map((p) => ({ title: p.name, body: p.frequency }))} cols={2} />
            </View>
          )}
          <CardGrid items={s.items} cols={3} />
        </View>
      );
    case "coverage":
      return (
        <View>
          <RichBody text={s.body} />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <View style={{ flex: 1.7 }}>
              {s.items.map((it, i) => (
                <View key={i} {...nw} style={{ backgroundColor: C.card2, borderLeftWidth: 3.5, borderLeftColor: C.red, borderRadius: 3, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 7 }}>
                  <Text style={S.cardTitle}>{it.title}</Text>
                  <Text style={S.cardBody}>{it.body}</Text>
                </View>
              ))}
            </View>
            {!!s.callout && (
              <View {...nw} style={{ flex: 1, backgroundColor: C.dark, borderRadius: 4, padding: 16, alignSelf: "flex-start" }}>
                <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 16, color: C.white, textTransform: "uppercase" }}>Scope boundaries</Text>
                <View style={{ height: 2, backgroundColor: C.red, marginVertical: 10, width: "100%" }} />
                <Text style={{ fontSize: 9.5, lineHeight: 1.5, color: C.white }}>{s.callout}</Text>
              </View>
            )}
          </View>
        </View>
      );
    case "ipm":
      return (
        <View>
          <RichBody text={s.body} />
          <AIM items={s.items} />
          {!!s.callout && <Text style={[S.small, { marginTop: 8 }]}>{s.callout}</Text>}
        </View>
      );
    case "implementation":
      return (
        <View>
          <RichBody text={s.body} />
          <CardGrid items={s.items} cols={s.items.length === 4 ? 4 : 3} numbered tall />
          <DarkPanel title="Ongoing program review" text={s.callout} />
        </View>
      );
    case "review_milestones":
    case "program_objectives":
      return (
        <View>
          <RichBody text={s.body} />
          <CardGrid items={s.items} cols={s.items.length === 4 ? 2 : 3} numbered={s.type === "review_milestones"} />
          <DarkPanel text={s.callout} />
        </View>
      );
    case "equipment_allocation":
      return (
        <View>
          <RichBody text={s.body} />
          <EquipmentTable m={m} />
          <CardGrid items={s.items} cols={3} />
        </View>
      );
    case "service_frequency":
      return (
        <View>
          <RichBody text={s.body.split(/\n{2,}/).filter((b) => !b.split("\n").every((l) => /^\s*-\s/.test(l))).join("\n\n")} />
          <FrequencyCards m={m} />
          {!!s.callout && <Text style={[S.small, { marginTop: 8, fontWeight: 700, textTransform: "uppercase" }]}>{s.callout}</Text>}
        </View>
      );
    case "investment":
      return (
        <View>
          <RichBody text={s.body} />
          <Investment m={m} />
          <Note text={s.callout} />
        </View>
      );
    case "specialty_services":
      return (
        <View>
          <RichBody text={s.body} />
          <Table
            cols={[
              { label: "Service / treatment scope", w: "74%" },
              { label: "Price / basis", w: "26%", align: "right" },
            ]}
            rows={m.specialty.map((x) => [
              <View key="a">
                <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 9, color: C.ink, textTransform: "uppercase" }}>{x.name}</Text>
                {!!x.description && <Text style={[S.small, { marginTop: 2 }]}>{x.description}</Text>}
              </View>,
              <Text key="b" style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 10, color: C.red }}>{x.price}</Text>,
            ])}
          />
          {!!s.callout && <Text style={[S.small, { marginTop: 8 }]}>{s.callout}</Text>}
        </View>
      );
    case "triple_guarantee":
      return (
        <View>
          <Text style={[S.small, { marginBottom: 10 }]}>{s.body}</Text>
          <CardGrid items={s.items} cols={3} />
          {!!s.callout && <Text style={[S.small, { marginTop: 10, fontWeight: 700, textTransform: "uppercase" }]}>{s.callout}</Text>}
        </View>
      );
    case "customer_responsibilities":
    case "exclusions":
      return (
        <View>
          <View style={{ backgroundColor: C.card2, borderRadius: 4, padding: 14, paddingBottom: 8 }}>
            <RichBody text={s.body} />
          </View>
          <CardGrid items={s.items} cols={2} />
          {!!s.callout && <Note text={s.callout} />}
        </View>
      );
    case "authorization":
      return <Authorization m={m} s={s} />;
    case "photos":
      return (
        <View>
          <RichBody text={s.body} />
          {m.photos.length ? <PhotoGrid photos={m.photos} /> : null}
        </View>
      );
    case "floor_plans":
      return (
        <View>
          <RichBody text={s.body} />
          {m.floorPlans.length ? <PhotoGrid photos={m.floorPlans} /> : null}
        </View>
      );
    default:
      return (
        <View>
          <RichBody text={s.body} lead={s.type === "property_assessment"} />
          <CardGrid items={s.items} cols={s.items.length === 2 || s.items.length === 4 ? 2 : 3} />
          {!!s.callout && (s.type === "documentation" || s.type === "reporting_capability" ? <Note text={s.callout} /> : <DarkPanel text={s.callout} />)}
        </View>
      );
  }
}

function Schedules({ m, startN }: { m: PdfModel; startN: number }) {
  return (
    <>
      {m.schedules.map((sch, i) => (
        <View key={i} break>
          <Text style={S.eyebrow}>
            {pad2(startN)} / SCHEDULE {sch.code.toUpperCase()}
          </Text>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 24, color: C.ink, marginBottom: 2 }}>{sch.title}</Text>
          {!!sch.subtitle && <Text style={[S.small, { fontSize: 9.5, marginBottom: 8 }]}>{sch.subtitle}</Text>}
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 9, color: C.red, marginBottom: 4 }}>
            {sch.rows.length} {sch.rows.length === 1 ? "PROPERTY" : "PROPERTIES"}
            {sch.homes ? `   /   ${sch.homes.toLocaleString()} APARTMENT HOMES` : ""}
          </Text>
          <Table
            cols={[
              { label: "Property / service address", w: "40%" },
              { label: "Metro", w: "16%" },
              { label: "Units", w: "9%", align: "right" },
              { label: "Rot./mo.", w: "11%", align: "right" },
              { label: "Apts/visit", w: "11%", align: "right" },
              { label: sch.rateLabel, w: "13%", align: "right" },
            ]}
            rows={sch.rows.map((r) => [
              <View key="n">
                <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 9.5, color: C.ink }}>{r.name}</Text>
                {!!r.address && <Text style={{ fontSize: 7.5, color: C.ink3, marginTop: 1 }}>{r.address}</Text>}
              </View>,
              r.metro,
              r.units,
              r.rot,
              <Text key="a" style={[S.td, { fontWeight: 700, color: C.ink }]}>{r.apv}</Text>,
              <Text key="r" style={[S.td, { color: C.red }]}>{r.rate}</Text>,
            ])}
          />
          <Text style={[S.small, { marginTop: 8 }]}>Rot./mo. is the planned monthly rotation minimum. Apartments per visit reflects whole-apartment capacity, including rounding for follow-up.</Text>
        </View>
      ))}
    </>
  );
}

// ───────────────────────── Covers ─────────────────────────

function PreparedBox({ m, dark }: { m: PdfModel; dark: boolean }) {
  return (
    <View style={{ backgroundColor: dark ? C.darker : C.card, padding: 14, paddingHorizontal: 16, borderRadius: 2 }}>
      <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 6.5, color: dark ? "#BBBBC2" : C.ink3, letterSpacing: 0.25, marginBottom: 8 }}>PREPARED BY</Text>
      {m.preparedBy.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 5 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 9.5, color: dark ? C.white : C.ink, textTransform: "uppercase", width: 130 }}>{p.name}</Text>
          <Text style={{ fontSize: 7, color: dark ? "#BBBBC2" : C.ink3, textTransform: "uppercase", letterSpacing: 0.25 }}>{[p.title, p.phone].filter(Boolean).join("  |  ")}</Text>
        </View>
      ))}
    </View>
  );
}

function TitleBlock({ m, color, size = 52 }: { m: PdfModel; color: string; size?: number }) {
  const words = m.title.toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 15 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  const fs = lines.length > 4 ? size * 0.72 : lines.length > 3 ? size * 0.85 : size;
  return (
    <View>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: fs, color, lineHeight: 1.02, letterSpacing: 0.25 }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function CoverCharcoal({ m, W, H }: { m: PdfModel; W: number; H: number }) {
  const split = W * 0.47;
  return (
    <Page size={[W, H]} style={{ backgroundColor: "#1E1E21", fontFamily: "Lato" }}>
      <Svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <Rect x={0} y={0} width={W} height={H} fill="#1E1E21" />
        <Polygon points={`0,${H * 0.62} ${split * 0.95},${H * 0.53} ${split * 0.84},${H} 0,${H}`} fill="#18181B" />
        {!m.cover.image && <Polygon points={`${split + 40},0 ${W},0 ${W},${H} ${split - 40},${H}`} fill="#26262A" />}
        {!m.cover.image && <Polygon points={`${split + 160},0 ${W},0 ${W},${H * 0.55}`} fill="#2C2C31" />}
        <Rect x={0} y={0} width={W} height={10} fill={C.red} />
      </Svg>
      {m.cover.image && (
        <>
          <Image src={m.cover.image} style={{ position: "absolute", top: 10, right: 0, width: W - split + 40, height: H - 10, objectFit: "cover" }} />
          <Svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
            <Polygon points={`${split + 40},10 ${split + 120},10 ${split - 40},${H} ${split - 40},${H}`} fill="#1E1E21" />
            <Polygon points={`${split - 40},10 ${split + 120},10 ${split - 40},${H}`} fill="#1E1E21" />
          </Svg>
        </>
      )}
      {!m.cover.image && (
        <View style={{ position: "absolute", top: H * 0.2, right: 52, width: W - split - 120, alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 800, fontSize: 92, color: "#2F2F35", lineHeight: 1 }}>ORKIN</Text>
          {!!m.property && <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 16, color: C.white, textTransform: "uppercase", marginTop: 16, textAlign: "right" }}>{m.property}</Text>}
          {!!m.address && <Text style={{ fontSize: 9, color: "#A9A9B0", marginTop: 4, textAlign: "right" }}>{m.address}</Text>}
        </View>
      )}
      <View style={{ position: "absolute", top: 18, right: 0, backgroundColor: C.darker, paddingVertical: 8, paddingHorizontal: 18 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8.5, color: C.white, letterSpacing: 0.25 }}>{m.dateLabel.toUpperCase()}</Text>
      </View>
      <View style={{ position: "absolute", top: 48, left: 46, width: split - 70 }}>
        <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 800, fontSize: 34, color: C.red }}>ORKIN</Text>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 11, color: C.white, letterSpacing: 0.25, marginTop: 4 }}>COMMERCIAL SERVICES</Text>
        <View style={{ backgroundColor: C.red, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 11, marginTop: 30, borderRadius: 1 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8.5, color: C.white, letterSpacing: 0.25, textTransform: "uppercase" }}>{m.cover.badge}</Text>
        </View>
        <View style={{ marginTop: 26 }}>
          <TitleBlock m={m} color={C.white} />
        </View>
        {!!m.subtitle && <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 15, color: C.mint, textTransform: "uppercase", marginTop: 6 }}>{m.subtitle}</Text>}
        {!!m.cover.tagline && <Text style={{ fontSize: 12, color: C.white, marginTop: 22, lineHeight: 1.4, maxWidth: 300 }}>{m.cover.tagline}</Text>}
      </View>
      <View style={{ position: "absolute", bottom: 40, left: 46, width: split - 110 }}>
        {m.cover.stats.length > 0 && <View style={{ height: 1.5, backgroundColor: C.red, marginBottom: 12 }} />}
        {m.cover.stats.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 26, color: C.white, width: 130 }}>{s.value}</Text>
            <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8, color: C.white, letterSpacing: 0.25, textTransform: "uppercase" }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ position: "absolute", bottom: 0, right: 40, width: 330, backgroundColor: C.red, paddingTop: 5, paddingHorizontal: 5 }}>
        <PreparedBox m={m} dark />
      </View>
    </Page>
  );
}

function CoverWhite({ m, W, H }: { m: PdfModel; W: number; H: number }) {
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white, fontFamily: "Lato" }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundColor: C.red }} />
      <View style={{ position: "absolute", top: 10, bottom: 0, left: 0, width: 16, backgroundColor: C.dark }} />
      <View style={{ position: "absolute", top: 56, left: 62, right: 62, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 0.75, borderBottomColor: C.line, paddingBottom: 12 }}>
        <View>
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 800, fontSize: 30, color: C.red }}>ORKIN</Text>
          <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 9, color: C.ink3, letterSpacing: 0.25, marginTop: 3 }}>COMMERCIAL SERVICES</Text>
        </View>
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8.5, color: C.ink3, letterSpacing: 0.25 }}>{m.dateLabel.toUpperCase()}</Text>
      </View>
      <View style={{ position: "absolute", top: H * 0.27, left: 62, width: W * 0.58 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 9, color: C.red, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: 14 }}>{m.cover.badge}</Text>
        <TitleBlock m={m} color={C.ink} size={50} />
        {!!m.subtitle && <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 16, color: C.red, textTransform: "uppercase", marginTop: 8 }}>{m.subtitle}</Text>}
        <View style={{ width: 70, height: 3, backgroundColor: C.red, marginTop: 20, marginBottom: 16 }} />
        {!!m.cover.tagline && <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.45 }}>{m.cover.tagline}</Text>}
      </View>
      <View style={{ position: "absolute", top: H * 0.27, right: 62, width: W * 0.24, borderLeftWidth: 0.75, borderLeftColor: C.line, paddingLeft: 18 }}>
        {[
          ["PREPARED FOR", m.customer],
          ["PROPERTY", m.property !== m.customer ? m.property : ""],
          ["SITE ADDRESS", m.address],
          ["ATTENTION", m.contact],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={{ marginBottom: 14 }}>
              <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7, color: C.ink3, letterSpacing: 0.25 }}>{k}</Text>
              <Text style={{ fontSize: 10.5, color: C.ink, marginTop: 3, lineHeight: 1.35 }}>{v}</Text>
            </View>
          ))}
        {m.cover.stats.map((s, i) => (
          <View key={i} style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 22, color: C.ink }}>{s.value}</Text>
            <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7, color: C.red, letterSpacing: 0.25, textTransform: "uppercase" }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ position: "absolute", bottom: 40, left: 62, width: 360 }}>
        <PreparedBox m={m} dark={false} />
      </View>
      <View style={{ position: "absolute", bottom: 40, right: 62, width: 140, height: 4, backgroundColor: C.red }} />
    </Page>
  );
}

function CoverShowcase({ m, W, H }: { m: PdfModel; W: number; H: number }) {
  const imgH = H * 0.64;
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white, fontFamily: "Lato" }}>
      {m.cover.image ? <Image src={m.cover.image} style={{ position: "absolute", top: 0, left: 0, width: W, height: imgH, objectFit: "cover" }} /> : null}
      <Svg width={W} height={imgH} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#111114" stopOpacity={m.cover.image ? 0.15 : 1} />
            <Stop offset="1" stopColor="#111114" stopOpacity={m.cover.image ? 0.88 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={imgH} fill="url(#g)" />
        {!m.cover.image && <Path d={`M ${W * 0.55} 0 L ${W} 0 L ${W} ${imgH} L ${W * 0.35} ${imgH} Z`} fill="#26262A" />}
        <Rect x={0} y={0} width={W} height={8} fill={C.red} />
        <Rect x={0} y={imgH - 5} width={W} height={5} fill={C.red} />
      </Svg>
      <View style={{ position: "absolute", top: 30, left: 46 }}>
        <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 800, fontSize: 28, color: C.white }}>ORKIN</Text>
        <Text style={{ fontFamily: "Lato", fontWeight: 700, fontSize: 9, color: C.white, letterSpacing: 0.25, marginTop: 2 }}>COMMERCIAL SERVICES</Text>
      </View>
      <View style={{ position: "absolute", top: 34, right: 46 }}>
        <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8.5, color: C.white, letterSpacing: 0.25 }}>{m.dateLabel.toUpperCase()}</Text>
      </View>
      <View style={{ position: "absolute", top: imgH - 190, left: 46, width: W * 0.66 }}>
        <View style={{ backgroundColor: C.red, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 10, marginBottom: 14 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 8, color: C.white, letterSpacing: 0.25, textTransform: "uppercase" }}>{m.cover.badge}</Text>
        </View>
        <TitleBlock m={{ ...m, title: m.title }} color={C.white} size={44} />
      </View>
      <View style={{ position: "absolute", top: imgH + 26, left: 46, right: 46, flexDirection: "row", gap: 30 }}>
        <View style={{ flex: 1.3 }}>
          {!!m.subtitle && <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 15, color: C.red, textTransform: "uppercase" }}>{m.subtitle}</Text>}
          <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 18, color: C.ink, textTransform: "uppercase", marginTop: 2 }}>{m.property || m.customer}</Text>
          {!!m.address && <Text style={{ fontSize: 9.5, color: C.ink3, marginTop: 3 }}>{m.address}</Text>}
          {!!m.cover.tagline && <Text style={{ fontSize: 10.5, color: C.ink2, marginTop: 10, lineHeight: 1.45 }}>{m.cover.tagline}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 18 }}>
          {m.cover.stats.map((s, i) => (
            <View key={i}>
              <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 24, color: C.ink }}>{s.value}</Text>
              <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7, color: C.red, letterSpacing: 0.25, textTransform: "uppercase" }}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ width: 230 }}>
          <PreparedBox m={m} dark={false} />
        </View>
      </View>
    </Page>
  );
}

// ───────────────────────── Layout estimation ─────────────────────────

/** Rough height estimate (pt) so short sections are kept whole and never strand a heading. */
export function estimateHeight(s: ProposalSection, m: PdfModel, contentW: number): number {
  const cpl = contentW / 5.1;
  const textH = (t: string, size = 15.5, w = cpl) => (t ? t.split(/\n/).reduce((h, l) => h + Math.max(1, Math.ceil(l.length / w)) * size, 0) + 8 : 0);
  let h = 26 + (s.headline ? 34 : 0) + (s.headlineAccent ? 28 : 0) + textH(s.body);
  const cols = s.items.length === 4 ? 4 : s.items.length === 2 ? 2 : 3;
  const cardRows = Math.ceil(s.items.length / cols);
  const cardH = 30 + Math.max(...s.items.map((i) => Math.ceil(i.body.length / (cpl / cols - 4)) * 14), 14);
  h += cardRows * (cardH + 10);
  if (s.callout) h += textH(s.callout, 14) + 24;
  switch (s.type) {
    case "executive_overview":
      h += m.cover.stats.length ? 80 : 0;
      h += m.programs.length > 1 ? 30 + Math.ceil(m.programs.length / 2) * 54 : 0;
      break;
    case "coverage":
      h = 26 + 62 + textH(s.body) + Math.max(s.items.length * 52, s.callout ? 160 : 0);
      break;
    case "ipm":
      h += 70;
      break;
    case "equipment_allocation":
      h += 30 + m.programs.reduce((a, p) => a + p.equipment.length, 0) * 22;
      break;
    case "service_frequency":
      h += 90;
      break;
    case "investment":
      h += m.programs.reduce((a, p) => a + 130 + (p.equipment.some((e) => e.unit) ? 30 + p.equipment.length * 22 : 0), 0);
      break;
    case "specialty_services":
      h += 30 + m.specialty.length * 36;
      break;
    case "triple_guarantee":
      h += 80;
      break;
    case "authorization":
      h += 190;
      break;
    case "photos":
      h += Math.ceil(m.photos.length / 2) * 210;
      break;
    case "floor_plans":
      h += Math.ceil(m.floorPlans.length / 2) * 210;
      break;
  }
  return h;
}

// ───────────────────────── Document ─────────────────────────

export function ProposalDocument({ m }: { m: PdfModel }) {
  const W = m.orientation === "landscape" ? 792 : 612;
  const H = m.orientation === "landscape" ? 612 : 792;
  const Cover = m.cover.style === "corporate_white" ? CoverWhite : m.cover.style === "property_showcase" ? CoverShowcase : CoverCharcoal;
  const body = m.sections.filter((s) => s.type !== "portfolio_schedules");
  const hasSchedules = m.sections.some((s) => s.type === "portfolio_schedules") && m.schedules.length > 0;
  const headerRight = [m.customer, m.subtitle || "Proposal"].filter(Boolean).join("   |   ").toUpperCase();
  return (
    <Document title={`${m.title}${m.customer ? ` — ${m.customer}` : ""}`} author={m.preparedBy.map((p) => p.name).join(", ")} subject="Orkin Commercial proposal" creator="Orkin Proposal Studio" producer="Orkin Proposal Studio" language="en-US">
      <Cover m={m} W={W} H={H} />
      <Page size={[W, H]} style={S.page} wrap>
        <View fixed style={S.topBar} />
        <View fixed style={S.header}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text style={S.wordmark}>ORKIN</Text>
            <Text style={S.headerSub}>/ COMMERCIAL SERVICES</Text>
          </View>
          <Text style={S.headerRight}>{headerRight}</Text>
        </View>
        <View fixed style={S.footer}>
          <Text style={S.footerText}>ORKIN / {m.title.toUpperCase()}</Text>
          <Text style={S.footerText} render={({ pageNumber }) => `${m.dateLabel.toUpperCase()}   /   ${pad2(pageNumber)}`} />
        </View>
        {body.map((s, i) => {
          const keepWhole = estimateHeight(s, m, W - 88) <= H - 84 - 58 - 24;
          return keepWhole ? (
            <View key={s.id} style={S.section} wrap={false}>
              <WholeCtx.Provider value={true}>
                <SectionHead n={i + 1} s={s} />
                <SectionBody s={s} m={m} />
              </WholeCtx.Provider>
            </View>
          ) : (
            <View key={s.id} style={S.section} break={i > 0}>
              <SectionHead n={i + 1} s={s} />
              <SectionBody s={s} m={m} />
            </View>
          );
        })}
        {hasSchedules && <Schedules m={m} startN={body.length + 1} />}
      </Page>
    </Document>
  );
}

/** Cover page alone, sized to match an existing document (used by "keep everything except the cover"). */
export function CoverOnlyDocument({ m, W, H }: { m: PdfModel; W: number; H: number }) {
  const Cover = m.cover.style === "corporate_white" ? CoverWhite : m.cover.style === "property_showcase" ? CoverShowcase : CoverCharcoal;
  return (
    <Document title={m.title} creator="Orkin Proposal Studio">
      <Cover m={m} W={W} H={H} />
    </Document>
  );
}
