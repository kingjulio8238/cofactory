import { DatabaseSync } from "node:sqlite";

import type { DiscoveryBatch, FactoryProfile, Niche, NicheStatus, Signal } from "../../../shared/cofactory/discovery.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, factory_id TEXT NOT NULL, started_at INTEGER NOT NULL, closed_at INTEGER, target INTEGER NOT NULL, note TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, factory_id TEXT NOT NULL, batch_id TEXT, at INTEGER NOT NULL, url TEXT NOT NULL, site TEXT NOT NULL, quote TEXT NOT NULL,
  norm_quote TEXT NOT NULL, kind TEXT NOT NULL, source_type TEXT NOT NULL, buyer_hint TEXT NOT NULL, job_hint TEXT NOT NULL,
  claim_check_id INTEGER NOT NULL, snapshot_id TEXT, UNIQUE (url, norm_quote)
);
CREATE TABLE IF NOT EXISTS niches (
  id TEXT PRIMARY KEY, factory_id TEXT NOT NULL, batch_id TEXT, at INTEGER NOT NULL, buyer TEXT NOT NULL, job TEXT NOT NULL, channel TEXT NOT NULL,
  why_gap TEXT NOT NULL, signal_ids TEXT NOT NULL, unique_input_ids TEXT NOT NULL, boring INTEGER NOT NULL, cross_field INTEGER NOT NULL,
  status TEXT NOT NULL, density INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS signals_no_update BEFORE UPDATE ON signals BEGIN SELECT RAISE(ABORT, 'signals are append-only'); END;
`;

const text = (value: unknown) => String(value);

/** Discovery state for one factory: its profile, batches, verified signals and niche candidates. */
export function openDiscoveryStore(file: string) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const toSignal = (row: Record<string, unknown>): Signal => ({
    id: text(row.id), factoryId: text(row.factory_id), batchId: row.batch_id === null ? null : text(row.batch_id), at: Number(row.at), url: text(row.url),
    site: text(row.site), quote: text(row.quote), kind: row.kind as Signal["kind"], sourceType: row.source_type as Signal["sourceType"],
    buyerHint: text(row.buyer_hint), jobHint: text(row.job_hint), claimCheckId: Number(row.claim_check_id), snapshotId: row.snapshot_id === null ? null : text(row.snapshot_id),
  });
  const toNiche = (row: Record<string, unknown>): Niche => ({
    id: text(row.id), factoryId: text(row.factory_id), batchId: row.batch_id === null ? null : text(row.batch_id), at: Number(row.at),
    buyer: text(row.buyer), job: text(row.job), channel: text(row.channel), whyGap: text(row.why_gap),
    signalIds: JSON.parse(text(row.signal_ids)) as string[], uniqueInputIds: JSON.parse(text(row.unique_input_ids)) as string[],
    boring: Number(row.boring) === 1, crossField: Number(row.cross_field) === 1, status: row.status as NicheStatus, density: Number(row.density),
  });
  const toBatch = (row: Record<string, unknown>): DiscoveryBatch => ({
    id: text(row.id), factoryId: text(row.factory_id), startedAt: Number(row.started_at), closedAt: row.closed_at === null ? null : Number(row.closed_at),
    target: Number(row.target), note: text(row.note),
  });

  return {
    profile(): FactoryProfile | null {
      const row = db.prepare("SELECT json FROM profile WHERE id = 1").get() as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as FactoryProfile) : null;
    },
    setProfile(profile: FactoryProfile): void {
      db.prepare("INSERT INTO profile (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(JSON.stringify(profile));
    },

    addBatch(batch: DiscoveryBatch): void {
      db.prepare("INSERT INTO batches (id, factory_id, started_at, closed_at, target, note) VALUES (?, ?, ?, NULL, ?, ?)").run(batch.id, batch.factoryId, batch.startedAt, batch.target, batch.note);
    },
    closeBatch(id: string, at: number): boolean {
      return db.prepare("UPDATE batches SET closed_at = ? WHERE id = ? AND closed_at IS NULL").run(at, id).changes > 0;
    },
    openBatch(): DiscoveryBatch | null {
      const row = db.prepare("SELECT * FROM batches WHERE closed_at IS NULL ORDER BY started_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
      return row ? toBatch(row) : null;
    },
    batches(): DiscoveryBatch[] {
      return (db.prepare("SELECT * FROM batches ORDER BY started_at").all() as Array<Record<string, unknown>>).map(toBatch);
    },

    signalByQuote(url: string, normQuote: string): Signal | null {
      const row = db.prepare("SELECT * FROM signals WHERE url = ? AND norm_quote = ?").get(url, normQuote) as Record<string, unknown> | undefined;
      return row ? toSignal(row) : null;
    },
    addSignal(signal: Signal, normQuote: string): void {
      db.prepare("INSERT INTO signals (id, factory_id, batch_id, at, url, site, quote, norm_quote, kind, source_type, buyer_hint, job_hint, claim_check_id, snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(signal.id, signal.factoryId, signal.batchId, signal.at, signal.url, signal.site, signal.quote, normQuote, signal.kind, signal.sourceType, signal.buyerHint, signal.jobHint, signal.claimCheckId, signal.snapshotId);
    },
    signal(id: string): Signal | null {
      const row = db.prepare("SELECT * FROM signals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? toSignal(row) : null;
    },
    signals(filter: { batchId?: string } = {}): Signal[] {
      const rows = (filter.batchId
        ? db.prepare("SELECT * FROM signals WHERE batch_id = ? ORDER BY at").all(filter.batchId)
        : db.prepare("SELECT * FROM signals ORDER BY at").all()) as Array<Record<string, unknown>>;
      return rows.map(toSignal);
    },

    addNiche(niche: Niche): void {
      db.prepare("INSERT INTO niches (id, factory_id, batch_id, at, buyer, job, channel, why_gap, signal_ids, unique_input_ids, boring, cross_field, status, density) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(niche.id, niche.factoryId, niche.batchId, niche.at, niche.buyer, niche.job, niche.channel, niche.whyGap, JSON.stringify(niche.signalIds), JSON.stringify(niche.uniqueInputIds), niche.boring ? 1 : 0, niche.crossField ? 1 : 0, niche.status, niche.density);
    },
    setNicheStatus(id: string, status: NicheStatus): boolean {
      return db.prepare("UPDATE niches SET status = ? WHERE id = ?").run(status, id).changes > 0;
    },
    niche(id: string): Niche | null {
      const row = db.prepare("SELECT * FROM niches WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? toNiche(row) : null;
    },
    niches(filter: { batchId?: string } = {}): Niche[] {
      const rows = (filter.batchId
        ? db.prepare("SELECT * FROM niches WHERE batch_id = ? ORDER BY at").all(filter.batchId)
        : db.prepare("SELECT * FROM niches ORDER BY at").all()) as Array<Record<string, unknown>>;
      return rows.map(toNiche);
    },

    close(): void {
      db.close();
    },
  };
}

export type DiscoveryStore = ReturnType<typeof openDiscoveryStore>;
