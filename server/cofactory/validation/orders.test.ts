import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Membership } from "../../../shared/cofactory/types.ts";
import { openBook } from "../book.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { createObserver } from "../observe/observer.ts";
import { openObserveStore } from "../observe/store.ts";
import { createSessions, type TurnPort } from "../runtime/sessions.ts";
import { openRuntimeStore } from "../runtime/store.ts";
import { createWorkspaces } from "../runtime/workspace.ts";
import { runTool } from "../tools.ts";
import { openTruth } from "../truth/store.ts";
import { openOrders } from "./orders.ts";
import { createOutreach } from "./outreach.ts";
import { openRails } from "./rails.ts";
import { createRehearsals } from "./rehearsal.ts";
import { openSprints } from "./sprints.ts";

const DAY = 24 * 60 * 60_000;
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const done of cleanups.splice(0).reverse()) await done(); });

const RUNBOOK = `# Runbook\n\n1. Download the customer's remittance CSVs from the PBM portal they name in their reply.\n2. Match each claim line to the DIR fee line by Rx number and fill date.\n3. Flag every fee above the contracted rate and total them per PBM.\n4. Write the monthly report (report.md) with totals, flagged lines and the appeal deadline for each.\n5. Email it to the customer with cofactory_message_customer and record the delivery.\n`;

async function rig() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-orders-"));
  let at = Date.UTC(2026, 10, 18, 9);
  const now = () => at;
  const book = openBook(join(dir, "cofactory.db"), { now });
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
  const store = openRuntimeStore(join(dir, "runtime.db"), now);
  const observeStore = openObserveStore(join(dir, "observe.db"));
  const observe = createObserver({ store: observeStore, book });
  const workspaces = createWorkspaces(join(dir, "companies"), { git: false });
  const starts: Array<{ botId: string; prompt: string; onSettled: (result: { ok: boolean; text: string }) => void }> = [];
  let threads = 0;
  const turns: TurnPort = { threadFor: (botId) => `t-${botId}-${++threads}`, start: async (botId, _thread, prompt, onSettled) => { starts.push({ botId, prompt, onSettled }); }, interrupt: async () => {} };
  const sessions = createSessions({ store, book, workspaces, turns, now, defer: (work) => { work(); } });
  const sprints = openSprints(join(dir, "sprints.db"), { truth, now });
  const orders = openOrders(join(dir, "orders.db"), { now });
  const sent: Array<{ to: string; subject: string }> = [];
  const outreach = createOutreach({ sprints, truth, mailboxFor: () => "hello@company.test", cursor: sprints.cursor, mail: { send: async (_box, input) => { sent.push(input); return { messageId: `<m${sent.length}@x>`, rejected: [] }; }, fetchNew: async () => [] } });
  const rails = openRails(join(dir, "rails.json"));
  cleanups.push(async () => { await sessions.drain(); orders.close(); sprints.close(); store.close(); observeStore.close(); truth.close(); book.close(); rmSync(dir, { recursive: true, force: true }); });

  book.deposit(20_000, "owner");
  const launched = book.launch({ name: "DIR Recon", brief: "Monthly DIR-fee reconciliation for independent pharmacies", capCents: 4_000 }, "owner");
  if (!launched.ok) throw new Error(launched.reason);
  const companyId = launched.company.id;
  const folder = await workspaces.ensure(companyId, "# DIR Recon\n");
  const seats = { builder: { botId: "builder-1", role: "builder", companyId }, lead: { botId: "lead-1", role: "lead", companyId: null } } satisfies Record<string, Membership>;
  for (const seat of Object.values(seats)) book.seat(seat);
  const validation = { sprints, outreach, rails, orders, folderOf: (id: string) => workspaces.dirOf(id), saveOffer: () => "" };
  const tool = (seat: Membership, name: string, args: unknown = {}) => runTool({ book, truth, seat, actor: `${seat.role}:${seat.botId}`, observe, sessions, session: store.liveFor(seat.botId), now, validation }, name, args);
  let bots = 0;
  const rehearsals = createRehearsals({ orders, book, truth, store, sessions, observe, folderOf: validation.folderOf, packetRoot: join(dir, "rehearsals"), createBot: async () => `stand-in-${++bots}`, now });

  truth.recordEvent({ source: "mailbox", externalId: "<r1@x>", companyId, kind: "reply", occurredAt: at, payerEmail: "owner@riverside-rx.test", text: "Please reconcile October for our two stores; the CSVs are attached in the portal." });
  const payment = truth.recordEvent({ source: "stripe", externalId: "pi_1", companyId, kind: "payment", occurredAt: at, payerEmail: "owner@riverside-rx.test", amountCents: 29_900 }).event;
  const order = orders.open({ companyId, eventId: payment.id, externalId: "pi_1", customer: "Owner@Riverside-Rx.test", amountCents: 29_900 });
  const writeRunbook = (text: string) => { const file = join(folder, "RUNBOOK.md"); writeFileSync(file, text); utimesSync(file, new Date(at + 1_000), new Date(at + 1_000)); };
  return { book, store, observeStore, orders, sent, folder, seats, tool, rehearsals, starts, order, companyId, writeRunbook, tick: (ms: number) => { at += ms; }, now };
}

describe("cofactory orders and the bus-factor rehearsal", () => {
  it("delivers an order only with the work in the company folder and a runbook written for it", async () => {
    const r = await rig();
    const deliver = (deliverable: string) => r.tool(r.seats.builder, "cofactory_deliver_order", { order_id: r.order.id, summary: "October reconciliation for both stores, emailed as report.md", deliverable });
    expect(await deliver("report.md")).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("does not exist") }] });
    writeFileSync(join(r.folder, "report.md"), "# October\nTotals per PBM...");
    expect(await deliver("../../etc/passwd")).toMatchObject({ isError: true });
    expect(await deliver("report.md")).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("RUNBOOK.md") }] });
    r.writeRunbook("# Runbook\nDo the thing.");
    expect(await deliver("report.md")).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("too short") }] });
    r.writeRunbook(RUNBOOK);
    const delivered = await deliver("report.md");
    expect(delivered.structuredContent).toMatchObject({ order: { status: "delivered", deliverable: "report.md" }, firstDollar: { paid: true, delivered: true, rehearsed: false, reached: false } });
    expect(await deliver("report.md")).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("delivered") }] });
    const decisions = r.observeStore.decisions().filter((decision) => decision.kind === "order.deliver");
    expect(decisions.map((decision) => decision.verdict)).toEqual(["refused", "refused", "refused", "refused", "allowed"]);
    expect(decisions.at(-1)!.evidence[0]).toMatchObject({ type: "external_event", evidenceClass: "committed" });
  });

  it("mails only customers who have an order", async () => {
    const r = await rig();
    expect(await r.tool(r.seats.builder, "cofactory_message_customer", { to: "stranger@elsewhere.test", subject: "Hello", text: "A note about our service." })).toMatchObject({ isError: true });
    expect(await r.tool(r.seats.builder, "cofactory_message_customer", { to: "owner@riverside-rx.test", subject: "Your October report", text: "Attached is your October reconciliation." })).toMatchObject({ structuredContent: { sent: true } });
    expect(r.sent.map((mail) => mail.to)).toEqual(["owner@riverside-rx.test"]);
  });

  it("runs a stand-in from the packet alone, retries after the runbook is rewritten, and reaches the first dollar on a pass", async () => {
    const r = await rig();
    writeFileSync(join(r.folder, "report.md"), "# October\nTotals per PBM...");
    r.writeRunbook(RUNBOOK);
    await r.tool(r.seats.builder, "cofactory_deliver_order", { order_id: r.order.id, summary: "October reconciliation for both stores", deliverable: "report.md" });

    await r.rehearsals.upkeep();
    const first = r.orders.rehearsals(r.companyId)[0]!;
    expect(first).toMatchObject({ status: "pending", botId: "stand-in-1" });
    expect(r.book.membership("stand-in-1")).toMatchObject({ role: "operator", companyId: r.companyId });
    expect(readFileSync(join(first.dir, "ORDER.md"), "utf8")).toContain("Please reconcile October for our two stores");
    expect(existsSync(join(first.dir, "RUNBOOK.md"))).toBe(true);
    expect(existsSync(join(first.dir, "report.md"))).toBe(false);
    const prompt = r.starts.at(-1)!;
    expect(prompt.botId).toBe("stand-in-1");
    expect(prompt.prompt).toContain(`Handoff packet folder (work only here): ${first.dir}`);
    expect(prompt.prompt).not.toContain("Company folder");
    await r.rehearsals.upkeep();
    expect(r.orders.rehearsals(r.companyId)).toHaveLength(1);

    const standIn: Membership = { botId: "stand-in-1", role: "operator", companyId: r.companyId };
    const rehearse = (deliverable: string) => r.tool(standIn, "cofactory_deliver_order", { order_id: r.order.id, summary: "Reconciled October from the remits", deliverable, rehearsal: true });
    expect(await rehearse("report.md")).toMatchObject({ isError: true });
    expect(await r.tool(standIn, "cofactory_deliver_order", { order_id: r.order.id, summary: "Reconciled October from the remits", deliverable: "report.md" })).toMatchObject({ isError: true });
    writeFileSync(join(first.dir, "report.md"), "# October (stand-in)\nTotals per PBM...");
    expect(await rehearse("report.md")).toMatchObject({ structuredContent: { next: "the factory lead judges it" } });
    expect(r.book.inbox("lead", null).at(-1)!.brief.known).toContain(join(first.dir, "report.md"));

    r.tick(DAY);
    expect(await r.tool(r.seats.lead, "cofactory_rehearsal_verdict", { company_id: r.companyId, passed: false, note: "The stand-in missed the appeal deadlines: step 4 does not say where they come from." })).toMatchObject({ structuredContent: { passed: false } });
    expect(r.book.membership("stand-in-1")).toBeNull();
    await r.rehearsals.upkeep();
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).toContain("rehearsal_failed");
    expect(r.orders.rehearsals(r.companyId)).toHaveLength(1);

    r.writeRunbook(`${RUNBOOK}6. Appeal deadlines are on page 2 of each PBM's provider manual; add 30 days to the remit date.\n`);
    await r.rehearsals.upkeep();
    const second = r.orders.rehearsals(r.companyId)[1]!;
    expect(second).toMatchObject({ status: "pending", botId: "stand-in-2" });
    mkdirSync(join(second.dir, "out"));
    writeFileSync(join(second.dir, "out", "report.md"), "# October (stand-in 2)\nTotals and deadlines...");
    await r.tool({ botId: "stand-in-2", role: "operator", companyId: r.companyId }, "cofactory_deliver_order", { order_id: r.order.id, summary: "Reconciled October with deadlines", deliverable: "out/report.md", rehearsal: true });
    const passed = await r.tool(r.seats.lead, "cofactory_rehearsal_verdict", { company_id: r.companyId, passed: true, note: "Same totals, same flagged lines, deadlines now present; the customer would accept it." });
    expect(passed.structuredContent).toMatchObject({ firstDollar: { reached: true } });
    await r.rehearsals.upkeep();
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).not.toContain("rehearsal_failed");
  });

  it("fails a rehearsal whose stand-in gave up, and alarms on an order left open", async () => {
    const r = await rig();
    r.tick(4 * DAY);
    await r.rehearsals.upkeep();
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).toContain("order_overdue");
    writeFileSync(join(r.folder, "report.md"), "# October");
    r.writeRunbook(RUNBOOK);
    await r.tool(r.seats.builder, "cofactory_deliver_order", { order_id: r.order.id, summary: "October reconciliation for both stores", deliverable: "report.md" });
    await r.rehearsals.upkeep();
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).not.toContain("order_overdue");
    const standIn: Membership = { botId: "stand-in-1", role: "operator", companyId: r.companyId };
    await r.tool(standIn, "cofactory_journal", { did: "read the packet", blockers: "the runbook never says which PBM portal" });
    await r.tool(standIn, "cofactory_end_session", { outcome: "blocked", summary: "the runbook never says which PBM portal to log into" });
    r.starts.at(-1)!.onSettled({ ok: true, text: "" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await r.rehearsals.upkeep();
    expect(r.orders.rehearsals(r.companyId)[0]).toMatchObject({ status: "failed", note: expect.stringContaining("which PBM portal") });
    expect(r.book.membership("stand-in-1")).toBeNull();
  });
});
