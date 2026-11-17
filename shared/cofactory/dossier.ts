import type { SourceType } from "./discovery.ts";

/** A quote on a public page; every one in a dossier is fetched and checked. */
export interface Cited {
  url: string;
  quote: string;
}

/** A dossier: the one-page case for a niche, built so that code can check every claim in it. */
export interface DossierBody {
  /** 5–10 named buyers: a page proving each exists, and a public way to reach them. */
  buyers: Array<{ name: string; url: string; contactUrl: string; whyFit: string }>;
  /** Practitioners describing the pain in their own words (forums, reviews, job posts, Q&A). At least 5 distinct pages. */
  pains: Array<Cited & { sourceType: SourceType }>;
  /** What buyers pay today and to whom, with the source. */
  spend: Array<Cited & { amountCents: number; per: "month" | "year" | "job" | "hour" }>;
  /** How many buyers there are, with the registry, association or count it comes from. */
  buyerCount: Cited & { value: number };
  incumbents: Array<{ name: string; url: string; whatTheyMiss: string; priceCents: number | null }>;
  gap: { why: string; hiddenReasonsRuledOut: string };
  firstTen: { channel: string; steps: string };
  failureModes: string[];
  risks: {
    licensedAdvice: boolean;
    regulatedClaims: boolean;
    /** A platform or marketplace whose terms the business would break, or null. */
    platformTos: string | null;
    /** Share of distribution or revenue through one intermediary that can review, delay or ban (0..1). */
    gatekeeperShare: number;
    /** The buyer cannot pay without procurement, a committee or an RFP. */
    procurement: boolean;
    notes: string;
  };
  offer: {
    archetype: "done_for_you" | "monitoring" | "micro_tool" | "templates" | "directory";
    priceCents: number;
    per: "month" | "year" | "job";
    /** What the buyer pays for the human alternative, with the source. */
    humanAlternative: Cited & { amountCents: number; per: "month" | "year" | "job" | "hour"; hoursPerMonth?: number };
    /** Estimated cost to serve the heaviest tenth of customers, per billing period. */
    costToServeCents: number;
  };
}

export type ClaimRole = "buyer" | "contact" | "pain" | "spend" | "buyer_count" | "incumbent" | "human_alternative";

export interface ClaimResult {
  role: ClaimRole;
  index: number;
  url: string;
  quote: string | null;
  verdict: "verified" | "missing" | "unreachable" | "unverifiable";
  checkId: number | null;
}

export interface VerificationReport {
  claims: ClaimResult[];
  verifiedShare: number;
  /** Claims a dossier cannot pass without: the buyer count and the human-alternative price. */
  criticalFailures: string[];
  /** Missing minimums: too few buyers, practitioners, spend lines, failure modes. */
  structural: string[];
  pass: boolean;
}

export interface QaReport {
  questions: Array<{ id: string; question: string; answer: string | null }>;
  unknown: number;
  pass: boolean;
}

export const VETOES = ["licensed_advice", "regulated_claims", "platform_tos", "gatekeeper", "procurement", "unverified", "qa", "price_ratio", "unit_economics", "taken"] as const;
export type Veto = (typeof VETOES)[number];

export interface ScoreReport {
  score: number;
  features: Record<string, number>;
  vetoes: Array<{ veto: Veto; why: string }>;
}

export const DOSSIER_STATUSES = ["submitted", "failed", "scored", "shortlisted", "championed", "dropped"] as const;
export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export interface Dossier {
  id: string;
  nicheId: string;
  factoryId: string;
  version: number;
  at: number;
  body: DossierBody;
  verification: VerificationReport;
  qa: QaReport;
  score: ScoreReport | null;
  status: DossierStatus;
  champion: { by: string; why: string; evidence: string[] } | null;
}

export interface DossierPolicy {
  minBuyers: number;
  minPractitioners: number;
  minFailureModes: number;
  verifiedShare: number;
  qaQuestions: number;
  qaMaxUnknown: number;
  /** Our price must be at most this share of the human alternative. */
  maxPriceRatio: number;
  /** A price above this, per month, is no longer a decision one buyer can make on a card. */
  cardLimitCentsPerMonth: number;
  minMarginShare: number;
  /** Candidates from a closed batch that get a dossier. */
  dossiersPerBatch: number;
  shortlistSize: number;
}

export const DEFAULT_DOSSIER_POLICY: DossierPolicy = {
  minBuyers: 5,
  minPractitioners: 5,
  minFailureModes: 3,
  verifiedShare: 0.95,
  qaQuestions: 10,
  qaMaxUnknown: 3,
  maxPriceRatio: 1 / 3,
  cardLimitCentsPerMonth: 50_000,
  minMarginShare: 0.5,
  dossiersPerBatch: 5,
  shortlistSize: 2,
};
