import type { Book } from "./book.ts";
import type { Discovery } from "./discovery/discovery.ts";
import { territoryCode } from "./discovery/territories.ts";
import type { RuntimeStore } from "./runtime/store.ts";
import type { FactorySettings } from "./settings.ts";
import type { Orders } from "./validation/orders.ts";
import type { Rails } from "./validation/rails.ts";
import type { Sprints } from "./validation/sprints.ts";

const DAY_MS = 24 * 60 * 60_000;

export type ChecklistState = "done" | "running" | "todo";

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
    inbox: book.inbox("owner", seat.companyId, 5).map((message) => ({ id: message.id, at: message.at, type: message.type, goal: message.brief.goal })),
    alarms: (runtime?.openAlarms(seat.companyId ?? undefined) ?? []).map((alarm) => ({ kind: alarm.kind, detail: alarm.detail, raisedAt: alarm.raisedAt })),
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
    const shortlisted = niches.some((niche) => discovery.store.dossiersOf(niche.id).some((dossier) => dossier.status === "shortlisted" || dossier.status === "championed"));
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
          { id: "shortlist", state: step(shortlisted, Boolean(batch?.batch.closedAt)) },
          { id: "launch", state: step(companies.length > 0) },
          { id: "live", state: step(live) },
          { id: "dollar", state: step(firstDollar, live) },
        ] as Array<{ id: "search" | "shortlist" | "launch" | "live" | "dollar"; state: ChecklistState }>,
      },
    };
  }

  const company = book.company(seat.companyId);
  if (!company) return { seat, work, needsYou };
  const sprint = sprints.running(company.id);
  const evidence = sprint ? sprints.evidence(sprint.id) : null;
  const earned = book.entries({ companyId: company.id }).filter((entry) => entry.kind === "revenue").reduce((sum, entry) => sum + entry.cents, 0);
  return {
    seat, work, needsYou,
    company: {
      id: company.id, name: company.name, stage: company.stage, status: company.status, capCents: company.capCents,
      availableCents: book.available(company.id), earnedCents: earned,
      daysLeft: company.status === "live" && earned === 0 ? Math.max(0, Math.ceil((company.createdAt + settings.closeAfterDays * DAY_MS - now) / DAY_MS)) : null,
      sprint: sprint ? { buyers: sprints.targets(sprint.id).length, contacts: sprints.touches(sprint.id).length, urgent: evidence?.urgent.length ?? 0, committed: evidence?.committed.length ?? 0 } : null,
      firstDollar: orders.firstDollar(company.id),
      armed: rails.peek(company.id)?.outreachArmed === true,
    },
  };
}

export type SeatView = ReturnType<typeof seatView>;
