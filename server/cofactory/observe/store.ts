import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { CostSnapshot, Decision, DecisionKind, EvidenceLink, OwnerTouch, ToolCallRecord } from "../../../shared/cofactory/observe.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS decisions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, company_id TEXT, session_id TEXT, actor TEXT NOT NULL,
  kind TEXT NOT NULL, verdict TEXT NOT NULL, reason TEXT NOT NULL, evidence TEXT NOT NULL, cost TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_company ON decisions (company_id, seq);
CREATE INDEX IF NOT EXISTS decisions_session ON decisions (session_id, seq);
CREATE TABLE IF NOT EXISTS tool_calls (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, session_id TEXT, company_id TEXT, bot_id TEXT NOT NULL, role TEXT NOT NULL,
  tool TEXT NOT NULL, ok INTEGER NOT NULL, summary TEXT NOT NULL, took_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tool_calls_session ON tool_calls (session_id, seq);
CREATE TABLE IF NOT EXISTS owner_touches (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, company_id TEXT, session_id TEXT, source TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT, 'decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS tool_calls_no_update BEFORE UPDATE ON tool_calls BEGIN SELECT RAISE(ABORT, 'tool calls are append-only'); END;
CREATE TRIGGER IF NOT EXISTS touches_no_update BEFORE UPDATE ON owner_touches BEGIN SELECT RAISE(ABORT, 'owner touches are append-only'); END;
`;

const nullable = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** The observation log: decisions at gates, tool calls, and owner touches. Nothing here is ever rewritten. */
export function openObserveStore(file: string, now: () => number = Date.now) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const toDecision = (row: Record<string, unknown>): Decision => ({
    seq: Number(row.seq), id: String(row.id), at: Number(row.at), companyId: nullable(row.company_id), sessionId: nullable(row.session_id),
    actor: String(row.actor), kind: row.kind as DecisionKind, verdict: row.verdict as Decision["verdict"], reason: String(row.reason),
    evidence: JSON.parse(String(row.evidence)) as EvidenceLink[], cost: JSON.parse(String(row.cost)) as CostSnapshot,
  });
  const toCall = (row: Record<string, unknown>): ToolCallRecord => ({
    seq: Number(row.seq), at: Number(row.at), sessionId: nullable(row.session_id), companyId: nullable(row.company_id), botId: String(row.bot_id),
    role: String(row.role), tool: String(row.tool), ok: Number(row.ok) === 1, summary: String(row.summary), tookMs: Number(row.took_ms),
  });
  const toTouch = (row: Record<string, unknown>): OwnerTouch => ({
    seq: Number(row.seq), at: Number(row.at), companyId: nullable(row.company_id), sessionId: nullable(row.session_id),
    source: row.source as OwnerTouch["source"], kind: String(row.kind), detail: String(row.detail),
  });

  return {
    decide(input: Omit<Decision, "seq" | "id" | "at">): Decision {
      const id = randomUUID(), at = now();
      const { lastInsertRowid } = db.prepare("INSERT INTO decisions (id, at, company_id, session_id, actor, kind, verdict, reason, evidence, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, at, input.companyId, input.sessionId, input.actor, input.kind, input.verdict, input.reason, JSON.stringify(input.evidence), JSON.stringify(input.cost));
      return { ...input, seq: Number(lastInsertRowid), id, at };
    },

    decisions(filter: { companyId?: string | null; sessionId?: string; limit?: number } = {}): Decision[] {
      const limit = filter.limit ?? 500;
      const rows = (filter.sessionId
        ? db.prepare("SELECT * FROM decisions WHERE session_id = ? ORDER BY seq").all(filter.sessionId)
        : filter.companyId !== undefined
          ? db.prepare("SELECT * FROM (SELECT * FROM decisions WHERE company_id IS ? ORDER BY seq DESC LIMIT ?) ORDER BY seq").all(filter.companyId, limit)
          : db.prepare("SELECT * FROM (SELECT * FROM decisions ORDER BY seq DESC LIMIT ?) ORDER BY seq").all(limit)) as Array<Record<string, unknown>>;
      return rows.map(toDecision);
    },

    toolCall(input: Omit<ToolCallRecord, "seq" | "at">): void {
      db.prepare("INSERT INTO tool_calls (at, session_id, company_id, bot_id, role, tool, ok, summary, took_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(now(), input.sessionId, input.companyId, input.botId, input.role, input.tool, input.ok ? 1 : 0, input.summary.slice(0, 500), input.tookMs);
    },

    toolCalls(filter: { sessionId?: string; companyId?: string | null; limit?: number } = {}): ToolCallRecord[] {
      const limit = filter.limit ?? 500;
      const rows = (filter.sessionId
        ? db.prepare("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY seq").all(filter.sessionId)
        : filter.companyId !== undefined
          ? db.prepare("SELECT * FROM (SELECT * FROM tool_calls WHERE company_id IS ? ORDER BY seq DESC LIMIT ?) ORDER BY seq").all(filter.companyId, limit)
          : db.prepare("SELECT * FROM (SELECT * FROM tool_calls ORDER BY seq DESC LIMIT ?) ORDER BY seq").all(limit)) as Array<Record<string, unknown>>;
      return rows.map(toCall);
    },

    touch(input: Omit<OwnerTouch, "seq" | "at">): void {
      db.prepare("INSERT INTO owner_touches (at, company_id, session_id, source, kind, detail) VALUES (?, ?, ?, ?, ?, ?)")
        .run(now(), input.companyId, input.sessionId, input.source, input.kind, input.detail.slice(0, 500));
    },

    touches(filter: { companyId?: string | null; since?: number } = {}): OwnerTouch[] {
      const since = filter.since ?? 0;
      const rows = (filter.companyId !== undefined
        ? db.prepare("SELECT * FROM owner_touches WHERE company_id IS ? AND at >= ? ORDER BY seq").all(filter.companyId, since)
        : db.prepare("SELECT * FROM owner_touches WHERE at >= ? ORDER BY seq").all(since)) as Array<Record<string, unknown>>;
      return rows.map(toTouch);
    },

    close(): void {
      db.close();
    },
  };
}

export type ObserveStore = ReturnType<typeof openObserveStore>;
