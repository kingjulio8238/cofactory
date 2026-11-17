import type { Book } from "../book.ts";
import type { Truth } from "../truth/store.ts";

const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

/**
 * An estimate of one hosted factory machine a month (2 vCPU, 4 GiB), set with COFACTORY_CLOUD_MONTHLY_CENTS once a
 * provider quote is in hand.
 */
export const CLOUD_MACHINE_MONTHLY_CENTS = Number(process.env.COFACTORY_CLOUD_MONTHLY_CENTS) || 3_000;

export interface GateCriterion {
  name: string;
  met: boolean;
  value: string;
  target: string;
}

/**
 * When to build Cofactory's own cloud, read from the factory's own records: the product works (companies past the
 * first-dollar gate), running on the owner's computer is costing money (customers who wrote or paid waited hours because
 * the factory was offline), and revenue pays for a machine several times over. All three, or not yet.
 */
export function cloudGate(deps: { book: Book; truth: Truth; firstDollarCompanies: () => number }, now: number): { ready: boolean; criteria: GateCriterion[] } {
  const since = now - 30 * DAY_MS;
  const proven = deps.firstDollarCompanies();
  const waited = deps.truth.events({}).filter((event) => event.receivedAt >= since && (event.kind === "reply" || event.kind === "payment" || event.kind === "form_submit")
    && event.receivedAt - event.occurredAt > 6 * HOUR_MS).length;
  const revenue = deps.book.entries({}).filter((entry) => entry.at >= since && entry.kind === "revenue").reduce((sum, entry) => sum + entry.cents, 0);
  const criteria: GateCriterion[] = [
    { name: "companies past the first-dollar gate", met: proven >= 3, value: String(proven), target: "3 or more" },
    { name: "customers kept waiting 6h+ while offline (30 days)", met: waited >= 2, value: String(waited), target: "2 or more" },
    { name: "revenue in 30 days vs one cloud machine", met: revenue >= 3 * CLOUD_MACHINE_MONTHLY_CENTS, value: `$${(revenue / 100).toFixed(2)}`, target: `$${((3 * CLOUD_MACHINE_MONTHLY_CENTS) / 100).toFixed(2)} or more` },
  ];
  return { ready: criteria.every((criterion) => criterion.met), criteria };
}
