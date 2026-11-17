import { BUYER_VOICE_SOURCES, type Niche } from "../../../shared/cofactory/discovery.ts";
import { nicheSimilarity } from "../discovery/similarity.ts";
import type { DossierBody, DossierPolicy, QaReport, ScoreReport, VerificationReport, Veto } from "../../../shared/cofactory/dossier.ts";

/** A price as cents per month; null when it cannot be put on a monthly basis (an hourly rate with no hours). */
export function monthlyCents(cents: number, per: "month" | "year" | "job" | "hour", hoursPerMonth?: number): number | null {
  if (per === "month" || per === "job") return cents;
  if (per === "year") return Math.round(cents / 12);
  return hoursPerMonth ? cents * hoursPerMonth : null;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The rubric, in code. Each feature is 0..1; the score is their weighted sum out of 100. A veto stops a niche whatever
 * its score: licensed advice, regulated claims, a platform's terms, a gatekeeper, a procurement path or a price over a
 * card, a dossier that did not verify or answer, a price not a third of the human alternative, thin margins, or a niche
 * another factory took first.
 */
export function scoreDossier(input: {
  niche: Pick<Niche, "boring" | "uniqueInputIds" | "density">;
  body: DossierBody;
  verification: VerificationReport;
  qa: QaReport;
  policy: DossierPolicy;
  takenBy: string | null;
}): ScoreReport {
  const { niche, body, verification, qa, policy } = input;
  const ok = (role: string, index = 0) => verification.claims.some((claim) => claim.role === role && claim.index === index && claim.verdict === "verified");
  const vetoes: ScoreReport["vetoes"] = [];
  const veto = (name: Veto, why: string) => vetoes.push({ veto: name, why });

  if (body.risks.licensedAdvice) veto("licensed_advice", "the work is advice only a licensed professional may give");
  if (body.risks.regulatedClaims) veto("regulated_claims", "selling it means making regulated claims");
  if (body.risks.platformTos) veto("platform_tos", `it would break ${body.risks.platformTos}'s terms`);
  if (body.risks.gatekeeperShare > 0.5) veto("gatekeeper", `${Math.round(body.risks.gatekeeperShare * 100)}% of distribution or revenue runs through one gatekeeper`);
  const ours = monthlyCents(body.offer.priceCents, body.offer.per);
  if (body.risks.procurement) veto("procurement", "the buyer cannot pay without procurement or a committee");
  else if (ours !== null && ours > policy.cardLimitCentsPerMonth) veto("procurement", `at ${ours / 100} dollars a month it is no longer one person's card decision`);
  if (!verification.pass) veto("unverified", [...verification.criticalFailures, ...verification.structural, `${Math.round(verification.verifiedShare * 100)}% of claims verified`].join("; "));
  if (!qa.pass) veto("qa", `${qa.unknown} of ${qa.questions.length} questions unknown`);
  const theirs = ok("human_alternative") ? monthlyCents(body.offer.humanAlternative.amountCents, body.offer.humanAlternative.per, body.offer.humanAlternative.hoursPerMonth) : null;
  const ratio = ours !== null && theirs ? ours / theirs : null;
  if (ratio === null) veto("price_ratio", "our price cannot be compared with a verified human alternative");
  else if (ratio > policy.maxPriceRatio) veto("price_ratio", `our price is ${Math.round(ratio * 100)}% of the human alternative; it must be at most a third`);
  if (body.offer.costToServeCents > body.offer.priceCents * (1 - policy.minMarginShare)) veto("unit_economics", "serving the heaviest customer leaves less than half the price as margin");
  if (input.takenBy) veto("taken", `another factory now holds this niche (${input.takenBy})`);

  const practitioners = new Set(body.pains.filter((pain, index) => ok("pain", index) && BUYER_VOICE_SOURCES.includes(pain.sourceType)).map((pain) => pain.url)).size;
  const reachable = body.buyers.filter((_, index) => ok("buyer", index) && ok("contact", index)).length;
  const count = ok("buyer_count") ? body.buyerCount.value : 0;
  const nicheBand = count >= 50 && count <= 20_000 ? 1 : count > 20_000 ? 0.6 : count > 0 ? 0.4 : 0;
  const verifiedSpend = body.spend.filter((_, index) => ok("spend", index)).length;
  const incumbentGap = body.incumbents.some((incumbent, index) => ok("incumbent", index) && incumbent.whatTheyMiss.trim().length >= 20) ? 1 : 0;
  const features: Record<string, number> = {
    demand: clamp(practitioners / 8),
    money: clamp(verifiedSpend / 2) * (ok("human_alternative") ? 1 : 0.5),
    price_advantage: ratio === null ? 0 : clamp((policy.maxPriceRatio - ratio) / (policy.maxPriceRatio - 0.1) + 0.5),
    reach: clamp(reachable / 10) * nicheBand,
    moat: (niche.boring ? 0.5 : 0) + clamp(niche.uniqueInputIds.length / 2) * 0.5,
    gap: incumbentGap,
    crowding: 1 - clamp(niche.density / 3),
  };
  const weights: Record<string, number> = { demand: 0.2, money: 0.2, price_advantage: 0.15, reach: 0.15, moat: 0.1, gap: 0.1, crowding: 0.1 };
  const score = Math.round(Object.entries(features).reduce((sum, [name, value]) => sum + value * weights[name]!, 0) * 1000) / 10;
  return { score, features, vetoes };
}

/**
 * Which closed-batch candidates earn a dossier: the ones whose own evidence is strongest, before any dossier exists,
 * less a penalty for each killed company whose niche it resembles, so a disproved idea is not re-tried in new words.
 */
export function preScore(niche: Niche, signals: Array<{ sourceType: string; site: string }>, killed: ReadonlyArray<{ buyer: string; job: string }> = []): number {
  const voice = signals.filter((signal) => (BUYER_VOICE_SOURCES as readonly string[]).includes(signal.sourceType)).length;
  const sites = new Set(signals.map((signal) => signal.site)).size;
  const history = killed.reduce((penalty, dead) => penalty + Math.max(0, nicheSimilarity(niche, { ...dead, channel: "" }) - 0.3) * 10, 0);
  return voice * 2 + sites + (niche.boring ? 1 : 0) + niche.uniqueInputIds.length - niche.density * 2 - history;
}
