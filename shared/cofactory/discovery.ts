export const PROFILE_FIELDS = ["domains", "skills", "network", "assets", "geography", "languages", "interests"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** One thing the owner brings that no other factory has; a niche must cite at least one by id. */
export interface ProfileInput {
  id: string;
  field: ProfileField;
  text: string;
}

/** The owner's factory profile: the inputs that make this factory's niches its own. */
export interface FactoryProfile {
  factoryId: string;
  inputs: ProfileInput[];
  constraints: string[];
  /** Niches the owner asks the scout to look into first; the pipeline still has to find evidence for them. */
  seedNiches: string[];
  updatedAt: number;
}

export const SIGNAL_KINDS = ["complaint", "would_pay", "why_no_one", "workaround", "job_post", "regulation", "price", "registry"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SOURCE_TYPES = ["forum", "review", "job_board", "regulator", "registry", "social", "news", "marketplace", "qa", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
/** Sources where buyers speak for themselves, as opposed to reporters, vendors and regulators describing them. */
export const BUYER_VOICE_SOURCES: readonly SourceType[] = ["forum", "review", "job_board", "qa", "social", "marketplace"];

/** A verbatim piece of demand evidence. It is stored only after its quote was found on its page. */
export interface Signal {
  id: string;
  factoryId: string;
  batchId: string | null;
  at: number;
  url: string;
  site: string;
  quote: string;
  kind: SignalKind;
  sourceType: SourceType;
  buyerHint: string;
  jobHint: string;
  claimCheckId: number;
  snapshotId: string | null;
}

/**
 * `card`: chosen from a closed batch for a card the owner picks from. `selected`: the owner started it (or it was picked by
 * hand), so it gets a full dossier. `passed`: the owner said no to its card.
 */
export const NICHE_STATUSES = ["candidate", "card", "selected", "shortlisted", "rejected", "claimed", "released", "passed"] as const;
export type NicheStatus = (typeof NICHE_STATUSES)[number];

/** One buyer × one job × one channel, resting on signals from independent sources and a factory-unique input. */
export interface Niche {
  id: string;
  factoryId: string;
  batchId: string | null;
  at: number;
  buyer: string;
  job: string;
  channel: string;
  whyGap: string;
  signalIds: string[];
  uniqueInputIds: string[];
  /** A boring, operations-heavy niche (the quota that counters drift toward easy software ideas). */
  boring: boolean;
  /** Built by crossing an owner input with a second, unrelated field. */
  crossField: boolean;
  status: NicheStatus;
  /** Claims by other factories within the density radius when it was proposed: crowding, not a block. */
  density: number;
}

export interface DiscoveryBatch {
  id: string;
  factoryId: string;
  startedAt: number;
  closedAt: number | null;
  target: number;
  note: string;
}

export interface DiscoveryPolicy {
  minSignals: number;
  minSites: number;
  minSourceTypes: number;
  /** Signals that must come from buyers' own voice (BUYER_VOICE_SOURCES). */
  minBuyerVoice: number;
  /** At or above this similarity a niche duplicates one this factory already has. */
  ownDuplicate: number;
  /** At or above this similarity a niche another factory has claimed is blocked. */
  crossFactoryBlock: number;
  /** Claims by other factories at or above this similarity count toward a niche's density. */
  densityRadius: number;
  batchTarget: number;
  boringShare: number;
  crossFieldShare: number;
  minProfileInputs: number;
}

export const DEFAULT_DISCOVERY_POLICY: DiscoveryPolicy = {
  minSignals: 3,
  minSites: 3,
  minSourceTypes: 2,
  minBuyerVoice: 1,
  ownDuplicate: 0.75,
  crossFactoryBlock: 0.6,
  densityRadius: 0.3,
  batchTarget: 30,
  boringShare: 0.2,
  crossFieldShare: 0.2,
  minProfileInputs: 3,
};

/**
 * A candidate company as the owner sees it before saying Start: enough to decide on, and every claim on it checked
 * against its page. Its buyer quotes are the niche's own signals, already checked when they were recorded.
 */
export interface CardBody {
  /** The company's proposed name. */
  name: string;
  /** What it sells, to whom, in one line. */
  headline: string;
  /** What a buyer pays today for this job, quoted from its page. */
  priceToday: { url: string; quote: string; amountCents: number; per: "month" | "year" | "job" | "hour"; hoursPerMonth?: number };
  offer: { priceCents: number; per: "month" | "year" | "job" };
  rival: { name: string; url: string; whatTheyMiss: string; priceCents: number | null };
  /** One real buyer who fits, with a page proving they exist. */
  exampleBuyer: { name: string; url: string };
  risks: { licensedAdvice: boolean; regulatedClaims: boolean; notes: string };
}

/**
 * `ready`: checked and waiting for the owner. `started`: the owner said Start; its full dossier is being researched and
 * it launches once that is shortlisted. `unconfirmed`: the full research did not hold up, so nothing launched.
 */
export const CARD_STATUSES = ["failed", "ready", "started", "passed", "launched", "unconfirmed", "dismissed"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export interface Card {
  id: string;
  nicheId: string;
  factoryId: string;
  version: number;
  at: number;
  body: CardBody;
  checks: Array<{ role: "price" | "rival" | "buyer"; url: string; verdict: string; checkId: number | null }>;
  /** Why a failed card did not hold up; empty for a ready one. */
  problems: string[];
  status: CardStatus;
  decidedAt: number | null;
  /** The owner's reason for passing, when they gave one. */
  passReason: string | null;
  companyId: string | null;
  /** What happened after Start: why it could not launch yet, or why it was not confirmed. */
  note: string | null;
}
