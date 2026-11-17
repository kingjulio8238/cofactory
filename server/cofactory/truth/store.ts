import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ClaimCheck, EventKind, ExternalEvent, Snapshot } from "../../../shared/cofactory/evidence.ts";
import { declaredCharset } from "../../link-preview/meta.ts";
import { guardedGet, type Fetched } from "../../link-preview/net.ts";
import { classifyEvent } from "./classify.ts";
import { htmlToText, quoteAppears } from "./text.ts";

/** One GET of a public page; the default goes through dusk's SSRF-guarded fetch. */
export type PageFetcher = (url: URL) => Promise<Fetched>;

const MAX_PAGE_BYTES = 3_000_000;
/** Below this much readable text a missing quote proves nothing: the page is likely rendered by script. */
const THIN_PAGE_CHARS = 400;

const PAGE_TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml)/i;

export const guardedPageFetcher: PageFetcher = (url) => guardedGet(url, {
  limit: MAX_PAGE_BYTES, partial: true, accept: (type) => PAGE_TYPES.test(type),
  headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "user-agent": "Mozilla/5.0 (compatible; evidence-check)" },
  signal: AbortSignal.timeout(20_000),
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, final_url TEXT, fetched_at INTEGER NOT NULL, ok INTEGER NOT NULL, failure TEXT,
  content_type TEXT, sha256 TEXT, text_length INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_url ON snapshots (url, fetched_at);
CREATE TABLE IF NOT EXISTS claim_checks (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, subject TEXT, url TEXT NOT NULL, quote TEXT,
  verdict TEXT NOT NULL, reason TEXT NOT NULL, snapshot_id TEXT
);
CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, company_id TEXT, kind TEXT NOT NULL,
  occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL, payer_email TEXT, amount_cents INTEGER, refund_of TEXT,
  test_mode INTEGER NOT NULL, text TEXT, evidence_class TEXT NOT NULL, UNIQUE (source, external_id)
);
CREATE TRIGGER IF NOT EXISTS checks_no_update BEFORE UPDATE ON claim_checks BEGIN SELECT RAISE(ABORT, 'claim checks are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON external_events BEGIN SELECT RAISE(ABORT, 'external events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON external_events BEGIN SELECT RAISE(ABORT, 'external events are append-only'); END;
`;

export interface EventInput {
  source: string;
  externalId: string;
  companyId?: string | null;
  kind: EventKind;
  occurredAt: number;
  payerEmail?: string | null;
  amountCents?: number | null;
  refundOf?: string | null;
  testMode?: boolean;
  text?: string | null;
}

/** The evidence store: page snapshots (bodies content-addressed on disk), claim checks, and external events. */
export function openTruth(dir: string, options: { fetch?: PageFetcher; now?: () => number; maxAgeMs?: number } = {}) {
  mkdirSync(join(dir, "snapshots"), { recursive: true });
  const db = new DatabaseSync(join(dir, "evidence.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  const fetchPage = options.fetch ?? guardedPageFetcher;
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60_000;
  const bodyFile = (sha: string) => join(dir, "snapshots", `${sha}.body`);

  const rowToSnapshot = (row: Record<string, unknown>): Snapshot => ({
    id: String(row.id), url: String(row.url), finalUrl: row.final_url === null ? null : String(row.final_url), fetchedAt: Number(row.fetched_at),
    ok: Number(row.ok) === 1, failure: row.failure === null ? null : String(row.failure), contentType: row.content_type === null ? null : String(row.content_type),
    sha256: row.sha256 === null ? null : String(row.sha256), textLength: Number(row.text_length),
  });

  const textOf = (snapshot: Snapshot): string => {
    if (!snapshot.sha256 || !existsSync(bodyFile(snapshot.sha256))) return "";
    const body = readFileSync(bodyFile(snapshot.sha256));
    return pageText(body, snapshot.contentType ?? "");
  };

  async function snapshot(rawUrl: string, fresh = false): Promise<Snapshot> {
    if (!fresh) {
      const cached = db.prepare("SELECT * FROM snapshots WHERE url = ? AND ok = 1 AND fetched_at > ? ORDER BY fetched_at DESC LIMIT 1").get(rawUrl, now() - maxAgeMs) as Record<string, unknown> | undefined;
      if (cached) return rowToSnapshot(cached);
    }
    let url: URL;
    try { url = new URL(rawUrl); } catch { return record({ url: rawUrl, ok: false, failure: "not a URL" }); }
    let fetched: Fetched;
    try { fetched = await fetchPage(url); } catch { fetched = { ok: false, reason: "network" }; }
    if (!fetched.ok) return record({ url: rawUrl, ok: false, failure: fetched.reason });
    const sha256 = createHash("sha256").update(fetched.body).digest("hex");
    if (!existsSync(bodyFile(sha256))) writeFileSync(bodyFile(sha256), fetched.body, { mode: 0o600 });
    const text = pageText(fetched.body, fetched.type);
    return record({ url: rawUrl, finalUrl: fetched.url.href, ok: true, contentType: fetched.type, sha256, textLength: text.length });
  }

  function record(input: { url: string; ok: boolean; failure?: string; finalUrl?: string; contentType?: string; sha256?: string; textLength?: number }): Snapshot {
    const snap: Snapshot = {
      id: randomUUID(), url: input.url, finalUrl: input.finalUrl ?? null, fetchedAt: now(), ok: input.ok, failure: input.failure ?? null,
      contentType: input.contentType ?? null, sha256: input.sha256 ?? null, textLength: input.textLength ?? 0,
    };
    db.prepare("INSERT INTO snapshots (id, url, final_url, fetched_at, ok, failure, content_type, sha256, text_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(snap.id, snap.url, snap.finalUrl, snap.fetchedAt, snap.ok ? 1 : 0, snap.failure, snap.contentType, snap.sha256, snap.textLength);
    return snap;
  }

  return {
    snapshot,

    text(snapshotId: string): string {
      const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(snapshotId) as Record<string, unknown> | undefined;
      return row ? textOf(rowToSnapshot(row)) : "";
    },

    /** Checks that `url` resolves and, given a quote, that the quote is on the page; every check is kept. */
    async checkClaim(input: { url: string; quote?: string | null; subject?: string | null }): Promise<ClaimCheck> {
      const snap = await snapshot(input.url);
      const quote = input.quote?.trim() ? input.quote.trim() : null;
      let check: ClaimCheck;
      if (!snap.ok) check = { url: input.url, quote, verdict: "unreachable", reason: `fetch failed: ${snap.failure}`, snapshotId: snap.id };
      else if (!quote) check = { url: input.url, quote, verdict: "verified", reason: "page resolves", snapshotId: snap.id };
      else {
        const found = quoteAppears(quote, textOf(snap));
        if (found.found) check = { url: input.url, quote, verdict: "verified", reason: found.reason, snapshotId: snap.id };
        else if (snap.textLength < THIN_PAGE_CHARS) check = { url: input.url, quote, verdict: "unverifiable", reason: `only ${snap.textLength} characters of text: likely rendered by script`, snapshotId: snap.id };
        else check = { url: input.url, quote, verdict: "missing", reason: found.reason, snapshotId: snap.id };
      }
      const { lastInsertRowid } = db.prepare("INSERT INTO claim_checks (at, subject, url, quote, verdict, reason, snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(now(), input.subject ?? null, check.url, check.quote, check.verdict, check.reason, check.snapshotId);
      return { ...check, checkId: Number(lastInsertRowid) };
    },

    /** Records an event once per (source, externalId); a repeat returns the first record unchanged. */
    recordEvent(input: EventInput): { event: ExternalEvent; duplicate: boolean } {
      const existing = db.prepare("SELECT * FROM external_events WHERE source = ? AND external_id = ?").get(input.source, input.externalId) as Record<string, unknown> | undefined;
      if (existing) return { event: rowToEvent(existing), duplicate: true };
      const refunded = input.kind !== "refund" && Boolean(db.prepare("SELECT 1 FROM external_events WHERE kind = 'refund' AND refund_of = ?").get(input.externalId));
      const event: ExternalEvent = {
        id: randomUUID(), source: input.source, externalId: input.externalId, companyId: input.companyId ?? null, kind: input.kind,
        occurredAt: input.occurredAt, receivedAt: now(), payerEmail: input.payerEmail ?? null, amountCents: input.amountCents ?? null,
        refundOf: input.refundOf ?? null, testMode: input.testMode ?? false, text: input.text ?? null,
        evidenceClass: classifyEvent(input.kind, input.text ?? null, refunded),
      };
      db.prepare(
        "INSERT INTO external_events (id, source, external_id, company_id, kind, occurred_at, received_at, payer_email, amount_cents, refund_of, test_mode, text, evidence_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(event.id, event.source, event.externalId, event.companyId, event.kind, event.occurredAt, event.receivedAt, event.payerEmail, event.amountCents, event.refundOf, event.testMode ? 1 : 0, event.text, event.evidenceClass);
      return { event, duplicate: false };
    },

    claimCheck(checkId: number): (ClaimCheck & { at: number; subject: string | null }) | null {
      const row = db.prepare("SELECT * FROM claim_checks WHERE seq = ?").get(checkId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        checkId, at: Number(row.at), subject: row.subject === null ? null : String(row.subject), url: String(row.url),
        quote: row.quote === null ? null : String(row.quote), verdict: row.verdict as ClaimCheck["verdict"], reason: String(row.reason),
        snapshotId: row.snapshot_id === null ? null : String(row.snapshot_id),
      };
    },

    event(id: string): ExternalEvent | null {
      const row = db.prepare("SELECT * FROM external_events WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? rowToEvent(row) : null;
    },

    events(filter: { companyId?: string } = {}): ExternalEvent[] {
      const rows = (filter.companyId
        ? db.prepare("SELECT * FROM external_events WHERE company_id = ? ORDER BY occurred_at").all(filter.companyId)
        : db.prepare("SELECT * FROM external_events ORDER BY occurred_at").all()) as Array<Record<string, unknown>>;
      return rows.map(rowToEvent);
    },

    /** externalIds of payments some refund reverses. */
    refunded(): Set<string> {
      return new Set((db.prepare("SELECT refund_of FROM external_events WHERE kind = 'refund' AND refund_of IS NOT NULL").all() as Array<{ refund_of: string }>).map((row) => row.refund_of));
    },

    close(): void {
      db.close();
    },
  };
}

export type Truth = ReturnType<typeof openTruth>;

function pageText(body: Buffer, type: string): string {
  const head = body.subarray(0, 4_096).toString("latin1");
  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? declaredCharset(head) ?? "utf-8";
  let decoded: string;
  try { decoded = new TextDecoder(charset).decode(body); } catch { decoded = body.toString("utf8"); }
  return /html|xml/i.test(type) ? htmlToText(decoded) : decoded;
}

function rowToEvent(row: Record<string, unknown>): ExternalEvent {
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return {
    id: String(row.id), source: String(row.source), externalId: String(row.external_id), companyId: text(row.company_id), kind: row.kind as EventKind,
    occurredAt: Number(row.occurred_at), receivedAt: Number(row.received_at), payerEmail: text(row.payer_email),
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents), refundOf: text(row.refund_of), testMode: Number(row.test_mode) === 1,
    text: text(row.text), evidenceClass: row.evidence_class as ExternalEvent["evidenceClass"],
  };
}
