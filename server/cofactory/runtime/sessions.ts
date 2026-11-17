import { DEFAULT_RUNTIME_POLICY, type RuntimePolicy, type Session, type SessionKind } from "../../../shared/cofactory/runtime.ts";
import type { Membership } from "../../../shared/cofactory/types.ts";
import type { Book } from "../book.ts";
import type { RuntimeStore } from "./store.ts";
import type { Workspaces } from "./workspace.ts";

/** What the runtime needs from dusk to run one turn of a seat. */
export interface TurnPort {
  /** The conversation this seat works in for this company; created on first use. */
  threadFor(botId: string, companyId: string | null, title: string): string;
  start(botId: string, threadId: string, prompt: string, onSettled: (result: { ok: boolean; text: string; stalled?: boolean }) => void): Promise<void>;
  interrupt(botId: string, threadId: string): Promise<void>;
}

export interface SessionRequest {
  companyId: string | null;
  botId: string;
  kind: SessionKind;
  trigger: string;
  objective: string;
  doneWhen: string;
  /** What woke the session (events, messages), shown in its first prompt. */
  context?: string;
}

export interface SessionDeps {
  store: RuntimeStore;
  book: Book;
  workspaces: Workspaces;
  turns: TurnPort;
  now?: () => number;
  policy?: Partial<RuntimePolicy>;
  log?: (line: string) => void;
  /** Runs `work` after `ms`; tests pass one that runs it at once. */
  defer?: (work: () => void, ms: number) => void;
}

/** Waits before each new try at starting a round the conversation was not ready for. */
const START_RETRY_MS = [500, 1_000, 2_000, 4_000, 8_000, 16_000];

const RESTARTED = "dusk restarted while this session was running. Whatever you were doing may or may not have finished: check the real state (files, cofactory_status, the page or the inbox) before repeating any action.";

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[clipped]` : text);

/**
 * Bounded sessions over durable state: a session is started with a full envelope, re-entered with a short continue
 * prompt while its seat keeps working and its budget lasts, and ends only when the seat ends it after journaling, or
 * when the runtime stops it (budget, rounds, a seat that only acknowledges, a zombie, a restart with no time left).
 */
export function createSessions(deps: SessionDeps) {
  const { store, book, workspaces, turns } = deps;
  const policy: RuntimePolicy = { ...DEFAULT_RUNTIME_POLICY, ...deps.policy };
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const inFlight = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>): Promise<T> => {
    inFlight.add(work);
    void work.finally(() => inFlight.delete(work)).catch(() => {});
    return work;
  };

  const shadowSince = (session: Session) =>
    book.entries(session.companyId ? { companyId: session.companyId } : {})
      .filter((entry) => entry.kind === "shadow" && entry.at >= session.startedAt && entry.companyId === session.companyId && entry.actor.startsWith(`${session.role}:`))
      .reduce((sum, entry) => sum + entry.cents, 0);

  function envelope(session: Session, context: string | undefined): string {
    const company = session.companyId ? book.company(session.companyId) : null;
    const where = company ? `${company.name} (stage ${company.stage}, ${company.status}, ${book.available(company.id)} cents available)` : "the factory";
    const journal = store.journal(session.companyId, 8).map((entry) => `- ${new Date(entry.at).toISOString()} ${entry.role}: did ${entry.did}${entry.next ? `; next ${entry.next}` : ""}${entry.blockers ? `; blocked by ${entry.blockers}` : ""}`).join("\n");
    const alarms = store.openAlarms(session.companyId).map((alarm) => `- ${alarm.kind}: ${alarm.detail}`).join("\n");
    return [
      `[Cofactory session ${session.id.slice(0, 8)} · ${session.kind} · ${session.role} seat in ${where}]`,
      `Objective: ${session.objective}`,
      `Done when: ${session.doneWhen}`,
      `Budget: about ${minutes(session.budgetMs)} minutes and ${session.budgetCents} cents of model use.`,
      context ? `What woke this session:\n${clip(context, 6_000)}` : "",
      `Company brief and standing rules (BRIEF.md):\n${clip(workspaces.brief(session.companyId), 4_000) || "(none yet)"}`,
      `Journal, most recent last:\n${journal || "(empty: this is the first session)"}`,
      alarms ? `Open alarms:\n${alarms}` : "",
      "How to work: keep working in the foreground (background tasks stop when your turn ends). Act in the world and check results; a stage moves only on evidence the world confirms. Before you stop, write cofactory_journal (did, learned, next, blockers), then call cofactory_end_session: done, waiting (name what you wait on and when to wake), or blocked.",
    ].filter(Boolean).join("\n\n");
  }

  const defer = deps.defer ?? ((work: () => void, ms: number) => { setTimeout(work, ms).unref?.(); });

  async function runRound(session: Session, prompt: string): Promise<void> {
    store.roundStarted(session.id);
    await startRound(session, store.session(session.id)?.rounds ?? 0, prompt, 0);
  }

  /** A turn's settle can arrive while its conversation is still winding down, so a refused start is tried again shortly. */
  async function startRound(session: Session, round: number, prompt: string, attempt: number): Promise<void> {
    try {
      await turns.start(session.botId, session.threadId, prompt, (result) => {
        void track(settled(session.id, round, result)).catch((error) => log(`cofactory: settling session ${session.id.slice(0, 8)} failed: ${error instanceof Error ? error.message : String(error)}`));
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      const live = store.session(session.id);
      if (!live || live.status !== "running" || live.rounds !== round) return;
      if (attempt < START_RETRY_MS.length) {
        store.note(session.id, "start_retry", { attempt: attempt + 1, why });
        defer(() => { void track(startRound(session, round, prompt, attempt + 1)); }, START_RETRY_MS[attempt]!);
        return;
      }
      await finish(session.id, "interrupted", `the turn could not start: ${why}`);
    }
  }

  async function finish(sessionId: string, status: Exclude<Session["status"], "running">, reason: string): Promise<void> {
    const session = store.session(sessionId);
    if (!session || session.status !== "running") return;
    if (!store.journaledIn(sessionId)) {
      const entry = store.appendJournal({ sessionId, companyId: session.companyId, botId: session.botId, role: "runtime", did: `session ended (${status}) without a journal entry from the ${session.role}`, learned: "", next: "", blockers: reason });
      workspaces.appendJournal(session.companyId, entry);
      store.raise(session.companyId, "unjournaled", `the ${session.role}'s ${session.kind} session ended (${status}) without writing the journal`);
    }
    if (!store.finish(sessionId, status, reason)) return;
    log(`cofactory: session ${sessionId.slice(0, 8)} ${status}: ${reason}`);
    try {
      await workspaces.checkpoint(session.companyId, `session ${sessionId.slice(0, 8)} ${session.role} ${status}`);
    } catch (error) {
      store.note(sessionId, "checkpoint_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function settled(sessionId: string, round: number, result: { ok: boolean; text: string; stalled?: boolean }): Promise<void> {
    const session = store.session(sessionId);
    if (!session || session.status !== "running" || session.rounds !== round) return;
    const took = session.roundStartedAt === null ? 0 : now() - session.roundStartedAt;
    const shortStreak = took < policy.shortRoundMs ? session.shortStreak + 1 : 0;
    store.roundSettled(sessionId, shortStreak, { round, ok: result.ok, stalled: Boolean(result.stalled), tookMs: took });
    if (session.endRequested && store.journaledIn(sessionId)) {
      const { outcome, summary } = session.endRequested;
      await finish(sessionId, outcome === "done" ? "completed" : outcome, summary);
      return;
    }
    const left = session.startedAt + session.budgetMs - now();
    if (left < policy.reserveMs) return finish(sessionId, "budget_exhausted", "time budget used");
    const spent = shadowSince(session);
    if (spent >= session.budgetCents) return finish(sessionId, "budget_exhausted", `model budget used (${spent} of ${session.budgetCents} cents)`);
    if (shortStreak >= policy.shortRounds) return finish(sessionId, "short_rounds", `${shortStreak} rounds in a row under ${policy.shortRoundMs / 1_000}s: the seat only acknowledges`);
    if (session.rounds >= policy.maxRounds) return finish(sessionId, "max_rounds", `${session.rounds} rounds`);
    const nudge = session.endRequested
      ? "You asked to end the session, but it has no journal entry yet: write cofactory_journal, then call cofactory_end_session again."
      : `Session ${sessionId.slice(0, 8)} continues: about ${minutes(left)} minutes of its budget remain. Keep working toward the objective (${session.objective}). Re-check the real state before repeating anything. When it is done or you cannot progress, write cofactory_journal and call cofactory_end_session.`;
    await runRound(store.session(sessionId)!, nudge);
  }

  return {
    policy,

    /** Resolves once every settle, finish and checkpoint in progress is done. */
    async drain(): Promise<void> {
      while (inFlight.size) await Promise.allSettled(inFlight);
    },

    /** Starts a session unless the seat already has one running; that one is returned instead. */
    async request(input: SessionRequest): Promise<{ session: Session; started: boolean } | { refused: string }> {
      const seat = book.membership(input.botId);
      if (!seat) return { refused: "the bot holds no seat" };
      if (seat.companyId !== input.companyId) return { refused: "the bot's seat is in another company" };
      if (input.companyId) {
        const company = book.company(input.companyId);
        if (!company || company.status !== "live") return { refused: `company is ${company?.status ?? "missing"}` };
      }
      const live = store.liveFor(input.botId);
      if (live) return { session: live, started: false };
      const company = input.companyId ? book.company(input.companyId) : null;
      await workspaces.ensure(input.companyId, company ? `# ${company.name}\n\n${company.brief}\n` : "# Factory\n");
      const threadId = turns.threadFor(input.botId, input.companyId, `Cofactory · ${company?.name ?? "factory"}`);
      const session = store.createSession({
        companyId: input.companyId, botId: input.botId, role: seat.role, threadId, kind: input.kind, trigger: input.trigger,
        objective: input.objective, doneWhen: input.doneWhen,
        budgetMs: input.kind === "deep" ? policy.deepBudgetMs : policy.operatingBudgetMs, budgetCents: input.kind === "deep" ? policy.deepBudgetCents : policy.sessionBudgetCents,
      });
      await runRound(session, envelope(session, input.context));
      return { session: store.session(session.id)!, started: true };
    },

    /** The seat's journal entry for its running session (or a loose entry when it has none). */
    journal(seat: Membership, entry: { did: string; learned: string; next: string; blockers: string }) {
      const live = store.liveFor(seat.botId);
      const written = store.appendJournal({ sessionId: live?.id ?? null, companyId: seat.companyId, botId: seat.botId, role: seat.role, ...entry });
      workspaces.appendJournal(seat.companyId, written);
      return written;
    },

    /** The seat asks to end its session; it ends once the turn settles, and only after a journal entry. */
    requestEnd(seat: Membership, request: { outcome: "done" | "waiting" | "blocked"; summary: string; nextWakeAt: number | null }): { ok: true; session: Session } | { ok: false; reason: string } {
      const live = store.liveFor(seat.botId);
      if (!live) return { ok: false, reason: "no session is running for this seat" };
      if (!store.journaledIn(live.id)) return { ok: false, reason: "write cofactory_journal for this session first" };
      store.requestEnd(live.id, request);
      return { ok: true, session: store.session(live.id)! };
    },

    /** After a restart: a session that still has time is re-entered with a note that its last action is uncertain. */
    async recover(): Promise<void> {
      for (const session of store.liveSessions()) {
        store.note(session.id, "restarted");
        const left = session.startedAt + session.budgetMs - now();
        if (left < policy.reserveMs) await finish(session.id, "interrupted", "dusk restarted with no time left in the session");
        else await runRound(session, `${RESTARTED} About ${minutes(left)} minutes of this session remain. Objective: ${session.objective}. Done when: ${session.doneWhen}.`);
      }
    },

    /** Ends sessions that ran past their budget without settling, after interrupting their turn. */
    async sweep(): Promise<Session[]> {
      const zombies: Session[] = [];
      for (const session of store.liveSessions()) {
        if (now() <= session.startedAt + session.budgetMs + policy.zombieGraceMs) continue;
        await turns.interrupt(session.botId, session.threadId).catch(() => {});
        store.raise(session.companyId, "zombie", `the ${session.role}'s session ${session.id.slice(0, 8)} ran past its budget without settling`);
        await finish(session.id, "zombie", "ran past its budget without settling; interrupted");
        zombies.push(session);
      }
      return zombies;
    },

    /** Stops every running session of a company (a kill or a freeze). */
    async stopCompany(companyId: string, reason: string): Promise<void> {
      for (const session of store.liveSessions().filter((candidate) => candidate.companyId === companyId)) {
        await turns.interrupt(session.botId, session.threadId).catch(() => {});
        await finish(session.id, "cancelled", reason);
      }
    },
  };
}

export type Sessions = ReturnType<typeof createSessions>;
