import type { Evidence } from "../../../shared/cofactory/types.ts";
import type { Truth } from "./store.ts";

const STRONG = new Set(["committed", "urgent"]);

/**
 * Checks evidence offered for a stage move against the world. A URL ref must resolve for a stranger. Any other ref
 * must be an external event already recorded for this company: a selling signal must be urgent or committed, and a
 * repeatable motion must be committed.
 */
export async function verifyEvidence(truth: Truth, companyId: string, evidence: Evidence): Promise<{ ok: boolean; reason: string }> {
  const ref = evidence.ref.trim();
  if (/^https?:\/\//i.test(ref)) {
    if (evidence.kind !== "path_live") return { ok: false, reason: `${evidence.kind} must point at a recorded event, not a page` };
    const check = await truth.checkClaim({ url: ref, subject: `company:${companyId}` });
    return check.verdict === "verified" ? { ok: true, reason: "page resolves for a stranger" } : { ok: false, reason: `${ref} is ${check.verdict}: ${check.reason}` };
  }
  const event = truth.events({ companyId }).find((candidate) => candidate.externalId === ref || candidate.id === ref);
  if (!event) return { ok: false, reason: `no external event ${ref} is recorded for this company` };
  if (evidence.kind === "selling_signal" && !STRONG.has(event.evidenceClass)) return { ok: false, reason: `event ${ref} is ${event.evidenceClass}; a selling signal must be urgent or committed` };
  if (evidence.kind === "repeatable_motion" && event.evidenceClass !== "committed") return { ok: false, reason: `event ${ref} is ${event.evidenceClass}; a repeatable motion must rest on money` };
  return { ok: true, reason: `${event.kind} event ${ref} (${event.evidenceClass})` };
}
