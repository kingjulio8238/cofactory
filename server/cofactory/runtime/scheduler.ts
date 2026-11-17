import type { Company, FactoryMessage, Membership, Role } from "../../../shared/cofactory/types.ts";
import type { Book } from "../book.ts";
import type { Truth } from "../truth/store.ts";
import type { Sessions } from "./sessions.ts";
import type { RuntimeStore } from "./store.ts";

const NEXT_GOAL: Record<Company["stage"], { objective: string; doneWhen: string }> = {
  build: {
    objective: "Get the offer live: a named offer and one unattended path from a stranger to a payment or a tracked lead.",
    doneWhen: "the offer page loads for a stranger and its form or payment link produces an event you can see; then advance to market with that URL or event as evidence",
  },
  design: {
    objective: "Make the live offer trustworthy enough to convert, without delaying the market push.",
    doneWhen: "copy and a coherent page are live; then advance to market",
  },
  market: {
    objective: "Put the offer in front of the named buyers in this niche and get a selling signal.",
    doneWhen: "a recorded reply or payment reads urgent or committed; then advance to sell with that event as evidence",
  },
  sell: {
    objective: "Close and collect the first arm's-length payment, and deliver by hand.",
    doneWhen: "a real customer's payment is recorded and delivered",
  },
  manage: {
    objective: "Keep the company default-alive: serve customers, improve the one funnel, report what moves revenue.",
    doneWhen: "this period's customers are served and the next step for revenue is set",
  },
};

const FACTORY_GOAL = {
  objective: "Run the portfolio: read every company's state and the auditor's recommendations, act on kills and top-ups, and start the next company when the money and a strong niche allow.",
  doneWhen: "every recommendation is acted on or answered and the next portfolio step is set",
};

const describeEvent = (event: ReturnType<Truth["events"]>[number]) =>
  `- ${event.kind} via ${event.source} (${event.evidenceClass}) id ${event.externalId}${event.amountCents !== null ? `, ${event.amountCents} cents` : ""}${event.text ? `: ${event.text.slice(0, 500)}` : ""}`;
const describeMessage = (message: FactoryMessage) =>
  `- ${message.type} from ${message.fromRole} (id ${message.id}, reply policy ${message.replyPolicy})\n  goal: ${message.brief.goal}\n  known: ${message.brief.known}\n  done when: ${message.brief.doneWhen}\n  constraints: ${message.brief.constraints}`;

export interface SchedulerDeps {
  book: Book;
  truth: Truth;
  store: RuntimeStore;
  sessions: Sessions;
  now?: () => number;
}

/** Decides which sessions to start. The store holds every cursor, so a restart neither skips nor repeats a wake. */
export function createScheduler(deps: SchedulerDeps) {
  const { book, truth, store, sessions } = deps;
  const now = deps.now ?? Date.now;

  const seatFor = (companyId: string | null, role: Role): Membership | undefined =>
    book.members().find((member) => member.companyId === companyId && member.role === role);

  /** When this seat's next cadence session is due: after the cadence, or at the wake its last session asked for. */
  function cadenceDue(seat: Membership): boolean {
    const last = store.lastSessionOf(seat.botId, seat.companyId);
    if (!last) return true;
    if (last.status === "running") return false;
    const asked = last.status === "waiting" ? last.endRequested?.nextWakeAt ?? null : null;
    return now() >= (asked ?? last.startedAt + sessions.policy.cadenceMs);
  }

  async function wakeForEvents(company: Company, ceo: Membership): Promise<boolean> {
    const name = `events:${company.id}`;
    const fresh = truth.events({ companyId: company.id }).filter((event) => event.receivedAt > store.cursor(name));
    if (!fresh.length) return false;
    if (store.liveFor(ceo.botId)) return false;
    const result = await sessions.request({
      companyId: company.id, botId: ceo.botId, kind: "event", trigger: `events:${fresh.length}`,
      objective: `Act on what just happened outside, then keep moving toward: ${NEXT_GOAL[company.stage].objective}`,
      doneWhen: "every new event is answered or acted on, and the journal says what changed",
      context: fresh.map(describeEvent).join("\n"),
    });
    if ("refused" in result) return false;
    store.setCursor(name, Math.max(...fresh.map((event) => event.receivedAt)));
    return true;
  }

  /** Each seat reads its own cursor, so a busy seat never holds back another seat's messages. */
  async function wakeForMessages(): Promise<number> {
    let started = 0;
    for (const seat of book.members()) {
      const name = `messages:${seat.botId}`;
      const fresh = book.messagesAfter(store.cursor(name)).filter(({ message }) =>
        message.toRole === seat.role && (seat.companyId === null || message.companyId === seat.companyId));
      if (!fresh.length || store.liveFor(seat.botId)) continue;
      const result = await sessions.request({
        companyId: seat.companyId, botId: seat.botId, kind: "inbox", trigger: `messages:${fresh.length}`,
        objective: "Do what your typed messages ask, within your seat, and reply as each one's reply policy says.",
        doneWhen: "every message below is done, answered with a typed reply, or reported blocked",
        context: fresh.map(({ message }) => describeMessage(message)).join("\n"),
      });
      if ("refused" in result) continue;
      store.setCursor(name, fresh.at(-1)!.seq);
      if (result.started) started++;
    }
    return started;
  }

  return {
    /** One pass: message wakes, then for each live company event wakes and its CEO's cadence, then the lead's cadence. */
    async tick(): Promise<{ started: number }> {
      let started = await wakeForMessages();
      for (const company of book.companies().filter((candidate) => candidate.status === "live")) {
        const ceo = seatFor(company.id, "ceo");
        if (!ceo) continue;
        if (await wakeForEvents(company, ceo)) { started++; continue; }
        if (!cadenceDue(ceo)) continue;
        const goal = NEXT_GOAL[company.stage];
        const result = await sessions.request({ companyId: company.id, botId: ceo.botId, kind: "operating", trigger: "cadence", objective: goal.objective, doneWhen: goal.doneWhen });
        if (!("refused" in result) && result.started) started++;
      }
      const lead = seatFor(null, "lead");
      if (lead && cadenceDue(lead)) {
        const result = await sessions.request({ companyId: null, botId: lead.botId, kind: "operating", trigger: "cadence", ...FACTORY_GOAL });
        if (!("refused" in result) && result.started) started++;
      }
      return { started };
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
