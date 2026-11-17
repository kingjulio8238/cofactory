export const OUTREACH_CHANNELS = ["email", "contact_form", "community_post", "phone", "social_dm"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const SPRINT_STATUSES = ["running", "passed", "failed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** One validation sprint: a company puts its offer in front of named buyers for at most a week and the world answers. */
export interface Sprint {
  id: string;
  companyId: string;
  nicheId: string | null;
  dossierId: string | null;
  startedAt: number;
  endsAt: number;
  status: SprintStatus;
  /** The event ids that passed it, or why it failed. */
  outcome: string | null;
  offerUrl: string | null;
}

/** A named buyer the sprint may contact, with the verified page that shows their public contact route. */
export interface SprintTarget {
  id: string;
  sprintId: string;
  name: string;
  /** An email address, or the URL of a contact form, community or profile. */
  address: string;
  channel: OutreachChannel;
  /** The claim check that verified the contact route is public. */
  sourceCheckId: number;
  addedAt: number;
}

/** One contact made, logged before it goes out; it is the gate every send passes. */
export interface Touch {
  id: string;
  sprintId: string;
  targetId: string;
  at: number;
  channel: OutreachChannel;
  summary: string;
  /** The external id of the sent message, filled in once it went out, so replies can be matched. */
  messageRef: string | null;
}

export interface Suppression {
  address: string;
  reason: "unsubscribe" | "bounce" | "rejected" | "complaint" | "owner";
  at: number;
}

export interface ValidationPolicy {
  sprintDays: number;
  touchesPerDay: number;
  touchesPerSprint: number;
  touchesPerTarget: number;
  daysBetweenTouches: number;
  /** A sprint passes on one committed event, or on this many urgent replies from distinct buyers. */
  urgentToPass: number;
}

export const DEFAULT_VALIDATION_POLICY: ValidationPolicy = {
  sprintDays: 7,
  touchesPerDay: 20,
  touchesPerSprint: 60,
  touchesPerTarget: 2,
  daysBetweenTouches: 3,
  urgentToPass: 3,
};

/** The line every first message carries, so a buyer can stop further contact with one word. */
export const OPT_OUT_LINE = "If this is not useful, reply \"stop\" and you will not hear from us again.";
