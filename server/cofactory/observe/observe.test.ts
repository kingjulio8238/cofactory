import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openBook } from "../book.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { openRuntimeStore } from "../runtime/store.ts";
import { runTool } from "../tools.ts";
import { openTruth } from "../truth/store.ts";
import { boardData, renderBoardHtml, renderBoardText } from "./board.ts";
import { costByStage } from "./cost.ts";
import { createObserver } from "./observer.ts";
import { openObserveStore } from "./store.ts";
import { autonomy, companyTrace } from "./trace.ts";

const HOUR = 60 * 60_000;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-observe-"));
  let at = Date.UTC(2026, 10, 18, 9);
  const now = () => at;
  const book = openBook(join(dir, "cofactory.db"), { now });
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
  const store = openObserveStore(join(dir, "observe.db"), now);
  const runtime = openRuntimeStore(join(dir, "runtime.db"), now);
  const observe = createObserver({ store, book });
  cleanups.push(() => { store.close(); runtime.close(); truth.close(); book.close(); rmSync(dir, { recursive: true, force: true }); });
  book.deposit(10_000, "owner");
  const launched = book.launch({ name: "Tender Watch", brief: "HVAC tender digests", capCents: 4_000 }, "owner");
  if (!launched.ok) throw new Error(launched.reason);
  const companyId = launched.company.id;
  const ceo = { botId: "ceo", role: "ceo" as const, companyId };
  const builder = { botId: "builder", role: "builder" as const, companyId };
  book.seat(ceo);
  book.seat(builder);
  const call = (seat: typeof ceo | typeof builder, name: string, args: unknown) => runTool({ book, truth, seat, actor: `${seat.role}:bot`, observe, now }, name, args);
  return { book, truth, store, runtime, observe, companyId, ceo, builder, call, tick: (ms: number) => { at += ms; }, now, deps: { book, truth, observe: store, runtime } };
}

describe("cofactory observability", () => {
  it("splits model cost and real spend by the stage the company was in", async () => {
    const r = rig();
    r.book.recordShadow({ companyId: r.companyId, cents: 300, vendor: "model" }, "builder:bot");
    const held = await r.call(r.builder, "cofactory_authorize_spend", { category: "infra", vendor: "porkbun", cents: 1_200, purpose: "domain" });
    await r.call(r.builder, "cofactory_capture_spend", { hold_id: (held.structuredContent as { hold: { id: string } }).hold.id, receipt: "inv" });
    r.tick(HOUR);
    await r.call(r.ceo, "cofactory_advance_stage", { to: "market", evidence: { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/pricing" } });
    r.tick(HOUR);
    r.book.recordShadow({ companyId: r.companyId, cents: 450, vendor: "model" }, "ceo:bot");
    expect(costByStage(r.book, r.companyId).map(({ stage, shadowCents, spentCents, leftAt }) => ({ stage, shadowCents, spentCents, closed: leftAt !== null }))).toEqual([
      { stage: "build", shadowCents: 300, spentCents: 1_200, closed: true },
      { stage: "market", shadowCents: 450, spentCents: 0, closed: false },
    ]);
  });

  it("files every gate decision with its evidence and the cost it was made at, and every tool call", async () => {
    const r = rig();
    r.book.recordShadow({ companyId: r.companyId, cents: 120, vendor: "model" }, "ceo:bot");
    await r.call(r.ceo, "cofactory_advance_stage", { to: "market", evidence: { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/gone" } });
    await r.call(r.ceo, "cofactory_status", {});
    const [refusedMove] = r.store.decisions();
    expect(refusedMove).toMatchObject({
      kind: "stage.advance", verdict: "refused", actor: "ceo:bot",
      evidence: [{ type: "claim_check", url: "https://fixtures.cofactory.test/gone" }],
      cost: { companyShadowCents: 120, companySpentCents: 0, companyAvailableCents: 4_000 },
    });
    expect(r.truth.claimCheck((refusedMove!.evidence[0] as { id: number }).id)).toMatchObject({ verdict: "unreachable" });
    expect(r.store.toolCalls().map((call) => [call.tool, call.ok])).toEqual([["cofactory_advance_stage", false], ["cofactory_status", true]]);
  });

  it("tells a company's story in time order and flags nothing untraceable on a clean run", async () => {
    const r = rig();
    r.truth.recordEvent({ source: "mailbox", externalId: "hot", companyId: r.companyId, kind: "reply", occurredAt: r.now(), text: "Send me an invoice for two offices." });
    r.tick(HOUR);
    await r.call(r.ceo, "cofactory_advance_stage", { to: "market", evidence: { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/pricing" } });
    r.tick(HOUR);
    await r.call(r.ceo, "cofactory_advance_stage", { to: "sell", evidence: { kind: "selling_signal", source: "inbound", ref: "hot" } });
    const trace = companyTrace(r.deps, r.companyId)!;
    expect(trace.untraceable).toEqual([]);
    const sources = trace.timeline.map((item) => item.source);
    expect(sources.indexOf("world")).toBeLessThan(sources.lastIndexOf("decision"));
    expect(trace.timeline.filter((item) => item.source === "decision").map((item) => item.text)).toEqual([
      "stage.advance allowed by ceo:bot: to market: page resolves for a stranger",
      "stage.advance allowed by ceo:bot: to sell: reply event hot (urgent)",
    ]);
  });

  it("measures the owner's share of the work, and why", async () => {
    const r = rig();
    await r.call(r.ceo, "cofactory_status", {});
    await r.call(r.builder, "cofactory_status", {});
    await r.call(r.builder, "cofactory_status", {});
    r.observe.touch({ companyId: r.companyId, sessionId: null, source: "question", kind: "AskUserQuestion", detail: "Which domain?" });
    expect(autonomy(r.deps, 0)).toEqual([{ companyId: r.companyId, seatActions: 3, ownerTouches: 1, ownerShare: 0.25, why: [["question:AskUserQuestion", 1]] }]);
  });

  it("renders the ops board as text and as a page, escaping what bots and the world wrote", async () => {
    const r = rig();
    r.runtime.raise(r.companyId, "stalled", "no outside event for 4 days");
    await r.call(r.builder, "cofactory_authorize_spend", { category: "distribution", vendor: "<script>alert(1)</script>", cents: 100, purpose: "x" });
    const data = boardData(r.deps, r.now(), { pass: false, at: "2026-11-18T09:00:00Z", failing: ["claims"] });
    const text = renderBoardText(data);
    expect(text).toContain("Tender Watch");
    expect(text).toContain("evals FAIL (claims)");
    expect(text).toMatch(/Tender Watch\s+\| build\s+\| live/);
    const html = renderBoardHtml(data);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('<span class="bad">stalled</span>');
    expect(html).toContain(`/api/cofactory/trace/company/${r.companyId}`);
  });
});
