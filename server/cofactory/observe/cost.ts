import type { CostSnapshot, StageCost } from "../../../shared/cofactory/observe.ts";
import type { Stage } from "../../../shared/cofactory/types.ts";
import type { Book } from "../book.ts";

/** The stages a company has been through, with when it entered and left each, read from its own event trail. */
export function stageSpans(book: Book, companyId: string): Array<{ stage: Stage; enteredAt: number; leftAt: number | null }> {
  const company = book.company(companyId);
  if (!company) return [];
  const spans: Array<{ stage: Stage; enteredAt: number; leftAt: number | null }> = [{ stage: "build", enteredAt: company.createdAt, leftAt: null }];
  for (const event of book.events(companyId)) {
    if (event.type !== "advance") continue;
    const to = (event.data as { to?: Stage }).to;
    if (!to) continue;
    spans.at(-1)!.leftAt = event.at;
    spans.push({ stage: to, enteredAt: event.at, leftAt: null });
  }
  return spans;
}

/** Shadow model cost and real spend booked while the company sat in each stage. */
export function costByStage(book: Book, companyId: string): StageCost[] {
  const spans = stageSpans(book, companyId).map((span) => ({ ...span, shadowCents: 0, spentCents: 0 }));
  if (!spans.length) return [];
  for (const entry of book.entries({ companyId })) {
    if (entry.kind !== "shadow" && entry.kind !== "spend") continue;
    const span = [...spans].reverse().find((candidate) => entry.at >= candidate.enteredAt) ?? spans[0]!;
    if (entry.kind === "shadow") span.shadowCents += entry.cents;
    else span.spentCents += entry.cents;
  }
  return spans;
}

export function costSnapshot(book: Book, companyId: string | null, session: { startedAt: number; role: string } | null): CostSnapshot {
  const entries = book.entries(companyId ? { companyId } : {}).filter((entry) => entry.companyId === companyId);
  const sum = (kind: "shadow" | "spend") => entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.cents, 0);
  return {
    companyShadowCents: sum("shadow"),
    companySpentCents: sum("spend"),
    companyAvailableCents: companyId ? book.available(companyId) : null,
    sessionShadowCents: session
      ? entries.filter((entry) => entry.kind === "shadow" && entry.at >= session.startedAt && entry.actor.startsWith(`${session.role}:`)).reduce((total, entry) => total + entry.cents, 0)
      : null,
  };
}
