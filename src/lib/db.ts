import Dexie, { type Table } from "dexie";
import type {
  Asset,
  AssumptionVersion,
  Customer,
  EquipmentItem,
  HistoricalPrice,
  KnowledgeDoc,
  Proposal,
  ProposalVersion,
  Settings,
  VerifiedCapability,
} from "./types";
import { DEFAULT_ASSUMPTIONS, cloneAssumptions } from "./engine/assumptions";
import { SEED_CAPABILITIES, SEED_EQUIPMENT, SEED_HISTORICAL, defaultSettings } from "./seed";
import { nowISO, uid } from "./ids";

/**
 * Local persistence (IndexedDB via Dexie). Data stays on this device. It is not
 * cloud-synchronized and not encrypted at rest beyond what the OS/browser provides.
 */
export class StudioDB extends Dexie {
  proposals!: Table<Proposal, string>;
  versions!: Table<ProposalVersion, string>;
  customers!: Table<Customer, string>;
  equipment!: Table<EquipmentItem, string>;
  historical!: Table<HistoricalPrice, string>;
  capabilities!: Table<VerifiedCapability, string>;
  knowledge!: Table<KnowledgeDoc, string>;
  assets!: Table<Asset, string>;
  assumptionVersions!: Table<AssumptionVersion, string>;
  settings!: Table<Settings, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = "orkin-proposal-studio") {
    super(name);
    this.version(1).stores({
      proposals: "id, status, updatedAt, customerId, kind",
      versions: "id, proposalId, createdAt, [proposalId+versionNumber]",
      customers: "id, name, updatedAt",
      equipment: "id, category, approvalStatus",
      historical: "id, customer, category, status",
      capabilities: "id, kind, status",
      knowledge: "id, uploadedAt",
      assets: "id, proposalId, kind",
      assumptionVersions: "id, effectiveDate, createdAt",
      settings: "id",
      meta: "key",
    });
  }
}

let _db: StudioDB | null = null;
export function db(): StudioDB {
  if (!_db) _db = new StudioDB();
  return _db;
}
/** Test hook. */
export function setDB(d: StudioDB) {
  _db = d;
}

export async function ensureSeeded(d: StudioDB = db()): Promise<void> {
  const seeded = await d.meta.get("seeded_v1");
  if (seeded) return migrate(d);
  await d.transaction("rw", [d.equipment, d.historical, d.capabilities, d.assumptionVersions, d.settings, d.meta], async () => {
    const version: AssumptionVersion = { id: uid("asv"), effectiveDate: nowISO().slice(0, 10), createdAt: nowISO(), note: "Initial defaults — $210/hr, Tin Cat 1 min, bait station 2 min confirmed; all other values are app planning estimates.", assumptions: cloneAssumptions(DEFAULT_ASSUMPTIONS) };
    await d.assumptionVersions.add(version);
    if (!(await d.settings.get("settings"))) await d.settings.put(defaultSettings(version.id));
    await d.equipment.bulkPut(SEED_EQUIPMENT);
    await d.historical.bulkPut(SEED_HISTORICAL);
    await d.capabilities.bulkPut(SEED_CAPABILITIES);
    await d.meta.put({ key: "seeded_v1", value: nowISO() });
    await d.meta.put({ key: "seeded_v2", value: nowISO() });
  });
}

/** v2: master-memory alignment for installs seeded before it existed. Adds missing records; never overwrites user edits except the rejected guarantee notes. */
async function migrate(d: StudioDB) {
  if (await d.meta.get("seeded_v2")) return;
  await d.transaction("rw", [d.historical, d.capabilities, d.settings, d.meta], async () => {
    for (const h of SEED_HISTORICAL) if (!(await d.historical.get(h.id))) await d.historical.add(h);
    const tg = await d.capabilities.get("cap_triple_guarantee");
    const seedTg = SEED_CAPABILITIES.find((c) => c.id === "cap_triple_guarantee")!;
    if (tg && /2 × 24|within 24 hours/.test(tg.internalNotes)) await d.capabilities.put({ ...tg, internalNotes: seedTg.internalNotes });
    const s = await d.settings.get("settings");
    if (s && !s.profile.branch) await d.settings.put({ ...s, profile: { ...s.profile, branch: "Detroit Commercial · Branch 693" } });
    await d.meta.put({ key: "seeded_v2", value: nowISO() });
  });
}

export async function getSettings(d: StudioDB = db()): Promise<Settings> {
  await ensureSeeded(d);
  return (await d.settings.get("settings"))!;
}

export async function activeAssumptionVersion(d: StudioDB = db()): Promise<AssumptionVersion> {
  const s = await getSettings(d);
  return (await d.assumptionVersions.get(s.activeAssumptionsVersionId))!;
}

/** Create a new assumptions version effective from a date; prior proposals keep their own snapshot. */
export async function publishAssumptions(next: AssumptionVersion["assumptions"], note: string, effectiveDate: string, d: StudioDB = db()) {
  const v: AssumptionVersion = { id: uid("asv"), effectiveDate, createdAt: nowISO(), note, assumptions: cloneAssumptions(next) };
  await d.assumptionVersions.add(v);
  const s = await getSettings(d);
  await d.settings.put({ ...s, activeAssumptionsVersionId: v.id, updatedAt: nowISO() });
  return v;
}

export async function saveProposal(p: Proposal, d: StudioDB = db()) {
  const next = { ...p, updatedAt: nowISO() };
  await d.proposals.put(next);
  return next;
}

export async function snapshotVersion(p: Proposal, reason: string, label = "", d: StudioDB = db()) {
  const last = await d.versions.where("proposalId").equals(p.id).sortBy("versionNumber");
  const versionNumber = (last.at(-1)?.versionNumber ?? 0) + 1;
  const v: ProposalVersion = { id: uid("ver"), proposalId: p.id, versionNumber, label: label || `v${versionNumber}`, reason, createdAt: nowISO(), snapshot: structuredClone(p) };
  await d.versions.add(v);
  return v;
}

export async function restoreVersion(versionId: string, d: StudioDB = db()) {
  const v = await d.versions.get(versionId);
  if (!v) throw new Error("Version not found");
  const current = await d.proposals.get(v.proposalId);
  if (current) await snapshotVersion(current, `Auto-saved before restoring ${v.label}`, "", d);
  const restored = { ...structuredClone(v.snapshot), updatedAt: nowISO() };
  await d.proposals.put(restored);
  return restored;
}

// ───── Backup & restore ─────

export const BACKUP_FORMAT = "orkin-proposal-studio-backup";
export const BACKUP_VERSION = 1;

export async function exportBackup(d: StudioDB = db()) {
  const [proposals, versions, customers, equipment, historical, capabilities, knowledge, assets, assumptionVersions, settings] = await Promise.all([
    d.proposals.toArray(),
    d.versions.toArray(),
    d.customers.toArray(),
    d.equipment.toArray(),
    d.historical.toArray(),
    d.capabilities.toArray(),
    d.knowledge.toArray(),
    d.assets.toArray(),
    d.assumptionVersions.toArray(),
    d.settings.toArray(),
  ]);
  // The AI access passcode is a credential; never include it in backup files.
  const safeSettings = settings.map((s) => ({ ...s, ai: { ...s.ai, accessToken: "" } }));
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowISO(), data: { proposals, versions, customers, equipment, historical, capabilities, knowledge, assets, assumptionVersions, settings: safeSettings } };
}

export interface RestoreReport {
  counts: Record<string, number>;
}

export async function importBackup(json: unknown, mode: "merge" | "replace", d: StudioDB = db()): Promise<RestoreReport> {
  if (!json || typeof json !== "object") throw new Error("Not a backup file");
  const b = json as { format?: string; version?: number; data?: Record<string, unknown[]> };
  if (b.format !== BACKUP_FORMAT) throw new Error("This file is not an Orkin Proposal Studio backup.");
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) throw new Error("Backup was created by a newer version of the app.");
  const data = b.data ?? {};
  const tables = ["proposals", "versions", "customers", "equipment", "historical", "capabilities", "knowledge", "assets", "assumptionVersions", "settings"] as const;
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = data[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Invalid backup: ${t} is not a list`);
    for (const r of (rows ?? []) as { id?: unknown }[]) if (!r || typeof r !== "object" || typeof r.id !== "string") throw new Error(`Invalid backup: ${t} row without id`);
  }
  const currentSettings = await d.settings.get("settings");
  await d.transaction("rw", tables.map((t) => d[t]), async () => {
    for (const t of tables) {
      const rows = (data[t] ?? []) as never[];
      if (mode === "replace") await d[t].clear();
      if (t === "settings" && currentSettings) {
        // Keep this device's AI passcode.
        for (const r of rows as unknown as Settings[]) r.ai = { ...r.ai, accessToken: currentSettings.ai.accessToken };
      }
      await (d[t] as Table<unknown, string>).bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  await d.meta.put({ key: "seeded_v1", value: nowISO() });
  return { counts };
}
