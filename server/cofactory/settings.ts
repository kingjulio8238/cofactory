import { existsSync, readFileSync } from "node:fs";

import { writeFileAtomic } from "../atomic.ts";

/** The owner's standing choices for the factory, set in the first run and changed in Settings. */
export interface FactorySettings {
  /** ISO 3166-1 alpha-2, e.g. "US": sets which outreach rules apply. */
  country: string | null;
  /** State or province, where the rules differ inside the country. */
  region: string | null;
  /** What the owner puts in each month. */
  budgetCents: number;
  /** The most one company may be given; a launch above it is refused. */
  companyCapCents: number;
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
  country: null, region: null, budgetCents: 0, companyCapCents: 0,
  approvals: { launch: "ask", spendOverCents: 2_500, kill: "tell" },
  hunches: [], never: [], seed: null,
  onboardedAt: null,
};

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
