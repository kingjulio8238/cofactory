import { randomUUID } from "node:crypto";

import type { Card, CardBody, Niche } from "../../../shared/cofactory/discovery.ts";
import { DEFAULT_DOSSIER_POLICY, type DossierPolicy } from "../../../shared/cofactory/dossier.ts";
import type { DiscoveryStore } from "../discovery/store.ts";
import type { Truth } from "../truth/store.ts";
import { monthlyCents, preScore } from "./score.ts";
import { amountsIn, unexplainedTopics } from "./verify.ts";

/** Niches in a search: small, so the owner sees cards soon. COFACTORY_FIRST_SEARCH_NICHES changes it (tests). */
export function searchSize(): number {
  return Number(process.env.COFACTORY_FIRST_SEARCH_NICHES) || 8;
}

export interface CardDeps {
  store: DiscoveryStore;
  truth: Truth;
  /** Niches of a closed search that get a card. */
  perBatch?: number;
  policy?: Partial<Pick<DossierPolicy, "maxPriceRatio" | "cardLimitCentsPerMonth">>;
  now?: () => number;
  /** A card changed in a way the owner hears about: it became ready. */
  onReady?: (card: Card) => void;
}

type Refusal = { ok: false; reason: string };

/** A card as the owner's Pick page shows it: the card, its niche, and the buyer quotes it rests on (one per site). */
export interface CardView {
  card: Card;
  niche: Pick<Niche, "id" | "buyer" | "job" | "channel">;
  quotes: Array<{ url: string; site: string; quote: string; sourceType: string }>;
}

/**
 * The quick first pass between a search and a company: the strongest niches of a closed search get a card, a short case
 * whose every claim is checked against its page, and the owner starts or passes on each. A started card gets its full
 * dossier, and the company launches once that is shortlisted.
 */
export function createCards(deps: CardDeps) {
  const { store, truth } = deps;
  const policy = { ...DEFAULT_DOSSIER_POLICY, ...deps.policy };
  const perBatch = deps.perBatch ?? 3;
  const now = deps.now ?? Date.now;
  const latest = (nicheId: string): Card | null => store.cardsOf(nicheId).at(-1) ?? null;

  function quotesOf(niche: Niche): CardView["quotes"] {
    const seen = new Set<string>();
    return niche.signalIds.map((id) => store.signal(id)).filter((signal) => signal !== null).filter((signal) => !seen.has(signal.site) && Boolean(seen.add(signal.site)))
      .slice(0, 3).map((signal) => ({ url: signal.url, site: signal.site, quote: signal.quote, sourceType: signal.sourceType }));
  }

  async function check(body: CardBody, subject: string): Promise<{ checks: Card["checks"]; problems: string[] }> {
    const claims = [
      { role: "price" as const, url: body.priceToday.url, quote: body.priceToday.quote },
      { role: "rival" as const, url: body.rival.url, quote: null },
      { role: "buyer" as const, url: body.exampleBuyer.url, quote: null },
    ];
    const results = await Promise.all(claims.map((claim) => truth.checkClaim({ url: claim.url, quote: claim.quote, subject })));
    const checks = claims.map((claim, index) => ({ role: claim.role, url: claim.url, verdict: results[index]!.verdict, checkId: results[index]!.checkId ?? null }));
    const verified = (role: Card["checks"][number]["role"]) => checks.find((item) => item.role === role)!.verdict === "verified";
    const problems: string[] = [];
    if (!verified("price")) problems.push(`what buyers pay today does not check out on its page (${checks[0]!.verdict})`);
    else if (!amountsIn(body.priceToday.quote).includes(body.priceToday.amountCents)) problems.push("the price buyers pay today is not the amount its quote states");
    if (!verified("rival")) problems.push(`the rival's page does not check out (${checks[1]!.verdict})`);
    if (!verified("buyer")) problems.push(`the example buyer's page does not check out (${checks[2]!.verdict})`);
    const ours = monthlyCents(body.offer.priceCents, body.offer.per);
    const theirs = monthlyCents(body.priceToday.amountCents, body.priceToday.per, body.priceToday.hoursPerMonth);
    if (ours === null || !theirs) problems.push("our price cannot be compared with what buyers pay today");
    else if (ours / theirs > policy.maxPriceRatio) problems.push(`our price is ${Math.round((ours / theirs) * 100)}% of what buyers pay today; it must be at most a third`);
    if (ours !== null && ours > policy.cardLimitCentsPerMonth) problems.push(`at ${ours / 100} dollars a month it is no longer one person's card decision`);
    if (body.risks.licensedAdvice || body.risks.regulatedClaims) problems.push("it needs a licence or makes regulated claims, which a factory does not run");
    else problems.push(...unexplainedTopics([body.headline, body.rival.whatTheyMiss].join("\n"), body.risks.notes));
    return { checks, problems };
  }

  return {
    /** Gives the `perBatch` strongest niches still waiting in a closed search a card; returns their ids. */
    select(batchId: string): string[] {
      const killed = store.postmortems();
      const ranked = store.niches({ batchId }).filter((niche) => niche.status === "candidate")
        .map((niche) => ({ niche, rank: preScore(niche, niche.signalIds.map((id) => store.signal(id)).filter((signal) => signal !== null), killed) }))
        .sort((a, b) => b.rank - a.rank).slice(0, perBatch);
      for (const { niche } of ranked) store.setNicheStatus(niche.id, "card");
      return ranked.map(({ niche }) => niche.id);
    },

    async submit(nicheId: string, body: CardBody): Promise<{ ok: true; card: Card } | Refusal> {
      const niche = store.niche(nicheId);
      if (!niche) return { ok: false, reason: "no such niche" };
      if (niche.status !== "card") return { ok: false, reason: `the niche is ${niche.status}; only a niche picked for a card gets one` };
      const previous = latest(nicheId);
      if (previous && previous.status !== "failed") return { ok: false, reason: `its card is already ${previous.status}` };
      const { checks, problems } = await check(body, `card:${nicheId}`);
      const card: Card = {
        id: randomUUID(), nicheId, factoryId: niche.factoryId, version: (previous?.version ?? 0) + 1, at: now(), body, checks, problems,
        status: problems.length ? "failed" : "ready", decidedAt: null, passReason: null, companyId: null, note: null,
      };
      store.addCard(card);
      if (card.status === "ready") deps.onReady?.(card);
      return { ok: true, card };
    },

    start(cardId: string): { ok: true; card: Card } | Refusal {
      const card = store.card(cardId);
      if (!card || card.status !== "ready") return { ok: false, reason: card ? `the card is ${card.status}` : "no such card" };
      store.updateCard(cardId, { status: "started", decidedAt: now() });
      store.setNicheStatus(card.nicheId, "selected");
      return { ok: true, card: store.card(cardId)! };
    },

    pass(cardId: string, reason: string | null): { ok: true; card: Card } | Refusal {
      const card = store.card(cardId);
      if (!card || card.status !== "ready") return { ok: false, reason: card ? `the card is ${card.status}` : "no such card" };
      store.updateCard(cardId, { status: "passed", decidedAt: now(), passReason: reason?.trim() || null });
      store.setNicheStatus(card.nicheId, "passed");
      return { ok: true, card: store.card(cardId)! };
    },

    dismiss(cardId: string): { ok: true } | Refusal {
      const card = store.card(cardId);
      if (!card || card.status !== "unconfirmed") return { ok: false, reason: card ? `the card is ${card.status}` : "no such card" };
      store.updateCard(cardId, { status: "dismissed" });
      return { ok: true };
    },

    /** Records what became of a started card: launched as a company, still waiting with a note, or not confirmed. */
    settle(cardId: string, patch: Partial<Pick<Card, "status" | "companyId" | "note">>): void {
      store.updateCard(cardId, patch);
    },

    latest,
    /** Every niche's newest card, oldest first. */
    all: (): Card[] => store.latestCards(),
    /** Niches picked for a card that still need one that holds up. */
    wanted(): string[] {
      return store.niches().filter((niche) => niche.status === "card" && (latest(niche.id)?.status ?? "failed") === "failed").map((niche) => niche.id);
    },
    /** What the owner passed on, and why, for the scout's next search. */
    passed(): Array<{ buyer: string; job: string; reason: string | null }> {
      return store.latestCards().filter((card) => card.status === "passed").map((card) => {
        const niche = store.niche(card.nicheId)!;
        return { buyer: niche.buyer, job: niche.job, reason: card.passReason };
      });
    },
    view(card: Card): CardView {
      const niche = store.niche(card.nicheId)!;
      return { card, niche: { id: niche.id, buyer: niche.buyer, job: niche.job, channel: niche.channel }, quotes: quotesOf(niche) };
    },
  };
}

export type Cards = ReturnType<typeof createCards>;
