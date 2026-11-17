import type { Company, Evidence, FactoryPolicy, Recommendation, Stage } from "../../shared/cofactory/types.ts";

const DAY_MS = 24 * 60 * 60_000;

const NEXT: Record<Stage, readonly Stage[]> = {
  build: ["design", "market"],
  design: ["market"],
  market: ["sell"],
  sell: ["manage"],
  manage: [],
};

const NEEDS: Partial<Record<Stage, Evidence["kind"]>> = {
  market: "path_live",
  sell: "selling_signal",
};

export interface AdvanceCheck {
  ok: boolean;
  reason?: string;
}

/** Whether `company` may move to `to` on `evidence`. Reaching Manage needs recorded revenue or a documented repeatable motion. */
export function checkAdvance(company: Company, to: Stage, evidence: Evidence | null, revenueCents: number): AdvanceCheck {
  if (company.status !== "live") return { ok: false, reason: `company is ${company.status}` };
  if (!NEXT[company.stage].includes(to)) return { ok: false, reason: `${company.stage} cannot move to ${to}` };
  const needed = NEEDS[to];
  if (needed && evidence?.kind !== needed) return { ok: false, reason: `${to} needs ${needed} evidence` };
  if (needed && !evidence?.ref.trim()) return { ok: false, reason: "evidence needs a ref the auditor can look up" };
  if (to === "manage" && revenueCents <= 0 && evidence?.kind !== "repeatable_motion") {
    return { ok: false, reason: "manage needs recorded revenue or repeatable_motion evidence" };
  }
  return { ok: true };
}

export interface CompanyFigures {
  company: Company;
  spentCents: number;
  /** Revenue inside the last `policy.stageDays.manage` days. */
  recentRevenueCents: number;
}

export function audit(figures: readonly CompanyFigures[], policy: FactoryPolicy, now: number): Recommendation[] {
  const out: Recommendation[] = [];
  for (const { company, spentCents, recentRevenueCents } of figures) {
    if (company.status !== "live") continue;
    const id = company.id;
    if (spentCents >= company.capCents) {
      out.push({ companyId: id, action: "freeze", reason: "cap reached" });
      continue;
    }
    if (company.stage === "build" && spentCents >= company.capCents * policy.buildKillShare) {
      out.push({ companyId: id, action: "kill", killReason: "cap", reason: `spent ${share(spentCents, company.capCents)} of its cap still in build` });
      continue;
    }
    const days = (now - company.stageAt) / DAY_MS;
    if (days > policy.stageDays[company.stage]) {
      const stalled = company.stage !== "manage" || recentRevenueCents <= 0;
      if (stalled) out.push({ companyId: id, action: "kill", killReason: "stall", reason: `${Math.floor(days)} days in ${company.stage}` });
    }
  }
  return out;
}

function share(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}
