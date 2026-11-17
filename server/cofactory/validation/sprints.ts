import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { DEFAULT_VALIDATION_POLICY, OPT_OUT_LINE, type OutreachChannel, type Sprint, type SprintTarget, type Suppression, type Touch, type ValidationPolicy } from "../../../shared/cofactory/validation.ts";
import type { Truth } from "../truth/store.ts";

const DAY_MS = 24 * 60 * 60_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, niche_id TEXT, dossier_id TEXT, started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  status TEXT NOT NULL, outcome TEXT, offer_url TEXT
);
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY, sprint_id TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, channel TEXT NOT NULL, source_check_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL, UNIQUE (sprint_id, address)
);
CREATE TABLE IF NOT EXISTS touches (
  id TEXT PRIMARY KEY, sprint_id TEXT NOT NULL, target_id TEXT NOT NULL, at INTEGER NOT NULL, channel TEXT NOT NULL, summary TEXT NOT NULL, message_ref TEXT
);
CREATE TABLE IF NOT EXISTS suppressions (address TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cursors (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS suppressions_no_delete BEFORE DELETE ON suppressions BEGIN SELECT RAISE(ABORT, 'a suppression is permanent'); END;
`;

type Refusal = { ok: false; reason: string };

/** Lowercased email, or a URL without its fragment and trailing slash: how a buyer is recognised across sprints. */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (/^[^@\s]+@[^@\s]+$/.test(trimmed)) return trimmed.toLowerCase();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

/** Validation sprints: who may be contacted, how often, and when the world's answer passes or fails the sprint. */
export function openSprints(file: string, deps: { truth: Truth; policy?: Partial<ValidationPolicy>; now?: () => number }) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  const policy: ValidationPolicy = { ...DEFAULT_VALIDATION_POLICY, ...deps.policy };
  const now = deps.now ?? Date.now;
  const { truth } = deps;

  const toSprint = (row: Record<string, unknown>): Sprint => ({
    id: String(row.id), companyId: String(row.company_id), nicheId: row.niche_id === null ? null : String(row.niche_id), dossierId: row.dossier_id === null ? null : String(row.dossier_id),
    startedAt: Number(row.started_at), endsAt: Number(row.ends_at), status: row.status as Sprint["status"], outcome: row.outcome === null ? null : String(row.outcome),
    offerUrl: row.offer_url === null ? null : String(row.offer_url),
  });
  const toTarget = (row: Record<string, unknown>): SprintTarget => ({
    id: String(row.id), sprintId: String(row.sprint_id), name: String(row.name), address: String(row.address), channel: row.channel as OutreachChannel,
    sourceCheckId: Number(row.source_check_id), addedAt: Number(row.added_at),
  });
  const toTouch = (row: Record<string, unknown>): Touch => ({
    id: String(row.id), sprintId: String(row.sprint_id), targetId: String(row.target_id), at: Number(row.at), channel: row.channel as OutreachChannel,
    summary: String(row.summary), messageRef: row.message_ref === null ? null : String(row.message_ref),
  });

  const sprint = (id: string): Sprint | null => {
    const row = db.prepare("SELECT * FROM sprints WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? toSprint(row) : null;
  };
  const running = (companyId: string): Sprint | null => {
    const row = db.prepare("SELECT * FROM sprints WHERE company_id = ? AND status = 'running' LIMIT 1").get(companyId) as Record<string, unknown> | undefined;
    return row ? toSprint(row) : null;
  };
  const touches = (sprintId: string): Touch[] => (db.prepare("SELECT * FROM touches WHERE sprint_id = ? ORDER BY at").all(sprintId) as Array<Record<string, unknown>>).map(toTouch);
  const suppressed = (address: string): Suppression | null => {
    const row = db.prepare("SELECT * FROM suppressions WHERE address = ?").get(normalizeAddress(address)) as Record<string, unknown> | undefined;
    return row ? { address: String(row.address), reason: row.reason as Suppression["reason"], at: Number(row.at) } : null;
  };

  /** Where the sprint stands against the pass rule: one committed event, or enough urgent replies from distinct buyers. */
  function evidence(s: Sprint) {
    const events = truth.events({ companyId: s.companyId }).filter((event) => event.receivedAt >= s.startedAt && !event.testMode);
    const committed = events.filter((event) => event.evidenceClass === "committed");
    const urgentSenders = new Map<string, string>();
    for (const event of events) {
      if (event.evidenceClass !== "urgent") continue;
      const sender = (event.payerEmail ?? event.externalId).toLowerCase();
      if (!urgentSenders.has(sender)) urgentSenders.set(sender, event.id);
    }
    return { committed: committed.map((event) => event.id), urgent: [...urgentSenders.values()], events: events.length };
  }

  return {
    policy,
    sprint,
    running,
    touches,
    suppressed,
    evidence: (sprintId: string) => { const s = sprint(sprintId); return s ? evidence(s) : null; },

    start(input: { companyId: string; nicheId?: string | null; dossierId?: string | null; offerUrl?: string | null }): { ok: true; sprint: Sprint } | Refusal {
      const open = running(input.companyId);
      if (open) return { ok: false, reason: `sprint ${open.id.slice(0, 8)} is still running` };
      const at = now();
      const created: Sprint = { id: randomUUID(), companyId: input.companyId, nicheId: input.nicheId ?? null, dossierId: input.dossierId ?? null, startedAt: at, endsAt: at + policy.sprintDays * DAY_MS, status: "running", outcome: null, offerUrl: input.offerUrl ?? null };
      db.prepare("INSERT INTO sprints (id, company_id, niche_id, dossier_id, started_at, ends_at, status, outcome, offer_url) VALUES (?, ?, ?, ?, ?, ?, 'running', NULL, ?)")
        .run(created.id, created.companyId, created.nicheId, created.dossierId, created.startedAt, created.endsAt, created.offerUrl);
      return { ok: true, sprint: created };
    },

    setOfferUrl(sprintId: string, url: string): void {
      db.prepare("UPDATE sprints SET offer_url = ? WHERE id = ?").run(url, sprintId);
    },

    /**
     * Adds a named buyer to the sprint's list. The contact route must be public: the page that shows it is fetched, and
     * for an email the address itself must appear on that page. No bought lists, no guessed addresses.
     */
    async addTarget(sprintId: string, input: { name: string; address: string; channel: OutreachChannel; sourceUrl: string }): Promise<{ ok: true; target: SprintTarget } | Refusal> {
      const s = sprint(sprintId);
      if (!s || s.status !== "running") return { ok: false, reason: "no running sprint with that id" };
      const address = normalizeAddress(input.address);
      const blocked = suppressed(address);
      if (blocked) return { ok: false, reason: `${address} is suppressed (${blocked.reason}); never contact it again` };
      const isEmail = address.includes("@") && !address.startsWith("http");
      const check = isEmail
        ? await truth.checkContains({ url: input.sourceUrl, needle: address, subject: `sprint:${sprintId}` })
        : await truth.checkClaim({ url: input.sourceUrl, subject: `sprint:${sprintId}` });
      if (check.verdict !== "verified") return { ok: false, reason: `the contact route is not public on ${input.sourceUrl}: ${check.verdict} (${check.reason})` };
      const target: SprintTarget = { id: randomUUID(), sprintId, name: input.name.trim(), address, channel: input.channel, sourceCheckId: check.checkId!, addedAt: now() };
      try {
        db.prepare("INSERT INTO targets (id, sprint_id, name, address, channel, source_check_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(target.id, sprintId, target.name, target.address, target.channel, target.sourceCheckId, target.addedAt);
      } catch {
        return { ok: false, reason: `${address} is already on this sprint's list` };
      }
      return { ok: true, target };
    },

    targets(sprintId: string): SprintTarget[] {
      return (db.prepare("SELECT * FROM targets WHERE sprint_id = ? ORDER BY added_at").all(sprintId) as Array<Record<string, unknown>>).map(toTarget);
    },

    /**
     * The gate before any contact: the target is on the list and not suppressed, and the sprint, the day and the
     * target each have room. Returns the opt-out line the first message must carry.
     */
    authorizeTouch(sprintId: string, targetId: string, summary: string): { ok: true; touch: Touch; optOutLine: string | null } | Refusal {
      const s = sprint(sprintId);
      if (!s || s.status !== "running") return { ok: false, reason: "no running sprint with that id" };
      if (now() > s.endsAt) return { ok: false, reason: "the sprint's time box is over" };
      const target = (db.prepare("SELECT * FROM targets WHERE id = ? AND sprint_id = ?").get(targetId, sprintId) as Record<string, unknown> | undefined);
      if (!target) return { ok: false, reason: "that buyer is not on this sprint's list" };
      const t = toTarget(target);
      const blocked = suppressed(t.address);
      if (blocked) return { ok: false, reason: `${t.address} is suppressed (${blocked.reason})` };
      const all = touches(sprintId);
      if (all.length >= policy.touchesPerSprint) return { ok: false, reason: `the sprint has used all ${policy.touchesPerSprint} contacts` };
      if (all.filter((touch) => touch.at > now() - DAY_MS).length >= policy.touchesPerDay) return { ok: false, reason: `${policy.touchesPerDay} contacts in the last 24 hours; wait` };
      const mine = all.filter((touch) => touch.targetId === targetId);
      if (mine.length >= policy.touchesPerTarget) return { ok: false, reason: `${t.name} has had ${mine.length} contacts; no more` };
      const last = mine.at(-1);
      if (last && now() - last.at < policy.daysBetweenTouches * DAY_MS) return { ok: false, reason: `${t.name} was contacted less than ${policy.daysBetweenTouches} days ago` };
      const touch: Touch = { id: randomUUID(), sprintId, targetId, at: now(), channel: t.channel, summary: summary.trim().slice(0, 500), messageRef: null };
      db.prepare("INSERT INTO touches (id, sprint_id, target_id, at, channel, summary, message_ref) VALUES (?, ?, ?, ?, ?, ?, NULL)").run(touch.id, sprintId, targetId, touch.at, touch.channel, touch.summary);
      return { ok: true, touch, optOutLine: mine.length === 0 ? OPT_OUT_LINE : null };
    },

    touch(touchId: string): Touch | null {
      const row = db.prepare("SELECT * FROM touches WHERE id = ?").get(touchId) as Record<string, unknown> | undefined;
      return row ? toTouch(row) : null;
    },

    /** Every running sprint, for the scheduler's upkeep. */
    runningAll(): Sprint[] {
      return (db.prepare("SELECT * FROM sprints WHERE status = 'running'").all() as Array<Record<string, unknown>>).map(toSprint);
    },

    markSent(touchId: string, messageRef: string): boolean {
      return db.prepare("UPDATE touches SET message_ref = ? WHERE id = ? AND message_ref IS NULL").run(messageRef, touchId).changes > 0;
    },

    /** Never contact this address again, in any sprint of any company here. Permanent by design. */
    suppress(address: string, reason: Suppression["reason"]): void {
      db.prepare("INSERT INTO suppressions (address, reason, at) VALUES (?, ?, ?) ON CONFLICT(address) DO NOTHING").run(normalizeAddress(address), reason, now());
    },

    /** Passes a sprint on its evidence, or fails it once its time box is over. */
    settle(sprintId: string): Sprint | null {
      const s = sprint(sprintId);
      if (!s || s.status !== "running") return s;
      const found = evidence(s);
      if (found.committed.length) {
        db.prepare("UPDATE sprints SET status = 'passed', outcome = ? WHERE id = ?").run(`committed: ${found.committed.join(", ")}`, sprintId);
      } else if (found.urgent.length >= policy.urgentToPass) {
        db.prepare("UPDATE sprints SET status = 'passed', outcome = ? WHERE id = ?").run(`urgent from ${found.urgent.length} buyers: ${found.urgent.join(", ")}`, sprintId);
      } else if (now() > s.endsAt) {
        db.prepare("UPDATE sprints SET status = 'failed', outcome = ? WHERE id = ?").run(`time box over: ${found.committed.length} committed, ${found.urgent.length} urgent buyers, ${touches(sprintId).length} contacts`, sprintId);
      }
      return sprint(sprintId);
    },

    cursor: {
      get: (name: string): number => Number((db.prepare("SELECT value FROM cursors WHERE name = ?").get(name) as { value: number } | undefined)?.value ?? 0),
      set: (name: string, value: number): void => { db.prepare("INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(name, value); },
    },

    close(): void {
      db.close();
    },
  };
}

export type Sprints = ReturnType<typeof openSprints>;
