import type { Stage } from "./types.ts";

/** A pointer from a decision to the record that justified it, resolvable in the evidence store or the books. */
export type EvidenceLink =
  | { type: "claim_check"; id: number; url: string }
  | { type: "external_event"; id: string; externalId: string; evidenceClass: string }
  | { type: "hold"; id: string }
  | { type: "ledger_entry"; id: string }
  | { type: "company"; id: string }
  | { type: "session"; id: string }
  | { type: "signal"; id: string }
  | { type: "niche"; id: string }
  | { type: "dossier"; id: string };

/** What the company (and the deciding session) had spent when a decision was made, in cents. */
export interface CostSnapshot {
  companyShadowCents: number;
  companySpentCents: number;
  companyAvailableCents: number | null;
  sessionShadowCents: number | null;
}

export const DECISION_KINDS = [
  "stage.advance", "spend.authorize", "spend.capture", "spend.void", "company.launch", "company.top_up", "company.kill",
  "company.freeze", "company.unfreeze", "revenue.record", "session.end", "seat.change", "money.deposit", "money.reserve",
  "signal.record", "niche.propose", "niche.select", "dossier.submit", "dossier.champion",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** One decision at a gate, allowed or refused, with what justified it and what it had cost so far. */
export interface Decision {
  seq: number;
  id: string;
  at: number;
  companyId: string | null;
  sessionId: string | null;
  actor: string;
  kind: DecisionKind;
  verdict: "allowed" | "refused";
  reason: string;
  evidence: EvidenceLink[];
  cost: CostSnapshot;
}

export interface ToolCallRecord {
  seq: number;
  at: number;
  sessionId: string | null;
  companyId: string | null;
  botId: string;
  role: string;
  tool: string;
  ok: boolean;
  summary: string;
  tookMs: number;
}

export const TOUCH_SOURCES = ["route", "question", "approval"] as const;

/** A moment the owner had to act: what the autonomy metric counts. */
export interface OwnerTouch {
  seq: number;
  at: number;
  companyId: string | null;
  sessionId: string | null;
  source: (typeof TOUCH_SOURCES)[number];
  kind: string;
  detail: string;
}

export interface StageCost {
  stage: Stage;
  enteredAt: number;
  leftAt: number | null;
  shadowCents: number;
  spentCents: number;
}
