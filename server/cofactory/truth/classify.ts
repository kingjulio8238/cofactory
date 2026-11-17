import type { ArmsLengthContext, ArmsLengthVerdict, EventKind, EvidenceClass } from "../../../shared/cofactory/evidence.ts";

const NOISE = [/\bout of (the )?office\b/, /\bautomatic reply\b/, /\bauto-?reply\b/, /\bdelivery status notification\b/, /\bmailer-daemon\b/, /\bundeliverable\b/, /\bvacation\b.*\breturn\b/];
const REJECTED = [/\bnot interested\b/, /\bunsubscribe\b/, /\bremove me\b/, /\bstop (emailing|contacting|messaging)\b/, /\bno thanks?\b/, /\bwe('re| are) all set\b/, /\bdon'?t (contact|email)\b/, /\bplease stop\b/];
const URGENT = [
  /\bhow much\b/, /\bwhat('s| is| are) (the |your )?(price|pricing|cost|rate)s?\b/, /\b(send|share) (me |us )?(an |the )?(invoice|quote|contract|payment link)\b/,
  /\bwhen can (you|we)\b/, /\bcan (you|we) start\b/, /\bhow (do|can) (i|we) (sign up|buy|order|pay|get started)\b/, /\b(book|schedule) (a |an )?(call|demo|meeting)\b/,
  /\b(need|needed) (this|it|something like this) (by|before|asap|urgently|now)\b/, /\basap\b/, /\bdeadline\b/, /\b(i|we)('ll| will) take\b/, /\bsign (me|us) up\b/,
  /\bwhere do (i|we) pay\b/, /\bcount (me|us) in\b/,
];

/** The evidence class of an event. Money and signatures are the only way to `committed`; text never gets there. */
export function classifyEvent(kind: EventKind, text: string | null, refunded = false): EvidenceClass {
  if (kind === "payment" || kind === "deposit" || kind === "signed_order") return refunded ? "rejected" : "committed";
  if (kind === "refund") return "rejected";
  const body = (text ?? "").toLowerCase().replace(/[‘’]/g, "'");
  if (!body.trim()) return "noise";
  if (NOISE.some((rule) => rule.test(body))) return "noise";
  if (REJECTED.some((rule) => rule.test(body))) return "rejected";
  if (URGENT.some((rule) => rule.test(body))) return "urgent";
  return "hypothetical";
}

const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1).toLowerCase();

/** Whether a payment counts as a real customer's: settled, live, unrelated, unreversed and near the list price. */
export function armsLength(payment: { externalId: string; kind: EventKind; payerEmail: string | null; amountCents: number | null; testMode: boolean }, ctx: ArmsLengthContext): ArmsLengthVerdict {
  const reasons: string[] = [];
  if (payment.kind !== "payment" && payment.kind !== "deposit") reasons.push(`a ${payment.kind} is not a payment`);
  if (payment.testMode) reasons.push("test-mode payment");
  if (ctx.refunded.has(payment.externalId)) reasons.push("refunded");
  if (payment.amountCents === null || payment.amountCents < Math.ceil(ctx.listPriceCents / 2)) reasons.push(`below half the list price of ${ctx.listPriceCents} cents`);
  const email = payment.payerEmail?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) reasons.push("no payer identity to check");
  else {
    if (ctx.relatedEmails.some((related) => related.trim().toLowerCase() === email)) reasons.push("payer is a related party");
    else if (ctx.relatedDomains.some((domain) => domain.trim().toLowerCase() === domainOf(email))) reasons.push("payer's domain belongs to a related party");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Distinct real customers among `payments`: one count per payer, whatever they bought. */
export function armsLengthPayers(payments: ReadonlyArray<Parameters<typeof armsLength>[0]>, ctx: ArmsLengthContext): number {
  const payers = new Set<string>();
  for (const payment of payments) if (armsLength(payment, ctx).ok) payers.add(payment.payerEmail!.trim().toLowerCase());
  return payers.size;
}
