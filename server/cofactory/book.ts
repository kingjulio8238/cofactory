import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import {
  DEFAULT_POLICY,
  type Authorization,
  type Brief,
  type Bucket,
  type Company,
  type CompanyStatus,
  type EntryKind,
  type Evidence,
  type FactoryPolicy,
  type KillReason,
  type LedgerEntry,
  type Membership,
  type FactoryMessage,
  type MessageType,
  type Recommendation,
  type ReplyPolicy,
  type Role,
  type SpendCategory,
  type Stage,
} from "../../shared/cofactory/types.ts";
import { rollbackKeeping } from "../sqlite-rollback.ts";
import { audit, checkAdvance, type CompanyFigures } from "./stages.ts";

export type Refusal = { ok: false; reason: string };
export type Result<T> = ({ ok: true } & T) | Refusal;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, brief TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL,
  cap_cents INTEGER NOT NULL, created_at INTEGER NOT NULL, stage_at INTEGER NOT NULL, killed_reason TEXT
);
CREATE TABLE IF NOT EXISTS entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, kind TEXT NOT NULL,
  from_bucket TEXT, to_bucket TEXT, cents INTEGER NOT NULL CHECK (cents > 0), company_id TEXT, category TEXT,
  vendor TEXT, actor TEXT NOT NULL, receipt TEXT, auth_id TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS entries_company ON entries (company_id, seq);
CREATE TRIGGER IF NOT EXISTS entries_no_update BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;
CREATE TABLE IF NOT EXISTS authorizations (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, category TEXT NOT NULL, vendor TEXT NOT NULL, cents INTEGER NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, company_id TEXT NOT NULL, type TEXT NOT NULL,
  actor TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TABLE IF NOT EXISTS members (bot_id TEXT PRIMARY KEY, role TEXT NOT NULL, company_id TEXT);
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, type TEXT NOT NULL,
  from_bot TEXT NOT NULL, from_role TEXT NOT NULL, to_role TEXT NOT NULL, company_id TEXT, parent_id TEXT,
  budget_auth_id TEXT, brief TEXT NOT NULL, reply_policy TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_to ON messages (company_id, to_role, seq);
CREATE TRIGGER IF NOT EXISTS messages_no_update BEFORE UPDATE ON messages BEGIN SELECT RAISE(ABORT, 'messages are append-only'); END;
CREATE TRIGGER IF NOT EXISTS messages_no_delete BEFORE DELETE ON messages BEGIN SELECT RAISE(ABORT, 'messages are append-only'); END;
`;

const companyBucket = (id: string): Bucket => `company:${id}`;

interface Move {
  kind: EntryKind;
  from: Bucket | null;
  to: Bucket | null;
  cents: number;
  actor: string;
  companyId?: string | null;
  category?: SpendCategory | null;
  vendor?: string | null;
  receipt?: string | null;
  authId?: string | null;
  note?: string | null;
}

export interface BookOptions {
  policy?: Partial<FactoryPolicy>;
  now?: () => number;
}

/** The factory's books: companies, the append-only ledger, spend holds and stage events, in one SQLite file. */
export function openBook(file: string, options: BookOptions = {}) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const policy: FactoryPolicy = { ...DEFAULT_POLICY, ...options.policy };
  const now = options.now ?? Date.now;

  const tx = <T>(work: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = work();
      db.exec("COMMIT");
      return out;
    } catch (error) {
      rollbackKeeping(db, error);
    }
  };

  const balance = (bucket: Bucket): number => {
    const row = db.prepare(
      "SELECT COALESCE(SUM(CASE WHEN to_bucket = ? THEN cents ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN from_bucket = ? THEN cents ELSE 0 END), 0) AS b FROM entries WHERE to_bucket = ? OR from_bucket = ?",
    ).get(bucket, bucket, bucket, bucket) as { b: number };
    return Number(row.b);
  };

  const heldCents = (companyId: string): number => {
    const row = db.prepare("SELECT COALESCE(SUM(cents), 0) AS h FROM authorizations WHERE company_id = ? AND status = 'open' AND expires_at > ?")
      .get(companyId, now()) as { h: number };
    return Number(row.h);
  };

  const append = (move: Move): LedgerEntry => {
    if (!Number.isSafeInteger(move.cents) || move.cents <= 0) throw new Error("cents must be a positive integer");
    if (move.from && move.from !== "external" && balance(move.from) < move.cents) throw new Error(`${move.from} cannot cover ${move.cents} cents`);
    const entry = {
      id: randomUUID(), at: now(), kind: move.kind, from: move.from, to: move.to, cents: move.cents,
      companyId: move.companyId ?? null, category: move.category ?? null, vendor: move.vendor ?? null, actor: move.actor,
      receipt: move.receipt ?? null, authId: move.authId ?? null, note: move.note ?? null,
    };
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO entries (id, at, kind, from_bucket, to_bucket, cents, company_id, category, vendor, actor, receipt, auth_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(entry.id, entry.at, entry.kind, entry.from, entry.to, entry.cents, entry.companyId, entry.category, entry.vendor, entry.actor, entry.receipt, entry.authId, entry.note);
    return { seq: Number(lastInsertRowid), ...entry };
  };

  const logEvent = (companyId: string, type: string, actor: string, data: object) => {
    db.prepare("INSERT INTO events (at, company_id, type, actor, data) VALUES (?, ?, ?, ?, ?)").run(now(), companyId, type, actor, JSON.stringify(data));
  };

  const company = (id: string): Company | null => {
    const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToCompany(row) : null;
  };

  const companies = (): Company[] =>
    (db.prepare("SELECT * FROM companies ORDER BY created_at").all() as Array<Record<string, unknown>>).map(rowToCompany);

  const setStatus = (id: string, status: CompanyStatus, killedReason: KillReason | null = null) => {
    db.prepare("UPDATE companies SET status = ?, killed_reason = ? WHERE id = ?").run(status, killedReason, id);
  };

  const sumFor = (companyId: string, kind: EntryKind, since = 0): number => {
    const row = db.prepare("SELECT COALESCE(SUM(cents), 0) AS s FROM entries WHERE company_id = ? AND kind = ? AND at >= ?").get(companyId, kind, since) as { s: number };
    return Number(row.s);
  };

  const live = (id: string): Result<{ company: Company }> => {
    const found = company(id);
    if (!found) return { ok: false, reason: "no such company" };
    if (found.status !== "live") return { ok: false, reason: `company is ${found.status}` };
    return { ok: true, company: found };
  };

  const voidOpen = (companyId: string) => {
    db.prepare("UPDATE authorizations SET status = 'voided' WHERE company_id = ? AND status = 'open'").run(companyId);
  };

  const figures = (): CompanyFigures[] => {
    const since = now() - policy.stageDays.manage * 24 * 60 * 60_000;
    return companies().map((c) => ({ company: c, spentCents: sumFor(c.id, "spend"), recentRevenueCents: sumFor(c.id, "revenue", since) }));
  };

  return {
    policy,

    deposit(cents: number, actor: string): LedgerEntry {
      return tx(() => append({ kind: "deposit", from: "external", to: "unallocated", cents, actor }));
    },

    /** Moves money between unallocated and the reserve until the reserve holds `cents`. */
    setReserve(cents: number, actor: string): LedgerEntry | null {
      return tx(() => {
        const delta = cents - balance("reserve");
        if (delta === 0) return null;
        return delta > 0
          ? append({ kind: "reserve", from: "unallocated", to: "reserve", cents: delta, actor })
          : append({ kind: "reserve", from: "reserve", to: "unallocated", cents: -delta, actor });
      });
    },

    launch(input: { name: string; brief: string; capCents: number }, actor: string): Result<{ company: Company }> {
      return tx(() => {
        const liveCount = companies().filter((c) => c.status !== "killed").length;
        if (liveCount >= policy.maxLiveCompanies) return { ok: false, reason: `already ${liveCount} of ${policy.maxLiveCompanies} companies running` };
        if (input.capCents < policy.minStakeCents) return { ok: false, reason: `cap is below the minimum stake of ${policy.minStakeCents} cents` };
        if (balance("unallocated") < input.capCents) return { ok: false, reason: "not enough unallocated money for that cap" };
        const at = now();
        const created: Company = { id: randomUUID(), name: input.name, brief: input.brief, stage: "build", status: "live", capCents: input.capCents, createdAt: at, stageAt: at };
        db.prepare("INSERT INTO companies (id, name, brief, stage, status, cap_cents, created_at, stage_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(created.id, created.name, created.brief, created.stage, created.status, created.capCents, created.createdAt, created.stageAt);
        append({ kind: "allocate", from: "unallocated", to: companyBucket(created.id), cents: input.capCents, actor, companyId: created.id });
        logEvent(created.id, "launch", actor, { capCents: input.capCents });
        return { ok: true, company: created };
      });
    },

    topUp(companyId: string, cents: number, actor: string): Result<{ company: Company }> {
      return tx(() => {
        const found = live(companyId);
        if (!found.ok) return found;
        if (balance("unallocated") < cents) return { ok: false, reason: "not enough unallocated money" };
        append({ kind: "allocate", from: "unallocated", to: companyBucket(companyId), cents, actor, companyId });
        db.prepare("UPDATE companies SET cap_cents = cap_cents + ? WHERE id = ?").run(cents, companyId);
        logEvent(companyId, "top_up", actor, { cents });
        return { ok: true, company: company(companyId)! };
      });
    },

    available(companyId: string): number {
      return balance(companyBucket(companyId)) - heldCents(companyId);
    },

    authorize(input: { companyId: string; category: SpendCategory; vendor: string; cents: number }, actor: string): Result<{ authorization: Authorization }> {
      return tx(() => {
        const found = live(input.companyId);
        if (!found.ok) return found;
        if (!Number.isSafeInteger(input.cents) || input.cents <= 0) return { ok: false, reason: "cents must be a positive integer" };
        if (input.category === "gated") return { ok: false, reason: "gated spend needs the owner" };
        if (input.category === "distribution" && !["sell", "manage"].includes(found.company.stage)) {
          return { ok: false, reason: "distribution spend opens after a selling signal" };
        }
        const available = balance(companyBucket(input.companyId)) - heldCents(input.companyId);
        if (available < input.cents) return { ok: false, reason: `only ${available} cents available` };
        const at = now();
        const authorization: Authorization = {
          id: randomUUID(), companyId: input.companyId, category: input.category, vendor: input.vendor, cents: input.cents,
          status: "open", createdAt: at, expiresAt: at + policy.authorizationTtlMs,
        };
        db.prepare("INSERT INTO authorizations (id, company_id, category, vendor, cents, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(authorization.id, authorization.companyId, authorization.category, authorization.vendor, authorization.cents, authorization.status, authorization.createdAt, authorization.expiresAt);
        logEvent(input.companyId, "authorize", actor, { authId: authorization.id, cents: input.cents, category: input.category, vendor: input.vendor });
        return { ok: true, authorization };
      });
    },

    capture(authId: string, input: { cents?: number; receipt: string }, actor: string): Result<{ entry: LedgerEntry }> {
      return tx(() => {
        const row = db.prepare("SELECT * FROM authorizations WHERE id = ?").get(authId) as Record<string, unknown> | undefined;
        if (!row) return { ok: false, reason: "no such authorization" };
        const auth = rowToAuthorization(row);
        if (auth.status !== "open") return { ok: false, reason: `authorization is ${auth.status}` };
        if (auth.expiresAt <= now()) return { ok: false, reason: "authorization lapsed" };
        const found = live(auth.companyId);
        if (!found.ok) return found;
        const cents = input.cents ?? auth.cents;
        if (cents > auth.cents) return { ok: false, reason: `capture of ${cents} exceeds the ${auth.cents} authorized` };
        db.prepare("UPDATE authorizations SET status = 'captured' WHERE id = ?").run(authId);
        const entry = append({
          kind: "spend", from: companyBucket(auth.companyId), to: "external", cents, actor, companyId: auth.companyId,
          category: auth.category, vendor: auth.vendor, receipt: input.receipt, authId,
        });
        return { ok: true, entry };
      });
    },

    authorization(authId: string): Authorization | null {
      const row = db.prepare("SELECT * FROM authorizations WHERE id = ?").get(authId) as Record<string, unknown> | undefined;
      return row ? rowToAuthorization(row) : null;
    },

    voidAuthorization(authId: string): boolean {
      return db.prepare("UPDATE authorizations SET status = 'voided' WHERE id = ? AND status = 'open'").run(authId).changes > 0;
    },

    recordRevenue(input: { companyId: string; cents: number; receipt: string }, actor: string): LedgerEntry {
      return tx(() => {
        if (!company(input.companyId)) throw new Error("no such company");
        return append({ kind: "revenue", from: "external", to: "unallocated", cents: input.cents, actor, companyId: input.companyId, receipt: input.receipt });
      });
    },

    recordRefund(input: { companyId: string; cents: number; receipt: string }, actor: string): LedgerEntry {
      return tx(() => append({ kind: "refund", from: "unallocated", to: "external", cents: input.cents, actor, companyId: input.companyId, receipt: input.receipt }));
    },

    recordShadow(input: { companyId: string | null; cents: number; vendor: string; note?: string }, actor: string): LedgerEntry {
      return tx(() => append({ kind: "shadow", from: null, to: null, cents: input.cents, actor, companyId: input.companyId, category: "intelligence", vendor: input.vendor, note: input.note ?? null }));
    },

    advance(companyId: string, to: Stage, evidence: Evidence | null, actor: string): Result<{ company: Company }> {
      return tx(() => {
        const found = company(companyId);
        if (!found) return { ok: false, reason: "no such company" };
        const check = checkAdvance(found, to, evidence, sumFor(companyId, "revenue"));
        if (!check.ok) return { ok: false, reason: check.reason! };
        db.prepare("UPDATE companies SET stage = ?, stage_at = ? WHERE id = ?").run(to, now(), companyId);
        logEvent(companyId, "advance", actor, { from: found.stage, to, evidence });
        return { ok: true, company: company(companyId)! };
      });
    },

    freeze(companyId: string, actor: string, why: string): Result<{ company: Company }> {
      return tx(() => {
        const found = live(companyId);
        if (!found.ok) return found;
        setStatus(companyId, "frozen");
        voidOpen(companyId);
        logEvent(companyId, "freeze", actor, { why });
        return { ok: true, company: company(companyId)! };
      });
    },

    unfreeze(companyId: string, actor: string): Result<{ company: Company }> {
      return tx(() => {
        const found = company(companyId);
        if (found?.status !== "frozen") return { ok: false, reason: "company is not frozen" };
        setStatus(companyId, "live");
        logEvent(companyId, "unfreeze", actor, {});
        return { ok: true, company: company(companyId)! };
      });
    },

    /** Stops a company for good: open holds are voided and what is left of its money returns to unallocated. */
    kill(companyId: string, reason: KillReason, actor: string, why: string): Result<{ company: Company; releasedCents: number }> {
      return tx(() => {
        const found = company(companyId);
        if (!found) return { ok: false, reason: "no such company" };
        if (found.status === "killed") return { ok: false, reason: "company is already killed" };
        voidOpen(companyId);
        const left = balance(companyBucket(companyId));
        if (left > 0) append({ kind: "release", from: companyBucket(companyId), to: "unallocated", cents: left, actor, companyId });
        setStatus(companyId, "killed", reason);
        logEvent(companyId, "kill", actor, { reason, why, releasedCents: left });
        return { ok: true, company: company(companyId)!, releasedCents: left };
      });
    },

    seat(membership: Membership): Result<{ membership: Membership }> {
      if (membership.companyId !== null && !company(membership.companyId)) return { ok: false, reason: "no such company" };
      db.prepare("INSERT INTO members (bot_id, role, company_id) VALUES (?, ?, ?) ON CONFLICT(bot_id) DO UPDATE SET role = excluded.role, company_id = excluded.company_id")
        .run(membership.botId, membership.role, membership.companyId);
      return { ok: true, membership };
    },

    unseat(botId: string): boolean {
      return db.prepare("DELETE FROM members WHERE bot_id = ?").run(botId).changes > 0;
    },

    membership(botId: string): Membership | null {
      const row = db.prepare("SELECT * FROM members WHERE bot_id = ?").get(botId) as Record<string, unknown> | undefined;
      return row ? rowToMembership(row) : null;
    },

    members(): Membership[] {
      return (db.prepare("SELECT * FROM members ORDER BY role, bot_id").all() as Array<Record<string, unknown>>).map(rowToMembership);
    },

    send(message: Omit<FactoryMessage, "id" | "at">): FactoryMessage {
      const stored: FactoryMessage = { ...message, id: randomUUID(), at: now() };
      db.prepare(
        "INSERT INTO messages (id, at, type, from_bot, from_role, to_role, company_id, parent_id, budget_auth_id, brief, reply_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(stored.id, stored.at, stored.type, stored.fromBotId, stored.fromRole, stored.toRole, stored.companyId, stored.parentId, stored.budgetAuthId, JSON.stringify(stored.brief), stored.replyPolicy);
      return stored;
    },

    /** Messages addressed to `role` (inside `companyId` for a company seat), newest last. */
    inbox(role: Role | "owner", companyId: string | null, limit = 20): FactoryMessage[] {
      const rows = (companyId === null
        ? db.prepare("SELECT * FROM messages WHERE to_role = ? ORDER BY seq DESC LIMIT ?").all(role, limit)
        : db.prepare("SELECT * FROM messages WHERE to_role = ? AND company_id = ? ORDER BY seq DESC LIMIT ?").all(role, companyId, limit)) as Array<Record<string, unknown>>;
      return rows.reverse().map(rowToMessage);
    },

    message(id: string): FactoryMessage | null {
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? rowToMessage(row) : null;
    },

    balance,
    company,
    companies,

    entries(filter: { companyId?: string } = {}): LedgerEntry[] {
      const rows = (filter.companyId
        ? db.prepare("SELECT * FROM entries WHERE company_id = ? ORDER BY seq").all(filter.companyId)
        : db.prepare("SELECT * FROM entries ORDER BY seq").all()) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry);
    },

    events(companyId: string): Array<{ seq: number; at: number; type: string; actor: string; data: unknown }> {
      return (db.prepare("SELECT * FROM events WHERE company_id = ? ORDER BY seq").all(companyId) as Array<Record<string, unknown>>).map((row) => ({
        seq: Number(row.seq), at: Number(row.at), type: String(row.type), actor: String(row.actor), data: JSON.parse(String(row.data)),
      }));
    },

    audit(): Recommendation[] {
      return audit(figures(), policy, now());
    },

    close(): void {
      db.close();
    },
  };
}

export type Book = ReturnType<typeof openBook>;

function rowToCompany(row: Record<string, unknown>): Company {
  return {
    id: String(row.id), name: String(row.name), brief: String(row.brief), stage: row.stage as Stage, status: row.status as CompanyStatus,
    capCents: Number(row.cap_cents), createdAt: Number(row.created_at), stageAt: Number(row.stage_at),
    ...(row.killed_reason ? { killedReason: row.killed_reason as KillReason } : {}),
  };
}

function rowToMembership(row: Record<string, unknown>): Membership {
  return { botId: String(row.bot_id), role: row.role, companyId: row.company_id === null ? null : String(row.company_id) } as Membership;
}

function rowToMessage(row: Record<string, unknown>): FactoryMessage {
  return {
    id: String(row.id), at: Number(row.at), type: row.type as MessageType, fromBotId: String(row.from_bot), fromRole: row.from_role as Role,
    toRole: row.to_role as Role | "owner", companyId: row.company_id === null ? null : String(row.company_id),
    parentId: row.parent_id === null ? null : String(row.parent_id), budgetAuthId: row.budget_auth_id === null ? null : String(row.budget_auth_id),
    brief: JSON.parse(String(row.brief)) as Brief, replyPolicy: row.reply_policy as ReplyPolicy,
  };
}

function rowToAuthorization(row: Record<string, unknown>): Authorization {
  return {
    id: String(row.id), companyId: String(row.company_id), category: row.category as SpendCategory, vendor: String(row.vendor),
    cents: Number(row.cents), status: row.status as Authorization["status"], createdAt: Number(row.created_at), expiresAt: Number(row.expires_at),
  };
}

function rowToEntry(row: Record<string, unknown>): LedgerEntry {
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return {
    seq: Number(row.seq), id: String(row.id), at: Number(row.at), kind: row.kind as EntryKind,
    from: text(row.from_bucket) as Bucket | null, to: text(row.to_bucket) as Bucket | null, cents: Number(row.cents),
    companyId: text(row.company_id), category: text(row.category) as SpendCategory | null, vendor: text(row.vendor),
    actor: String(row.actor), receipt: text(row.receipt), authId: text(row.auth_id), note: text(row.note),
  };
}
