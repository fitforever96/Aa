import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InternalModel } from "./internalModel";
import { COMPONENT_LABELS } from "../engine/estimator";
import { formatMinutes, formatMoney } from "../engine/money";
import { frequencyLabel } from "../engine/frequency";

/** Internal estimate workbook. Contains labor minutes, rates, yields and assumptions — never for customers. */
const C = { red: "#E4002B", ink: "#1E1E21", ink2: "#44444A", ink3: "#7A7A82", line: "#DADBDE", card: "#F3F4F6", warn: "#B26B00" };
const S = StyleSheet.create({
  page: { fontFamily: "Lato", fontSize: 9, color: C.ink2, paddingTop: 70, paddingBottom: 50, paddingHorizontal: 40 },
  h: { fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 16, color: C.ink, textTransform: "uppercase", marginBottom: 6, marginTop: 14 },
  h2: { fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 12, color: C.ink, textTransform: "uppercase", marginBottom: 4, marginTop: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 },
  mono: { fontFamily: "Lato", fontSize: 7.5, color: C.ink3 },
});

export function InternalEstimateDocument({ m }: { m: InternalModel }) {
  const p = m.proposal;
  return (
    <Document title={`INTERNAL estimate — ${p.title}`} creator="Orkin Proposal Studio" author={p.document.preparedBy[0]?.name}>
      <Page size={[792, 612]} style={S.page} wrap>
        <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, height: 22, backgroundColor: C.ink, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: "#fff", letterSpacing: 0.25 }}>INTERNAL ESTIMATE — NOT FOR CUSTOMER DISTRIBUTION</Text>
          <Text style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 7.5, color: C.red }}>ORKIN</Text>
        </View>
        <View fixed style={{ position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={S.mono}>{p.customer.name || p.property.name} · {p.title}</Text>
          <Text style={S.mono} render={({ pageNumber, totalPages }) => `Generated ${m.dateLabel} · ${pageNumber}/${totalPages}`} />
        </View>
        <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 24, color: C.ink, textTransform: "uppercase" }}>{p.customer.name || p.property.name || "Untitled"}</Text>
        <Text style={{ fontSize: 10, color: C.ink3, marginBottom: 6 }}>{[p.property.name, p.property.propertyType, p.property.squareFeet ? `${p.property.squareFeet.toLocaleString()} sq ft` : "", `${p.property.buildingCount} bldg / ${p.property.floorCount} fl`, `access ${p.property.accessLevel}`, `activity ${p.property.activityLevel}`].filter(Boolean).join(" · ")}</Text>
        <Text style={{ fontSize: 9, color: C.ink2 }}>
          Status: {p.status.replace(/_/g, " ")} · QC: {m.qc.fail} fail, {m.qc.warn} warn, {m.qc.pass} pass, {m.qc.notRun} not run · Assumptions snapshot {p.assumptionsVersionId}
        </Text>
        {m.results.map((r, i) => {
          const pr = p.programs[i];
          const e = r.estimate;
          return (
            <View key={pr.id}>
              <Text style={S.h}>{pr.name} — {frequencyLabel(pr.frequency)}</Text>
              <View style={{ flexDirection: "row", gap: 8 }} wrap={false}>
                {[
                  ["Rate", `${formatMoney(r.rateCentsPerHour)}/hr (${r.rateSource.replace("_", " ")})`],
                  ["Device labor", formatMinutes(e.deviceServicing.minutes)],
                  ["Recurring tech time", `${formatMinutes(e.recurring.technicianMinutes)} (${(e.recurring.technicianMinutes / 60).toFixed(2)} h)`],
                  ["Elapsed", `${formatMinutes(e.recurring.elapsedMinutes)} · ${e.technicians} tech`],
                  ["Confidence", e.confidence.level.toUpperCase()],
                ].map(([k, v]) => (
                  <View key={k} style={{ flex: 1, backgroundColor: C.card, padding: 8, borderRadius: 3 }}>
                    <Text style={{ fontSize: 7, color: C.ink3, textTransform: "uppercase" }}>{k}</Text>
                    <Text style={{ fontFamily: "RobotoCondensed", fontWeight: 700, fontSize: 11, color: C.ink, marginTop: 2 }}>{v}</Text>
                  </View>
                ))}
              </View>
              {(["recurring", "initial"] as const).map((phase) => {
                const ph = e[phase];
                const pt = phase === "recurring" ? r.recurring : r.initial;
                if (!pt || !ph.lines.length) return null;
                return (
                  <View key={phase}>
                    <Text style={S.h2}>{phase} service — {formatMinutes(ph.technicianMinutes)} technician time</Text>
                    {ph.lines.map((l) => (
                      <View key={l.key} style={S.row} wrap={false}>
                        <Text style={{ width: "16%", fontSize: 8 }}>{COMPONENT_LABELS[l.component]}</Text>
                        <Text style={{ width: "24%", fontSize: 8, color: C.ink }}>{l.label}</Text>
                        <Text style={{ width: "44%", ...S.mono }}>{l.formula}</Text>
                        <Text style={{ width: "8%", fontSize: 7.5, color: l.provenance === "confirmed" ? "#168A3A" : l.provenance === "estimate" ? C.warn : "#1664C0" }}>{l.provenance}</Text>
                        <Text style={{ width: "8%", fontSize: 8, textAlign: "right" }}>{formatMinutes(l.minutes)}</Text>
                      </View>
                    ))}
                    <View style={{ marginTop: 4 }} wrap={false}>
                      {pt.components.map((c, k) => (
                        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={S.mono}>{c.label}: {c.formula}</Text>
                          <Text style={{ fontSize: 8 }}>{formatMoney(c.cents)}</Text>
                        </View>
                      ))}
                      <Text style={{ fontSize: 9, color: C.ink, marginTop: 3 }}>
                        Calculated {formatMoney(pt.calculatedCents)} · Manual {pt.overrideCents != null ? formatMoney(pt.overrideCents) : "—"}{pt.locked ? " (locked)" : ""} · Difference {pt.differenceCents != null ? formatMoney(pt.differenceCents) : "—"} · Yield {pt.effectiveHourlyYieldCents != null ? `${formatMoney(pt.effectiveHourlyYieldCents)}/hr` : "—"}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {r.equipment.lines.length > 0 && <Text style={{ fontSize: 8.5, marginTop: 6 }}>Equipment: {r.equipment.lines.map((l) => `${l.quantity} × ${l.name} @ ${l.unitPriceCents != null ? formatMoney(l.unitPriceCents) : "unpriced"} (${l.priceSource.replace(/_/g, " ")})`).join("; ")} = {formatMoney(r.equipment.totalCents)}</Text>}
              {r.advisories.map((a, k) => (
                <Text key={k} style={{ fontSize: 8.5, color: C.warn, marginTop: 3 }}>⚠ {a}</Text>
              ))}
              <Text style={S.h2}>Basis & explanation</Text>
              {[...e.confidence.reasons, ...e.confidence.missing.map((x) => `Missing: ${x}`), ...m.explanations[i]].map((x, k) => (
                <Text key={k} style={{ fontSize: 8.5, marginBottom: 2 }}>• {x}</Text>
              ))}
              {m.historical[i].length > 0 && (
                <>
                  <Text style={S.h2}>Historical comparisons (reference only)</Text>
                  {m.historical[i].map((h) => (
                    <Text key={h.id} style={{ fontSize: 8.5, marginBottom: 2 }}>• {h.customer} — {h.program}: {formatMoney(h.priceCents)}{h.priceHighCents ? `–${formatMoney(h.priceHighCents)}` : ""} {h.basis} [{h.status.replace(/_/g, " ")}]</Text>
                  ))}
                </>
              )}
            </View>
          );
        })}
        <Text style={S.h}>Assumptions snapshot</Text>
        <Text style={{ fontSize: 8.5, lineHeight: 1.5 }}>
          Labor {formatMoney(p.assumptions.laborRateCentsPerHour)}/hr (confirmed) · Tin Cat {p.assumptions.tinCatServiceMinutes} min (confirmed) · Exterior bait station {p.assumptions.baitStationServiceMinutes} min (confirmed) · Initial inspection ×{p.assumptions.initialInspectionMultiplier} · Floor transition {p.assumptions.perFloorTransitionMinutes} min · Access multipliers {JSON.stringify(p.assumptions.accessMultipliers)} · Activity multipliers {JSON.stringify(p.assumptions.activityMultipliers)} · Parallel fractions {JSON.stringify(p.assumptions.parallelFractions)}. All non-confirmed values are app-generated planning estimates.
        </Text>
        {(p.rfpRequirements?.length ?? 0) > 0 && (
          <>
            <Text style={S.h}>RFP requirements matrix</Text>
            {p.rfpRequirements!.map((r) => (
              <Text key={r.id} style={{ fontSize: 8.5, marginBottom: 2, color: r.status === "cannot_perform" || (r.mandatory && r.status === "open") ? C.red : C.ink2 }}>
                [{r.status.replace("_", " ").toUpperCase()}{r.mandatory ? " · MANDATORY" : ""}] {r.requirement}{r.response ? ` → ${r.response}` : ""}
              </Text>
            ))}
          </>
        )}
        {m.qcIssues.length > 0 && (
          <>
            <Text style={S.h}>Open QC items</Text>
            {m.qcIssues.map((q, k) => (
              <Text key={k} style={{ fontSize: 8.5, marginBottom: 2, color: q.status === "fail" ? C.red : C.warn }}>
                [{q.status.toUpperCase()}] {q.label}: {q.detail}
              </Text>
            ))}
          </>
        )}
        {!!p.internalNotes && (
          <>
            <Text style={S.h}>Internal notes</Text>
            <Text style={{ fontSize: 9 }}>{p.internalNotes}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}
