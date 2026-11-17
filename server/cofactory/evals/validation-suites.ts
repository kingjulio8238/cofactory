import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OPT_OUT_LINE } from "../../../shared/cofactory/validation.ts";
import { openTruth } from "../truth/store.ts";
import { stripeEventToInput, verifyStripeSignature } from "../validation/intake.ts";
import { createOutreach, giveawayProblem } from "../validation/outreach.ts";
import { openSprints } from "../validation/sprints.ts";
import type { Suite } from "./harness.ts";
import { fixtureFetcher } from "./suites.ts";

const DAY = 24 * 60 * 60_000;

/**
 * The outreach gate: every case a send must be refused in is refused, every allowed send carries the opt-out on first
 * contact, and payments only count when Stripe signed them. A contact that should have been refused is never allowed.
 */
export function outreachGateSuite(): Suite {
  return {
    name: "outreach-gate",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-outreach-"));
      let at = Date.UTC(2026, 10, 18, 9);
      const now = () => at;
      const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
      const sprints = openSprints(join(dir, "sprints.db"), { truth, now, policy: { touchesPerDay: 3, touchesPerSprint: 5 } });
      const sent: Array<{ to: string; text: string }> = [];
      const cursors = new Map<string, number>();
      const outreach = createOutreach({
        sprints, truth, mailboxFor: () => "hello@company.test", postalAddressFor: () => "100 Main St, Columbus, OH 43215", offerProblem: async () => null, cursor: { get: (name) => cursors.get(name) ?? 0, set: (name, value) => cursors.set(name, value) },
        mail: { send: async (_box, input) => { sent.push(input); return { messageId: `<m${sent.length}@x>`, rejected: [] }; }, fetchNew: async () => [] },
      });
      const noPostal = createOutreach({ sprints, truth, mailboxFor: () => "hello@company.test", postalAddressFor: () => null, offerProblem: async () => null, cursor: { get: () => 0, set: () => {} }, mail: { send: async () => { throw new Error("must not send"); }, fetchNew: async () => [] } });
      const failures: string[] = [];
      let correct = 0, total = 0, falseAllowed = 0;
      const expect = (name: string, allowed: boolean, shouldAllow: boolean) => {
        total++;
        if (allowed === shouldAllow) correct++;
        else failures.push(`${name}: expected ${shouldAllow ? "allowed" : "refused"}`);
        if (allowed && !shouldAllow) falseAllowed++;
      };
      try {
        const started = sprints.start({ companyId: "c1" });
        if (!started.ok) throw new Error(started.reason);
        const id = started.sprint.id;
        const add = (n: number, address = `owner${n}@riverside.test`) => sprints.addTarget(id, { name: `R${n}`, address, channel: "email", sourceUrl: `https://buyers-site.test/contact-${n}` });
        const targets: Array<{ id: string }> = [];
        for (const n of [1, 2, 3, 4]) { const added = await add(n); expect(`list buyer ${n}`, added.ok, true); if (added.ok) targets.push(added.target); }
        expect("guessed address", (await add(5, "ceo@riverside.test")).ok, false);
        expect("unverifiable page", (await sprints.addTarget(id, { name: "Spa", address: "x@spa.test", channel: "email", sourceUrl: "https://fixtures.cofactory.test/spa" })).ok, false);
        sprints.suppress("owner4@riverside.test", "unsubscribe");
        const send = async (index: number) => (await outreach.send(id, targets[index]!.id, { subject: "Hello", text: "A short note about reconciliation." })).ok;
        const offline = createOutreach({ sprints, truth, mailboxFor: () => "hello@company.test", postalAddressFor: () => "100 Main St, Columbus, OH 43215", offerProblem: async () => "unreachable", cursor: { get: () => 0, set: () => {} }, mail: { send: async () => { throw new Error("must not send"); }, fetchNew: async () => [] } });
        expect("first contact while the offer page does not load", (await offline.send(id, targets[0]!.id, { subject: "Hello", text: "A short note about reconciliation." })).ok, false);
        at += 5 * DAY;
        expect("week not started before the first contact", sprints.sprint(id)!.endsAt === started.sprint.endsAt, true);
        expect("no postal address on record", (await noPostal.send(id, targets[0]!.id, { subject: "Hello", text: "A short note about reconciliation." })).ok, false);
        expect("a free first month", (await outreach.send(id, targets[0]!.id, { subject: "Free trial: we reconcile your payouts", text: "Send your export and we reconcile it, free for the first month." })).ok, false);
        expect("the first report on us", (await outreach.send(id, targets[0]!.id, { subject: "Reconciliation", text: "Your first report is on us, then $45 a month." })).ok, false);
        expect("first contact", await send(0), true);
        expect("opt-out on first contact", sent.at(-1)!.text.includes(OPT_OUT_LINE), true);
        expect("a money-back guarantee is not a giveaway", giveawayProblem("$45 a month, money back if the first report is not right") === null, true);
        expect("a free consultation call is not the order", giveawayProblem("Happy to answer questions on a free 10-minute call") === null, true);
        expect("postal address on every email", sent.at(-1)!.text.endsWith("--\n100 Main St, Columbus, OH 43215"), true);
        expect("second contact too soon", await send(0), false);
        expect("suppressed buyer", await send(3), false);
        expect("the week starts at the first contact", sprints.sprint(id)!.endsAt === at + 7 * DAY, true);
        expect("second buyer", await send(1), true);
        expect("third buyer", await send(2), true);
        expect("daily cap", (await outreach.send(id, targets[0]!.id, { subject: "x", text: "a follow up note here" })).ok, false);
        at += 3 * DAY + 1;
        expect("follow-up after the gap", await send(0), true);
        expect("no opt-out on follow-up", !sent.at(-1)!.text.includes(OPT_OUT_LINE), true);
        expect("postal address on a follow-up", sent.at(-1)!.text.endsWith("--\n100 Main St, Columbus, OH 43215"), true);
        expect("sprint cap", (await send(1)) && (await send(2)), false);
        at += 8 * DAY;
        expect("after the time box", await send(1), false);
        const payload = JSON.stringify({ type: "checkout.session.completed", livemode: true, created: at / 1000, data: { object: { id: "cs", payment_intent: "pi", payment_status: "paid", amount_total: 100 } } });
        const t = Math.floor(at / 1000);
        expect("forged Stripe signature", verifyStripeSignature(payload, `t=${t},v1=${createHmac("sha256", "bad").update(`${t}.${payload}`).digest("hex")}`, "good", at).ok, false);
        expect("signed Stripe delivery", verifyStripeSignature(payload, `t=${t},v1=${createHmac("sha256", "good").update(`${t}.${payload}`).digest("hex")}`, "good", at).ok, true);
        expect("test-mode payment marked", stripeEventToInput({ ...JSON.parse(payload), livemode: false }, "c1")?.testMode === true, true);
        return { name: "outreach-gate", pass: correct === total && falseAllowed === 0, metrics: { accuracy: correct / total, false_allowed: falseAllowed, cases: total }, failures };
      } finally {
        sprints.close();
        truth.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}



/**
 * The first-dollar gate: an order counts as delivered only with the work inside the company folder and a runbook written
 * for it, and the gate is reached only when a payment, a delivery and a passed stand-in rehearsal all stand.
 */
export function firstDollarSuite(): Suite {
  return {
    name: "first-dollar-gate",
    async run() {
      const { openOrders, fileInside, runbookProblem } = await import("../validation/orders.ts");
      const { writeFileSync, utimesSync, mkdirSync, symlinkSync } = await import("node:fs");
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-orders-"));
      const folder = join(dir, "company");
      mkdirSync(folder);
      let at = Date.UTC(2026, 10, 18, 9);
      const orders = openOrders(join(dir, "orders.db"), { now: () => at });
      const failures: string[] = [];
      let correct = 0, total = 0, falsePass = 0;
      const expect = (name: string, passed: boolean, shouldPass: boolean) => {
        total++;
        if (passed === shouldPass) correct++;
        else failures.push(`${name}: expected ${shouldPass ? "pass" : "refusal"}`);
        if (passed && !shouldPass) falsePass++;
      };
      try {
        const order = orders.open({ companyId: "c", eventId: "e1", externalId: "pi_1", customer: "a@b.test", amountCents: 100 });
        expect("reopening the same payment is one order", orders.open({ companyId: "c", eventId: "e1", externalId: "pi_1", customer: "a@b.test", amountCents: 100 }).id === order.id, true);
        expect("missing deliverable", fileInside(folder, "report.md").ok, false);
        writeFileSync(join(folder, "report.md"), "work");
        writeFileSync(join(dir, "secret.md"), "outside");
        symlinkSync(join(dir, "secret.md"), join(folder, "link.md"));
        expect("absolute path", fileInside(folder, join(folder, "report.md")).ok, false);
        expect("path escaping the folder", fileInside(folder, "../secret.md").ok, false);
        expect("link escaping the folder", fileInside(folder, "link.md").ok, false);
        expect("deliverable in the folder", fileInside(folder, "report.md").ok, true);
        expect("no runbook", runbookProblem(folder, order.openedAt) === null, false);
        writeFileSync(join(folder, "RUNBOOK.md"), "too short");
        utimesSync(join(folder, "RUNBOOK.md"), new Date(at + 1_000), new Date(at + 1_000));
        expect("thin runbook", runbookProblem(folder, order.openedAt) === null, false);
        writeFileSync(join(folder, "RUNBOOK.md"), "step ".repeat(100));
        utimesSync(join(folder, "RUNBOOK.md"), new Date(at - 60_000), new Date(at - 60_000));
        expect("runbook not updated for this order", runbookProblem(folder, order.openedAt) === null, false);
        utimesSync(join(folder, "RUNBOOK.md"), new Date(at + 1_000), new Date(at + 1_000));
        expect("runbook written for this order", runbookProblem(folder, order.openedAt) === null, true);
        expect("paid only", orders.firstDollar("c").reached, false);
        orders.deliver(order.id, { by: "builder", summary: "done", deliverable: "report.md" });
        expect("delivered twice", orders.deliver(order.id, { by: "builder", summary: "again", deliverable: "report.md" }) !== null, false);
        expect("delivered without rehearsal", orders.firstDollar("c").reached, false);
        const failed = orders.startRehearsal({ companyId: "c", orderId: order.id, botId: "s1", dir });
        orders.rehearsalVerdict(failed.id, false, "missed a step");
        expect("failed rehearsal", orders.firstDollar("c").reached, false);
        at += 1_000;
        const passed = orders.startRehearsal({ companyId: "c", orderId: order.id, botId: "s2", dir });
        orders.rehearsalDelivered(passed.id, "out.md");
        expect("rehearsal delivered but not judged", orders.firstDollar("c").reached, false);
        orders.rehearsalVerdict(passed.id, true, "same work");
        expect("paid, delivered and rehearsed", orders.firstDollar("c").reached, true);
        orders.refund("pi_1");
        expect("refunded order", orders.firstDollar("c").reached, false);
        return { name: "first-dollar-gate", pass: correct === total && falsePass === 0, metrics: { accuracy: correct / total, false_pass: falsePass, cases: total }, failures };
      } finally {
        orders.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
export const VALIDATION_SUITES: readonly Suite[] = [outreachGateSuite(), firstDollarSuite()];
