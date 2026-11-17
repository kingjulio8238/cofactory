export const STAGES = ["build", "design", "market", "sell", "manage"] as const;
export type Stage = (typeof STAGES)[number];

export type CompanyStatus = "live" | "frozen" | "killed";

export const SPEND_CATEGORIES = ["intelligence", "infra", "distribution", "cogs", "gated"] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const KILL_REASONS = ["metric", "cap", "legal", "stall", "owner"] as const;
export type KillReason = (typeof KILL_REASONS)[number];

/** A company the factory launched. Money fields are integer US cents. */
export interface Company {
  id: string;
  name: string;
  brief: string;
  stage: Stage;
  status: CompanyStatus;
  /** What the launcher allocated, plus any top-ups. */
  capCents: number;
  createdAt: number;
  stageAt: number;
  killedReason?: KillReason;
}

/** Where money sits. `external` is the outside world: deposits come from it, captured spend goes to it. */
export type Bucket = "external" | "unallocated" | "reserve" | `company:${string}`;

export const ENTRY_KINDS = ["deposit", "reserve", "allocate", "spend", "release", "revenue", "refund", "shadow"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** One append-only ledger row. A `shadow` row moves no money: it records API-equivalent model cost run on a subscription. */
export interface LedgerEntry {
  seq: number;
  id: string;
  at: number;
  kind: EntryKind;
  from: Bucket | null;
  to: Bucket | null;
  cents: number;
  companyId: string | null;
  category: SpendCategory | null;
  vendor: string | null;
  actor: string;
  receipt: string | null;
  authId: string | null;
  note: string | null;
}

/** A hold on a company's money that a spend must capture before it lapses. */
export interface Authorization {
  id: string;
  companyId: string;
  category: SpendCategory;
  vendor: string;
  cents: number;
  status: "open" | "captured" | "voided";
  createdAt: number;
  expiresAt: number;
}

/** A machine-checkable fact offered to advance a stage, e.g. the id of a Stripe payment webhook. */
export interface Evidence {
  kind: "path_live" | "selling_signal" | "repeatable_motion";
  source: "webhook" | "form" | "mailbox" | "payment" | "test_result" | "inbound";
  ref: string;
  note?: string;
}

export interface FactoryPolicy {
  /** Smallest unallocated amount a new company may be launched with. */
  minStakeCents: number;
  maxLiveCompanies: number;
  /** Share of its cap a company may spend while still in Build before the auditor recommends a kill. */
  buildKillShare: number;
  authorizationTtlMs: number;
  /** Days a company may sit in a stage without advancing before the auditor recommends a kill. */
  stageDays: Record<Stage, number>;
}

export const DEFAULT_POLICY: FactoryPolicy = {
  minStakeCents: 2_500,
  maxLiveCompanies: 1,
  buildKillShare: 0.4,
  authorizationTtlMs: 60 * 60_000,
  stageDays: { build: 7, design: 2, market: 7, sell: 14, manage: 14 },
};

export interface Recommendation {
  companyId: string;
  action: "kill" | "freeze" | "advance" | "top_up";
  reason: string;
  killReason?: KillReason;
}

export const FACTORY_ROLES = ["lead", "scout"] as const;
export const COMPANY_ROLES = ["ceo", "builder", "marketer", "seller", "operator"] as const;
export type FactoryRole = (typeof FACTORY_ROLES)[number];
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export type Role = FactoryRole | CompanyRole;

/** A bot's seat: a factory role has no company; a company role always has one. */
export type Membership =
  | { botId: string; role: FactoryRole; companyId: null }
  | { botId: string; role: CompanyRole; companyId: string };

export const MESSAGE_TYPES = ["assign", "consult", "review", "report", "escalate", "advance", "kill", "budget_request", "rework"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const REPLY_POLICIES = ["resume_requester", "report_only", "one_way"] as const;
export type ReplyPolicy = (typeof REPLY_POLICIES)[number];

/** A standalone brief: a recipient can act on it without reading the conversation it came from. */
export interface Brief {
  goal: string;
  known: string;
  doneWhen: string;
  constraints: string;
}

/** One typed message between seats. `toRole: "owner"` reaches the person. */
export interface FactoryMessage {
  id: string;
  at: number;
  type: MessageType;
  fromBotId: string;
  fromRole: Role;
  toRole: Role | "owner";
  companyId: string | null;
  parentId: string | null;
  budgetAuthId: string | null;
  brief: Brief;
  replyPolicy: ReplyPolicy;
}
