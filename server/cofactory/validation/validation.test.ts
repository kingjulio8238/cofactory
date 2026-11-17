import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { OPT_OUT_LINE } from "../../../shared/cofactory/validation.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { openTruth } from "../truth/store.ts";
import { createOutreach, type MailPort } from "./outreach.ts";
import { openSprints } from "./sprints.ts";

const DAY = 24 * 60 * 60_000;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

function rig(policy = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-validation-"));
  let at = Date.UTC(2026, 10, 18, 9);
  const now = () => at;
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
  const sprints = openSprints(join(dir, "sprints.db"), { truth, now, policy });
  const sent: Array<{ to: string; subject: string; text: string; headers: Record<string, string> }> = [];
  const inbox: Awaited<ReturnType<MailPort["fetchNew"]>> = [];
  const cursors = new Map<string, number>();
  const mail: MailPort = {
    send: async (_mailbox, input) => { sent.push(input); return { messageId: `<m${sent.length}@company.test>`, rejected: [] }; },
    fetchNew: async (_mailbox, after) => inbox.filter((message) => message.uid > after),
  };
  const outreach = createOutreach({ sprints, truth, mail, mailboxFor: () => "hello@company.test", postalAddressFor: () => "100 Main St, Columbus, OH 43215", offerProblem: async () => null, armed: () => true, cursor: { get: (name) => cursors.get(name) ?? 0, set: (name, value) => cursors.set(name, value) } });
  cleanups.push(() => { sprints.close(); truth.close(); rmSync(dir, { recursive: true, force: true }); });
  const started = sprints.start({ companyId: "c1" });
  if (!started.ok) throw new Error(started.reason);
  const add = (n: number) => sprints.addTarget(started.sprint.id, { name: `Riverside ${n}`, address: `owner${n}@riverside.test`, channel: "email", sourceUrl: `https://buyers-site.test/contact-${n}` });
  return { truth, sprints, outreach, sent, inbox, sprint: started.sprint, add, tick: (ms: number) => { at += ms; }, now };
}

describe("cofactory validation sprints", () => {
  it("lists only buyers whose contact route is public on a page, and never a suppressed one", async () => {
    const r = rig();
    expect(await r.add(1)).toMatchObject({ ok: true, target: { address: "owner1@riverside.test" } });
    expect(await r.sprints.addTarget(r.sprint.id, { name: "Guess", address: "ceo@riverside.test", channel: "email", sourceUrl: "https://buyers-site.test/contact-2" })).toMatchObject({ ok: false, reason: expect.stringContaining("not public") });
    expect(await r.add(1)).toMatchObject({ ok: false, reason: expect.stringContaining("already") });
    r.sprints.suppress("Owner3@Riverside.test", "unsubscribe");
    expect(await r.add(3)).toMatchObject({ ok: false, reason: expect.stringContaining("suppressed") });
  });

  it("sends through the gate with the opt-out line and unsubscribe header on first contact only, inside every cap", async () => {
    const r = rig({ touchesPerDay: 2, touchesPerTarget: 2, daysBetweenTouches: 3 });
    const one = await r.add(1), two = await r.add(2), three = await r.add(4);
    if (!one.ok || !two.ok || !three.ok) throw new Error("targets");
    expect(await r.outreach.send(r.sprint.id, one.target.id, { subject: "Monthly DIR reconciliation", text: "Hi Dana" })).toMatchObject({ ok: true });
    expect(r.sent[0]!.text).toBe(`Hi Dana\n\n${OPT_OUT_LINE}\n\n--\n100 Main St, Columbus, OH 43215`);
    expect(r.sent[0]!.headers["List-Unsubscribe"]).toBe("<mailto:hello@company.test?subject=unsubscribe>");
    expect(await r.outreach.send(r.sprint.id, one.target.id, { subject: "Following up", text: "Hi again" })).toMatchObject({ ok: false, reason: expect.stringContaining("less than 3 days") });
    expect(await r.outreach.send(r.sprint.id, two.target.id, { subject: "Monthly DIR reconciliation", text: "Hi" })).toMatchObject({ ok: true });
    expect(await r.outreach.send(r.sprint.id, three.target.id, { subject: "Monthly DIR reconciliation", text: "Hi" })).toMatchObject({ ok: false, reason: expect.stringContaining("24 hours") });
    r.tick(3 * DAY + 1);
    expect(await r.outreach.send(r.sprint.id, one.target.id, { subject: "Following up", text: "Hi again" })).toMatchObject({ ok: true });
    expect(r.sent.at(-1)!.text.includes(OPT_OUT_LINE)).toBe(false);
    r.tick(3 * DAY + 1);
    expect(await r.outreach.send(r.sprint.id, one.target.id, { subject: "Third", text: "x" })).toMatchObject({ ok: false, reason: expect.stringContaining("no more") });
    expect(r.sprints.touches(r.sprint.id).every((touch) => touch.messageRef)).toBe(true);
  });

  it("turns replies into evidence, honours stop and bounces for good, and passes the sprint on three urgent buyers", async () => {
    const r = rig();
    const targets = await Promise.all([1, 2, 4, 5].map((n) => r.add(n)));
    for (const target of targets) if (target.ok) await r.outreach.send(r.sprint.id, target.target.id, { subject: "Monthly DIR reconciliation", text: "Hi" });
    r.inbox.push(
      { uid: 1, messageId: "<r1@x>", inReplyTo: "<m1@company.test>", from: "Dana <owner1@riverside.test>", subject: "Re: Monthly DIR reconciliation", text: "How much for our three stores?", date: r.now() },
      { uid: 2, messageId: "<r2@x>", inReplyTo: "<m2@company.test>", from: "owner2@riverside.test", subject: "Re: Monthly DIR reconciliation", text: "Please stop emailing me.", date: r.now() },
      { uid: 3, messageId: "<r3@x>", inReplyTo: "<m3@company.test>", from: "MAILER-DAEMON@mx.test", subject: "Undelivered Mail Returned to Sender", text: "user unknown", date: r.now() },
    );
    expect(await r.outreach.poll("c1")).toEqual({ recorded: 2, suppressed: 2 });
    expect(r.sprints.suppressed("owner2@riverside.test")).toMatchObject({ reason: "unsubscribe" });
    expect(r.sprints.suppressed("owner4@riverside.test")).toMatchObject({ reason: "bounce" });
    expect(await r.outreach.poll("c1")).toEqual({ recorded: 0, suppressed: 0 });
    expect(r.sprints.settle(r.sprint.id)).toMatchObject({ status: "running" });
    r.inbox.push(
      { uid: 4, messageId: "<r4@x>", inReplyTo: "<m4@company.test>", from: "owner5@riverside.test", subject: "Re: x", text: "Can we book a call this week?", date: r.now() },
      { uid: 5, messageId: "<r5@x>", inReplyTo: null, from: "owner9@elsewhere.test", subject: "Saw your page", text: "Send me an invoice for two stores.", date: r.now() },
    );
    await r.outreach.poll("c1");
    expect(r.sprints.settle(r.sprint.id)).toMatchObject({ status: "passed", outcome: expect.stringContaining("urgent from 3 buyers") });
  });

  it("passes on one real payment and fails when the week runs out with no answer", async () => {
    const r = rig();
    r.truth.recordEvent({ source: "stripe", externalId: "pi_test", companyId: "c1", kind: "payment", occurredAt: r.now(), amountCents: 9_900, payerEmail: "a@b.test", testMode: true });
    expect(r.sprints.settle(r.sprint.id)).toMatchObject({ status: "running" });
    r.truth.recordEvent({ source: "stripe", externalId: "pi_live", companyId: "c1", kind: "payment", occurredAt: r.now(), amountCents: 9_900, payerEmail: "a@b.test" });
    expect(r.sprints.settle(r.sprint.id)).toMatchObject({ status: "passed", outcome: expect.stringContaining("committed") });

    const quiet = rig();
    quiet.tick(8 * DAY);
    expect(quiet.sprints.settle(quiet.sprint.id)).toMatchObject({ status: "failed", outcome: expect.stringContaining("time box over") });
    expect(quiet.sprints.start({ companyId: "c1" })).toMatchObject({ ok: true });
  });
});
