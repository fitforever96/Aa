import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { StudioDB, setDB, ensureSeeded, getSettings, activeAssumptionVersion, publishAssumptions, saveProposal, snapshotVersion, restoreVersion, exportBackup, importBackup } from "@/lib/db";
import { newProposal, allocationFromCatalog } from "@/lib/factories";
import { priceProgram } from "@/lib/engine/pricing";
import { cloneAssumptions } from "@/lib/engine/assumptions";
import { withStatus } from "@/lib/actions";

let d: StudioDB;
beforeEach(async () => {
  d = new StudioDB(`test-${Math.random()}`);
  setDB(d);
  await ensureSeeded(d);
});

async function makeProposal() {
  const p = newProposal(await getSettings(d), await activeAssumptionVersion(d));
  const items = await d.equipment.toArray();
  p.programs[0].equipment.push(allocationFromCatalog(items.find((i) => i.id === "eq_tin_cat")!, 40), allocationFromCatalog(items.find((i) => i.id === "eq_exterior_bait_station")!, 30));
  p.customer.name = "Persisted Co";
  await saveProposal(p, d);
  return p;
}

describe("Persistence", () => {
  it("seeds settings, equipment, historical library and default $210 assumptions", async () => {
    const s = await getSettings(d);
    expect(s.profile.name).toBe("Anthony Acosta");
    expect((await activeAssumptionVersion(d)).assumptions.laborRateCentsPerHour).toBe(21000);
    expect(await d.historical.count()).toBe(0); // confidential history ships only in the private data pack
    const tin = await d.equipment.get("eq_tin_cat");
    expect(tin!.unitPriceCents).toBeNull(); // historical prices are never applied
  });
  it("proposals survive a new connection (page refresh)", async () => {
    const p = await makeProposal();
    const again = new StudioDB(d.name);
    const got = await again.proposals.get(p.id);
    expect(got?.customer.name).toBe("Persisted Co");
  });
  it("changing the default rate does not reprice existing proposals", async () => {
    const p = await makeProposal();
    const v = await activeAssumptionVersion(d);
    const a = cloneAssumptions(v.assumptions);
    a.laborRateCentsPerHour = 25000;
    await publishAssumptions(a, "raise", "2027-01-01", d);
    const stored = (await d.proposals.get(p.id))!;
    expect(stored.assumptions.laborRateCentsPerHour).toBe(21000);
    expect(priceProgram(stored, stored.programs[0]).rateCentsPerHour).toBe(21000);
    expect((await activeAssumptionVersion(d)).assumptions.laborRateCentsPerHour).toBe(25000);
  });
  it("price override persists across saves", async () => {
    const p = await makeProposal();
    p.programs[0].pricing.recurringOverride = { cents: 15000, locked: true, lockedAt: "x", note: "" };
    await saveProposal(p, d);
    const got = (await d.proposals.get(p.id))!;
    expect(priceProgram(got, got.programs[0]).recurring!.finalCents).toBe(15000);
  });
});

describe("Versioning", () => {
  it("snapshots and restores an earlier version", async () => {
    const p = await makeProposal();
    await snapshotVersion(p, "v1", "", d);
    p.title = "Changed";
    await saveProposal(p, d);
    const versions = await d.versions.where("proposalId").equals(p.id).toArray();
    const restored = await restoreVersion(versions[0].id, d);
    expect(restored.title).not.toBe("Changed");
    expect(await d.versions.where("proposalId").equals(p.id).count()).toBe(2); // auto-save before restore
  });
  it("approval snapshots prices", async () => {
    const p = await makeProposal();
    const a = withStatus(p, "approved");
    expect(a.approvedSnapshot).not.toBeNull();
    expect(Object.keys(a.approvedSnapshot!.prices).length).toBeGreaterThan(0);
  });
});

describe("Private data pack", () => {
  it("merges historical records and a knowledge document without touching proposals or settings", async () => {
    await makeProposal();
    const before = await getSettings(d);
    const pack = { format: "orkin-proposal-studio-backup", version: 1, data: { historical: [{ id: "hist_x", customer: "Sample", program: "P", category: "Commercial", description: "", priceCents: 15000, priceHighCents: null, basis: "per visit", frequency: "Weekly", status: "customer_specific", source: "pack", version: "", effectiveDate: null, notes: "", tags: [], metrics: {} }], knowledge: [{ id: "doc_mm", name: "Standards", mime: "text/plain", size: 1, uploadedAt: "x", text: "t", chunks: [], facts: [], extractionMethod: "plain_text", notes: "" }] } };
    const r = await importBackup(pack, "merge", d);
    expect(r.counts.historical).toBe(1);
    expect(await d.proposals.count()).toBe(1);
    expect((await getSettings(d)).profile.name).toBe(before.profile.name);
  });
});

describe("Backup & restore", () => {
  it("round-trips data and strips the AI passcode", async () => {
    await makeProposal();
    const s = await getSettings(d);
    await d.settings.put({ ...s, ai: { ...s.ai, accessToken: "secret" } });
    const b = await exportBackup(d);
    expect(JSON.stringify(b)).not.toContain("secret");
    const fresh = new StudioDB(`restore-${Math.random()}`);
    await ensureSeeded(fresh);
    const r = await importBackup(JSON.parse(JSON.stringify(b)), "replace", fresh);
    expect(r.counts.proposals).toBe(1);
    expect((await fresh.proposals.toArray())[0].customer.name).toBe("Persisted Co");
  });
  it("rejects files that are not backups", async () => {
    await expect(importBackup({ hello: 1 }, "merge", d)).rejects.toThrow(/not an Orkin Proposal Studio backup/);
  });
});
