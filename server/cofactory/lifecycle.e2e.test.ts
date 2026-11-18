import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { removeTempDir } from "../testing/cleanup.ts";
import { freePortBlock } from "../testing/ports.ts";
import { askToLaunch, ending, scriptFirstSearch, searchToShortlist, startScriptedFactory, tool, type ScriptedFactory } from "./testing/scripted-factory.ts";

let factory: ScriptedFactory | null = null;
let dataDir = "";
afterAll(async () => {
  factory?.stop();
  if (dataDir) await removeTempDir(dataDir);
});

describe("a factory's whole life on a real dusk server, every seat scripted", () => {
  it("opens, searches, writes a dossier, launches on the owner's OK, goes live, sells, delivers, rehearses and reaches the first dollar", { timeout: 420_000 }, async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cofactory-lifecycle-e2e-"));
    factory = await startScriptedFactory(dataDir, await freePortBlock([0, 1]));
    const { url, hooks, outbox, call, until, routes } = factory;

    // the first run, as the onboarding screens send it
    await call("POST", "/api/cofactory/settings", { country: "US", region: "Ohio" });
    await call("POST", "/api/cofactory/settings", { budgetCents: 50_000, allocation: "dynamic", closeAfterDays: 5 });
    await call("POST", "/api/cofactory/settings", { approvals: { launch: "ask", spendOverCents: 2_500, kill: "ask" } });
    scriptFirstSearch(factory);
    const opened = await call("POST", "/api/cofactory/factory/open", {});
    expect(opened.territories).toHaveLength(6);
    const scout = opened.staffed.find((seat: { role: string }) => seat.role === "scout").botId as string;

    // the scout's niches earn a dossier, which is shortlisted
    const { dossierId } = await searchToShortlist(factory);
    const reopened = await call("POST", "/api/cofactory/factory/open", {});
    expect(reopened.territories, "opening again, as a reloaded onboarding does, keeps the territories").toEqual(opened.territories);
    expect((await call("GET", "/api/cofactory/discovery")).batches, "and starts no second first search").toHaveLength(1);

    // the lead asks to launch from it; nothing launches until the owner approves in Needs you
    const approval = await askToLaunch(factory, dossierId);
    const needsYou = (await call("GET", `/api/cofactory/seat/${scout}`)).needsYou;
    expect(needsYou.approvals.map((item: { title: string }) => item.title)).toEqual(["Start Riverside Recon?"]);
    expect(needsYou.alarms, "the lead's own alarms never ask the owner").toEqual([]);
    expect((await call("GET", "/api/cofactory/state")).companies).toHaveLength(0);
    const approved = await call("POST", `/api/cofactory/approvals/${approval.id}`, { decision: "approve" });
    expect(approved.outcome).toContain("Riverside Recon is launched");
    const company = (await call("GET", "/api/cofactory/state")).companies[0] as { id: string; brief: string };
    routes({ "Factory lead ·": [tool("cofactory_launch_company", { name: "Riverside Recon", cap_cents: 5_000, dossier_id: dossierId }), ...ending("asked again")] });
    await until("the second ask refused", async () => ((await call("GET", "/api/cofactory/decisions")).decisions as Array<{ kind: string; reason: string }>)
      .some((d) => d.kind === "company.launch" && d.reason.includes("this niche is already a company (Riverside Recon, live)")));
    routes({});
    expect((await call("GET", "/api/cofactory/approvals")).approvals, "a launched dossier never asks the owner twice").toEqual([]);
    expect(company.brief, "the dossier carried into the brief").toContain("Buyer: independent pharmacies in Ohio.");
    const ceoSeat = (await call("GET", "/api/cofactory/rail")).companies[0].ceoBotId as string;
    const asked = await until("the rails the owner still owes", async () => (await call("GET", `/api/cofactory/seat/${ceoSeat}`)).needsYou.alarms[0]?.detail as string | undefined);
    expect(asked).toBe("Connect a mailbox to send from, a postal address, a public HTTPS address for the intake, a Stripe key, the Stripe webhook secret so it can take customers. Everything else goes ahead.");
    const rail = await call("GET", "/api/cofactory/rail");
    expect(rail.companies.map((item: { name: string; botIds: string[] }) => [item.name, item.botIds.length])).toEqual([["Riverside Recon", 3]]);

    // the owner connects rails; the CEO builds the offer, starts the sprint and lists a buyer from their public page
    await call("POST", `/api/cofactory/companies/${company.id}/rails`, { mailbox: "hello@riverside-recon.test", publicHooksUrl: "https://hooks.riverside-recon.test", stripeWebhookSecret: "whsec_lifecycle", postalAddress: "100 Main St, Columbus, OH 43215" });
    routes({ "CEO ·": [
      tool("cofactory_start_sprint"),
      tool("cofactory_publish_offer", { business_name: "Riverside Recon", headline: "Your monthly DIR fee report, done for you", for_whom: "independent pharmacies in Ohio", deliverables: ["Every DIR fee matched to its claim", "Appeal deadlines flagged"], price_line: "$150 a month, money back if we miss one" }),
      tool("cofactory_add_buyer", { name: "Riverside Pharmacy 1", address: "owner1@riverside.test", channel: "email", source_url: "https://buyers-site.test/contact-1" }),
      ...ending("published the offer and listed the first buyer"),
    ] });
    const buyer = await until("a listed buyer", async () => {
      const decisions = (await call("GET", `/api/cofactory/decisions?company=${company.id}`)).decisions as Array<{ kind: string; verdict: string }>;
      if (!decisions.some((d) => d.kind === "offer.publish" && d.verdict === "allowed")) return null;
      return (await call("GET", `/api/cofactory/sprints?company=${company.id}`)).sprints[0]?.buyers >= 1;
    });
    expect(buyer).toBe(true);

    // the owner arms outreach; the CEO's first email goes out with the opt-out and the postal address
    await call("POST", `/api/cofactory/companies/${company.id}/rails`, { outreachArmed: true });
    const buyerId = ((await call("GET", `/api/cofactory/sprints?company=${company.id}`)).sprints[0].targets as Array<{ id: string }>)[0]!.id;
    routes({ "CEO ·": [tool("cofactory_send_outreach", { buyer_id: buyerId, subject: "Your DIR fee reconciliation", text: "Hello, we reconcile DIR fees for one-store pharmacies each month, for $150 a month. Would that help?" }), ...ending("emailed the first buyer")] });
    const sent = await until("the first email", async () => {
      try { return readFileSync(outbox, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { to: string; text: string })[0]; } catch { return null; }
    });
    expect(sent.to).toBe("owner1@riverside.test");
    expect(sent.text).toContain("If this is not useful, reply \"stop\"");
    expect(sent.text.endsWith("--\n100 Main St, Columbus, OH 43215")).toBe(true);
    routes({});

    // the buyer pays through Stripe; the payment is booked as revenue and opens an order, and the sprint passes
    const payload = JSON.stringify({ type: "checkout.session.completed", livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_life", payment_intent: "pi_life", payment_status: "paid", amount_total: 15_000, customer_details: { email: "owner1@riverside.test" } } } });
    const t = Math.floor(Date.now() / 1000);
    const paid = await fetch(`${hooks}/hooks/cofactory/stripe/${company.id}`, { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_lifecycle").update(`${t}.${payload}`).digest("hex")}` } });
    expect(paid.status).toBe(200);
    const order = await until("the order", async () => ((await call("GET", `/api/cofactory/orders?company=${company.id}`)).companies[0].orders as Array<{ id: string; status: string }>)[0]);
    expect(order).toMatchObject({ status: "open", customer: "owner1@riverside.test", amountCents: 15_000 });

    // the builder's work lands in the company folder with its runbook
    const folder = join(dataDir, "cofactory-companies", company.id);
    writeFileSync(join(folder, "report.md"), "# October DIR fees\nEvery fee matched to its claim; three above contract, appeal by Nov 30.\n");
    writeFileSync(join(folder, "RUNBOOK.md"), `# Serving an order\n${"1. Download the remits from the PBM portal the customer names. 2. Match each DIR fee to its claim by Rx number and fill date. 3. Flag fees above the contract rate. 4. Write report.md with totals, flagged lines and appeal deadlines. 5. Email it with cofactory_message_customer and record the delivery.\n".repeat(2)}`);
    // a stand-in serves the order again from the handoff packet alone, and the lead judges it; both are scripted with
    //    the delivery, since the stand-in starts the moment the order is delivered (a scripted seat writes no files, so it
    //    hands back the packet's own order sheet)
    routes({
      "CEO ·": [tool("cofactory_deliver_order", { order_id: order.id, summary: "October reconciliation delivered as report.md", deliverable: "report.md" }), ...ending("delivered the first order")],
      "Stand-in ·": [tool("cofactory_deliver_order", { order_id: order.id, summary: "Served October again from the packet", deliverable: "ORDER.md", rehearsal: true }), ...ending("delivered the rehearsal")],
      "Factory lead ·": [tool("cofactory_rehearsal_verdict", { company_id: company.id, passed: true, note: "Same totals and flags as the original; a customer would accept it." }), ...ending("judged the rehearsal")],
    });
    await until("the delivery", async () => ((await call("GET", `/api/cofactory/orders?company=${company.id}`)).companies[0].orders as Array<{ status: string }>)[0]?.status === "delivered");
    const rehearsal = await until("the stand-in's rehearsal", async () => ((await call("GET", `/api/cofactory/orders?company=${company.id}`)).companies[0].rehearsals as Array<{ id: string; dir: string; status: string }>)[0]);
    expect(readFileSync(join(rehearsal.dir, "ORDER.md"), "utf8")).toContain("owner1@riverside.test");
    const gate = await until("the first-dollar gate", async () => {
      const view = (await call("GET", `/api/cofactory/orders?company=${company.id}`)).companies[0];
      return view.firstDollar.reached ? view.firstDollar : null;
    });
    expect(gate).toEqual({ paid: true, delivered: true, rehearsed: true, reached: true });
    routes({});
    const board = await fetch(`${url}/api/cofactory/board.txt`).then((response) => response.text());
    expect(board).toContain("companies past the first-dollar gate: 1");
    const ceo = (await call("GET", "/api/cofactory/rail")).companies[0].ceoBotId as string;
    expect((await call("GET", `/api/cofactory/seat/${ceo}`)).company).toMatchObject({ earnedCents: 15_000, firstDollar: { reached: true } });

    // closing a company waits for the owner too, and a closed company owes its post-mortem
    routes({ "Factory lead ·": [tool("cofactory_kill_company", { company_id: company.id, reason: "owner", why: "the owner wants to try a different niche" }), ...ending("asked to close Riverside Recon")] });
    const close = await until("the close request", async () => (await call("GET", "/api/cofactory/approvals")).approvals?.find((item: { kind: string }) => item.kind === "close"));
    routes({});
    await call("POST", `/api/cofactory/approvals/${close.id}`, { decision: "approve" });
    expect((await call("GET", "/api/cofactory/state")).companies[0].status).toBe("killed");
    await until("the post-mortem alarm", async () => ((await call("GET", "/api/cofactory/state")).runtime.alarms as Array<{ kind: string }>).some((alarm) => alarm.kind === "postmortem_missing"));
    routes({ "Factory lead ·": [tool("cofactory_postmortem", { company_id: company.id, cause: "other", falsified: "that one paying pharmacy meant the niche would keep paying", lesson: "check repeat demand from three buyers before scaling a niche", evidence: [order.id] }), ...ending("wrote the post-mortem")] });
    await until("the post-mortem", async () => !((await call("GET", "/api/cofactory/state")).runtime.alarms as Array<{ kind: string }>).some((alarm) => alarm.kind === "postmortem_missing"));
    routes({});
    const trace = await call("GET", `/api/cofactory/trace/company/${company.id}`);
    expect(trace.untraceable, "every decision along the way traces to its evidence").toEqual([]);
  });
});
