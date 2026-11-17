import { DatabaseSync } from "node:sqlite";

import { nicheSimilarity, type NicheKey } from "./similarity.ts";

export interface RegistryClaim extends NicheKey {
  nicheId: string;
  factoryId: string;
  /** `candidate`: proposed, counts toward density and blocks near-copies; `live`: a company runs it. */
  level: "candidate" | "live";
  at: number;
}

/**
 * The cross-factory niche registry: which factory holds which niche. This one is a local SQLite file, so factories on
 * one server share it; a hosted registry implements the same calls for factories on different servers.
 */
export interface NicheRegistry {
  claim(claim: RegistryClaim): void;
  release(nicheId: string): void;
  promote(nicheId: string): void;
  /** Other factories' claims, most similar first, with their similarity to `key`. */
  nearest(key: NicheKey, excludeFactoryId: string, limit?: number): Array<RegistryClaim & { similarity: number }>;
  claims(factoryId?: string): RegistryClaim[];
  close(): void;
}

export function openLocalRegistry(file: string, options: { now?: () => number; candidateTtlMs?: number } = {}): NicheRegistry {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS claims (
    niche_id TEXT PRIMARY KEY, factory_id TEXT NOT NULL, buyer TEXT NOT NULL, job TEXT NOT NULL, channel TEXT NOT NULL, level TEXT NOT NULL, at INTEGER NOT NULL
  );`);
  const now = options.now ?? Date.now;
  const ttl = options.candidateTtlMs ?? 30 * 24 * 60 * 60_000;
  const current = () => (db.prepare("SELECT * FROM claims WHERE level = 'live' OR at > ?").all(now() - ttl) as Array<Record<string, unknown>>).map((row): RegistryClaim => ({
    nicheId: String(row.niche_id), factoryId: String(row.factory_id), buyer: String(row.buyer), job: String(row.job), channel: String(row.channel),
    level: row.level as RegistryClaim["level"], at: Number(row.at),
  }));
  return {
    claim(claim) {
      db.prepare("INSERT INTO claims (niche_id, factory_id, buyer, job, channel, level, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(niche_id) DO UPDATE SET level = excluded.level, at = excluded.at")
        .run(claim.nicheId, claim.factoryId, claim.buyer, claim.job, claim.channel, claim.level, claim.at);
    },
    release(nicheId) { db.prepare("DELETE FROM claims WHERE niche_id = ?").run(nicheId); },
    promote(nicheId) { db.prepare("UPDATE claims SET level = 'live', at = ? WHERE niche_id = ?").run(now(), nicheId); },
    nearest(key, excludeFactoryId, limit = 5) {
      return current().filter((claim) => claim.factoryId !== excludeFactoryId)
        .map((claim) => ({ ...claim, similarity: nicheSimilarity(key, claim) }))
        .sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    },
    claims(factoryId) { return current().filter((claim) => factoryId === undefined || claim.factoryId === factoryId); },
    close() { db.close(); },
  };
}
