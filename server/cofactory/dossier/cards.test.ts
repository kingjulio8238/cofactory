import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { goodDossier } from "../evals/dossier-suites.ts";
import { createCofactoryHost } from "../host.ts";
import { traceProblem } from "../observe/trace.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { vi.unstubAllEnvs(); for (const done of cleanups.splice(0).reverse()) done(); });

const goodCard = (name = "Riverside Recon") => ({
  name, headline: "Your monthly DIR fee report, done for you, for one-store pharmacies",
  price_today: { url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month, fixed price, long term.", amount_cents: 60_000, per: "month", kind: "job_post_budget" },
  offer: { price_cents: 15_000, per: "month" },
  rival: { name: "RemitCheck Enterprise", url: "https://vendor-site.test/pricing", what_they_miss: "sells software to chains of 25+ stores; one-store owners still do the work", price_cents: 4_900 },
  example_buyer: { name: "Riverside Pharmacy 1", url: "https://buyers-site.test/buyer-1" },
  risks: { licensed_advice: false, regulated_claims: false, notes: "" },
});

async function factory() {
  vi.stubEnv("COFACTORY_TRUTH_FIXTURES", "1");
  vi.stubEnv("COFACTORY_CARDS_PER_BATCH", "2");
  const dir = mkdtempSync(join(tmpdir(), "cofactory-cards-"));
  let bots = 0, threads = 0;
  const told: string[] = [];
  const started: string[] = [];
  const cofactory = createCofactoryHost({
    dataDir: dir, proxy: { command: "node", script: "x", env: {} }, harnessUrl: () => "http://127.0.0.1:1", tokenEnv: "T", mint: () => "token",
    turns: { createThread: () => `thread-${++threads}`, start: async (_bot, _thread, prompt) => { started.push(prompt); }, interrupt: async () => {} },
    createBot: async () => `bot-${++bots}`,
    notifyOwner: (text) => told.push(text),
    tickMs: 3_600_000,
  });
  cleanups.push(() => { cofactory.close(); rmSync(dir, { recursive: true, force: true }); });
  cofactory.books().deposit(50_000, "owner");
  cofactory.settings.set({ budgetCents: 50_000, allocation: "dynamic", onboardedAt: Date.now() });
  const staffed = await cofactory.runtime()!.launcher!.staffFactory();
  const scout = staffed.find((seat) => seat.role === "scout")!.botId, lead = staffed.find((seat) => seat.role === "lead")!.botId;
  const call = (botId: string, name: string, args: unknown = {}) =>
    cofactory.rpc({ method: "tools/call", params: { name, arguments: args } }, { botId, botName: "bot", assertActive: () => {} }) as Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean; content?: Array<{ text: string }> }>;

  const discovery = cofactory.discovery();
  discovery.setProfile({ inputs: [{ field: "domains", text: "pharmacy" }, { field: "skills", text: "claims" }, { field: "geography", text: "Ohio" }] });
  discovery.startBatch("test", 3);
  const signals: string[] = [];
  for (const [url, quote, sourceType] of [
    ["https://forum-site.test/thread-1", "reconciling the remits by hand eats a whole weekend every month for store number 1", "forum"],
    ["https://jobs-site.test/jobs", "Budget: $600 per month, fixed price, long term.", "job_board"],
    ["https://board-site.test/regulator", "Records must be retained for three years and produced to the Board within ten business days of a request", "regulator"],
    ["https://qa-site.test/thread-2", "reconciling the remits by hand eats a whole weekend every month for store number 2", "qa"],
  ] as const) {
    const recorded = await discovery.recordSignal({ url, quote, kind: "complaint", sourceType, buyerHint: "pharmacies", jobHint: "reconciliation" });
    if (!recorded.ok) throw new Error(recorded.reason);
    signals.push(recorded.signal.id);
  }
  const input = discovery.profile()!.inputs[0]!.id;
  const propose = (job: string, ids: string[], extra: { boring?: boolean; crossField?: boolean } = {}) => {
    const result = discovery.proposeNiche({ buyer: "independent pharmacies in Ohio", job, channel: "association forum", signalIds: ids, uniqueInputIds: [input], boring: extra.boring ?? false, crossField: extra.crossField ?? false,
      whyGap: "Vendors sell software seats needing an analyst; one-store owners need the finished monthly report instead." });
    if (!result.ok) throw new Error(result.reason);
    return result.niche.id;
  };
  const strong = propose("monthly DIR fee reconciliation report", signals, { boring: true });
  const middle = propose("PBM audit appeal letters", signals.slice(0, 3), { crossField: true });
  const weak = propose("board records binder upkeep", signals.slice(1));
  return { cofactory, call, scout, lead, strong, middle, weak, told, started };
}

describe("cards: the owner picks companies before any is started", () => {
  it("picks the strongest niches of a closed search for cards, wakes the scout for a quick one, and checks every claim on it", async () => {
    const f = await factory();
    const closed = await f.call(f.scout, "cofactory_close_batch");
    expect((closed.structuredContent!.pickedForCards as string[]).sort()).toEqual([f.strong, f.middle].sort());
    expect(f.cofactory.discovery().store.niche(f.weak)!.status, "the rest wait for a later round").toBe("candidate");

    await f.cofactory.tick();
    const prompt = f.started.find((text) => text.includes("Write the card for"))!;
    expect(prompt).toMatch(/cofactory_submit_card \(niche_id [0-9a-f-]{36}\)/);
    expect(f.cofactory.runtime()!.store.liveFor(f.scout)!.kind, "a card is a short session, not a deep one").toBe("operating");

    const wrongAmount = { ...goodCard(), price_today: { ...goodCard().price_today, amount_cents: 90_000 } };
    const failed = await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...wrongAmount, offer: { price_cents: 45_000, per: "month" }, rival: { ...goodCard().rival, url: "https://gone-site.test/nothing" } });
    expect(failed.structuredContent).toMatchObject({ status: "failed", version: 1 });
    expect(failed.structuredContent!.problems).toEqual([
      "today's price is not the amount its quote states",
      expect.stringMatching(/^the rival's page does not check out/),
      "our price is 50% of today's price; it must be at most a third",
    ]);
    const regulated = await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard(), headline: "Tax filings for one-store pharmacies, done for you" });
    expect(regulated.structuredContent!.problems).toEqual([expect.stringContaining("the work touches tax")]);
    expect(f.told, "a failed card does not call the owner").toEqual([]);

    const ready = await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard() });
    expect(ready.structuredContent).toMatchObject({ status: "ready", version: 3, problems: [] });
    expect(f.told).toEqual(["Riverside Recon is ready for you to look at: Your monthly DIR fee report, done for you, for one-store pharmacies"]);
    const card = f.cofactory.cards().latest(f.strong)!;
    expect(f.cofactory.cards().view(card).quotes.map((quote) => quote.site), "buyers' own words, one per site; the regulator's page is not one").toEqual(["forum-site.test", "jobs-site.test", "qa-site.test"]);
    expect(await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard() }), "a ready card is final").toMatchObject({ isError: true });
    expect(await f.call(f.scout, "cofactory_submit_card", { niche_id: f.weak, ...goodCard() }), "only a niche picked for a card gets one").toMatchObject({ isError: true });

    const decisions = f.cofactory.observe().store.decisions().filter((decision) => decision.kind === "card.submit" || decision.kind === "niche.card");
    for (const decision of decisions) expect(traceProblem(f.cofactory.traceDeps(), decision)).toBeNull();
  });

  it("closes a search that met its target and quotas by itself, so the cards never wait on the scout to close it", async () => {
    const f = await factory();
    await f.cofactory.tick();
    expect(f.cofactory.discovery().store.openBatch()).toBeNull();
    expect([f.strong, f.middle, f.weak].map((id) => f.cofactory.discovery().store.niche(id)!.status)).toEqual(["card", "card", "candidate"]);
    expect(f.started.some((text) => text.includes("Write the card for")), "and the scout is woken for the first card").toBe(true);
  });

  it("holds a card to sourced hours, buyers' words from sites that aren't vendors, and an honest account of who sets today's price", async () => {
    const f = await factory();
    await f.call(f.scout, "cofactory_close_batch");
    const submit = async (overrides: Record<string, unknown>) => ((await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard(), ...overrides })).structuredContent!.problems as string[]);
    const hourly = { url: "https://bookkeepers-site.test/rate", quote: "Our bookkeepers charge $75 per hour for remit reconciliation.", amount_cents: 7_500, per: "hour", kind: "service_rate" };

    expect(await submit({ price_today: hourly }), "an hourly rate needs quoted hours").toEqual(["today's price is an hourly rate with no quoted hours of work, so it cannot be put on a monthly basis", "our price cannot be compared with today's price"]);
    expect(await submit({ price_today: { ...hourly, hours: { url: "https://bookkeepers-site.test/hours", quote: "Reconciling one store's remits by hand takes about 12 hours a month.", amount: 20, per: "month" } } }))
      .toContain("the hours behind today's price (20) are not the number their quote states");

    // with the rival on the forum's site and a vendor's price on the job board's, only the Q&A site still speaks for buyers
    const onRival = await submit({ rival: { ...goodCard().rival, url: "https://forum-site.test/rival" }, price_today: { ...goodCard().price_today, kind: "vendor_list_price" } });
    expect(onRival).toContain("the buyers' own words come from 1 site(s) that aren't vendors; a card needs 2 (forums, Q&A, job posts or review platforms, not a vendor's case studies or testimonials)");
    expect(await submit({ price_today: { url: "https://vendor-site.test/pricing", quote: "Starts at $49 per store per month, billed annually.", amount_cents: 4_900, per: "month", kind: "buyer_statement" }, offer: { price_cents: 1_500, per: "month" } }))
      .toContain("a price on the rival's own site is its list price, not a buyer saying what they pay");

    const sourced = await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard(), offer: { price_cents: 25_000, per: "month" },
      price_today: { ...hourly, hours: { url: "https://bookkeepers-site.test/hours", quote: "Reconciling one store's remits by hand takes about 12 hours a month.", amount: 12, per: "month" } } });
    expect(sourced.structuredContent, "$75/h × 12 h = $900/mo, against our $250/mo").toMatchObject({ status: "ready", problems: [] });
  });

  it("starts a company only after the owner's Start and a clean full dossier; a pass teaches the next search; nothing moves money until then", async () => {
    const f = await factory();
    const deck = f.cofactory.cards();
    await f.call(f.scout, "cofactory_close_batch");
    await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard() });
    await f.call(f.scout, "cofactory_submit_card", { niche_id: f.middle, ...goodCard("Appeal Desk") });
    const riverside = deck.latest(f.strong)!, appeals = deck.latest(f.middle)!;

    expect(f.cofactory.startCard(riverside.id, "owner")).toEqual({ ok: true });
    expect(f.cofactory.discovery().store.niche(f.strong)!.status, "Start orders the full dossier").toBe("selected");
    expect(deck.pass(appeals.id, "appeal letters are too close to legal work").ok).toBe(true);
    expect(f.cofactory.books().companies(), "Start alone launches nothing").toHaveLength(0);

    const lead = await f.call(f.lead, "cofactory_launch_company", { name: "Riverside Recon", cap_cents: 5_000, dossier_id: "x" });
    expect(lead.isError).toBe(true);
    const submitted = await f.call(f.scout, "cofactory_submit_dossier", { niche_id: f.strong, dossier: goodDossier() });
    expect(submitted.structuredContent).toMatchObject({ status: "shortlisted" });
    const dossierId = f.cofactory.dossiers().latest(f.strong)!.id;
    const byLead = await f.call(f.lead, "cofactory_launch_company", { name: "Riverside Recon", cap_cents: 5_000, dossier_id: dossierId });
    expect(byLead.content?.[0]?.text, "the lead never launches a card the owner started").toContain("launches by itself once its dossier is shortlisted");

    await f.cofactory.tick();
    const [company] = f.cofactory.books().companies();
    expect(company).toMatchObject({ name: "Riverside Recon", capCents: 5_000 });
    expect(deck.latest(f.strong)).toMatchObject({ status: "launched", companyId: company!.id });
    expect(f.told.at(-1)).toBe("Riverside Recon is open.");
    const launch = f.cofactory.observe().store.decisions().find((decision) => decision.kind === "company.launch" && decision.verdict === "allowed")!;
    expect(launch.reason).toBe("started from its card: Riverside Recon");
    expect(traceProblem(f.cofactory.traceDeps(), launch)).toBeNull();

    // nothing is left to decide, so the next niche of the search gets its card, and the scout hears what the owner passed on
    expect(f.cofactory.discovery().store.niche(f.weak)!.status).toBe("card");
    expect(deck.passed()).toEqual([{ buyer: "independent pharmacies in Ohio", job: "PBM audit appeal letters", reason: "appeal letters are too close to legal work" }]);
  });

  it("tells the owner when a started card's full research does not hold up, with no money moved, and refuses a Start the money cannot cover", async () => {
    const f = await factory();
    const deck = f.cofactory.cards();
    await f.call(f.scout, "cofactory_close_batch");
    await f.call(f.scout, "cofactory_submit_card", { niche_id: f.strong, ...goodCard() });
    const card = deck.latest(f.strong)!;
    f.cofactory.startCard(card.id, "owner");
    const vetoed = goodDossier();
    vetoed.risks.licensedAdvice = true;
    expect((await f.call(f.scout, "cofactory_submit_dossier", { niche_id: f.strong, dossier: vetoed })).structuredContent).toMatchObject({ status: "dropped" });
    await f.cofactory.tick();
    expect(deck.latest(f.strong)).toMatchObject({ status: "unconfirmed" });
    expect(f.told.at(-1)).toMatch(/^Riverside Recon couldn't be confirmed: .+\. No money moved\.$/);
    expect(f.cofactory.books().balance("unallocated")).toBe(50_000);
    expect(deck.dismiss(card.id)).toEqual({ ok: true });

    await f.call(f.scout, "cofactory_submit_card", { niche_id: f.middle, ...goodCard("Appeal Desk") });
    f.cofactory.settings.set({ budgetCents: 0 });
    expect(f.cofactory.startCard(deck.latest(f.middle)!.id, "owner")).toEqual({ ok: false, reason: "fund the factory first" });
    f.cofactory.settings.set({ budgetCents: 50_000, approvals: { launch: "auto", spendOverCents: 2_500, kill: "tell" } });
    await f.cofactory.tick();
    expect(deck.latest(f.middle)!.status, "with launches on auto, the factory starts a ready card itself").toBe("started");
  });
});
