import { existsSync, readFileSync } from "node:fs";

import { writeFileAtomic } from "../atomic.ts";
import type { Book } from "./book.ts";
import type { Observer } from "./observe/observer.ts";
import type { RuntimeStore } from "./runtime/store.ts";

/** The owner's standing choices for the factory, set in the first run and changed in Settings. */
export interface FactorySettings {
  /** ISO 3166-1 alpha-2, e.g. "US": sets which outreach rules apply. */
  country: string | null;
  /** State or province, where the rules differ inside the country. */
  region: string | null;
  /** What the owner puts in each month. */
  budgetCents: number;
  /** The most one company may be given in "fixed" allocation; a launch or top-up above it is refused. */
  companyCapCents: number;
  /**
   * "fixed": every company gets at most `companyCapCents`. "dynamic": the factory decides. A new company starts with at
   * most a tenth of the month's money, and only a company that has made money gets more.
   */
  allocation: "fixed" | "dynamic";
  /** A company with no paying customer this many days after launch is closed (or put to the owner, per approvals.kill). */
  closeAfterDays: number;
  approvals: {
    launch: "ask" | "auto";
    /** Spends above this ask the owner first; 0 asks for every one. */
    spendOverCents: number;
    kill: "ask" | "tell";
  };
  /** Places the owner asked the factory to look first; it still has to find evidence for them. */
  hunches: string[];
  /** Kinds of business the owner will not run. */
  never: string[];
  /** Seeds the factory's own draw of territories, so it can be reproduced. */
  seed: string | null;
  onboardedAt: number | null;
}

export const DEFAULT_SETTINGS: FactorySettings = {
  country: null, region: null, budgetCents: 0, companyCapCents: 0, allocation: "dynamic", closeAfterDays: 5,
  approvals: { launch: "ask", spendOverCents: 2_500, kill: "tell" },
  hunches: [], never: [], seed: null,
  onboardedAt: null,
};

const MIN_STAKE_CENTS = 2_500;

/** The most a new company may start with under these settings; 0 when there is no limit beyond the money left. */
export function startingStakeLimit(settings: FactorySettings): number {
  if (settings.allocation === "fixed") return settings.companyCapCents;
  return settings.budgetCents > 0 ? Math.max(MIN_STAKE_CENTS, Math.floor(settings.budgetCents / 10)) : 0;
}

/** Why a top-up is refused under these settings, or null: a fixed cap is never passed, and dynamic money follows revenue. */
export function topUpProblem(settings: FactorySettings, company: { capCents: number }, cents: number, earnedCents: number): string | null {
  if (settings.allocation === "fixed") {
    return settings.companyCapCents > 0 && company.capCents + cents > settings.companyCapCents ? `the owner caps each company at ${settings.companyCapCents} cents` : null;
  }
  return earnedCents > 0 ? null : "more money goes only to a company that has made money; this one has not yet";
}

export function openSettings(file: string) {
  const read = (): FactorySettings => {
    if (!existsSync(file)) return structuredClone(DEFAULT_SETTINGS);
    try {
      const stored = JSON.parse(readFileSync(file, "utf8")) as Partial<FactorySettings>;
      return { ...DEFAULT_SETTINGS, ...stored, approvals: { ...DEFAULT_SETTINGS.approvals, ...stored.approvals } };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  };
  return {
    get: read,
    set(patch: Partial<Omit<FactorySettings, "approvals">> & { approvals?: Partial<FactorySettings["approvals"]> }): FactorySettings {
      const current = read();
      const next: FactorySettings = { ...current, ...patch, approvals: { ...current.approvals, ...patch.approvals } };
      writeFileAtomic(file, JSON.stringify(next, null, 2), { mode: 0o600 });
      return next;
    },
  };
}

export type Settings = ReturnType<typeof openSettings>;

const DAY_MS = 24 * 60 * 60_000;

/**
 * The owner's close rule: a live company with no paying customer `closeAfterDays` after launch is closed, its money
 * returned and a post-mortem asked for; or, when the owner approves closes, it is put to them once in their inbox.
 */
export function closeIdleCompanies(deps: { book: Book; settings: FactorySettings; store: RuntimeStore; observe: Observer; now?: () => number; log?: (line: string) => void }): void {
  const { book, settings: rules, store } = deps;
  const now = (deps.now ?? Date.now)();
  for (const company of book.companies().filter((candidate) => candidate.status === "live")) {
    if (now - company.createdAt < rules.closeAfterDays * DAY_MS) continue;
    if (book.entries({ companyId: company.id }).some((entry) => entry.kind === "revenue")) continue;
    const why = `no paying customer ${rules.closeAfterDays} days after launch`;
    if (rules.approvals.kill === "ask") {
      if (store.raise(company.id, "close_due", `${why}; waiting for the owner's OK to close it`)) {
        book.send({ type: "kill", fromBotId: "runtime", fromRole: "lead", toRole: "owner", companyId: company.id, parentId: null, budgetAuthId: null, replyPolicy: "report_only",
          brief: { goal: `Close ${company.name}?`, known: `${company.name} has had ${why}.`, doneWhen: "the owner closes it or tops it up", constraints: "Closing returns its remaining money to the factory." } });
      }
      continue;
    }
    const killed = book.kill(company.id, "metric", "rule", why);
    if (!killed.ok) continue;
    deps.observe.decide({ companyId: company.id, session: null, actor: "rule", kind: "company.kill", verdict: "allowed", reason: `${why}; ${killed.releasedCents} cents returned`, evidence: [{ type: "company", id: company.id }] });
    deps.log?.(`cofactory: closed ${company.name}: ${why}`);
  }
}
