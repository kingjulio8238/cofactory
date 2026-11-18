import type { Book } from "./book.ts";
import type { Discovery } from "./discovery/discovery.ts";
import { territoryCode } from "./discovery/territories.ts";
import type { RuntimeStore } from "./runtime/store.ts";
import type { FactorySettings } from "./settings.ts";
import type { Orders } from "./validation/orders.ts";
import type { Rails } from "./validation/rails.ts";
import type { Sprints } from "./validation/sprints.ts";
import type { Approvals } from "./approvals.ts";
import type { Alarm } from "../../shared/cofactory/runtime.ts";

const DAY_MS = 24 * 60 * 60_000;

export type ChecklistState = "done" | "running" | "todo";

/**
 * An alarm as the owner reads it, or null for one only the lead acts on (a seat's missing journal, a stuck search, a
 * failed sprint): those wake the lead and never ask the owner.
 */
export function ownerAlarm(alarm: Pick<Alarm, "kind" | "companyId">, rails: Pick<Rails, "missing">, companyName?: string): string | null {
  switch (alarm.kind) {
    case "rails_missing": {
      const missing = alarm.companyId ? rails.missing(alarm.companyId) : [];
      return missing.length ? `Connect ${missing.join(", ")} so ${companyName ?? "it"} can take customers. Everything else goes ahead.` : null;
    }
    case "mail_failed": return "The mailbox could not be read. Check its connection so replies are not missed.";
    case "order_overdue": return `A paying customer's order${companyName ? ` at ${companyName}` : ""} is overdue.`;
    default: return null;
  }
}

/** What a seated bot's Factory tab shows: what it is doing now, and the factory or company it works for. */
export function seatView(deps: {
  botId: string;
  book: Book;
  runtime: RuntimeStore | null;
  discovery: Discovery;
  sprints: Sprints;
  orders: Orders;
  rails: Rails;
  settings: FactorySettings;
  approvals: Approvals | null;
  now: number;
}) {
  const { book, runtime, discovery, sprints, orders, rails, settings, now } = deps;
  const seat = book.membership(deps.botId);
  if (!seat) return { seat: null };
  const live = runtime?.liveFor(deps.botId) ?? null;
  const last = live ? null : runtime?.lastSessionOf(deps.botId, seat.companyId) ?? null;
  const work = {
    live: live ? { objective: live.objective, startedAt: live.startedAt, rounds: live.rounds, threadId: live.threadId } : null,
    last: last ? { status: last.status, endedAt: last.endedAt, summary: last.endRequested?.summary ?? last.stopReason, threadId: last.threadId } : null,
  };
  const needsYou = {
    approvals: (deps.approvals?.pending(seat.companyId === null ? undefined : seat.companyId) ?? []).map((approval) => ({ id: approval.id, kind: approval.kind, title: approval.title, detail: approval.detail, at: approval.at })),
    inbox: book.inbox("owner", seat.companyId, 5).map((message) => ({ id: message.id, at: message.at, type: message.type, goal: message.brief.goal })),
    alarms: (runtime?.openAlarms(seat.companyId ?? undefined) ?? []).flatMap((alarm) => {
      const detail = ownerAlarm(alarm, rails, seat.companyId === null && alarm.companyId ? book.company(alarm.companyId)?.name : undefined);
      return detail ? [{ kind: alarm.kind, detail, raisedAt: alarm.raisedAt }] : [];
    }),
  };

  if (seat.companyId === null) {
    const profile = discovery.profile();
    const niches = discovery.store.niches();
    const territories = (profile?.inputs ?? []).filter((input) => input.field === "domains").map((input) => ({
      title: input.text.replace(/\s*\(NAICS \d{6}\)$/, ""), code: territoryCode(input.text),
      niches: niches.filter((niche) => niche.uniqueInputIds.includes(input.id)).length,
    }));
    const finds = discovery.store.signals().sort((a, b) => b.at - a.at).slice(0, 6).map((signal) => ({ quote: signal.quote, site: signal.site, url: signal.url, at: signal.at }));
    const batch = discovery.batchStatus();
    const carded = discovery.store.latestCards().some((card) => card.status !== "failed");
    const companies = book.companies();
    const live = companies.some((company) => rails.peek(company.id)?.outreachArmed === true);
    const firstDollar = companies.some((company) => orders.firstDollar(company.id).paid);
    const step = (done: boolean, running = false): ChecklistState => (done ? "done" : running ? "running" : "todo");
    return {
      seat, work, needsYou,
      factory: {
        territories, finds, signals: discovery.store.signals().length,
        batch: batch ? { niches: batch.niches, target: batch.batch.target, closed: batch.batch.closedAt !== null } : null,
        checklist: [
          { id: "search", state: step(Boolean(batch?.batch.closedAt), Boolean(batch && !batch.batch.closedAt)) },
          { id: "shortlist", state: step(carded, Boolean(batch?.batch.closedAt)) },
          { id: "launch", state: step(companies.length > 0) },
          { id: "live", state: step(live) },
          { id: "dollar", state: step(firstDollar, live) },
        ] as Array<{ id: "search" | "shortlist" | "launch" | "live" | "dollar"; state: ChecklistState }>,
      },
    };
  }

  const company = book.company(seat.companyId);
  if (!company) return { seat, work, needsYou };
  // the clock counts from going live; before that, the longer limit to go live at all
  const daysLeft = (armedAt: number | null) => Math.max(0, Math.ceil(((armedAt ?? company.createdAt) + (armedAt ? settings.closeAfterDays : settings.goLiveDays) * DAY_MS - now) / DAY_MS));
  const sprint = sprints.running(company.id);
  const evidence = sprint ? sprints.evidence(sprint.id) : null;
  const earned = book.entries({ companyId: company.id }).filter((entry) => entry.kind === "revenue").reduce((sum, entry) => sum + entry.cents, 0);
  return {
    seat, work, needsYou,
    company: {
      id: company.id, name: company.name, stage: company.stage, status: company.status, capCents: company.capCents,
      availableCents: book.available(company.id), earnedCents: earned,
      daysLeft: company.status === "live" && earned === 0 ? daysLeft(rails.peek(company.id)?.armedAt ?? null) : null,
      live: rails.peek(company.id)?.armedAt != null,
      sprint: sprint ? { buyers: sprints.targets(sprint.id).length, contacts: sprints.touches(sprint.id).length, urgent: evidence?.urgent.length ?? 0, committed: evidence?.committed.length ?? 0 } : null,
      firstDollar: orders.firstDollar(company.id),
      armed: rails.peek(company.id)?.outreachArmed === true,
    },
  };
}

export type SeatView = ReturnType<typeof seatView>;
