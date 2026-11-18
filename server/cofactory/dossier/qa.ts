import { createHash } from "node:crypto";

import { BUYER_VOICE_SOURCES } from "../../../shared/cofactory/discovery.ts";
import { hoursPerMonthOf, type DossierBody, type DossierPolicy, type QaReport, type VerificationReport } from "../../../shared/cofactory/dossier.ts";
import { siteOf } from "../discovery/discovery.ts";
import { monthlyCents } from "./score.ts";

type Ask = { id: string; question: string; answer: (body: DossierBody, ok: (role: string, index?: number) => boolean) => string | null };

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

/**
 * The adversarial questions. Each is answered only from the dossier's verified evidence: a claim whose page or quote did
 * not check out leaves its question "unknown", however well the dossier is written.
 */
const BANK: Ask[] = [
  { id: "count", question: "How many buyers are there, and where does that number come from?", answer: (body, ok) => (ok("buyer_count") ? `${body.buyerCount.value} (${body.buyerCount.url})` : null) },
  { id: "named", question: "Name three buyers and how to reach each.", answer: (body, ok) => {
    const reachable = body.buyers.filter((_, index) => ok("buyer", index) && ok("contact", index));
    return reachable.length >= 3 ? reachable.slice(0, 3).map((buyer) => `${buyer.name} via ${buyer.contactUrl}`).join("; ") : null;
  } },
  { id: "spend", question: "What do buyers pay today for this job, and to whom?", answer: (body, ok) => {
    const index = body.spend.findIndex((_, at) => ok("spend", at));
    return index < 0 ? null : `${dollars(body.spend[index]!.amountCents)} per ${body.spend[index]!.per} (${body.spend[index]!.url})`;
  } },
  { id: "human", question: "What does the human alternative cost?", answer: (body, ok) => (ok("human_alternative") ? `${dollars(body.offer.humanAlternative.amountCents)} per ${body.offer.humanAlternative.per}` : null) },
  { id: "ratio", question: "Is our price at most a third of the human alternative?", answer: (body, ok) => {
    if (!ok("human_alternative")) return null;
    const ours = monthlyCents(body.offer.priceCents, body.offer.per), theirs = monthlyCents(body.offer.humanAlternative.amountCents, body.offer.humanAlternative.per, hoursPerMonthOf(body.offer.humanAlternative.hours));
    return ours === null || theirs === null ? null : `${ours <= theirs / 3 ? "yes" : "no"}: ${dollars(ours)} against ${dollars(theirs)} a month`;
  } },
  { id: "incumbent", question: "Who is the closest incumbent, and what exactly do they miss?", answer: (body, ok) => {
    const index = body.incumbents.findIndex((incumbent, at) => ok("incumbent", at) && incumbent.whatTheyMiss.trim().length >= 20);
    return index < 0 ? null : `${body.incumbents[index]!.name}: ${body.incumbents[index]!.whatTheyMiss}`;
  } },
  { id: "incumbent_price", question: "What does that incumbent charge?", answer: (body, ok) => {
    const index = body.incumbents.findIndex((incumbent, at) => ok("incumbent", at) && incumbent.priceCents !== null);
    return index < 0 ? null : `${body.incumbents[index]!.name}: ${dollars(body.incumbents[index]!.priceCents!)}`;
  } },
  { id: "gap", question: "Why does the gap exist, and why is it not a monopoly or a regulation in disguise?", answer: (body) => (body.gap.why.trim().length >= 60 && body.gap.hiddenReasonsRuledOut.trim().length >= 40 ? `${body.gap.why} / ${body.gap.hiddenReasonsRuledOut}` : null) },
  { id: "pain", question: "Quote a practitioner describing the pain.", answer: (body, ok) => {
    const index = body.pains.findIndex((pain, at) => ok("pain", at) && BUYER_VOICE_SOURCES.includes(pain.sourceType));
    return index < 0 ? null : `"${body.pains[index]!.quote}" (${body.pains[index]!.url})`;
  } },
  { id: "second_voice", question: "Which practitioner on another site says the same?", answer: (body, ok) => {
    const sites = new Set(body.pains.filter((pain, at) => ok("pain", at) && BUYER_VOICE_SOURCES.includes(pain.sourceType)).map((pain) => siteOf(pain.url)));
    return sites.size >= 2 ? [...sites].join(", ") : null;
  } },
  { id: "no", question: "What would make a buyer say no?", answer: (body) => (body.failureModes.find((mode) => mode.trim().length > 15) ?? null) },
  { id: "first_ten", question: "How do the first ten customers hear about it, step by step?", answer: (body) => (body.firstTen.steps.trim().length >= 60 ? `${body.firstTen.channel}: ${body.firstTen.steps}` : null) },
  { id: "rules", question: "Which rules, licences or platform terms apply?", answer: (body) => (body.risks.notes.trim().length >= 20 ? body.risks.notes : null) },
  { id: "cost", question: "What does serving the heaviest customer cost us?", answer: (body) => (body.offer.costToServeCents > 0 ? `${dollars(body.offer.costToServeCents)} per ${body.offer.per}` : null) },
  { id: "card", question: "Can one person at the buyer say yes and pay by card?", answer: (body) => (body.offer.priceCents > 0 ? `${body.risks.procurement ? "no, procurement" : "yes"} at ${dollars(body.offer.priceCents)} per ${body.offer.per}` : null) },
  { id: "archetype", question: "What exactly is sold, and how is it delivered?", answer: (body) => (body.offer.archetype ? `${body.offer.archetype} at ${dollars(body.offer.priceCents)} per ${body.offer.per}` : null) },
];

/** Ten questions drawn at random (seeded by the dossier, so a rerun asks the same ones); more than three unknown fails. */
export function interrogate(dossierKey: string, body: DossierBody, verification: VerificationReport, policy: DossierPolicy): QaReport {
  const ok = (role: string, index = 0) => verification.claims.some((claim) => claim.role === role && claim.index === index && claim.verdict === "verified");
  const order = BANK.map((ask) => ({ ask, rank: createHash("sha256").update(`${dossierKey}:${ask.id}`).digest().readUInt32BE(0) })).sort((a, b) => a.rank - b.rank);
  const questions = order.slice(0, policy.qaQuestions).map(({ ask }) => ({ id: ask.id, question: ask.question, answer: ask.answer(body, ok) }));
  const unknown = questions.filter((item) => item.answer === null).length;
  return { questions, unknown, pass: unknown <= policy.qaMaxUnknown };
}
