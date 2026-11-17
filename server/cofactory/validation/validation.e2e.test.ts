import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { verificationServerArgs, verificationServerEnvironment } from "../../../scripts/control-dusk.ts";
import { removeTempDir } from "../../testing/cleanup.ts";
import { freePortBlock } from "../../testing/ports.ts";

const FAKE_CLI = fileURLToPath(new URL("../../testing/fake-claude-cli.ts", import.meta.url));
let child: ChildProcess | null = null;
let dataDir = "";
afterAll(async () => {
  if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
  if (dataDir) await removeTempDir(dataDir);
});

async function until<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  let log = "";
  try { log = readFileSync(join(dataDir, "server.log"), "utf8").slice(-3_000); } catch {}
  throw new Error(`timed out waiting for ${what}\n${log}`);
}

describe("cofactory validation on a real dusk server", () => {
  it("runs a sprint: offer page served publicly, a buyer listed, outreach refused without a mailbox, a signed payment passes it", { timeout: 180_000 }, async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cofactory-validation-e2e-"));
    mkdirSync(join(dataDir, "tmp"));
    writeFileSync(join(dataDir, "config.json"), JSON.stringify({ features: { smartSetupChoices: false }, instances: { claude: { driver: "claudeAgent", displayName: "Verification fixture", config: { cli: FAKE_CLI } } } }));
    const port = await freePortBlock([0, 1]);
    const url = `http://127.0.0.1:${port}`, hooks = `http://127.0.0.1:${port + 1}`;
    const tools = [
      { server: "cofactory", tool: "cofactory_start_sprint", arguments: {} },
      { server: "cofactory", tool: "cofactory_publish_offer", arguments: { business_name: "Tender Watch", headline: "Weekly HVAC tender digests, done for you", for_whom: "commercial HVAC contractors in Ohio", deliverables: ["Every public HVAC bid in your counties, each Monday", "Deadlines and bonding in one line"], price_line: "$99 a month", contact_email: "hello@tenderwatch.test", postal_address: "100 Main St, Columbus, OH 43215" } },
      { server: "cofactory", tool: "cofactory_add_buyer", arguments: { name: "Example Mechanical", address: "https://example.com/", channel: "contact_form", source_url: "https://example.com/" } },
      { server: "cofactory", tool: "cofactory_send_outreach", arguments: { buyer_id: "unknown", subject: "Tender digests", text: "Hello, this is a short note about weekly tender digests." } },
      { server: "cofactory", tool: "cofactory_journal", arguments: { did: "started the sprint and published the offer" } },
      { server: "cofactory", tool: "cofactory_end_session", arguments: { outcome: "waiting", summary: "offer live", waiting_on: "buyer replies", wake_in_hours: 24 } },
    ];
    const env = { ...verificationServerEnvironment({ FAKE_CLAUDE_MCP_TOOLS: JSON.stringify(tools) }, dataDir, port), DUSK_NO_TEST_BOTS: "1", COFACTORY_TICK_MS: "400", COFACTORY_SHORT_ROUND_MS: "1" };
    child = spawn(process.execPath, verificationServerArgs(env), { env, detached: true, stdio: ["ignore", openSync(join(dataDir, "server.log"), "a"), openSync(join(dataDir, "server.log"), "a")] });
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return response.json() as Promise<Record<string, any>>;
    };
    await until("the server", async () => ((await fetch(`${url}/api/health`)).ok ? true : undefined));
    await call("POST", "/api/cofactory/deposit", { cents: 10_000 });
    const launched = await call("POST", "/api/cofactory/launch", { name: "Tender Watch", brief: "Weekly tender digests for HVAC contractors in Ohio", capCents: 4_000 });
    const companyId = launched.company.id as string;
    const rails = await call("POST", `/api/cofactory/companies/${companyId}/rails`, { publicHooksUrl: "https://hooks.tenderwatch.test", stripeWebhookSecret: "whsec_e2e" });
    expect(rails.rails).toMatchObject({ stripeWebhook: true, mailbox: null, stripeWebhookUrl: `https://hooks.tenderwatch.test/hooks/cofactory/stripe/${companyId}` });
    expect(JSON.stringify(rails)).not.toContain("whsec_e2e");

    await until("the CEO's session to run its sprint tools", async () => ((await call("GET", `/api/cofactory/decisions?company=${companyId}`)).decisions as Array<{ kind: string }>).some((decision) => decision.kind === "outreach.send") || undefined);
    const sprint = (await call("GET", `/api/cofactory/sprints?company=${companyId}`)).sprints[0];
    expect(sprint.buyers).toBe(1);
    const page = await until("the offer page", async () => { const response = await fetch(`${hooks}/hooks/cofactory/offer/${companyId}`); return response.ok ? response.text() : undefined; });
    expect(page).toContain("Weekly HVAC tender digests, done for you");
    expect(page).toContain(`https://hooks.tenderwatch.test/hooks/cofactory/form/${companyId}/`);
    const decisions = (await call("GET", `/api/cofactory/decisions?company=${companyId}`)).decisions as Array<{ kind: string; verdict: string; reason: string }>;
    expect(decisions.map((decision) => [decision.kind, decision.verdict])).toEqual(expect.arrayContaining([["sprint.start", "allowed"], ["offer.publish", "allowed"], ["sprint.add_buyer", "allowed"], ["outreach.send", "refused"]]));

    const payload = JSON.stringify({ type: "checkout.session.completed", livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_e2e", payment_intent: "pi_e2e", payment_status: "paid", amount_total: 9_900, customer_details: { email: "estimator@example-mechanical.test" } } } });
    const t = Math.floor(Date.now() / 1000);
    const forged = await fetch(`${hooks}/hooks/cofactory/stripe/${companyId}`, { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_wrong").update(`${t}.${payload}`).digest("hex")}` } });
    expect(forged.status).toBe(400);
    const signed = await fetch(`${hooks}/hooks/cofactory/stripe/${companyId}`, { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_e2e").update(`${t}.${payload}`).digest("hex")}` } });
    expect(signed.status).toBe(200);

    const passed = await until("the sprint to pass", async () => {
      const state = await call("GET", "/api/cofactory/state");
      const events = (await call("GET", `/api/cofactory/events?company=${companyId}`)).events as Array<{ kind: string; evidenceClass: string }>;
      const running = (await call("GET", `/api/cofactory/sprints?company=${companyId}`)).sprints as Array<{ sprint: { id: string } }>;
      return events.some((event) => event.kind === "payment") && !running.some((item) => item.sprint.id === sprint.sprint.id) ? state : undefined;
    });
    expect(passed).toBeTruthy();
    const booked = await until("the payment to be booked as revenue", async () => {
      const entries = (await call("GET", `/api/cofactory/ledger?company=${companyId}`)).entries as Array<{ kind: string; receipt: string; cents: number }>;
      return entries.find((entry) => entry.kind === "revenue" && entry.receipt === "pi_e2e");
    });
    expect(booked).toMatchObject({ cents: 9_900 });
    const orders = (await call("GET", `/api/cofactory/orders?company=${companyId}`)).companies[0];
    expect(orders.orders).toMatchObject([{ status: "open", customer: "estimator@example-mechanical.test", amountCents: 9_900 }]);
    expect(orders.firstDollar).toEqual({ paid: true, delivered: false, rehearsed: false, reached: false });
    await call("POST", "/api/cofactory/related-parties", { emails: ["owner@tenderwatch.test"], domains: [] });
    const own = JSON.stringify({ type: "checkout.session.completed", livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_own", payment_intent: "pi_own", payment_status: "paid", amount_total: 9_900, customer_details: { email: "owner@tenderwatch.test" } } } });
    const t2 = Math.floor(Date.now() / 1000);
    await fetch(`${hooks}/hooks/cofactory/stripe/${companyId}`, { method: "POST", body: own, headers: { "stripe-signature": `t=${t2},v1=${createHmac("sha256", "whsec_e2e").update(`${t2}.${own}`).digest("hex")}` } });
    const refusedRevenue = await until("the owner's own payment to be refused as revenue", async () => ((await call("GET", `/api/cofactory/decisions?company=${companyId}`)).decisions as Array<{ kind: string; verdict: string; reason: string }>).find((decision) => decision.kind === "revenue.record" && decision.verdict === "refused"));
    expect(refusedRevenue.reason).toContain("related party");
    const trace = (await call("GET", `/api/cofactory/trace/company/${companyId}`));
    expect(trace.untraceable).toEqual([]);
    expect(trace.timeline.some((item: { source: string; text: string }) => item.source === "world" && item.text.startsWith("payment via stripe (committed)"))).toBe(true);
  });
});
