import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const ORDER_STATUSES = ["open", "delivered", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** One paid order: opened when an arm's-length payment is booked, closed when it is delivered by hand. */
export interface Order {
  id: string;
  companyId: string;
  eventId: string;
  externalId: string;
  customer: string | null;
  amountCents: number;
  openedAt: number;
  status: OrderStatus;
  deliveredAt: number | null;
  deliveredBy: string | null;
  summary: string | null;
  /** Path of the delivered work, relative to the company folder. */
  deliverable: string | null;
}

export const REHEARSAL_STATUSES = ["pending", "delivered", "passed", "failed"] as const;
export type RehearsalStatus = (typeof REHEARSAL_STATUSES)[number];

/**
 * The bus-factor test: a fresh operator, given only the handoff packet (brief, runbook, journal and the order), serves
 * an order again in a separate folder. The lead compares the two deliverables and records the verdict.
 */
export interface Rehearsal {
  id: string;
  companyId: string;
  orderId: string;
  botId: string;
  dir: string;
  startedAt: number;
  status: RehearsalStatus;
  deliverable: string | null;
  verdictAt: number | null;
  note: string | null;
}

/** Shortest runbook that can plausibly hand an order to someone new. */
export const RUNBOOK_MIN_CHARS = 300;

/** A file inside `root`, given relative to it; links and `..` that leave the folder are refused. */
export function fileInside(root: string, path: string): { ok: true; file: string } | { ok: false; reason: string } {
  if (isAbsolute(path)) return { ok: false, reason: "give the path relative to the folder" };
  const file = join(root, path);
  if (!existsSync(file)) return { ok: false, reason: `${path} does not exist in the folder` };
  const real = realpathSync(file), base = realpathSync(root);
  const rel = relative(base, real);
  if (rel.startsWith("..") || isAbsolute(rel)) return { ok: false, reason: `${path} is outside the folder` };
  const stat = statSync(real);
  if (!stat.isFile() || stat.size === 0) return { ok: false, reason: `${path} is not a non-empty file` };
  return { ok: true, file: real };
}

/** Whether the folder's RUNBOOK.md is long enough and was written after `since`, so the steps are on record. */
export function runbookProblem(dir: string, since: number): string | null {
  const file = join(dir, "RUNBOOK.md");
  if (!existsSync(file)) return "write RUNBOOK.md first: the steps another operator would follow to serve this order";
  if (readFileSync(file, "utf8").trim().length < RUNBOOK_MIN_CHARS) return `RUNBOOK.md is too short to hand over (under ${RUNBOOK_MIN_CHARS} characters)`;
  if (statSync(file).mtimeMs < since) return "update RUNBOOK.md with what serving this order took";
  return null;
}

export function openOrders(file: string, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, external_id TEXT NOT NULL, customer TEXT,
  amount_cents INTEGER NOT NULL, opened_at INTEGER NOT NULL, status TEXT NOT NULL, delivered_at INTEGER, delivered_by TEXT,
  summary TEXT, deliverable TEXT
);
CREATE TABLE IF NOT EXISTS rehearsals (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, order_id TEXT NOT NULL, bot_id TEXT NOT NULL, dir TEXT NOT NULL, started_at INTEGER NOT NULL,
  status TEXT NOT NULL, deliverable TEXT, verdict_at INTEGER, note TEXT
);`);
  const toOrder = (row: Record<string, unknown>): Order => ({
    id: String(row.id), companyId: String(row.company_id), eventId: String(row.event_id), externalId: String(row.external_id),
    customer: row.customer === null ? null : String(row.customer), amountCents: Number(row.amount_cents), openedAt: Number(row.opened_at),
    status: row.status as OrderStatus, deliveredAt: row.delivered_at === null ? null : Number(row.delivered_at),
    deliveredBy: row.delivered_by === null ? null : String(row.delivered_by), summary: row.summary === null ? null : String(row.summary),
    deliverable: row.deliverable === null ? null : String(row.deliverable),
  });
  const toRehearsal = (row: Record<string, unknown>): Rehearsal => ({
    id: String(row.id), companyId: String(row.company_id), orderId: String(row.order_id), botId: String(row.bot_id), dir: String(row.dir),
    startedAt: Number(row.started_at), status: row.status as RehearsalStatus, deliverable: row.deliverable === null ? null : String(row.deliverable),
    verdictAt: row.verdict_at === null ? null : Number(row.verdict_at), note: row.note === null ? null : String(row.note),
  });

  return {
    /** Opens the order for a booked payment; a payment already opened returns its order. */
    open(input: { companyId: string; eventId: string; externalId: string; customer: string | null; amountCents: number }): Order {
      db.prepare("INSERT INTO orders (id, company_id, event_id, external_id, customer, amount_cents, opened_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open') ON CONFLICT(event_id) DO NOTHING")
        .run(randomUUID(), input.companyId, input.eventId, input.externalId, input.customer?.toLowerCase() ?? null, input.amountCents, now());
      return toOrder(db.prepare("SELECT * FROM orders WHERE event_id = ?").get(input.eventId) as Record<string, unknown>);
    },
    order(id: string): Order | null {
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? toOrder(row) : null;
    },
    list(companyId: string): Order[] {
      return (db.prepare("SELECT * FROM orders WHERE company_id = ? ORDER BY opened_at").all(companyId) as Array<Record<string, unknown>>).map(toOrder);
    },
    /** Whether `address` is a customer of the company: someone with an order. */
    isCustomer(companyId: string, address: string): boolean {
      return db.prepare("SELECT 1 FROM orders WHERE company_id = ? AND customer = ? LIMIT 1").get(companyId, address.trim().toLowerCase()) !== undefined;
    },
    deliver(id: string, input: { by: string; summary: string; deliverable: string }): Order | null {
      const changed = db.prepare("UPDATE orders SET status = 'delivered', delivered_at = ?, delivered_by = ?, summary = ?, deliverable = ? WHERE id = ? AND status = 'open'")
        .run(now(), input.by, input.summary, input.deliverable, id).changes;
      return changed ? this.order(id) : null;
    },
    refund(externalId: string): void {
      db.prepare("UPDATE orders SET status = 'refunded' WHERE external_id = ?").run(externalId);
    },

    startRehearsal(input: { companyId: string; orderId: string; botId: string; dir: string }): Rehearsal {
      const id = randomUUID();
      db.prepare("INSERT INTO rehearsals (id, company_id, order_id, bot_id, dir, started_at, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')")
        .run(id, input.companyId, input.orderId, input.botId, input.dir, now());
      return this.rehearsals(input.companyId).find((rehearsal) => rehearsal.id === id)!;
    },
    rehearsals(companyId: string): Rehearsal[] {
      return (db.prepare("SELECT * FROM rehearsals WHERE company_id = ? ORDER BY started_at").all(companyId) as Array<Record<string, unknown>>).map(toRehearsal);
    },
    rehearsalOfBot(botId: string): Rehearsal | null {
      const row = db.prepare("SELECT * FROM rehearsals WHERE bot_id = ? AND status IN ('pending', 'delivered') ORDER BY started_at DESC LIMIT 1").get(botId) as Record<string, unknown> | undefined;
      return row ? toRehearsal(row) : null;
    },
    rehearsalDelivered(id: string, deliverable: string): void {
      db.prepare("UPDATE rehearsals SET status = 'delivered', deliverable = ? WHERE id = ? AND status = 'pending'").run(deliverable, id);
    },
    rehearsalVerdict(id: string, passed: boolean, note: string): boolean {
      return db.prepare("UPDATE rehearsals SET status = ?, verdict_at = ?, note = ? WHERE id = ? AND status IN ('pending', 'delivered')")
        .run(passed ? "passed" : "failed", now(), note, id).changes > 0;
    },

    /** The first-dollar gate: a booked arm's-length payment, its order delivered, and a stand-in who served it again. */
    firstDollar(companyId: string): { paid: boolean; delivered: boolean; rehearsed: boolean; reached: boolean } {
      const orders = this.list(companyId).filter((order) => order.status !== "refunded");
      const paid = orders.length > 0;
      const delivered = orders.some((order) => order.status === "delivered");
      const rehearsed = this.rehearsals(companyId).some((rehearsal) => rehearsal.status === "passed");
      return { paid, delivered, rehearsed, reached: paid && delivered && rehearsed };
    },

    close(): void {
      db.close();
    },
  };
}

export type Orders = ReturnType<typeof openOrders>;
