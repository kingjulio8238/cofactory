import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { Alarm, AlarmKind, JournalEntry, Session, SessionKind, SessionStatus } from "../../../shared/cofactory/runtime.ts";
import type { Role } from "../../../shared/cofactory/types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, company_id TEXT, bot_id TEXT NOT NULL, role TEXT NOT NULL, thread_id TEXT NOT NULL, kind TEXT NOT NULL,
  trigger TEXT NOT NULL, objective TEXT NOT NULL, done_when TEXT NOT NULL, budget_ms INTEGER NOT NULL, budget_cents INTEGER NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, status TEXT NOT NULL, rounds INTEGER NOT NULL, short_streak INTEGER NOT NULL,
  round_started_at INTEGER, stop_reason TEXT, end_requested TEXT
);
CREATE INDEX IF NOT EXISTS sessions_live ON sessions (status, bot_id);
CREATE INDEX IF NOT EXISTS sessions_company ON sessions (company_id, started_at);
CREATE TABLE IF NOT EXISTS session_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS session_events_no_update BEFORE UPDATE ON session_events BEGIN SELECT RAISE(ABORT, 'session events are append-only'); END;
CREATE TABLE IF NOT EXISTS journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, session_id TEXT, company_id TEXT, bot_id TEXT NOT NULL, role TEXT NOT NULL,
  did TEXT NOT NULL, learned TEXT NOT NULL, next TEXT NOT NULL, blockers TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS journal_company ON journal (company_id, seq);
CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON journal BEGIN SELECT RAISE(ABORT, 'the journal is append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON journal BEGIN SELECT RAISE(ABORT, 'the journal is append-only'); END;
CREATE TABLE IF NOT EXISTS alarms (
  id TEXT PRIMARY KEY, company_id TEXT, kind TEXT NOT NULL, detail TEXT NOT NULL, raised_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS cursors (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS threads (bot_id TEXT NOT NULL, company_key TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY (bot_id, company_key));
`;

export interface NewSession {
  companyId: string | null;
  botId: string;
  role: Role;
  threadId: string;
  kind: SessionKind;
  trigger: string;
  objective: string;
  doneWhen: string;
  budgetMs: number;
  budgetCents: number;
}

/** The runtime's own state: sessions and their event trail, the journal, alarms and wake cursors. */
export function openRuntimeStore(file: string, now: () => number = Date.now) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const toSession = (row: Record<string, unknown>): Session => ({
    id: String(row.id), companyId: row.company_id === null ? null : String(row.company_id), botId: String(row.bot_id), role: row.role as Role,
    threadId: String(row.thread_id), kind: row.kind as SessionKind, trigger: String(row.trigger), objective: String(row.objective), doneWhen: String(row.done_when),
    budgetMs: Number(row.budget_ms), budgetCents: Number(row.budget_cents), startedAt: Number(row.started_at),
    endedAt: row.ended_at === null ? null : Number(row.ended_at), status: row.status as SessionStatus, rounds: Number(row.rounds),
    shortStreak: Number(row.short_streak), roundStartedAt: row.round_started_at === null ? null : Number(row.round_started_at),
    stopReason: row.stop_reason === null ? null : String(row.stop_reason),
    endRequested: row.end_requested === null ? null : JSON.parse(String(row.end_requested)),
  });

  const event = (sessionId: string, type: string, data: object = {}) =>
    db.prepare("INSERT INTO session_events (at, session_id, type, data) VALUES (?, ?, ?, ?)").run(now(), sessionId, type, JSON.stringify(data));

  return {
    createSession(input: NewSession): Session {
      const session: Session = {
        ...input, id: randomUUID(), startedAt: now(), endedAt: null, status: "running", rounds: 0, shortStreak: 0, roundStartedAt: null,
        stopReason: null, endRequested: null,
      };
      db.prepare(
        "INSERT INTO sessions (id, company_id, bot_id, role, thread_id, kind, trigger, objective, done_when, budget_ms, budget_cents, started_at, status, rounds, short_streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)",
      ).run(session.id, session.companyId, session.botId, session.role, session.threadId, session.kind, session.trigger, session.objective, session.doneWhen, session.budgetMs, session.budgetCents, session.startedAt, session.status);
      event(session.id, "created", { trigger: session.trigger, kind: session.kind });
      return session;
    },

    session(id: string): Session | null {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? toSession(row) : null;
    },

    liveSessions(): Session[] {
      return (db.prepare("SELECT * FROM sessions WHERE status = 'running' ORDER BY started_at").all() as Array<Record<string, unknown>>).map(toSession);
    },

    liveFor(botId: string): Session | null {
      const row = db.prepare("SELECT * FROM sessions WHERE status = 'running' AND bot_id = ? LIMIT 1").get(botId) as Record<string, unknown> | undefined;
      return row ? toSession(row) : null;
    },

    sessionsFor(companyId: string | null, limit = 50): Session[] {
      const rows = (companyId === null
        ? db.prepare("SELECT * FROM sessions WHERE company_id IS NULL ORDER BY started_at DESC LIMIT ?").all(limit)
        : db.prepare("SELECT * FROM sessions WHERE company_id = ? ORDER BY started_at DESC LIMIT ?").all(companyId, limit)) as Array<Record<string, unknown>>;
      return rows.map(toSession);
    },

    lastSessionOf(botId: string, companyId: string | null): Session | null {
      const row = (companyId === null
        ? db.prepare("SELECT * FROM sessions WHERE bot_id = ? AND company_id IS NULL ORDER BY started_at DESC LIMIT 1").get(botId)
        : db.prepare("SELECT * FROM sessions WHERE bot_id = ? AND company_id = ? ORDER BY started_at DESC LIMIT 1").get(botId, companyId)) as Record<string, unknown> | undefined;
      return row ? toSession(row) : null;
    },

    roundStarted(id: string): void {
      db.prepare("UPDATE sessions SET rounds = rounds + 1, round_started_at = ? WHERE id = ? AND status = 'running'").run(now(), id);
      event(id, "round_started");
    },

    roundSettled(id: string, shortStreak: number, data: object): void {
      db.prepare("UPDATE sessions SET short_streak = ?, round_started_at = NULL WHERE id = ?").run(shortStreak, id);
      event(id, "round_settled", data);
    },

    requestEnd(id: string, request: NonNullable<Session["endRequested"]>): void {
      db.prepare("UPDATE sessions SET end_requested = ? WHERE id = ? AND status = 'running'").run(JSON.stringify(request), id);
      event(id, "end_requested", request);
    },

    finish(id: string, status: Exclude<SessionStatus, "running">, reason: string): boolean {
      const changed = db.prepare("UPDATE sessions SET status = ?, stop_reason = ?, ended_at = ?, round_started_at = NULL WHERE id = ? AND status = 'running'").run(status, reason, now(), id).changes > 0;
      if (changed) event(id, "finished", { status, reason });
      return changed;
    },

    note(id: string, type: string, data: object = {}): void {
      event(id, type, data);
    },

    sessionEvents(id: string): Array<{ at: number; type: string; data: unknown }> {
      return (db.prepare("SELECT at, type, data FROM session_events WHERE session_id = ? ORDER BY seq").all(id) as Array<Record<string, unknown>>)
        .map((row) => ({ at: Number(row.at), type: String(row.type), data: JSON.parse(String(row.data)) }));
    },

    appendJournal(entry: Omit<JournalEntry, "seq" | "at">): JournalEntry {
      const at = now();
      const { lastInsertRowid } = db.prepare("INSERT INTO journal (at, session_id, company_id, bot_id, role, did, learned, next, blockers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(at, entry.sessionId, entry.companyId, entry.botId, entry.role, entry.did, entry.learned, entry.next, entry.blockers);
      return { ...entry, seq: Number(lastInsertRowid), at };
    },

    journal(companyId: string | null, limit = 20): JournalEntry[] {
      const rows = (companyId === null
        ? db.prepare("SELECT * FROM journal WHERE company_id IS NULL ORDER BY seq DESC LIMIT ?").all(limit)
        : db.prepare("SELECT * FROM journal WHERE company_id = ? ORDER BY seq DESC LIMIT ?").all(companyId, limit)) as Array<Record<string, unknown>>;
      return rows.reverse().map((row) => ({
        seq: Number(row.seq), at: Number(row.at), sessionId: row.session_id === null ? null : String(row.session_id),
        companyId: row.company_id === null ? null : String(row.company_id), botId: String(row.bot_id), role: row.role as JournalEntry["role"],
        did: String(row.did), learned: String(row.learned), next: String(row.next), blockers: String(row.blockers),
      }));
    },

    journaledIn(sessionId: string): boolean {
      return Boolean(db.prepare("SELECT 1 FROM journal WHERE session_id = ? AND role != 'runtime' LIMIT 1").get(sessionId));
    },

    /** Raises an alarm unless the same kind is already open for the company. */
    raise(companyId: string | null, kind: AlarmKind, detail: string): Alarm | null {
      const open = db.prepare("SELECT 1 FROM alarms WHERE kind = ? AND resolved_at IS NULL AND company_id IS ?").get(kind, companyId);
      if (open) return null;
      const alarm: Alarm = { id: randomUUID(), companyId, kind, detail, raisedAt: now(), resolvedAt: null };
      db.prepare("INSERT INTO alarms (id, company_id, kind, detail, raised_at) VALUES (?, ?, ?, ?, ?)").run(alarm.id, companyId, kind, detail, alarm.raisedAt);
      return alarm;
    },

    resolve(companyId: string | null, kind: AlarmKind): void {
      db.prepare("UPDATE alarms SET resolved_at = ? WHERE kind = ? AND resolved_at IS NULL AND company_id IS ?").run(now(), kind, companyId);
    },

    openAlarms(companyId?: string | null): Alarm[] {
      const rows = (companyId === undefined
        ? db.prepare("SELECT * FROM alarms WHERE resolved_at IS NULL ORDER BY raised_at").all()
        : db.prepare("SELECT * FROM alarms WHERE resolved_at IS NULL AND company_id IS ? ORDER BY raised_at").all(companyId)) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id), companyId: row.company_id === null ? null : String(row.company_id), kind: row.kind as AlarmKind,
        detail: String(row.detail), raisedAt: Number(row.raised_at), resolvedAt: null,
      }));
    },

    cursor(name: string): number {
      const row = db.prepare("SELECT value FROM cursors WHERE name = ?").get(name) as { value: number } | undefined;
      return row ? Number(row.value) : 0;
    },

    setCursor(name: string, value: number): void {
      db.prepare("INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(name, value);
    },

    /** The seat a runtime conversation belongs to, if it is one. */
    seatOfThread(threadId: string): { botId: string; companyId: string | null } | null {
      const row = db.prepare("SELECT bot_id, company_key FROM threads WHERE thread_id = ?").get(threadId) as { bot_id: string; company_key: string } | undefined;
      return row ? { botId: row.bot_id, companyId: row.company_key === "factory" ? null : row.company_key } : null;
    },

    threadOf(botId: string, companyId: string | null): string | null {
      const row = db.prepare("SELECT thread_id FROM threads WHERE bot_id = ? AND company_key = ?").get(botId, companyId ?? "factory") as { thread_id: string } | undefined;
      return row ? row.thread_id : null;
    },

    setThread(botId: string, companyId: string | null, threadId: string): void {
      db.prepare("INSERT INTO threads (bot_id, company_key, thread_id) VALUES (?, ?, ?) ON CONFLICT(bot_id, company_key) DO UPDATE SET thread_id = excluded.thread_id").run(botId, companyId ?? "factory", threadId);
    },

    close(): void {
      db.close();
    },
  };
}

export type RuntimeStore = ReturnType<typeof openRuntimeStore>;
