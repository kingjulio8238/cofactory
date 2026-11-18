import type { ClaimResult, ClaimRole, DossierBody, DossierPolicy, VerificationReport } from "../../../shared/cofactory/dossier.ts";
import type { Truth } from "../truth/store.ts";
import { BUYER_VOICE_SOURCES } from "../../../shared/cofactory/discovery.ts";
import { siteOf } from "../discovery/discovery.ts";

type ClaimInput = { role: ClaimRole; index: number; url: string; quote: string | null };

/** Every claim a dossier makes that can be checked against a page. */
export function dossierClaims(body: DossierBody): ClaimInput[] {
  return [
    ...body.buyers.flatMap((buyer, index): ClaimInput[] => [
      { role: "buyer", index, url: buyer.url, quote: null },
      { role: "contact", index, url: buyer.contactUrl, quote: null },
    ]),
    ...body.pains.map((pain, index): ClaimInput => ({ role: "pain", index, url: pain.url, quote: pain.quote })),
    ...body.spend.map((line, index): ClaimInput => ({ role: "spend", index, url: line.url, quote: line.quote })),
    { role: "buyer_count", index: 0, url: body.buyerCount.url, quote: body.buyerCount.quote },
    ...body.incumbents.map((incumbent, index): ClaimInput => ({ role: "incumbent", index, url: incumbent.url, quote: null })),
    { role: "human_alternative", index: 0, url: body.offer.humanAlternative.url, quote: body.offer.humanAlternative.quote },
    ...(body.offer.humanAlternative.hours ? [{ role: "hours" as const, index: 0, url: body.offer.humanAlternative.hours.url, quote: body.offer.humanAlternative.hours.quote }] : []),
  ];
}

/** A number written in a quote, as cents, so a stated amount can be held to its source. */
export function amountsIn(quote: string): number[] {
  return [...quote.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k|K|thousand|million|m\b)?/g)].map((match) => {
    const base = Number(match[1]!.replace(/,/g, ""));
    const scale = match[2] ? (/^(k|thousand)$/i.test(match[2]) ? 1_000 : 1_000_000) : 1;
    return Math.round(base * scale * 100);
  });
}

/**
 * What is wrong with an hourly price's hours, or nothing: an hourly price needs the hours of work quoted from a page, the
 * page must check out (`verified`), and the number given must be the one its quote states.
 */
export function hoursProblems(price: { per: string; hours?: { quote: string; amount: number } }, verified: boolean, what: string): string[] {
  if (price.per !== "hour") return [];
  if (!price.hours) return [`${what} is an hourly rate with no quoted hours of work, so it cannot be put on a monthly basis`];
  if (!verified) return [`the hours behind ${what}'s hourly rate do not check out on their page`];
  if (!countsIn(price.hours.quote).includes(price.hours.amount)) return [`the hours behind ${what} (${price.hours.amount}) are not the number their quote states`];
  return [];
}

export function countsIn(quote: string): number[] {
  return [...quote.matchAll(/(\d[\d,]*)/g)].map((match) => Number(match[1]!.replace(/,/g, ""))).filter((value) => Number.isFinite(value));
}

/**
 * Checks a dossier against the world: every page must load and every quote must be on its page; the buyer count and
 * the human alternative's price must appear in their own quotes; and the dossier must meet its minimums.
 */
/** Work that often needs a licence or makes regulated claims, found in the dossier's own words about what it sells. */
const REGULATED_TOPICS: ReadonlyArray<{ topic: string; pattern: RegExp }> = [
  { topic: "tax", pattern: /\b(1099s?|w-?9s?|tax (returns?|filings?|filing|prep\w*|advice)|sales tax|payroll tax|occupancy tax|irs)\b/i },
  { topic: "legal", pattern: /\b(legal advice|contract review|litigation|lawsuits?|evictions?|attorneys?)\b/i },
  { topic: "medical", pattern: /\b(diagnos\w*|treatment plans?|prescri\w*|medical advice|clinical advice)\b/i },
  { topic: "financial", pattern: /\b(investment advice|financial advice|securities|credit repair|loan approvals?)\b/i },
  { topic: "insurance", pattern: /\b(insurance claims?|underwrit\w*)\b/i },
  { topic: "immigration", pattern: /\b(immigration|visa petitions?)\b/i },
];

/**
 * Risk flags the scout leaves off although its own description of the work names a regulated topic, unless the risk
 * notes take that topic up and say why no licence or regulated claim is involved. The scout declares its own flags, so
 * a flag it never raised has to be answered in words a later reader can check.
 */
export function undeclaredRisks(body: DossierBody, job: string): string[] {
  if (body.risks.licensedAdvice || body.risks.regulatedClaims) return [];
  return unexplainedTopics([job, body.gap.why, body.firstTen.steps, ...body.incumbents.map((incumbent) => incumbent.whatTheyMiss)].join("\n"), body.risks.notes);
}

/** Regulated topics the scout's own words (`own`) name that its risk notes do not take up. */
export function unexplainedTopics(own: string, notes: string): string[] {
  return REGULATED_TOPICS.flatMap(({ topic, pattern }) => {
    const found = pattern.exec(own);
    if (!found || pattern.test(notes)) return [];
    return [`the work touches ${topic} ("${found[0]}") but the risks neither flag it nor explain in the notes why no licence or regulated claim is involved`];
  });
}

export async function verifyDossier(truth: Truth, body: DossierBody, policy: DossierPolicy, subject: string, job = ""): Promise<VerificationReport> {
  const claims: ClaimResult[] = [];
  const inputs = dossierClaims(body);
  for (let start = 0; start < inputs.length; start += 4) {
    const batch = inputs.slice(start, start + 4);
    const checked = await Promise.all(batch.map((claim) => truth.checkClaim({ url: claim.url, quote: claim.quote, subject })));
    batch.forEach((claim, offset) => claims.push({ ...claim, verdict: checked[offset]!.verdict, checkId: checked[offset]!.checkId ?? null }));
  }
  const ok = (role: ClaimRole, index = 0) => claims.find((claim) => claim.role === role && claim.index === index)?.verdict === "verified";
  const critical: string[] = [];
  if (!ok("buyer_count")) critical.push("the buyer count's source does not check out");
  else if (!countsIn(body.buyerCount.quote).includes(body.buyerCount.value)) critical.push(`the buyer count ${body.buyerCount.value} is not the number its quote states`);
  if (!ok("human_alternative")) critical.push("the human alternative's price does not check out");
  else if (!amountsIn(body.offer.humanAlternative.quote).includes(body.offer.humanAlternative.amountCents)) critical.push("the human alternative's price is not the amount its quote states");
  critical.push(...hoursProblems(body.offer.humanAlternative, ok("hours"), "the human alternative"));
  body.spend.forEach((line, index) => {
    if (ok("spend", index) && !amountsIn(line.quote).includes(line.amountCents)) critical.push(`spend line ${index + 1} states an amount its quote does not`);
  });

  const structural: string[] = [];
  const realBuyers = body.buyers.filter((_, index) => ok("buyer", index) && ok("contact", index));
  if (realBuyers.length < policy.minBuyers) structural.push(`${realBuyers.length} named buyers with a working page and contact route; needs ${policy.minBuyers}`);
  // a quote on an incumbent's own site is its marketing, whatever source type it was filed under
  const vendorSites = new Set(body.incumbents.map((incumbent) => siteOf(incumbent.url)));
  const ownVoice = (pain: DossierBody["pains"][number], index: number) => ok("pain", index) && BUYER_VOICE_SOURCES.includes(pain.sourceType) && !vendorSites.has(siteOf(pain.url));
  const onVendorSites = body.pains.filter((pain, index) => ok("pain", index) && BUYER_VOICE_SOURCES.includes(pain.sourceType) && vendorSites.has(siteOf(pain.url))).length;
  if (onVendorSites) structural.push(`${onVendorSites} practitioner quote(s) are on an incumbent's own site, which is its marketing, not buyers talking`);
  const practitionerPages = new Set(body.pains.filter(ownVoice).map((pain) => pain.url));
  const practitionerSites = new Set([...practitionerPages].map(siteOf));
  if (practitionerPages.size < policy.minPractitioners) structural.push(`${practitionerPages.size} practitioner pages; needs ${policy.minPractitioners}`);
  if (practitionerSites.size < 2) structural.push("practitioner quotes all come from one site");
  const voices = body.pains.filter(ownVoice);
  const voiceKinds = new Set(voices.map((pain) => pain.sourceType));
  if (voiceKinds.size < 2) structural.push(`practitioner quotes come from one kind of source (${[...voiceKinds].join(", ") || "none"}); pain needs buyers talking (forums, reviews, Q&A), not only one kind of page`);
  const jobPages = new Set(voices.filter((pain) => pain.sourceType === "job_board").map((pain) => pain.url)).size;
  if (practitionerPages.size && jobPages / practitionerPages.size > 0.5) structural.push(`${jobPages} of ${practitionerPages.size} practitioner pages are job ads; job ads show spend, not pain, so at most half may be job ads`);
  if (!body.spend.some((_, index) => ok("spend", index))) structural.push("no verified line of what buyers spend today");
  if (body.failureModes.filter((mode) => mode.trim().length > 15).length < policy.minFailureModes) structural.push(`needs ${policy.minFailureModes} specific failure modes`);
  if (body.gap.why.trim().length < 60 || body.gap.hiddenReasonsRuledOut.trim().length < 40) structural.push("the gap and the hidden reasons it rules out must be specific");
  if (body.firstTen.steps.trim().length < 60) structural.push("the plan for the first ten customers must be concrete");
  structural.push(...undeclaredRisks(body, job));

  const verifiedShare = claims.length ? claims.filter((claim) => claim.verdict === "verified").length / claims.length : 0;
  return { claims, verifiedShare, criticalFailures: critical, structural, pass: verifiedShare >= policy.verifiedShare && !critical.length && !structural.length };
}
