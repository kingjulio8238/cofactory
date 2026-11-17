import type { Role } from "./types.ts";

export const SESSION_KINDS = ["operating", "deep", "event", "inbox"] as const;
/** `deep`: a long research or build session; `event`: woken by outside events; `inbox`: woken by typed messages. */
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_STATUSES = ["running", "completed", "waiting", "blocked", "budget_exhausted", "short_rounds", "max_rounds", "zombie", "interrupted", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** One bounded stretch of work by one seat, woken by a cadence, an event or a message, re-entered until it ends. */
export interface Session {
  id: string;
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
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  rounds: number;
  shortStreak: number;
  roundStartedAt: number | null;
  /** What the seat said when it ended the session, or why the runtime ended it. */
  stopReason: string | null;
  endRequested: { outcome: "done" | "waiting" | "blocked"; summary: string; nextWakeAt: number | null } | null;
}

/** One journal entry: the file every later session starts from, so nothing depends on chat history. */
export interface JournalEntry {
  seq: number;
  at: number;
  sessionId: string | null;
  companyId: string | null;
  botId: string;
  role: Role | "runtime";
  did: string;
  learned: string;
  next: string;
  blockers: string;
}

export const ALARM_KINDS = ["stalled", "fake_work", "journal_stale", "zombie", "unstaffed", "unjournaled"] as const;
export type AlarmKind = (typeof ALARM_KINDS)[number];

export interface Alarm {
  id: string;
  companyId: string | null;
  kind: AlarmKind;
  detail: string;
  raisedAt: number;
  resolvedAt: number | null;
}

export interface RuntimePolicy {
  /** How often a company's CEO (and the factory lead) gets an operating session without any other wake. */
  cadenceMs: number;
  operatingBudgetMs: number;
  deepBudgetMs: number;
  /** Shadow model cost one session may run up, in cents. */
  sessionBudgetCents: number;
  /** Re-entry stops with this much of a session's time left. */
  reserveMs: number;
  /** A round shorter than this only acknowledges; this many in a row means the seat has stopped working. */
  shortRoundMs: number;
  shortRounds: number;
  maxRounds: number;
  /** Days without any outside event before a live company is `stalled`. */
  silenceDays: number;
  /** Shadow cents spent since the last outside event before `fake_work` is raised. */
  fakeWorkCents: number;
  /** How long past its budget a session may go unsettled before it is a zombie. */
  zombieGraceMs: number;
}

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = {
  cadenceMs: 24 * 60 * 60_000,
  operatingBudgetMs: 45 * 60_000,
  deepBudgetMs: 3 * 60 * 60_000,
  sessionBudgetCents: 500,
  reserveMs: 2 * 60_000,
  shortRoundMs: 90_000,
  shortRounds: 5,
  maxRounds: 20,
  silenceDays: 3,
  fakeWorkCents: 1_500,
  zombieGraceMs: 15 * 60_000,
};
