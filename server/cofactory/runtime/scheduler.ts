import type { Company, FactoryMessage, Membership, Role } from "../../../shared/cofactory/types.ts";
import type { Book } from "../book.ts";
import type { Truth } from "../truth/store.ts";
import type { Discovery } from "../discovery/discovery.ts";
import type { Cards } from "../dossier/cards.ts";
import type { Dossiers } from "../dossier/dossiers.ts";
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
  objective: "Run the portfolio: read every company's state and the auditor's recommendations, and act on kills and top-ups. New companies start when the owner picks them from their cards, so never launch one yourself.",
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
  discovery?: Discovery;
  dossiers?: Dossiers;
  cards?: Cards;
  now?: () => number;
}

/** Decides which sessions to start. The store holds every cursor, so a restart neither skips nor repeats a wake. */
export function createScheduler(deps: SchedulerDeps) {
  const { book, truth, store, sessions } = deps;
  const now = deps.now ?? Date.now;

  /** A session counts against an allowance only if a turn of it actually ran; one that never started took nothing. */
  const ranARound = (sessionId: string) => store.sessionEvents(sessionId).some((event) => event.type === "round_settled");

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

  /** Wakes the scout for deep discovery sessions while a batch is open and short, up to the batch's session allowance. */
  async function wakeForDiscovery(): Promise<boolean> {
    const discovery = deps.discovery;
    const scout = seatFor(null, "scout");
    if (!discovery || !scout || store.liveFor(scout.botId)) return false;
    const status = discovery.batchStatus();
    if (!status || status.batch.closedAt !== null) return false;
    const trigger = `discovery:${status.batch.id}`;
    const past = store.sessionsFor(null, 200).filter((session) => session.botId === scout.botId && session.trigger === trigger && (ranARound(session.id) || session.status === "running"));
    const last = past[0];
    if (last?.status === "waiting" && last.endRequested?.nextWakeAt && now() < last.endRequested.nextWakeAt) return false;
    if (past.length >= sessions.policy.discoverySessionsPerBatch) {
      store.raise(null, "discovery_stuck", `batch ${status.batch.id.slice(0, 8)} is still short after ${past.length} scout sessions: ${status.short.join("; ")}`);
      return false;
    }
    const profile = discovery.profile()!;
    const result = await sessions.request({
      companyId: null, botId: scout.botId, kind: "deep", trigger,
      objective: `Discovery batch ${status.batch.id.slice(0, 8)}: find extremely niche businesses only this factory would find, each resting on verified signals and one of the owner's inputs.`,
      doneWhen: status.complete ? "the batch meets its target and quotas; close it with cofactory_close_batch" : `the batch has ${status.batch.target} niches with the boring and cross-field quotas met (still needs: ${status.short.join("; ")})`,
      context: [
        `Owner inputs (cite by id): ${profile.inputs.map((item) => `${item.id} = ${item.field}: ${item.text}`).join("; ")}`,
        profile.constraints.length ? `Owner constraints: ${profile.constraints.join("; ")}` : "",
        profile.seedNiches.length ? `Seed niches to look into first: ${profile.seedNiches.join("; ")}` : "",
        status.batch.note ? `Batch note: ${status.batch.note}` : "",
        ...(deps.cards?.passed().length ? [`The owner passed on these; find different ones:\n${deps.cards.passed().map((item) => `- ${item.buyer} · ${item.job}${item.reason ? ` (why: ${item.reason})` : ""}`).join("\n")}`] : []),
        `So far: ${status.niches} niches from ${status.signals} signals on ${status.sites} sites.`,
      ].filter(Boolean).join("\n"),
    });
    return !("refused" in result) && result.started;
  }

  /** Wakes the scout to write the card of a niche picked for one: quick, so the owner has something to decide on soon. */
  async function wakeForCard(): Promise<boolean> {
    const discovery = deps.discovery, cards = deps.cards;
    const scout = seatFor(null, "scout");
    if (!discovery || !cards || !scout || store.liveFor(scout.botId)) return false;
    for (const nicheId of cards.wanted()) {
      const niche = discovery.store.niche(nicheId)!;
      const trigger = `card:${nicheId}`;
      const past = store.sessionsFor(null, 500).filter((session) => session.botId === scout.botId && session.trigger === trigger && ranARound(session.id));
      if (past.length >= sessions.policy.cardSessionsPerNiche) {
        discovery.store.setNicheStatus(nicheId, "rejected");
        store.note(past[0]!.id, "niche_rejected", { nicheId, why: `no card held up after ${past.length} sessions` });
        continue;
      }
      const previous = cards.latest(nicheId);
      const signals = niche.signalIds.map((id) => discovery.store.signal(id)).filter((signal) => signal !== null);
      const result = await sessions.request({
        companyId: null, botId: scout.botId, kind: "operating", trigger,
        objective: `Write the card for "${niche.buyer} · ${niche.job}" and submit it with cofactory_submit_card (niche_id ${nicheId}). The owner is waiting to decide on it, so be quick: a card needs one price a buyer pays today, one rival, one real buyer, and our offer.`,
        doneWhen: "the card is submitted and ready, or the research shows the niche does not hold (say so in the journal)",
        context: [
          `Niche: buyer ${niche.buyer}; job ${niche.job}; channel ${niche.channel}.`,
          `Gap as proposed: ${niche.whyGap}`,
          `Its signals (the card shows these as the buyers' own words):\n${signals.map((signal) => `- [${signal.sourceType}] ${signal.url}: "${signal.quote}"`).join("\n")}`,
          previous ? `The last card did not hold up: ${previous.problems.join("; ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      return !("refused" in result) && result.started;
    }
    return false;
  }

  /** Wakes the scout to research a selected niche's dossier, one niche at a time, within the niche's session allowance. */
  async function wakeForDossier(): Promise<boolean> {
    const discovery = deps.discovery, dossiers = deps.dossiers;
    const scout = seatFor(null, "scout");
    if (!discovery || !dossiers || !scout || store.liveFor(scout.botId)) return false;
    for (const nicheId of dossiers.wanted()) {
      const niche = discovery.store.niche(nicheId)!;
      const trigger = `dossier:${nicheId}`;
      const past = store.sessionsFor(null, 500).filter((session) => session.botId === scout.botId && session.trigger === trigger && ranARound(session.id));
      if (past.length >= sessions.policy.dossierSessionsPerNiche) {
        discovery.store.setNicheStatus(nicheId, "rejected");
        store.note(past[0]!.id, "niche_rejected", { nicheId, why: `no passing dossier after ${past.length} sessions` });
        continue;
      }
      const previous = dossiers.latest(nicheId);
      const signals = niche.signalIds.map((id) => discovery.store.signal(id)).filter((signal) => signal !== null);
      const result = await sessions.request({
        companyId: null, botId: scout.botId, kind: "deep", trigger,
        objective: `Research the dossier for "${niche.buyer} · ${niche.job}" and submit it with cofactory_submit_dossier (niche_id ${nicheId}).`,
        doneWhen: "the dossier is submitted and scores without a veto, or the research shows the niche does not hold (say so in the journal)",
        context: [
          `Niche: buyer ${niche.buyer}; job ${niche.job}; channel ${niche.channel}.`,
          `Gap as proposed: ${niche.whyGap}`,
          `Its signals:\n${signals.map((signal) => `- [${signal.sourceType}] ${signal.url}: "${signal.quote}"`).join("\n")}`,
          ...(() => {
            const card = deps.cards?.latest(nicheId);
            if (card?.status !== "started") return [];
            const { body } = card;
            return [`The owner chose this from its card, so build on it: ${body.name}, "${body.headline}"; buyers pay ${body.priceToday.amountCents} cents per ${body.priceToday.per} today (${body.priceToday.url}); rival ${body.rival.name} (${body.rival.url}) misses ${body.rival.whatTheyMiss}; example buyer ${body.exampleBuyer.name} (${body.exampleBuyer.url}); our offer ${body.offer.priceCents} cents per ${body.offer.per}.`];
          })(),
          previous ? `Previous dossier v${previous.version} was ${previous.status}: ${[...previous.verification.criticalFailures, ...previous.verification.structural, ...previous.verification.claims.filter((claim) => claim.verdict !== "verified").map((claim) => `${claim.role} ${claim.url} ${claim.verdict}`), ...(previous.score?.vetoes.map((item) => `veto ${item.veto}: ${item.why}`) ?? []), `${previous.qa.unknown} questions unknown`].join("; ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      return !("refused" in result) && result.started;
    }
    return false;
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
      if (await wakeForDiscovery()) started++;
      else if (await wakeForCard()) started++;
      else if (await wakeForDossier()) started++;
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
