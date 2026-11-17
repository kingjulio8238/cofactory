import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_RUNTIME_POLICY, type RuntimePolicy } from "../../../shared/cofactory/runtime.ts";
import type { Membership } from "../../../shared/cofactory/types.ts";
import { openBook } from "../book.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { runTool } from "../tools.ts";
import { openTruth } from "../truth/store.ts";
import { checkAlarms } from "./alarms.ts";
import { createLauncher } from "./launcher.ts";
import { createScheduler } from "./scheduler.ts";
import { createSessions, type TurnPort } from "./sessions.ts";
import { openRuntimeStore } from "./store.ts";
import { createWorkspaces } from "./workspace.ts";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const done of cleanups.splice(0).reverse()) await done(); });

type Start = { botId: string; threadId: string; prompt: string; onSettled: (result: { ok: boolean; text: string }) => void };

/** A factory with a fake dusk: turns are recorded and settled by the test, on a clock the test moves. */
function rig(policy: Partial<RuntimePolicy> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-runtime-"));
  let at = Date.UTC(2026, 10, 18, 9);
  const now = () => at;
  const book = openBook(join(dir, "cofactory.db"), { now, policy: { maxLiveCompanies: 3 } });
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
  const workspaces = createWorkspaces(join(dir, "companies"));
  const starts: Start[] = [];
  const interrupted: string[] = [];
  let busyStarts = 0;
  let threads = 0;
  const turns: TurnPort = {
    threadFor: (botId) => `thread-${botId}-${++threads}`,
    start: async (botId, threadId, prompt, onSettled) => {
      if (busyStarts > 0) { busyStarts--; throw new Error("this thread is already working: interrupt it first"); }
      starts.push({ botId, threadId, prompt, onSettled });
    },
    interrupt: async (_botId, threadId) => { interrupted.push(threadId); },
  };
  const open = () => {
    const store = openRuntimeStore(join(dir, "runtime.db"), now);
    const sessions = createSessions({ store, book, workspaces, turns, now, policy, defer: (work) => { work(); } });
    const scheduler = createScheduler({ book, truth, store, sessions, now });
    return { store, sessions, scheduler };
  };
  let parts = open();
  cleanups.push(async () => { await parts.sessions.drain(); parts.store.close(); book.close(); truth.close(); rmSync(dir, { recursive: true, force: true }); });
  book.deposit(20_000, "owner");
  const launched = book.launch({ name: "DIR Recon", brief: "Monthly DIR-fee reconciliation for independent pharmacies", capCents: 4_000 }, "owner");
  if (!launched.ok) throw new Error(launched.reason);
  const companyId = launched.company.id;
  const ceo: Membership = { botId: "ceo-1", role: "ceo", companyId };
  const builder: Membership = { botId: "builder-1", role: "builder", companyId };
  const lead: Membership = { botId: "lead-1", role: "lead", companyId: null };
  for (const seat of [ceo, builder, lead]) book.seat(seat);
  const tool = (seat: Membership, name: string, args: unknown = {}) =>
    runTool({ book, truth, seat, actor: `${seat.role}:bot`, sessions: parts.sessions, now }, name, args);
  /** The last turn started settles after `took` ms, having first done `work` as the seat. */
  const settle = async (work: (() => Promise<unknown>) | null, took = 5 * MIN) => {
    const turn = starts.at(-1)!;
    at += took;
    await work?.();
    turn.onSettled({ ok: true, text: "turn over" });
    await parts.sessions.drain();
  };
  const finishWork = (seat: Membership) => async () => {
    await tool(seat, "cofactory_journal", { did: "checked the offer page", learned: "form posts work", next: "message 20 pharmacies" });
    await tool(seat, "cofactory_end_session", { outcome: "done", summary: "offer page checked" });
  };
  return {
    dir, book, truth, workspaces, starts, interrupted, companyId, ceo, builder, lead, tool, settle, finishWork,
    get store() { return parts.store; }, get sessions() { return parts.sessions; }, get scheduler() { return parts.scheduler; },
    tick: (ms: number) => { at += ms; },
    busy: (times: number) => { busyStarts = times; },
    now,
    restart: async () => { await parts.sessions.drain(); parts.store.close(); parts = open(); },
  };
}

const request = (r: ReturnType<typeof rig>, seat: Membership = r.ceo, kind: "operating" | "deep" = "operating") =>
  r.sessions.request({ companyId: seat.companyId, botId: seat.botId, kind, trigger: "test", objective: "Get the offer live", doneWhen: "the offer page loads for a stranger" });

describe("cofactory sessions", () => {
  it("starts with the full envelope: objective, brief, journal and how to end", async () => {
    const r = rig();
    const started = await request(r);
    expect(started).toMatchObject({ started: true, session: { status: "running", rounds: 1, role: "ceo" } });
    const prompt = r.starts[0]!.prompt;
    expect(prompt).toContain("Objective: Get the offer live");
    expect(prompt).toContain("Monthly DIR-fee reconciliation");
    expect(prompt).toContain("Journal, most recent last:\n(empty: this is the first session)");
    expect(prompt).toContain("cofactory_end_session");
    expect((await request(r))).toMatchObject({ started: false });
    expect(r.starts).toHaveLength(1);
  });

  it("re-enters a seat that stops early, and ends only after a journal entry", async () => {
    const r = rig();
    const started = await request(r);
    if ("refused" in started) throw new Error(started.refused);
    await r.settle(null);
    expect(r.starts).toHaveLength(2);
    expect(r.starts[1]!.prompt).toMatch(/continues: about 40 minutes of its budget remain/);
    expect(await r.tool(r.ceo, "cofactory_end_session", { outcome: "done", summary: "x" })).toMatchObject({ isError: true });
    await r.settle(r.finishWork(r.ceo));
    const session = r.store.session(started.session.id)!;
    expect(session).toMatchObject({ status: "completed", rounds: 2, stopReason: "offer page checked" });
    expect(r.starts).toHaveLength(2);
    expect(readFileSync(join(r.workspaces.dirOf(r.companyId), "JOURNAL.md"), "utf8")).toContain("- Did: checked the offer page");
    const log = execFileSync("git", ["log", "--format=%s"], { cwd: r.workspaces.dirOf(r.companyId), encoding: "utf8" });
    expect(log.split("\n")[0]).toMatch(/^session [0-9a-f]{8} ceo completed$/);
  });

  it("tries a round again while its conversation is still winding down, and gives up after the retries", async () => {
    const r = rig();
    const started = await request(r);
    if ("refused" in started) throw new Error(started.refused);
    r.busy(2);
    await r.settle(null);
    expect(r.starts).toHaveLength(2);
    expect(r.store.session(started.session.id)).toMatchObject({ status: "running", rounds: 2 });
    expect(r.store.sessionEvents(started.session.id).filter((event) => event.type === "start_retry")).toHaveLength(2);
    r.busy(99);
    await r.settle(null);
    expect(r.store.session(started.session.id)).toMatchObject({ status: "interrupted", stopReason: "the turn could not start: this thread is already working: interrupt it first" });
  });

  it("stops a seat that only acknowledges, and records that it never journaled", async () => {
    const r = rig();
    const started = await request(r);
    if ("refused" in started) throw new Error(started.refused);
    for (let round = 0; round < 5; round++) await r.settle(null, 20_000);
    expect(r.store.session(started.session.id)).toMatchObject({ status: "short_rounds", rounds: 5 });
    expect(r.store.journal(r.companyId).at(-1)).toMatchObject({ role: "runtime" });
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).toEqual(["unjournaled"]);
  });

  it("ends a session at its time budget and at its model budget", async () => {
    const r = rig();
    const timed = await request(r);
    if ("refused" in timed) throw new Error(timed.refused);
    await r.settle(null, 44 * MIN);
    expect(r.store.session(timed.session.id)).toMatchObject({ status: "budget_exhausted", stopReason: "time budget used" });

    const spent = await request(r, r.builder);
    if ("refused" in spent) throw new Error(spent.refused);
    r.book.recordShadow({ companyId: r.companyId, cents: 600, vendor: "model" }, "builder:bot");
    await r.settle(null);
    expect(r.store.session(spent.session.id)).toMatchObject({ status: "budget_exhausted", stopReason: "model budget used (600 of 500 cents)" });
  });

  it("re-enters a session a restart cut off, and ends one with no time left", async () => {
    const r = rig();
    const first = await request(r);
    const second = await request(r, r.builder);
    if ("refused" in first || "refused" in second) throw new Error("refused");
    r.tick(10 * MIN);
    await r.restart();
    r.store.note(second.session.id, "aged");
    r.tick(0);
    await r.sessions.recover();
    const resumed = r.starts.filter((start) => start.prompt.startsWith("dusk restarted while this session was running"));
    expect(resumed.map((start) => start.botId).sort()).toEqual(["builder-1", "ceo-1"]);
    expect(r.store.session(first.session.id)).toMatchObject({ status: "running", rounds: 2 });

    r.tick(40 * MIN);
    await r.restart();
    await r.sessions.recover();
    expect(r.store.session(first.session.id)).toMatchObject({ status: "interrupted" });
  });

  it("sweeps a zombie that never settles: interrupted, alarmed, ended", async () => {
    const r = rig();
    const started = await request(r);
    if ("refused" in started) throw new Error(started.refused);
    r.tick(30 * MIN);
    expect(await r.sessions.sweep()).toEqual([]);
    r.tick(31 * MIN);
    expect((await r.sessions.sweep()).map((session) => session.id)).toEqual([started.session.id]);
    expect(r.interrupted).toEqual([started.session.threadId]);
    expect(r.store.session(started.session.id)?.status).toBe("zombie");
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind).sort()).toEqual(["unjournaled", "zombie"]);
  });

  it("cancels a killed company's sessions", async () => {
    const r = rig();
    const started = await request(r);
    if ("refused" in started) throw new Error(started.refused);
    r.book.kill(r.companyId, "owner", "owner", "test");
    await r.sessions.stopCompany(r.companyId, "killed");
    expect(r.store.session(started.session.id)?.status).toBe("cancelled");
    expect(await request(r)).toEqual({ refused: "company is killed" });
  });
});

describe("cofactory scheduler", () => {
  it("gives the CEO and the lead one operating session per cadence, and honours a waiting seat's wake time", async () => {
    const r = rig();
    await r.scheduler.tick();
    expect(r.starts.map((start) => start.botId).sort()).toEqual(["ceo-1", "lead-1"]);
    await r.settle(r.finishWork(r.lead));
    const ceoTurn = r.starts.find((start) => start.botId === "ceo-1")!;
    await r.tool(r.ceo, "cofactory_journal", { did: "emailed 20 pharmacies" });
    await r.tool(r.ceo, "cofactory_end_session", { outcome: "waiting", summary: "replies due", waiting_on: "replies from pharmacies", wake_in_hours: 48 });
    ceoTurn.onSettled({ ok: true, text: "" });
    await r.sessions.drain();
    r.tick(DAY);
    await r.scheduler.tick();
    expect(r.starts.filter((start) => start.botId === "ceo-1")).toHaveLength(1);
    expect(r.starts.filter((start) => start.botId === "lead-1")).toHaveLength(2);
    r.tick(DAY);
    await r.scheduler.tick();
    expect(r.starts.filter((start) => start.botId === "ceo-1")).toHaveLength(2);
  });

  it("wakes the CEO for new outside events once, with the events in its prompt", async () => {
    const r = rig();
    r.truth.recordEvent({ source: "mailbox", externalId: "m1", companyId: r.companyId, kind: "reply", occurredAt: r.now(), text: "How much for three stores?" });
    await r.scheduler.tick();
    const wake = r.starts.find((start) => start.botId === "ceo-1")!;
    expect(wake.prompt).toContain("What woke this session:\n- reply via mailbox (urgent) id m1: How much for three stores?");
    await r.settle(r.finishWork(r.ceo));
    await r.scheduler.tick();
    expect(r.starts.filter((start) => start.botId === "ceo-1")).toHaveLength(1);
  });

  it("delivers typed messages by waking the addressed seat, without one busy seat holding back another", async () => {
    const r = rig();
    await r.tool(r.ceo, "cofactory_send", { type: "assign", to_role: "builder", reply_policy: "resume_requester", brief: { goal: "Ship the offer page", done_when: "it loads for a stranger" } });
    await r.tool(r.ceo, "cofactory_send", { type: "report", to_role: "lead", reply_policy: "report_only", brief: { goal: "Week one done", done_when: "lead has read it" } });
    await request(r, r.lead);
    await r.scheduler.tick();
    const builderWake = r.starts.find((start) => start.botId === "builder-1")!;
    expect(builderWake.prompt).toContain("assign from ceo");
    expect(builderWake.prompt).toContain("goal: Ship the offer page");
    expect(r.starts.filter((start) => start.botId === "lead-1")).toHaveLength(1);
    expect(r.store.cursor("messages:lead-1")).toBe(0);
  });

  it("starts nothing for a frozen or killed company", async () => {
    const r = rig();
    r.book.freeze(r.companyId, "owner", "kill switch");
    await r.scheduler.tick();
    expect(r.starts.map((start) => start.botId)).toEqual(["lead-1"]);
  });
});

describe("cofactory alarms", () => {
  it("raises stalled and fake work on silence and spend, and clears them when the world answers", async () => {
    const r = rig();
    const policy = DEFAULT_RUNTIME_POLICY;
    r.tick(HOUR);
    r.book.recordShadow({ companyId: r.companyId, cents: 2_000, vendor: "model" }, "ceo:bot");
    r.tick(4 * DAY);
    const raised = checkAlarms({ book: r.book, truth: r.truth, store: r.store, policy, now: r.now });
    expect(raised.map((alarm) => alarm.kind).sort()).toEqual(["fake_work", "stalled"]);
    expect(checkAlarms({ book: r.book, truth: r.truth, store: r.store, policy, now: r.now })).toEqual([]);
    r.truth.recordEvent({ source: "mailbox", externalId: "m9", companyId: r.companyId, kind: "reply", occurredAt: r.now(), text: "Send me an invoice" });
    checkAlarms({ book: r.book, truth: r.truth, store: r.store, policy, now: r.now });
    expect(r.store.openAlarms(r.companyId)).toEqual([]);
  });

  it("raises unstaffed for a company with no CEO", () => {
    const r = rig();
    r.book.unseat("ceo-1");
    expect(checkAlarms({ book: r.book, truth: r.truth, store: r.store, policy: DEFAULT_RUNTIME_POLICY, now: r.now }).map((alarm) => alarm.kind)).toEqual(["unstaffed"]);
  });
});

describe("cofactory launcher", () => {
  it("launches a company with its brief, rules and a seated team", async () => {
    const r = rig();
    const created: Array<{ name: string; section: string }> = [];
    const launcher = createLauncher({ book: r.book, workspaces: r.workspaces, createBot: async (profile) => { created.push(profile); return `bot-${created.length}`; } });
    const launched = await launcher.launch({ name: "Tender Watch", brief: "Weekly tender digests for HVAC contractors in Ohio", capCents: 4_000 }, "lead:bot");
    if (!launched.ok) throw new Error(launched.reason);
    expect(created.map((profile) => profile.name)).toEqual(["Tender Watch · CEO", "Tender Watch · Builder", "Tender Watch · Marketer"]);
    expect(launched.team.map((member) => r.book.membership(member.botId)?.role)).toEqual(["ceo", "builder", "marketer"]);
    const brief = readFileSync(join(r.workspaces.dirOf(launched.company.id), "BRIEF.md"), "utf8");
    expect(brief).toContain("Weekly tender digests for HVAC contractors in Ohio");
    expect(brief).toContain("Only arm's-length money counts");
  });
});

describe("cofactory multi-day run", () => {
  it("runs a week of cadence, events, messages and a restart with no zombie, no overlap and every session journaled", async () => {
    const r = rig();
    let restarts = 0;
    for (let hour = 0; hour < 7 * 24; hour++) {
      if (hour === 30) r.truth.recordEvent({ source: "mailbox", externalId: "reply-1", companyId: r.companyId, kind: "reply", occurredAt: r.now(), text: "We need this before the next audit. Can we book a call?" });
      if (hour === 60) await r.tool(r.ceo, "cofactory_send", { type: "assign", to_role: "builder", reply_policy: "report_only", brief: { goal: "Add a payment link", done_when: "a test payment lands" } });
      if (hour === 100) { await r.restart(); restarts++; await r.sessions.recover(); }
      await r.sessions.sweep();
      checkAlarms({ book: r.book, truth: r.truth, store: r.store, policy: DEFAULT_RUNTIME_POLICY, now: r.now });
      await r.scheduler.tick();
      for (const session of r.store.liveSessions()) {
        const seat = r.book.membership(session.botId)!;
        const turn = [...r.starts].reverse().find((start) => start.botId === session.botId)!;
        r.tick(0);
        await r.tool(seat, "cofactory_journal", { did: `hour ${hour} work`, next: "keep going" });
        await r.tool(seat, "cofactory_end_session", { outcome: "done", summary: `hour ${hour}` });
        turn.onSettled({ ok: true, text: "" });
        await r.sessions.drain();
      }
      const live = r.store.liveSessions();
      expect(new Set(live.map((session) => session.botId)).size).toBe(live.length);
      r.tick(HOUR);
    }
    const all = [null, r.companyId].flatMap((id) => r.store.sessionsFor(id, 500));
    expect(restarts).toBe(1);
    expect(all.filter((session) => session.status === "running" || session.status === "zombie")).toEqual([]);
    expect(all.every((session) => r.store.journaledIn(session.id))).toBe(true);
    const byTrigger = (botId: string, trigger: string) => all.filter((session) => session.botId === botId && session.trigger.startsWith(trigger)).length;
    expect(byTrigger("ceo-1", "cadence")).toBeGreaterThanOrEqual(6);
    expect(byTrigger("ceo-1", "events")).toBe(1);
    expect(byTrigger("builder-1", "messages")).toBe(1);
    expect(byTrigger("lead-1", "cadence")).toBeGreaterThanOrEqual(6);
    expect(r.store.openAlarms(r.companyId).map((alarm) => alarm.kind)).not.toContain("zombie");
  });
});
