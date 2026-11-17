import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const APPROVAL_KINDS = ["launch", "spend", "close"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

/** An outward step the owner asked to approve, held until they decide. `payload` is what runs on approval. */
export interface Approval {
  id: string;
  kind: ApprovalKind;
  companyId: string | null;
  title: string;
  detail: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  at: number;
  status: "pending" | "approved" | "declined";
  decidedAt: number | null;
  note: string | null;
}

export function openApprovals(file: string, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, company_id TEXT, title TEXT NOT NULL, detail TEXT NOT NULL, payload TEXT NOT NULL,
  requested_by TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL, decided_at INTEGER, note TEXT
);`);
  const read = (row: Record<string, unknown>): Approval => ({
    id: String(row.id), kind: row.kind as ApprovalKind, companyId: row.company_id === null ? null : String(row.company_id), title: String(row.title),
    detail: String(row.detail), payload: JSON.parse(String(row.payload)) as Record<string, unknown>, requestedBy: String(row.requested_by), at: Number(row.at),
    status: row.status as Approval["status"], decidedAt: row.decided_at === null ? null : Number(row.decided_at), note: row.note === null ? null : String(row.note),
  });
  return {
    /** Files a request; an identical one still pending is returned instead of a second. */
    request(input: Pick<Approval, "kind" | "companyId" | "title" | "detail" | "payload" | "requestedBy">): Approval {
      const same = (db.prepare("SELECT * FROM approvals WHERE status = 'pending' AND kind = ? AND company_id IS ? AND payload = ?").get(input.kind, input.companyId, JSON.stringify(input.payload)) as Record<string, unknown> | undefined);
      if (same) return read(same);
      const approval: Approval = { ...input, id: randomUUID(), at: now(), status: "pending", decidedAt: null, note: null };
      db.prepare("INSERT INTO approvals (id, kind, company_id, title, detail, payload, requested_by, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')")
        .run(approval.id, approval.kind, approval.companyId, approval.title, approval.detail, JSON.stringify(approval.payload), approval.requestedBy, approval.at);
      return approval;
    },
    approval(id: string): Approval | null {
      const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return row ? read(row) : null;
    },
    /** Pending requests, all of them or one company's, oldest first. */
    pending(companyId?: string | null): Approval[] {
      const rows = companyId === undefined
        ? db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY at").all()
        : db.prepare("SELECT * FROM approvals WHERE status = 'pending' AND company_id IS ? ORDER BY at").all(companyId);
      return (rows as Array<Record<string, unknown>>).map(read);
    },
    /** Settles a pending request once; a second decision on the same request changes nothing. */
    decide(id: string, status: "approved" | "declined", note: string | null): Approval | null {
      const changed = db.prepare("UPDATE approvals SET status = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'pending'").run(status, now(), note, id).changes;
      return changed ? this.approval(id) : null;
    },
    close(): void {
      db.close();
    },
  };
}

export type Approvals = ReturnType<typeof openApprovals>;
