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

export function countsIn(quote: string): number[] {
  return [...quote.matchAll(/(\d[\d,]*)/g)].map((match) => Number(match[1]!.replace(/,/g, ""))).filter((value) => Number.isFinite(value));
}

/**
 * Checks a dossier against the world: every page must load and every quote must be on its page; the buyer count and
 * the human alternative's price must appear in their own quotes; and the dossier must meet its minimums.
 */
export async function verifyDossier(truth: Truth, body: DossierBody, policy: DossierPolicy, subject: string): Promise<VerificationReport> {
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
  body.spend.forEach((line, index) => {
    if (ok("spend", index) && !amountsIn(line.quote).includes(line.amountCents)) critical.push(`spend line ${index + 1} states an amount its quote does not`);
  });

  const structural: string[] = [];
  const realBuyers = body.buyers.filter((_, index) => ok("buyer", index) && ok("contact", index));
  if (realBuyers.length < policy.minBuyers) structural.push(`${realBuyers.length} named buyers with a working page and contact route; needs ${policy.minBuyers}`);
  const practitionerPages = new Set(body.pains.filter((pain, index) => ok("pain", index) && BUYER_VOICE_SOURCES.includes(pain.sourceType)).map((pain) => pain.url));
  const practitionerSites = new Set([...practitionerPages].map(siteOf));
  if (practitionerPages.size < policy.minPractitioners) structural.push(`${practitionerPages.size} practitioner pages; needs ${policy.minPractitioners}`);
  if (practitionerSites.size < 2) structural.push("practitioner quotes all come from one site");
  if (!body.spend.some((_, index) => ok("spend", index))) structural.push("no verified line of what buyers spend today");
  if (body.failureModes.filter((mode) => mode.trim().length > 15).length < policy.minFailureModes) structural.push(`needs ${policy.minFailureModes} specific failure modes`);
  if (body.gap.why.trim().length < 60 || body.gap.hiddenReasonsRuledOut.trim().length < 40) structural.push("the gap and the hidden reasons it rules out must be specific");
  if (body.firstTen.steps.trim().length < 60) structural.push("the plan for the first ten customers must be concrete");

  const verifiedShare = claims.length ? claims.filter((claim) => claim.verdict === "verified").length / claims.length : 0;
  return { claims, verifiedShare, criticalFailures: critical, structural, pass: verifiedShare >= policy.verifiedShare && !critical.length && !structural.length };
}
