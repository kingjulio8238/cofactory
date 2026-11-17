import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { armsLength } from "../truth/classify.ts";
import { runSuites, type Suite } from "./harness.ts";
import { armsLengthSuite, claimSuite, evidenceClassSuite, FOUNDATION_SUITES } from "./suites.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const history = () => {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-evals-"));
  dirs.push(dir);
  return join(dir, "history.jsonl");
};

describe("cofactory eval harness", () => {
  it("passes on the real truth layer", async () => {
    const card = await runSuites(FOUNDATION_SUITES);
    expect(card.suites.map((suite) => [suite.name, suite.pass])).toEqual([["claims", true], ["evidence-classes", true], ["arms-length", true], ["traceability", true]]);
    expect(card.pass).toBe(true);
  });

  it("fails a planted verifier that believes every quote", async () => {
    const gullible = claimSuite(() => ({
      check: async ({ url, quote }) => ({ url, quote, verdict: "verified", reason: "planted", snapshotId: null }),
      close: () => {},
    }));
    const card = await runSuites([gullible]);
    expect(card.pass).toBe(false);
    expect(card.suites[0]!.metrics.false_verified).toBeGreaterThan(0);
  });

  it("fails a planted classifier that turns enthusiasm into a commitment", async () => {
    const card = await runSuites([evidenceClassSuite((kind, text) => (kind === "reply" && /we will pay|we'll take it/i.test(text ?? "") ? "committed" : "hypothetical"))]);
    expect(card.pass).toBe(false);
    expect(card.suites[0]!.metrics.false_committed).toBeGreaterThan(0);
  });

  it("fails a planted arm's-length check that forgets refunds", async () => {
    const card = await runSuites([armsLengthSuite((payment, ctx) => armsLength(payment, { ...ctx, refunded: new Set() }))]);
    expect(card.pass).toBe(false);
  });

  it("flags a metric that drops below the last passing run even when its bar still passes", async () => {
    const file = history();
    const steady: Suite = { name: "steady", run: async () => ({ name: "steady", pass: true, metrics: { accuracy: 0.97, false_alarms: 0 }, failures: [] }) };
    const slipped: Suite = { name: "steady", run: async () => ({ name: "steady", pass: true, metrics: { accuracy: 0.9, false_alarms: 0 }, failures: [] }) };
    expect((await runSuites([steady], { historyFile: file })).pass).toBe(true);
    const card = await runSuites([slipped], { historyFile: file });
    expect(card.pass).toBe(false);
    expect(card.regressions).toEqual(["steady.accuracy: 0.97 -> 0.9"]);
    expect((await runSuites([steady], { historyFile: file })).pass).toBe(true);
  });

  it("catches a decision whose evidence points at nothing, and one allowed with no evidence", async () => {
    const { traceProblem } = await import("../observe/trace.ts");
    const deps = { book: { authorization: () => null, entries: () => [], company: () => null }, truth: { claimCheck: () => null, event: () => null }, runtime: null } as unknown as Parameters<typeof traceProblem>[0];
    const cost = { companyShadowCents: 0, companySpentCents: 0, companyAvailableCents: 0, sessionShadowCents: null };
    const base = { seq: 1, id: "d", at: 0, companyId: "c", sessionId: null, actor: "ceo:x", reason: "to market", cost };
    expect(traceProblem(deps, { ...base, kind: "stage.advance", verdict: "allowed", evidence: [{ type: "external_event", id: "gone", externalId: "gone", evidenceClass: "urgent" }] })).toMatch(/does not resolve/);
    expect(traceProblem(deps, { ...base, kind: "spend.capture", verdict: "allowed", evidence: [] })).toBe("allowed with no evidence");
    expect(traceProblem(deps, { ...base, kind: "stage.advance", verdict: "allowed", reason: "to design", evidence: [] })).toBeNull();
  });

  it("treats false_* and *_errors metrics as lower-is-better", async () => {
    const file = history();
    const run = (falseVerified: number): Suite => ({ name: "s", run: async () => ({ name: "s", pass: true, metrics: { false_verified: falseVerified, fetch_errors: 0 }, failures: [] }) });
    await runSuites([run(0)], { historyFile: file });
    expect((await runSuites([run(1)], { historyFile: file })).regressions).toEqual(["s.false_verified: 0 -> 1"]);
  });

  it("reports a crashing suite as a failure instead of stopping the run", async () => {
    const card = await runSuites([{ name: "boom", run: async () => { throw new Error("fixture missing"); } }, ...FOUNDATION_SUITES]);
    expect(card.pass).toBe(false);
    expect(card.suites[0]).toMatchObject({ name: "boom", pass: false, failures: ["suite crashed: fixture missing"] });
    expect(card.suites).toHaveLength(5);
  });
});
