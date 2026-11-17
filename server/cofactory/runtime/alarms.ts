import type { Alarm, RuntimePolicy } from "../../../shared/cofactory/runtime.ts";
import type { Book } from "../book.ts";
import type { Truth } from "../truth/store.ts";
import type { RuntimeStore } from "./store.ts";

const DAY_MS = 24 * 60 * 60_000;

/**
 * Heartbeat checks on every live company: no outside event for too long (`stalled`), model spend with no outside
 * event to show for it (`fake_work`), no journal entry across two cadences while sessions ran (`journal_stale`), and
 * no CEO seated (`unstaffed`). A condition that clears resolves its alarm.
 */
export function checkAlarms(deps: { book: Book; truth: Truth; store: RuntimeStore; policy: RuntimePolicy; now?: () => number }): Alarm[] {
  const { book, truth, store, policy } = deps;
  const now = deps.now?.() ?? Date.now();
  const raised: Alarm[] = [];
  const keep = (alarm: Alarm | null) => { if (alarm) raised.push(alarm); };
  for (const company of book.companies()) {
    if (company.status !== "live") continue;
    const id = company.id;
    const events = truth.events({ companyId: id });
    const lastOutside = Math.max(company.createdAt, ...events.map((event) => event.receivedAt));

    if (now - lastOutside > policy.silenceDays * DAY_MS) keep(store.raise(id, "stalled", `no outside event for ${Math.floor((now - lastOutside) / DAY_MS)} days`));
    else store.resolve(id, "stalled");

    const shadowSince = book.entries({ companyId: id }).filter((entry) => entry.kind === "shadow" && entry.at > lastOutside).reduce((sum, entry) => sum + entry.cents, 0);
    if (shadowSince >= policy.fakeWorkCents) keep(store.raise(id, "fake_work", `${shadowSince} cents of model use since the last outside event`));
    else store.resolve(id, "fake_work");

    const sessions = store.sessionsFor(id, 20);
    const lastJournal = store.journal(id, 1)[0]?.at ?? company.createdAt;
    const ranSince = sessions.some((session) => session.startedAt > lastJournal);
    if (ranSince && now - lastJournal > 2 * policy.cadenceMs) keep(store.raise(id, "journal_stale", `no journal entry since ${new Date(lastJournal).toISOString()} while sessions ran`));
    else store.resolve(id, "journal_stale");

    if (!book.members().some((member) => member.companyId === id && member.role === "ceo")) keep(store.raise(id, "unstaffed", "no CEO is seated"));
    else store.resolve(id, "unstaffed");
  }
  return raised;
}
