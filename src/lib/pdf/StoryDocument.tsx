/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { StoryBlock } from "../types";
import type { StoryModel } from "../story/resolve";
import { applyPlan, STORY_SCALE, STORY_SQUEEZE, type StoryPlan } from "../story/resolve";

/**
 * Portrait, argument-driven proposal (the layout of Anthony's own proposals):
 * red edge stripe, running header and footer, a hero with a dark stat bar, and dense
 * content blocks that flow continuously so pages fill without blank space.
 */

const K = {
  red: "#C8102E",
  redSoft: "#FFF1F3",
  redLine: "#F3C3CC",
  pink: "#F59AAA",
  ink: "#151517",
  ink2: "#2E2E33",
  ink3: "#6B6B73",
  line: "#DCDCE0",
  card: "#F1F1F3",
  dark: "#161618",
  darkLine: "#3A3A40",
  white: "#FFFFFF",
};
const F = "Lato";
const W = 612;
const H = 792;
const PAD_L = 46;
const PAD_R = 40;

function useScale(level: number, squeeze: number) {
  const k = STORY_SCALE[Math.min(STORY_SCALE.length - 1, level)] * STORY_SQUEEZE[Math.min(STORY_SQUEEZE.length - 1, squeeze)];
  // Type never goes below 6.2 pt.
  return (n: number) => Math.max(n < 7 ? 6.2 : 0, Math.round(n * k * 10) / 10);
}

function Label({ text, z }: { text: string; z: (n: number) => number }) {
  return (
    <View minPresenceAhead={70} style={{ flexDirection: "row", alignItems: "center", marginTop: z(4), marginBottom: z(7) }}>
      <View style={{ width: 18, height: 2.5, backgroundColor: K.red, marginRight: 7 }} />
      <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(7), color: K.red, letterSpacing: 0.25, textTransform: "uppercase", marginRight: 8 }}>{text}</Text>
      <View style={{ flex: 1, height: 0.6, backgroundColor: K.line }} />
    </View>
  );
}

function Check({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 7, marginTop: 0.5 }}>
      <Path d="M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24z" fill={K.red} />
      <Path d="M6.5 12.5l3.6 3.6l7.4-7.6" stroke={K.white} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Bullets({ items, z, color = K.ink2, tight }: { items: string[]; z: (n: number) => number; color?: string; tight?: boolean }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: tight ? 1.5 : z(3.5) }} wrap={false}>
          <Text style={{ fontSize: z(8.4), color: K.red, width: 8, fontWeight: 900 }}>•</Text>
          <Text style={{ flex: 1, fontSize: tight ? z(7.5) : z(8.2), lineHeight: tight ? 1.32 : 1.45, color }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Hero({ m, z, compact }: { m: StoryModel; z: (n: number) => number; compact: boolean }) {
  const h = m.hero;
  return (
    <View wrap={false} style={{ marginBottom: z(compact ? 9 : 14) }}>
      <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(29), color: K.ink, textTransform: "uppercase", lineHeight: 1.08 }}>{h.title}</Text>
      {!!h.subtitle && <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(14.5), color: K.red, textTransform: "uppercase", marginTop: 4 }}>{h.subtitle}</Text>}
      {!!h.tagline && <Text style={{ fontSize: z(8.8), color: K.ink3, marginTop: 6 }}>{h.tagline}</Text>}
      {!!m.address && <Text style={{ fontSize: z(7.8), color: K.ink3, marginTop: 2 }}>{m.address}</Text>}
      {h.stats.length > 0 && (
        <View style={{ flexDirection: "row", backgroundColor: K.dark, borderRadius: 6, paddingVertical: z(compact ? 8 : 11), marginTop: z(compact ? 8 : 12) }}>
          {h.stats.map((s, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 0.6 : 0, borderLeftColor: K.darkLine, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(12), color: K.white, textAlign: "center" }}>{s.value}</Text>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(5.8), color: "#B9B9C0", letterSpacing: 0.25, textTransform: "uppercase", marginTop: 4, textAlign: "center" }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Block({ b, m, z, compact }: { b: StoryBlock; m: StoryModel; z: (n: number) => number; compact: boolean }) {
  const gap = z(compact ? 10 : 13);
  switch (b.kind) {
    case "heading":
      return (
        <View minPresenceAhead={120} style={{ marginTop: z(6), marginBottom: z(10) }}>
          <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(compact ? 15 : 23), color: K.ink, textTransform: b.accent ? "none" : "uppercase", lineHeight: 1.1 }}>{b.title}</Text>
          {!!b.accent && <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(23), color: K.red, lineHeight: 1.1 }}>{b.accent}</Text>}
          {!!b.lead && <Text style={{ fontSize: z(8.8), color: K.ink3, marginTop: 5, lineHeight: 1.45 }}>{b.lead}</Text>}
        </View>
      );
    case "label":
      return <Label text={b.text} z={z} />;
    case "paragraph":
      return <Text style={{ fontSize: z(9), lineHeight: 1.5, color: K.ink2, marginBottom: gap * 0.7 }}>{b.text}</Text>;
    case "callout":
      return (
        <View wrap={false} style={{ backgroundColor: K.redSoft, borderWidth: 0.8, borderColor: K.redLine, borderRadius: 6, padding: z(12), marginBottom: gap }}>
          <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(7.2), color: K.red, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: z(6) }}>{b.title}</Text>
          <Text style={{ fontSize: z(8.7), lineHeight: 1.48, color: K.ink2 }}>
            {b.text}
            {b.emphasis ? " " : ""}
          </Text>
          {!!b.emphasis && <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(8.7), lineHeight: 1.48, color: K.red, marginTop: 2 }}>{b.emphasis}</Text>}
        </View>
      );
    case "checks":
      return (
        <View wrap={false} style={{ marginBottom: gap * 0.6 }}>
          {!!b.title && <Label text={b.title} z={z} />}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: z(9), columnGap: 18 }}>
            {b.items.map((it, i) => (
              <View key={i} style={{ width: "47.5%", flexDirection: "row" }}>
                <Check size={z(11)} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(8.7), color: K.ink }}>{it.title}</Text>
                  {!!it.body && <Text style={{ fontSize: z(8), lineHeight: 1.42, color: K.ink2, marginTop: 1.5 }}>{it.body}</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>
      );
    case "darkColumns":
      return (
        <View wrap={false} style={{ backgroundColor: K.dark, borderRadius: 6, padding: z(12), marginBottom: gap }}>
          <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(7), color: K.pink, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: z(8) }}>{b.title}</Text>
          <View style={{ flexDirection: "row" }}>
            {b.columns.map((c, i) => (
              <View key={i} style={{ flex: 1, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: K.darkLine, paddingLeft: i ? 10 : 0, paddingRight: 8 }}>
                <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(6.4), color: K.white, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: 4 }}>{c.title}</Text>
                <Text style={{ fontSize: z(7.8), lineHeight: 1.42, color: "#CFCFD5" }}>{c.body}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    case "stats":
      return (
        <View wrap={false} style={{ backgroundColor: K.card, borderRadius: 6, padding: z(12), marginBottom: gap }}>
          {!!b.title && <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(7), color: K.red, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: z(8) }}>{b.title}</Text>}
          <View style={{ flexDirection: "row" }}>
            {b.stats.map((s, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 0.6 : 0, borderLeftColor: K.line }}>
                <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(19), color: K.ink }}>{s.value}</Text>
                <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(5.8), color: K.ink3, letterSpacing: 0.25, textTransform: "uppercase", marginTop: 3, textAlign: "center" }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    case "scope":
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: gap }}>
          {b.cards.map((c, i) => {
            const pr = m.price(c.price);
            return (
              <View key={i} wrap={false} style={{ width: b.cards.length === 1 ? "100%" : "48.4%" }}>
                <View style={{ backgroundColor: K.red, borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingVertical: z(7), paddingHorizontal: 11 }}>
                  <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(5.8), color: "#FFD3DA", letterSpacing: 0.25, textTransform: "uppercase" }}>{c.eyebrow}</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 1 }}>
                    <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(10.5), color: K.white, textTransform: "uppercase", flex: 1 }}>{c.title}</Text>
                    {pr && (
                      <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(10.5), color: K.white }}>
                        {pr}
                        {c.priceSuffix}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={{ borderWidth: 0.8, borderTopWidth: 0, borderColor: K.line, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, padding: z(10), paddingBottom: z(6), flexGrow: 1 }}>
                  <Bullets items={c.bullets} z={z} />
                </View>
              </View>
            );
          })}
        </View>
      );
    case "bigNumber":
      return (
        <View wrap={false} style={{ backgroundColor: K.dark, borderRadius: 6, padding: z(13), marginBottom: gap }}>
          <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(7), color: K.pink, letterSpacing: 0.25, textTransform: "uppercase", marginBottom: z(8) }}>{b.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 92, borderRightWidth: 0.6, borderRightColor: K.darkLine, marginRight: 14 }}>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(26), color: K.white }}>{b.value}</Text>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(5.8), color: "#B9B9C0", letterSpacing: 0.25, textTransform: "uppercase", marginTop: 2 }}>{b.caption}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: z(8.5), lineHeight: 1.48, color: K.white }}>{b.text}</Text>
          </View>
        </View>
      );
    case "charge": {
      const pr = m.price(b.price);
      return (
        <View wrap={false} style={{ marginBottom: gap * 0.8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(9.6), color: K.ink, flex: 1, paddingRight: 10 }}>{b.title}</Text>
            {pr && <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(12.5), color: K.red, textTransform: "uppercase" }}>{`${pr}${b.priceLabel}`}</Text>}
          </View>
          {!!b.text && <Text style={{ fontSize: z(8.6), lineHeight: 1.48, color: K.ink2, marginTop: 4 }}>{b.text}</Text>}
        </View>
      );
    }
    case "note":
      return (
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", backgroundColor: K.card, borderRadius: 6, padding: z(10), marginBottom: gap }}>
          <View style={{ width: z(14), height: z(14), borderRadius: z(7), backgroundColor: K.red, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(9), color: K.white, marginTop: -1 }}>+</Text>
          </View>
          <Text style={{ flex: 1, fontSize: z(8.5), lineHeight: 1.45, color: K.ink2 }}>{b.text}</Text>
        </View>
      );
    case "steps":
      return (
        <View wrap={false} style={{ marginBottom: gap }}>
          {!!b.title && <Label text={b.title} z={z} />}
          {b.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", borderWidth: 0.8, borderColor: K.line, borderRadius: 5, marginBottom: 6, overflow: "hidden" }}>
              <View style={{ width: 36, backgroundColor: K.red, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(11), color: K.white }}>{String(i + 1).padStart(2, "0")}</Text>
              </View>
              <View style={{ flex: 1, padding: z(8) }}>
                <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(8.4), color: K.ink, textTransform: "uppercase" }}>{it.title}</Text>
                <Text style={{ fontSize: z(8), lineHeight: 1.42, color: K.ink2, marginTop: 2 }}>{it.body}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "twoLists":
      return (
        <View wrap={false} style={{ flexDirection: "row", gap: 18, marginBottom: gap * 0.6 }}>
          {[b.left, b.right]
            .filter((x) => x.items.length)
            .map((col, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Label text={col.title} z={z} />
                <Bullets items={col.items} z={(n) => z(n) * 0.97} tight={compact} />
              </View>
            ))}
        </View>
      );
    case "priceStrip":
      return (
        <View wrap={false} style={{ flexDirection: "row", backgroundColor: K.red, borderRadius: 6, paddingVertical: z(11), marginBottom: gap, marginTop: 2 }}>
          {b.items.map((it, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 0.6 : 0, borderLeftColor: "#E36C80", paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(6.2), color: K.white, letterSpacing: 0.25, textTransform: "uppercase", textAlign: "center" }}>{it.label}</Text>
              <Text style={{ fontFamily: F, fontWeight: 900, fontSize: z(19), color: K.white, marginTop: 3 }}>{m.price(it.price) ?? "—"}</Text>
              <Text style={{ fontSize: z(6.5), color: "#FFD3DA", marginTop: 2, textAlign: "center" }}>{it.caption}</Text>
            </View>
          ))}
        </View>
      );
    case "schedules":
      return (
        <View style={{ marginBottom: gap }}>
          {m.schedules.map((sch, si) => (
            <View key={si} style={{ marginBottom: z(8) }}>
              <Label text={`Schedule ${sch.code}: ${sch.title}`} z={z} />
              <View style={{ flexDirection: "row", backgroundColor: K.dark, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingVertical: 5, paddingHorizontal: 8 }} fixed={false}>
                {[["Property", "46%"], ["Units", "12%"], ["Rot./mo.", "14%"], ["Apts/visit", "14%"], [sch.rateLabel, "14%"]].map(([l, w], i) => (
                  <Text key={i} style={{ width: w, textAlign: i ? "right" : "left", fontFamily: F, fontWeight: 900, fontSize: z(6.4), color: K.white, textTransform: "uppercase", letterSpacing: 0.25 }}>
                    {l}
                  </Text>
                ))}
              </View>
              {sch.rows.map((r, i) => (
                <View key={i} wrap={false} style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8, backgroundColor: i % 2 ? K.card : K.white, borderBottomWidth: 0.5, borderBottomColor: K.line }}>
                  <View style={{ width: "46%" }}>
                    <Text style={{ fontFamily: F, fontWeight: 700, fontSize: z(7.8), color: K.ink }}>{r.name}</Text>
                    {!!r.address && <Text style={{ fontSize: z(6.4), color: K.ink3 }}>{r.address}</Text>}
                  </View>
                  {[r.units, r.rot, r.apv].map((v, j) => (
                    <Text key={j} style={{ width: j === 0 ? "12%" : "14%", textAlign: "right", fontSize: z(7.8), color: K.ink2 }}>
                      {v}
                    </Text>
                  ))}
                  <Text style={{ width: "14%", textAlign: "right", fontFamily: F, fontWeight: 900, fontSize: z(7.8), color: K.red }}>{r.rate}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "sources":
      return (
        <View wrap={false} style={{ marginBottom: gap }}>
          <Label text="Technical basis" z={z} />
          {b.items.map((s, i) => (
            <Text key={i} style={{ fontSize: z(6.8), color: K.ink3, lineHeight: 1.45 }}>
              {String(i + 1).padStart(2, "0")}   {s}
            </Text>
          ))}
        </View>
      );
  }
}

export function StoryDocument({ m, plan = { level: 0, drop: [] }, squeeze = 0 }: { m: StoryModel; plan?: StoryPlan; squeeze?: number }) {
  const level = plan.level;
  const z = useScale(level, squeeze);
  const blocks = applyPlan(m.blocks, plan);
  const site = m.site.toUpperCase();
  return (
    <Document title={`${m.programTitle}${m.customer ? ` — ${m.customer}` : ""}`} author={m.preparedBy.map((p) => p.name).join(", ")} subject="Orkin Commercial proposal" creator="Orkin Proposal Studio" producer="Orkin Proposal Studio" language="en-US">
      <Page size={[W, H]} style={{ fontFamily: F, paddingTop: 64, paddingBottom: 54, paddingLeft: PAD_L, paddingRight: PAD_R, backgroundColor: K.white }} wrap>
        <View fixed style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 12, backgroundColor: K.red }} />
        <View fixed style={{ position: "absolute", top: 26, left: PAD_L, right: PAD_R, flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.6, borderBottomColor: K.line, paddingBottom: 7 }}>
          <Text style={{ fontFamily: F, fontWeight: 900, fontSize: 7.2, color: K.red, letterSpacing: 0.25 }}>{m.hero.eyebrow || site}</Text>
          <Text style={{ fontSize: 7, color: K.ink3, letterSpacing: 0.25 }}>SERVICE PROPOSAL  |  {m.dateLabel.toUpperCase()}</Text>
        </View>
        <View fixed style={{ position: "absolute", bottom: 24, left: PAD_L, right: PAD_R, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: K.line, paddingTop: 7 }}>
          <Text style={{ fontSize: 6.8, color: K.ink3, letterSpacing: 0.25 }}>
            {site}  |  {m.programTitle.toUpperCase()}
          </Text>
          <Text style={{ fontSize: 6.8, color: K.ink3, letterSpacing: 0.25 }} render={({ pageNumber, totalPages }) => `SERVICE PROPOSAL  |  ${pageNumber} OF ${totalPages}`} />
        </View>
        <Hero m={m} z={z} compact={level >= 3} />
        {blocks.map((b, i) => {
          // A heading or label always travels with the block after it, so none is stranded at a page bottom.
          if (i > 0 && (blocks[i - 1].kind === "heading" || blocks[i - 1].kind === "label")) return null;
          const lead = b.kind === "heading" || b.kind === "label";
          const next = lead ? blocks[i + 1] : undefined;
          return next && next.kind !== "twoLists" && next.kind !== "schedules" ? (
            <View key={i} wrap={false}>
              <Block b={b} m={m} z={z} compact={level >= 3} />
              <Block b={next} m={m} z={z} compact={level >= 3} />
            </View>
          ) : (
            <Block key={i} b={b} m={m} z={z} compact={level >= 3} />
          );
        })}
        <View wrap={false} style={{ borderTopWidth: 0.6, borderTopColor: K.line, paddingTop: 7, marginTop: 4 }}>
          <Text style={{ fontSize: z(7.6), color: K.ink3, lineHeight: 1.45 }}>
            Prepared by{" "}
            {m.preparedBy.map((p) => [p.name, p.title, p.phone, p.email].filter(Boolean).join(", ")).join("; ")}
            {"  |  Orkin Commercial Services. Terms, guarantees, exclusions and eligibility are governed by the executed Orkin service agreement."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
