import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createCofactoryHost } from "./host.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0).reverse()) done(); });

function host() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-approvals-"));
  let bots = 0, threads = 0;
  const opened: string[] = [];
  const cofactory = createCofactoryHost({
    dataDir: dir, proxy: { command: "node", script: "x", env: {} }, harnessUrl: () => "http://127.0.0.1:1", tokenEnv: "T", mint: () => "token",
    turns: { createThread: () => `thread-${++threads}`, start: async () => {}, interrupt: async () => {} },
    createBot: async () => `bot-${++bots}`,
    factoryOpened: (lead) => opened.push(lead),
    tickMs: 3_600_000,
  });
  cleanups.push(() => { cofactory.close(); rmSync(dir, { recursive: true, force: true }); });
  return { cofactory, opened };
}

const ctx = (botId: string, botName: string) => ({ botId, botName, assertActive: () => {} });

describe("what waits for the owner's OK", () => {
  it("holds a launch, a large spend and a close for the owner, and carries out the decision and tells the seat that asked", async () => {
    const { cofactory } = host();
    const book = cofactory.books();
    book.deposit(50_000, "owner");
    cofactory.settings.set({ budgetCents: 50_000, approvals: { launch: "ask", spendOverCents: 2_500, kill: "ask" } });
    const staffed = await cofactory.runtime()!.launcher!.staffFactory();
    const lead = staffed.find((seat) => seat.role === "lead")!.botId;
    const call = (botId: string, name: string, args: unknown) => cofactory.rpc({ method: "tools/call", params: { name, arguments: args } }, ctx(botId, "bot")) as Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean }>;

    const asked = await call(lead, "cofactory_launch_company", { name: "Tender Watch", brief: "Weekly HVAC tender digests", cap_cents: 4_000 });
    expect(asked.structuredContent).toMatchObject({ waitingForOwner: expect.any(String) });
    expect(book.companies(), "nothing launches before the owner says so").toHaveLength(0);
    const [launch] = cofactory.approvals().pending();
    expect(launch).toMatchObject({ kind: "launch", title: "Start Tender Watch?" });

    const approved = await cofactory.settleApproval(launch!.id, true, null);
    expect(approved).toMatchObject({ ok: true, outcome: expect.stringContaining("Tender Watch is launched") });
    expect(book.companies().map((company) => company.name)).toEqual(["Tender Watch"]);
    expect(book.inbox("lead", null).at(-1)!.brief.goal).toBe("The owner approved: Start Tender Watch?");
    expect(await cofactory.settleApproval(launch!.id, true, null), "decided once").toMatchObject({ ok: false });

    const company = book.companies()[0]!;
    const ceo = book.members().find((member) => member.companyId === company.id && member.role === "ceo")!.botId;
    await call(ceo, "cofactory_authorize_spend", { category: "infra", vendor: "Namecheap", cents: 1_200, purpose: "the company's domain" });
    expect(cofactory.approvals().pending(), "a small spend goes ahead").toHaveLength(0);
    await call(ceo, "cofactory_authorize_spend", { category: "distribution", vendor: "Google Ads", cents: 3_000, purpose: "first ads" });
    const [spend] = cofactory.approvals().pending();
    expect(spend).toMatchObject({ kind: "spend", title: "Spend $30 at Google Ads?" });
    await cofactory.settleApproval(spend!.id, false, "not yet");
    expect(book.inbox("ceo", company.id).at(-1)!.brief).toMatchObject({ goal: "The owner declined: Spend $30 at Google Ads?", known: "declined: not yet" });

    await call(lead, "cofactory_kill_company", { company_id: company.id, reason: "metric", why: "no replies" });
    expect(book.company(company.id)!.status, "a close waits too").toBe("live");
    const [close] = cofactory.approvals().pending();
    await cofactory.settleApproval(close!.id, true, null);
    expect(book.company(company.id)!.status).toBe("killed");
  });

  it("starts no new session once today's model use reaches the owner's ceiling", async () => {
    const { cofactory } = host();
    cofactory.settings.set({ dailyModelCents: 100 });
    const staffed = await cofactory.runtime()!.launcher!.staffFactory();
    const scout = staffed.find((seat) => seat.role === "scout")!.botId;
    cofactory.costBooked({ botId: scout, usd: 1.5, botName: "Factory Scout" });
    const refused = await cofactory.runtime()!.sessions.request({ companyId: null, botId: scout, kind: "deep", trigger: "test", objective: "search", doneWhen: "done" });
    expect(refused).toEqual({ refused: "the factory reached today's ceiling on model use" });
    expect(cofactory.runtime()!.store.openAlarms(null).map((alarm) => alarm.kind)).toContain("daily_ceiling");
  });
});
