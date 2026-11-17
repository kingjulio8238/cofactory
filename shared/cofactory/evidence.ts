/** What a fetched page was, kept so any later check can be replayed against the same bytes. */
export interface Snapshot {
  id: string;
  url: string;
  finalUrl: string | null;
  fetchedAt: number;
  ok: boolean;
  /** Why the fetch failed, when it did. */
  failure: string | null;
  contentType: string | null;
  /** sha256 of the raw body; the body itself is stored under this name. */
  sha256: string | null;
  textLength: number;
}

export const CLAIM_VERDICTS = ["verified", "missing", "unreachable", "unverifiable"] as const;
/**
 * `missing`: the page was read and the quote is not on it. `unreachable`: the page could not be fetched.
 * `unverifiable`: the page was fetched but carries too little text to judge (often a script-rendered page).
 */
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];

export interface ClaimCheck {
  url: string;
  quote: string | null;
  verdict: ClaimVerdict;
  reason: string;
  snapshotId: string | null;
}

export const EVENT_KINDS = ["payment", "deposit", "signed_order", "refund", "reply", "form_submit", "signup"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Strength of a buyer signal. Only money or a signature is ever `committed`. */
export const EVIDENCE_CLASSES = ["committed", "urgent", "hypothetical", "rejected", "noise"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** Something that happened outside the factory, as its source reported it. */
export interface ExternalEvent {
  id: string;
  /** e.g. "stripe", "mailbox", "form". With `externalId` it makes intake idempotent. */
  source: string;
  externalId: string;
  companyId: string | null;
  kind: EventKind;
  occurredAt: number;
  receivedAt: number;
  payerEmail: string | null;
  amountCents: number | null;
  /** The payment a refund reverses. */
  refundOf: string | null;
  testMode: boolean;
  text: string | null;
  evidenceClass: EvidenceClass;
}

export interface ArmsLengthContext {
  listPriceCents: number;
  /** The owner's, Cofactory's and other factories' addresses: a payment from any of them is not a customer. */
  relatedEmails: readonly string[];
  relatedDomains: readonly string[];
  /** externalIds of payments that were refunded. */
  refunded: ReadonlySet<string>;
}

export interface ArmsLengthVerdict {
  ok: boolean;
  reasons: string[];
}
