import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { verificationServerArgs, verificationServerEnvironment } from "../../../scripts/control-dusk.ts";
import { removeTempDir } from "../../testing/cleanup.ts";
import { freePortBlock } from "../../testing/ports.ts";

const FAKE_CLI = fileURLToPath(new URL("../../testing/fake-claude-cli.ts", import.meta.url));
const children: ChildProcess[] = [];
let dataDir = "";
afterAll(async () => {
  for (const child of children) killGroup(child);
  if (dataDir) await removeTempDir(dataDir);
});

function killGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}

function startServer(port: number, fakeEngine: Record<string, string>): ChildProcess {
  const env = {
    ...verificationServerEnvironment({ ...fakeEngine }, dataDir, port),
    DUSK_NO_TEST_BOTS: "1",
    COFACTORY_TICK_MS: "400", COFACTORY_CADENCE_MS: String(6 * 60 * 60_000), COFACTORY_SESSION_MS: String(10 * 60_000), COFACTORY_SHORT_ROUND_MS: "1",
  };
  const log = openSync(join(dataDir, `server-${children.length}.log`), "a");
  const child = spawn(process.execPath, verificationServerArgs(env), { env, detached: true, stdio: ["ignore", log, log] });
  children.push(child);
  return child;
}

const logs = () => children.map((_, index) => { try { return readFileSync(join(dataDir, `server-${index}.log`), "utf8").slice(-3_000); } catch { return ""; } }).join("\n---\n");

async function until<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${what}\n${logs()}`);
}

describe("cofactory runtime on a real dusk server", () => {
  it("launches a staffed company, survives a hard kill mid-session, and finishes the session after the restart", { timeout: 180_000 }, async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cofactory-runtime-e2e-"));
    mkdirSync(join(dataDir, "tmp"));
    writeFileSync(join(dataDir, "config.json"), JSON.stringify({ features: { smartSetupChoices: false }, instances: { claude: { driver: "claudeAgent", displayName: "Verification fixture", config: { cli: FAKE_CLI } } } }));
    const port = await freePortBlock([0, 1]);
    const url = `http://127.0.0.1:${port}`;
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as Record<string, any> };
    };

    const first = startServer(port, { FAKE_CLAUDE_SCRIPT: JSON.stringify([{ waitMs: 120_000 }, { text: "still working" }]) });
    await until("the first server", async () => ((await fetch(`${url}/api/health`)).ok ? true : undefined));
    expect((await call("POST", "/api/cofactory/deposit", { cents: 10_000 })).status).toBe(200);
    const launched = await call("POST", "/api/cofactory/launch", { name: "Tender Watch", brief: "Weekly tender digests for HVAC contractors in Ohio", capCents: 4_000 });
    expect(launched.body).toMatchObject({ ok: true, team: [{ role: "ceo" }, { role: "builder" }, { role: "marketer" }] });
    const companyId = launched.body.company.id as string;
    const ceoId = launched.body.team[0].botId as string;
    const bots = (await call("GET", "/api/bots?messages=0")).body.bots as Array<{ id: string; name: string; section?: string }>;
    expect(bots.filter((bot) => bot.name.startsWith("Tender Watch ·")).map((bot) => bot.name).sort()).toEqual(["Tender Watch · Builder", "Tender Watch · CEO", "Tender Watch · Marketer"]);

    const session = await until("the CEO's first session", async () => {
      const live = (await call("GET", "/api/cofactory/state")).body.runtime?.liveSessions as Array<{ id: string; botId: string; rounds: number }> | undefined;
      return live?.find((candidate) => candidate.botId === ceoId && candidate.rounds === 1);
    });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    killGroup(first);
    await new Promise((resolve) => first.exitCode !== null ? resolve(null) : first.once("exit", resolve));

    startServer(port, { FAKE_CLAUDE_MCP_TOOLS: JSON.stringify([
      { server: "cofactory", tool: "cofactory_authorize_spend", arguments: { category: "infra", vendor: "porkbun", cents: 1_200, purpose: "the offer's domain" } },
      { server: "cofactory", tool: "cofactory_authorize_spend", arguments: { category: "distribution", vendor: "ads", cents: 500, purpose: "an ad test" } },
      { server: "cofactory", tool: "cofactory_journal", arguments: { did: "re-checked the offer page after the restart", learned: "nothing was lost", next: "contact 20 contractors" } },
      { server: "cofactory", tool: "cofactory_end_session", arguments: { outcome: "done", summary: "offer page re-checked" } },
    ]) });
    const ended = await until("the session to finish after the restart", async () => {
      const view = (await call("GET", `/api/cofactory/sessions/${session.id}`)).body;
      return view.session?.status === "running" ? undefined : view;
    }, 90_000);
    expect(ended.session).toMatchObject({ status: "completed", stopReason: "offer page re-checked" });
    expect(ended.session.rounds).toBeGreaterThanOrEqual(2);
    expect(ended.events.map((event: { type: string }) => event.type)).toContain("restarted");

    const journal = (await call("GET", `/api/cofactory/journal?company=${companyId}`)).body.entries as Array<{ role: string; did: string }>;
    expect(journal).toContainEqual(expect.objectContaining({ role: "ceo", did: "re-checked the offer page after the restart" }));
    const workspace = join(dataDir, "cofactory-companies", companyId);
    expect(readFileSync(join(workspace, "BRIEF.md"), "utf8")).toContain("Only arm's-length money counts");
    expect(readFileSync(join(workspace, "JOURNAL.md"), "utf8")).toContain("re-checked the offer page after the restart");
    expect(execFileSync("git", ["log", "--format=%s"], { cwd: workspace, encoding: "utf8" })).toMatch(/session [0-9a-f]{8} ceo completed/);

    const sessionTrace = (await call("GET", `/api/cofactory/trace/session/${session.id}`)).body;
    expect(sessionTrace.toolCalls.map((record: { tool: string; ok: boolean }) => [record.tool, record.ok])).toEqual(expect.arrayContaining([
      ["cofactory_authorize_spend", true], ["cofactory_authorize_spend", false], ["cofactory_journal", true], ["cofactory_end_session", true],
    ]));
    expect(sessionTrace.decisions.map((decision: { kind: string; verdict: string; problem: string | null }) => [decision.kind, decision.verdict, decision.problem])).toEqual(expect.arrayContaining([
      ["spend.authorize", "allowed", null], ["spend.authorize", "refused", null], ["session.end", "allowed", null],
    ]));
    const companyTrace = (await call("GET", `/api/cofactory/trace/company/${companyId}`)).body;
    expect(companyTrace.untraceable).toEqual([]);
    expect(companyTrace.timeline.map((item: { source: string }) => item.source)).toEqual(expect.arrayContaining(["books", "ledger", "session", "journal", "decision", "owner"]));
    expect(companyTrace.costByStage).toEqual([expect.objectContaining({ stage: "build" })]);
    const board = await fetch(`${url}/api/cofactory/board`);
    expect(board.headers.get("content-type")).toMatch(/text\/html/);
    const page = await board.text();
    expect(page).toContain("Tender Watch");
    expect(page).toContain("spend.authorize");
    expect(await (await fetch(`${url}/api/cofactory/board.txt`)).text()).toMatch(/Tender Watch\s+\| build/);
    const owner = (await call("GET", "/api/cofactory/autonomy")).body.companies as Array<{ companyId: string | null; ownerTouches: number; why: Array<[string, number]> }>;
    expect(owner.find((item) => item.companyId === companyId)?.why).toEqual([["route:launch", 1]]);

    const state = (await call("GET", "/api/cofactory/state")).body;
    expect(state.runtime.liveSessions.filter((live: { botId: string }) => live.botId === ceoId)).toEqual([]);
    expect(state.runtime.alarms.map((alarm: { kind: string }) => alarm.kind)).not.toContain("zombie");
  });
});
