import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Book } from "../book.ts";
import type { Observer } from "../observe/observer.ts";
import type { Sessions } from "../runtime/sessions.ts";
import type { RuntimeStore } from "../runtime/store.ts";
import type { Truth } from "../truth/store.ts";
import type { Order, Orders, Rehearsal } from "./orders.ts";
import { companySeatLook, type SeatLook } from "../runtime/launcher.ts";

const DAY = 24 * 60 * 60_000;
/** Days an order may stay open before the CEO is alarmed. */
export const ORDER_OVERDUE_DAYS = 3;
const PACKET_FILES = ["BRIEF.md", "RUNBOOK.md", "JOURNAL.md"] as const;

export const STAND_IN_INSTRUCTIONS = [
  "You are a stand-in operator for {company}. You have never worked here: everything you know is in the handoff packet folder named in your session.",
  "Serve the order in ORDER.md by following RUNBOOK.md, working only inside the packet folder. Do not open the company's own folder or earlier deliverables: the test is whether the packet alone is enough.",
  "Put the finished work in the packet folder and call cofactory_deliver_order with rehearsal true. Where the runbook leaves you guessing, say exactly where in the journal: that gap is the most useful thing you can find.",
].join("\n");

export interface RehearsalDeps {
  orders: Orders;
  book: Book;
  truth: Truth;
  store: RuntimeStore;
  sessions: Sessions;
  observe: Observer;
  folderOf(companyId: string): string;
  packetRoot: string;
  createBot(profile: { name: string; instructions: string; section: string; look?: SeatLook }): Promise<string>;
  now?: () => number;
}

/** What the customer asked for, as the stand-in sees it: the payment and the customer's own messages, never the deliverable. */
function orderSheet(order: Order, truth: Truth): string {
  const said = truth.events({ companyId: order.companyId })
    .filter((event) => event.payerEmail && event.payerEmail.toLowerCase() === order.customer && (event.kind === "reply" || event.kind === "form_submit" || event.kind === "payment"))
    .map((event) => `- ${new Date(event.occurredAt).toISOString()} ${event.kind}${event.amountCents ? ` ${event.amountCents} cents` : ""}${event.text ? `: ${event.text.slice(0, 2_000)}` : ""}`);
  return [
    `# Order ${order.id.slice(0, 8)}`,
    "",
    `Customer: ${order.customer ?? "(no email on the payment)"}`,
    `Paid: ${order.amountCents} cents (${order.externalId})`,
    "",
    "## What the customer sent",
    said.length ? said.join("\n") : "(nothing beyond the payment)",
    "",
  ].join("\n");
}

/**
 * The bus-factor test, run by the runtime: after a company's first delivered order a stand-in operator serves it again
 * from the packet alone, the lead judges, and a failed rehearsal is retried once the runbook has been rewritten.
 */
export function createRehearsals(deps: RehearsalDeps) {
  const now = deps.now ?? Date.now;
  const { orders, book, store } = deps;

  async function start(order: Order): Promise<Rehearsal | null> {
    const company = book.company(order.companyId);
    if (!company) return null;
    const folder = deps.folderOf(order.companyId);
    const dir = join(deps.packetRoot, order.companyId, `${order.id.slice(0, 8)}-${now()}`);
    mkdirSync(dir, { recursive: true });
    for (const name of PACKET_FILES) if (existsSync(join(folder, name))) copyFileSync(join(folder, name), join(dir, name));
    writeFileSync(join(dir, "ORDER.md"), orderSheet(order, deps.truth));
    const botId = await deps.createBot({ name: `${company.name} · Stand-in`, instructions: STAND_IN_INSTRUCTIONS.replaceAll("{company}", company.name), section: `Cofactory · ${company.name}`, look: companySeatLook("operator", company.id) });
    const seated = book.seat({ botId, role: "operator", companyId: company.id });
    if (!seated.ok) return null;
    const rehearsal = orders.startRehearsal({ companyId: company.id, orderId: order.id, botId, dir });
    deps.observe.decide({ companyId: company.id, session: null, actor: "runtime", kind: "rehearsal.start", verdict: "allowed", reason: `stand-in ${botId.slice(0, 8)} serves order ${order.id.slice(0, 8)} from ${dir}`, evidence: [{ type: "company", id: company.id }] });
    const requested = await deps.sessions.request({
      companyId: company.id, botId, kind: "deep", trigger: "rehearsal",
      objective: `Serve order ${order.id.slice(0, 8)} again from the handoff packet alone, as a new operator would.`,
      doneWhen: `the finished work is in ${dir} and cofactory_deliver_order was called with rehearsal true and order_id ${order.id}`,
      context: `Handoff packet folder (work only here): ${dir}\nIt holds BRIEF.md, RUNBOOK.md, JOURNAL.md and ORDER.md.`,
    });
    if ("refused" in requested) {
      orders.rehearsalVerdict(rehearsal.id, false, `the stand-in's session could not start: ${requested.refused}`);
      book.unseat(botId);
    }
    return rehearsal;
  }

  const runbookChangedSince = (companyId: string, at: number) => {
    const file = join(deps.folderOf(companyId), "RUNBOOK.md");
    return existsSync(file) && statSync(file).mtimeMs > at;
  };

  return {
    /** One pass for every live company: overdue orders, rehearsals to start, retry, or fail when the stand-in gave up. */
    async upkeep(): Promise<void> {
      for (const company of book.companies().filter((candidate) => candidate.status === "live")) {
        const list = orders.list(company.id);
        const overdue = list.filter((order) => order.status === "open" && now() - order.openedAt > ORDER_OVERDUE_DAYS * DAY);
        if (overdue.length) store.raise(company.id, "order_overdue", `${overdue.length} paid order(s) open for more than ${ORDER_OVERDUE_DAYS} days: ${overdue.map((order) => order.id.slice(0, 8)).join(", ")}`);
        else store.resolve(company.id, "order_overdue");

        const rehearsals = orders.rehearsals(company.id);
        const last = rehearsals.at(-1);
        if (last?.status === "passed") { store.resolve(company.id, "rehearsal_failed"); continue; }
        if (last?.status === "pending" && !store.liveFor(last.botId)) {
          const ended = store.lastSessionOf(last.botId, company.id);
          if (ended && ended.status !== "running") {
            orders.rehearsalVerdict(last.id, false, `the stand-in ended without delivering (${ended.status}): ${ended.stopReason ?? ended.endRequested?.summary ?? "no reason given"}`);
            book.unseat(last.botId);
          }
          continue;
        }
        if (last && last.status !== "failed") continue;
        if (last) store.raise(company.id, "rehearsal_failed", `the stand-in's rehearsal failed: ${last.note ?? "no note"}; rewrite RUNBOOK.md and it runs again`);
        if (last && !runbookChangedSince(company.id, last.verdictAt ?? last.startedAt)) continue;
        const firstDelivered = list.find((order) => order.status === "delivered");
        if (firstDelivered) await start(firstDelivered);
      }
    },
  };
}

export type Rehearsals = ReturnType<typeof createRehearsals>;
