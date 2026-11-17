import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_RUNTIME_POLICY } from "../../../shared/cofactory/runtime.ts";
import { openBook } from "../book.ts";
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
import { createDiscovery, siteOf } from "./discovery.ts";
import { openLocalRegistry } from "./registry.ts";
import { nicheSimilarity, themeOverlap, tokens } from "./similarity.ts";
import { openDiscoveryStore } from "./store.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0).reverse()) done(); });

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-discovery-"));
  let at = Date.UTC(2026, 10, 18, 9);
  const now = () => at;
  const book = openBook(join(dir, "cofactory.db"), { now });
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
  const registry = openLocalRegistry(join(dir, "registry.db"), { now });
  const store = openDiscoveryStore(join(dir, "discovery.db"));
  const discovery = createDiscovery({ store, truth, registry, now, policy: { batchTarget: 2 } });
  const observeStore = openObserveStore(join(dir, "observe.db"), now);
  const runtime = openRuntimeStore(join(dir, "runtime.db"), now);
  const starts: Array<{ botId: string; prompt: string; onSettled: (result: { ok: boolean; text: string }) => void }> = [];
  const sessions = createSessions({ store: runtime, book, workspaces: createWorkspaces(join(dir, "ws"), { git: false }), now, defer: (work) => work(),
    turns: { threadFor: () => "thread", start: async (botId, _thread, prompt, onSettled) => { starts.push({ botId, prompt, onSettled }); }, interrupt: async () => {} } });
  const scheduler = createScheduler({ book, truth, store: runtime, sessions, discovery, now });
  cleanups.push(() => { store.close(); registry.close(); observeStore.close(); runtime.close(); truth.close(); book.close(); rmSync(dir, { recursive: true, force: true }); });
  const scout = { botId: "scout", role: "scout" as const, companyId: null };
  book.seat(scout);
  const observe = createObserver({ store: observeStore, book });
  const call = (name: string, args: unknown) => runTool({ book, truth, seat: scout, actor: "scout:bot", observe, discovery, sessions, session: runtime.liveFor("scout") }, name, args);
  return { book, truth, discovery, store, runtime, observeStore, sessions, scheduler, starts, call, tick: (ms: number) => { at += ms; } };
}

const PROFILE = { inputs: [{ field: "domains" as const, text: "independent pharmacy operations" }, { field: "skills" as const, text: "claims data" }, { field: "geography" as const, text: "Ohio" }] };
const SIGNALS = [
  { url: "https://forum-site.test/forum", quote: "Every month I spend two full days matching remits against the PBM statements by hand", kind: "complaint", source_type: "forum" },
  { url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month, fixed price, long term.", kind: "job_post", source_type: "job_board" },
  { url: "https://board-site.test/regulator", quote: "Records must be retained for three years and produced to the Board within ten business days of a request", kind: "regulation", source_type: "regulator" },
];

describe("niche similarity", () => {
  it("matches the same niche in other words and tells different niches apart", () => {
    expect([...tokens("HVAC Contractors in Ohio")].sort()).toEqual([...tokens("hvac contractor ohio")].sort());
    const a = { buyer: "independent pharmacies in Ohio", job: "monthly DIR fee reconciliation report", channel: "pharmacy association" };
    expect(nicheSimilarity(a, { buyer: "Ohio independent pharmacy", job: "DIR fee reconciliation reports", channel: "association newsletter" })).toBeGreaterThan(0.6);
    expect(nicheSimilarity(a, { buyer: "dental practices", job: "appointment reminders", channel: "facebook groups" })).toBeLessThan(0.1);
    expect(themeOverlap([a], [a])).toBeCloseTo(1);
  });

  it("groups pages by site", () => {
    expect(siteOf("https://old.reddit.com/r/pharmacy/comments/1")).toBe("reddit.com");
    expect(siteOf("https://www.gov.uk/guidance/x")).toBe("www.gov.uk");
    expect(siteOf("https://forums.pharmacist.co.uk/t/1")).toBe("pharmacist.co.uk");
  });
});

describe("cofactory discovery", () => {
  it("needs a profile of the owner's own inputs, and keeps input ids stable across edits", () => {
    const r = rig();
    expect(r.discovery.setProfile({ inputs: PROFILE.inputs.slice(0, 2) })).toMatchObject({ ok: false });
    const first = r.discovery.setProfile(PROFILE);
    if (!first.ok) throw new Error(first.reason);
    const again = r.discovery.setProfile({ inputs: [...PROFILE.inputs, { field: "network", text: "Ohio pharmacists association" }] });
    if (!again.ok) throw new Error(again.reason);
    expect(again.profile.factoryId).toBe(first.profile.factoryId);
    expect(again.profile.inputs.slice(0, 3).map((item) => item.id)).toEqual(first.profile.inputs.map((item) => item.id));
  });

  it("runs a batch through the scout's tools: verified signals, a niche, quotas, and a close", async () => {
    const r = rig();
    r.discovery.setProfile(PROFILE);
    r.discovery.startBatch("pharmacy back office");
    const ids: string[] = [];
    for (const signal of SIGNALS) {
      const recorded = await r.call("cofactory_record_signal", { ...signal, buyer_hint: "independent pharmacies", job_hint: "reconciliation" });
      expect(recorded).not.toHaveProperty("isError");
      ids.push((recorded.structuredContent as { signal: { id: string } }).signal.id);
    }
    const fake = await r.call("cofactory_record_signal", { ...SIGNALS[0], quote: "we would pay five thousand dollars a year for this", buyer_hint: "x", job_hint: "y" });
    expect(fake).toMatchObject({ isError: true });
    const input = r.discovery.profile()!.inputs[0]!.id;
    const niche = { buyer: "independent pharmacies in Ohio", job: "monthly DIR fee reconciliation report", channel: "state pharmacy association", why_gap: "Enterprise tools need an analyst and a 12-month contract; one-store pharmacies need the finished report.", signal_ids: ids, unique_input_ids: [input] };
    expect(await r.call("cofactory_propose_niche", { ...niche, boring: true, cross_field: false })).not.toHaveProperty("isError");
    expect(await r.call("cofactory_close_batch", {})).toMatchObject({ isError: true });
    expect(await r.call("cofactory_propose_niche", { ...niche, job: "Board records binder for PBM reimbursement notices", boring: false, cross_field: true })).not.toHaveProperty("isError");
    expect(await r.call("cofactory_close_batch", {})).not.toHaveProperty("isError");
    const decisions = r.observeStore.decisions();
    expect(decisions.map((decision) => [decision.kind, decision.verdict])).toEqual([
      ["signal.record", "allowed"], ["signal.record", "allowed"], ["signal.record", "allowed"], ["signal.record", "refused"], ["niche.propose", "allowed"], ["niche.propose", "allowed"],
    ]);
    for (const decision of decisions) expect(traceProblem({ book: r.book, truth: r.truth, runtime: r.runtime, discovery: r.store }, decision)).toBeNull();
  });

  it("wakes the scout for an open batch, and stops waking it once the batch has used its sessions", async () => {
    const r = rig();
    r.discovery.setProfile({ ...PROFILE, seedNiches: ["PBM audit appeals"] } as Parameters<typeof r.discovery.setProfile>[0]);
    await r.scheduler.tick();
    expect(r.starts).toEqual([]);
    r.discovery.startBatch("first batch");
    await r.scheduler.tick();
    expect(r.starts).toHaveLength(1);
    expect(r.starts[0]!.prompt).toContain("Seed niches to look into first: PBM audit appeals");
    expect(r.starts[0]!.prompt).toMatch(/in-[0-9a-f]{8} = domains: independent pharmacy operations/);
    for (let session = 1; session < DEFAULT_RUNTIME_POLICY.discoverySessionsPerBatch; session++) {
      await r.call("cofactory_journal", { did: `searched round ${session}` });
      await r.call("cofactory_end_session", { outcome: "done", summary: "searched" });
      r.starts.at(-1)!.onSettled({ ok: true, text: "" });
      await r.sessions.drain();
      await r.scheduler.tick();
    }
    expect(r.starts).toHaveLength(DEFAULT_RUNTIME_POLICY.discoverySessionsPerBatch);
    await r.call("cofactory_journal", { did: "last round" });
    await r.call("cofactory_end_session", { outcome: "done", summary: "searched" });
    r.starts.at(-1)!.onSettled({ ok: true, text: "" });
    await r.sessions.drain();
    await r.scheduler.tick();
    expect(r.starts).toHaveLength(DEFAULT_RUNTIME_POLICY.discoverySessionsPerBatch);
    expect(r.runtime.openAlarms(null).map((alarm) => alarm.kind)).toEqual(["discovery_stuck"]);
  });
});
