import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { verificationServerArgs, verificationServerEnvironment } from "../../scripts/control-dusk.ts";
import { removeTempDir } from "../testing/cleanup.ts";
import { freePortBlock } from "../testing/ports.ts";

const FAKE_CLI = fileURLToPath(new URL("../testing/fake-claude-cli.ts", import.meta.url));
let child: ChildProcess | null = null;
let dataDir = "";
afterAll(async () => {
  if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
  if (dataDir) await removeTempDir(dataDir);
});

describe("opening a factory from the first run, on a real dusk server", () => {
  it("draws its own territories with nothing from the owner but a country, a stake and a hunch, staffs it, and starts the first search", { timeout: 120_000 }, async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cofactory-onboarding-e2e-"));
    mkdirSync(join(dataDir, "tmp"));
    writeFileSync(join(dataDir, "config.json"), JSON.stringify({ features: { smartSetupChoices: false }, instances: { claude: { driver: "claudeAgent", displayName: "Verification fixture", config: { cli: FAKE_CLI } } } }));
    const port = await freePortBlock([0, 1]);
    const url = `http://127.0.0.1:${port}`;
    const env = { ...verificationServerEnvironment({ FAKE_CLAUDE_MCP_TOOLS: "[]" }, dataDir, port), DUSK_NO_TEST_BOTS: "1", COFACTORY_TICK_MS: "3600000" };
    child = spawn(process.execPath, verificationServerArgs(env), { env, detached: true, stdio: ["ignore", openSync(join(dataDir, "server.log"), "a"), openSync(join(dataDir, "server.log"), "a")] });
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return response.json() as Promise<Record<string, any>>;
    };
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !(await fetch(`${url}/api/health`).then((response) => response.ok, () => false))) await new Promise((resolve) => setTimeout(resolve, 250));

    await call("POST", "/api/cofactory/settings", { country: "US", region: "Ohio" });
    const staked = await call("POST", "/api/cofactory/settings", { budgetCents: 10_000, companyCapCents: 4_000 });
    expect(staked.settings).toMatchObject({ budgetCents: 10_000, companyCapCents: 4_000 });
    await call("POST", "/api/cofactory/settings", { hunches: ["DIR fee recovery for one-store pharmacies"], never: ["medical advice"] });
    const opened = await call("POST", "/api/cofactory/factory/open", {});
    if (!opened.ok) throw new Error(`${JSON.stringify(opened)}\n${readFileSync(join(dataDir, "server.log"), "utf8").slice(-2_000)}`);
    expect(opened.staffed.map((seat: { role: string }) => seat.role).sort()).toEqual(["lead", "scout"]);
    expect(opened.territories).toHaveLength(6);
    for (const territory of opened.territories) expect(territory).toMatch(/\(NAICS \d{6}\)$/);

    const state = await call("GET", "/api/cofactory/settings");
    expect(state.profile.inputs.filter((input: { field: string }) => input.field === "domains").map((input: { text: string }) => input.text)).toEqual(opened.territories);
    expect(state.profile.inputs).toContainEqual(expect.objectContaining({ field: "geography", text: "Ohio, United States" }));
    expect(state.profile).toMatchObject({ seedNiches: ["DIR fee recovery for one-store pharmacies"], constraints: ["medical advice"] });
    expect(state.depositedCents, "the stake is in the books").toBe(10_000);
    expect(state.settings.onboardedAt).toBeGreaterThan(0);
    expect((await call("GET", "/api/cofactory/discovery")).batch?.batch).toMatchObject({ closedAt: null, note: "the factory's first search" });

    const scout = opened.staffed.find((seat: { role: string }) => seat.role === "scout").botId as string;
    const view = await call("GET", `/api/cofactory/seat/${scout}`);
    expect(view.seat).toMatchObject({ role: "scout", companyId: null });
    expect(view.factory.territories.map((territory: { title: string }) => territory.title)).toEqual(opened.territories.map((text: string) => text.replace(/ \(NAICS \d{6}\)$/, "")));
    expect(view.factory.checklist).toEqual([
      { id: "search", state: "running" }, { id: "shortlist", state: "todo" }, { id: "launch", state: "todo" }, { id: "live", state: "todo" }, { id: "dollar", state: "todo" },
    ]);
    expect((await call("GET", "/api/cofactory/seat/not-a-seat")).seat, "a bot without a seat has no Factory tab").toBeNull();
    const board = await fetch(`${url}/api/cofactory/board.txt`).then((response) => response.text());
    expect(board).toContain("cloud gate: not yet");
    const again = await call("POST", "/api/cofactory/factory/open", {});
    expect(again.territories, "opening twice keeps the same territories and seats").toEqual(opened.territories);
    expect(again.staffed.every((seat: { created: boolean }) => !seat.created)).toBe(true);
  });
});
