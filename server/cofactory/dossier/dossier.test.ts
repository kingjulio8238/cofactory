import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openBook } from "../book.ts";
import { createDiscovery } from "../discovery/discovery.ts";
import { openLocalRegistry } from "../discovery/registry.ts";
import { openDiscoveryStore } from "../discovery/store.ts";
import { goodDossier } from "../evals/dossier-suites.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { createObserver } from "../observe/observer.ts";
import { openObserveStore } from "../observe/store.ts";
import { traceProblem } from "../observe/trace.ts";
import { createScheduler } from "../runtime/scheduler.ts";
import { createSessions } from "../runtime/sessions.ts";
import { openRuntimeStore } from "../runtime/store.ts";
import { createWorkspaces } from "../runtime/workspace.ts";
import { runTool } from "../tools.ts";
import { openTruth } from "../truth/store.ts";
import { createDossiers } from "./dossiers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0).reverse()) done(); });

async function rig() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-dossier-"));
  const book = openBook(join(dir, "cofactory.db"));
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher });
  const registry = openLocalRegistry(join(dir, "registry.db"));
  const store = openDiscoveryStore(join(dir, "discovery.db"));
  const discovery = createDiscovery({ store, truth, registry, policy: { batchTarget: 3, boringShare: 0, crossFieldShare: 0 } });
  const dossiers = createDossiers({ store, truth, registry, policy: { dossiersPerBatch: 2 } });
  const observeStore = openObserveStore(join(dir, "observe.db"));
  const runtime = openRuntimeStore(join(dir, "runtime.db"));
  const starts: Array<{ prompt: string; onSettled: (result: { ok: boolean; text: string }) => void }> = [];
  const sessions = createSessions({ store: runtime, book, workspaces: createWorkspaces(join(dir, "ws"), { git: false }), defer: (work) => work(),
    turns: { threadFor: () => "t", start: async (_bot, _thread, prompt, onSettled) => { starts.push({ prompt, onSettled }); }, interrupt: async () => {} } });
  const scheduler = createScheduler({ book, truth, store: runtime, sessions, discovery, dossiers });
  cleanups.push(() => { store.close(); registry.close(); observeStore.close(); runtime.close(); truth.close(); book.close(); rmSync(dir, { recursive: true, force: true }); });
  const scout = { botId: "scout", role: "scout" as const, companyId: null };
  book.seat(scout);
  const observe = createObserver({ store: observeStore, book });
  const call = (name: string, args: unknown) => runTool({ book, truth, seat: scout, actor: "scout:bot", observe, discovery, dossiers, sessions, session: runtime.liveFor("scout") }, name, args);
  discovery.setProfile({ inputs: [{ field: "domains", text: "pharmacy" }, { field: "skills", text: "claims" }, { field: "geography", text: "Ohio" }] });
  discovery.startBatch("test");
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
  const gap = "Vendors sell software seats needing an analyst; one-store owners need the finished monthly report instead.";
  const propose = (job: string, ids: string[]) => {
    const result = discovery.proposeNiche({ buyer: "independent pharmacies in Ohio", job, channel: "association forum", whyGap: gap, signalIds: ids, uniqueInputIds: [input], boring: true, crossField: false });
    if (!result.ok) throw new Error(result.reason);
    return result.niche.id;
  };
  const strong = propose("monthly DIR fee reconciliation report", [signals[0]!, signals[1]!, signals[2]!, signals[3]!]);
  const middle = propose("PBM audit appeal letters", [signals[0]!, signals[1]!, signals[2]!]);
  const weak = propose("board records binder upkeep", [signals[1]!, signals[2]!, signals[3]!]);
  // dossiers start from a closed batch's niches picked by hand (cards cover the owner's own path to a dossier)
  const closeAndSelect = async () => { await call("cofactory_close_batch", {}); return dossiers.select(store.batches()[0]!.id); };
  return { book, truth, store, runtime, observeStore, dossiers, sessions, scheduler, starts, call, closeAndSelect, strong, middle, weak };
}

describe("cofactory dossiers", () => {
  it("selects the strongest candidates of a closed batch", async () => {
    const r = await rig();
    expect((await r.closeAndSelect()).sort()).toEqual([r.strong, r.middle].sort());
    expect(r.store.niche(r.weak)!.status).toBe("candidate");
  });

  it("scores a submitted dossier, shortlists it, and files the decision with every claim check behind it", async () => {
    const r = await rig();
    await r.closeAndSelect();
    const thin = goodDossier();
    thin.buyerCount.value = 9_999;
    const failed = await r.call("cofactory_submit_dossier", { niche_id: r.strong, dossier: thin });
    expect(failed.structuredContent).toMatchObject({ status: "failed", version: 1 });
    const passed = await r.call("cofactory_submit_dossier", { niche_id: r.strong, dossier: goodDossier() });
    expect(passed.structuredContent).toMatchObject({ status: "shortlisted", version: 2, score: { vetoes: [] } });
    expect(r.store.niche(r.strong)!.status).toBe("shortlisted");
    const submits = r.observeStore.decisions().filter((decision) => decision.kind === "dossier.submit");
    expect(submits.map((decision) => decision.verdict)).toEqual(["refused", "allowed"]);
    expect(submits[1]!.evidence.filter((link) => link.type === "claim_check").length).toBeGreaterThan(15);
    for (const decision of submits) expect(traceProblem({ book: r.book, truth: r.truth, runtime: r.runtime, discovery: r.store }, decision)).toBeNull();
    expect(await r.call("cofactory_submit_dossier", { niche_id: r.weak, dossier: goodDossier() })).toMatchObject({ isError: true });
  });

  it("wakes the scout for each selected niche with its evidence, and rejects a niche that fails its allowance", async () => {
    const r = await rig();
    await r.closeAndSelect();
    await r.scheduler.tick();
    expect(r.starts).toHaveLength(1);
    expect(r.starts[0]!.prompt).toMatch(/Research the dossier for "independent pharmacies in Ohio · (monthly DIR fee reconciliation report|PBM audit appeal letters)"/);
    expect(r.starts[0]!.prompt).toContain("[job_board] https://jobs-site.test/jobs");
    const first = /niche_id ([0-9a-f-]{36})/.exec(r.starts[0]!.prompt)![1]!;
    for (let attempt = 0; attempt < 2; attempt++) {
      await r.call("cofactory_journal", { did: "researched" });
      await r.call("cofactory_end_session", { outcome: "blocked", summary: "could not find buyers" });
      r.starts.at(-1)!.onSettled({ ok: true, text: "" });
      await r.sessions.drain();
      await r.scheduler.tick();
    }
    expect(r.store.niche(first)!.status).toBe("rejected");
    expect(r.starts.at(-1)!.prompt).not.toContain(`niche_id ${first}`);
  });
});

describe("from dossier to company", () => {
  it("launches a company from a shortlisted dossier, claims the niche, and refuses an unshortlisted one", async () => {
    const r = await rig();
    await r.closeAndSelect();
    const passed = await r.call("cofactory_submit_dossier", { niche_id: r.strong, dossier: goodDossier() });
    const dossierId = (passed.structuredContent as { status: string }) && r.store.dossiersOf(r.strong).at(-1)!.id;
    const { createLauncher } = await import("../runtime/launcher.ts");
    const { createWorkspaces } = await import("../runtime/workspace.ts");
    const { openLocalRegistry } = await import("../discovery/registry.ts");
    const dir = mkdtempSync(join(tmpdir(), "cofactory-launch-"));
    const registry = openLocalRegistry(join(dir, "registry.db"));
    cleanups.push(() => { registry.close(); rmSync(dir, { recursive: true, force: true }); });
    r.book.deposit(10_000, "owner");
    let bots = 0;
    const launcher = createLauncher({ book: r.book, workspaces: createWorkspaces(join(dir, "ws"), { git: false }), createBot: async () => `bot-${++bots}`, discovery: { store: r.store, registry } });
    const launched = await launcher.launch({ name: "Ohio DIR Recon", brief: "", capCents: 4_000, dossierId }, "lead:bot");
    if (!launched.ok) throw new Error(launched.reason);
    expect(launched.company.brief).toContain("Buyer: independent pharmacies in Ohio. Job: monthly DIR fee reconciliation report.");
    expect(launched.company.brief).toContain("Named buyers to start with: Riverside Pharmacy 1");
    expect(r.store.linkOf(launched.company.id)).toEqual({ nicheId: r.strong, dossierId });
    expect(r.store.niche(r.strong)!.status).toBe("claimed");
    const failedId = r.store.dossiersOf(r.strong)[0]!.id;
    expect(await launcher.launch({ name: "Again", brief: "", capCents: 4_000, dossierId: failedId }, "lead:bot")).toMatchObject({ ok: false });
  });

  it("ranks a candidate lower when it resembles a niche a killed company disproved", async () => {
    const { preScore } = await import("./score.ts");
    const niche = { id: "n", factoryId: "f", batchId: null, at: 0, buyer: "independent pharmacies in Ohio", job: "monthly DIR fee reconciliation report", channel: "forum", whyGap: "", signalIds: [], uniqueInputIds: ["in-1"], boring: true, crossField: false, status: "candidate" as const, density: 0 };
    const signals = [{ sourceType: "forum", site: "a" }, { sourceType: "job_board", site: "b" }, { sourceType: "regulator", site: "c" }];
    const fresh = preScore(niche, signals);
    expect(preScore(niche, signals, [{ buyer: "Ohio independent pharmacies", job: "DIR fee reconciliation reports each month" }])).toBeLessThan(fresh - 2);
    expect(preScore(niche, signals, [{ buyer: "dental practices", job: "appointment reminders" }])).toBe(fresh);
  });
});
