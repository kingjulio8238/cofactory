import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArmsLengthContext, ClaimCheck, ClaimVerdict, EventKind, EvidenceClass } from "../../../shared/cofactory/evidence.ts";
import { guardedGet, type Answer } from "../../link-preview/net.ts";
import { armsLength, armsLengthPayers, classifyEvent } from "../truth/classify.ts";
import { openTruth, type PageFetcher } from "../truth/store.ts";
import { openBook } from "../book.ts";
import { createObserver } from "../observe/observer.ts";
import { openObserveStore } from "../observe/store.ts";
import { traceProblem } from "../observe/trace.ts";
import { createSessions } from "../runtime/sessions.ts";
import { openRuntimeStore } from "../runtime/store.ts";
import { createWorkspaces } from "../runtime/workspace.ts";
import { runTool } from "../tools.ts";
import type { Suite } from "./harness.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const FIXTURE_HOST = "fixtures.cofactory.test";
const readFixture = (name: string) => readFileSync(new URL(name, FIXTURES), "utf8");

/**
 * dusk's real guarded fetch with the network swapped for fixture files: the address checks still run, so a private
 * address is refused exactly as it would be live.
 */
export const fixtureFetcher: PageFetcher = (url) => guardedGet(url, {
  limit: 3_000_000, partial: true, accept: (type) => /^text\/html|^text\/plain|^application\/pdf/.test(type), headers: {}, signal: AbortSignal.timeout(5_000),
}, {
  resolve: async (host) => {
    if (host === FIXTURE_HOST || host.endsWith(".test")) return [{ address: "93.184.216.34", family: 4 }];
    if (/^[\d.]+$/.test(host)) return [{ address: host, family: 4 }];
    throw new Error("no network in evals");
  },
  request: async (target): Promise<Answer> => {
    const page = { "/forum": "forum.html", "/pricing": "pricing.html", "/spa": "spa.html", "/jobs": "jobs.html", "/regulator": "regulator.html", "/reviews": "reviews.html", "/guidance.pdf": "guidance.pdf" }[target.pathname];
    if (!page) return { status: 404, location: null, type: "text/html", body: Buffer.from("not found"), truncated: false };
    if (page.endsWith(".pdf")) return { status: 200, location: null, type: "application/pdf", body: readFileSync(new URL(`pages/${page}`, FIXTURES)), truncated: false };
    return { status: 200, location: null, type: "text/html; charset=utf-8", body: Buffer.from(readFixture(`pages/${page}`)), truncated: false };
  },
});

type ClaimCase = { id: string; url: string; quote: string | null; expect: ClaimVerdict };
export type ClaimChecker = (input: { url: string; quote: string | null }) => Promise<ClaimCheck>;

/** A claim checker on a throwaway evidence store fed by the fixtures. */
export function fixtureClaimChecker(): { check: ClaimChecker; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-truth-"));
  const truth = openTruth(dir, { fetch: fixtureFetcher });
  return { check: (input) => truth.checkClaim(input), close: () => { truth.close(); rmSync(dir, { recursive: true, force: true }); } };
}

/** Quote and link verification. A false claim marked verified is the one error that is never allowed. */
export function claimSuite(make: () => { check: ClaimChecker; close(): void } = fixtureClaimChecker): Suite {
  return {
    name: "claims",
    async run() {
      const cases = JSON.parse(readFixture("claims.json")) as ClaimCase[];
      const checker = make();
      const failures: string[] = [];
      let correct = 0, falseVerified = 0;
      try {
        for (const item of cases) {
          const result = await checker.check({ url: item.url, quote: item.quote });
          if (result.verdict === item.expect) correct++;
          else failures.push(`${item.id}: expected ${item.expect}, got ${result.verdict} (${result.reason})`);
          if (result.verdict === "verified" && item.expect !== "verified") falseVerified++;
        }
      } finally {
        checker.close();
      }
      const accuracy = correct / cases.length;
      return { name: "claims", pass: falseVerified === 0 && accuracy >= 0.95, metrics: { accuracy, false_verified: falseVerified, cases: cases.length }, failures };
    },
  };
}

type ReplyCase = { id: string; kind: EventKind; text: string | null; expect: EvidenceClass };

/** Evidence classes. Calling anything but money `committed` is never allowed; the rest has an accuracy bar. */
export function evidenceClassSuite(classify: (kind: EventKind, text: string | null) => EvidenceClass = classifyEvent): Suite {
  return {
    name: "evidence-classes",
    async run() {
      const cases = JSON.parse(readFixture("replies.json")) as ReplyCase[];
      const failures: string[] = [];
      let correct = 0, falseCommitted = 0, falseUrgent = 0;
      for (const item of cases) {
        const got = classify(item.kind, item.text);
        if (got === item.expect) correct++;
        else failures.push(`${item.id}: expected ${item.expect}, got ${got} (${JSON.stringify(item.text)})`);
        if (got === "committed" && item.expect !== "committed") falseCommitted++;
        if (got === "urgent" && (item.expect === "hypothetical" || item.expect === "rejected" || item.expect === "noise")) falseUrgent++;
      }
      const accuracy = correct / cases.length;
      return {
        name: "evidence-classes", pass: falseCommitted === 0 && accuracy >= 0.85,
        metrics: { accuracy, false_committed: falseCommitted, false_urgent: falseUrgent, cases: cases.length }, failures,
      };
    },
  };
}

type PaymentFixture = {
  context: Omit<ArmsLengthContext, "refunded"> & { refunded: string[] };
  cases: Array<{ id: string; payment: Parameters<typeof armsLength>[0]; expect: boolean }>;
  distinctPayers: { payments: string[]; expect: number };
};

/** Arm's-length payment rules are deterministic, so every case must be right. */
export function armsLengthSuite(check: typeof armsLength = armsLength): Suite {
  return {
    name: "arms-length",
    async run() {
      const fixture = JSON.parse(readFixture("payments.json")) as PaymentFixture;
      const ctx: ArmsLengthContext = { ...fixture.context, refunded: new Set(fixture.context.refunded) };
      const failures: string[] = [];
      let correct = 0, falseAccepted = 0;
      for (const item of fixture.cases) {
        const verdict = check(item.payment, ctx);
        if (verdict.ok === item.expect) correct++;
        else failures.push(`${item.id}: expected ${item.expect ? "accepted" : "refused"}, got ${verdict.ok ? "accepted" : `refused (${verdict.reasons.join("; ")})`}`);
        if (verdict.ok && !item.expect) falseAccepted++;
      }
      const chosen = fixture.distinctPayers.payments.map((id) => fixture.cases.find((item) => item.payment.externalId === id)!.payment);
      const payers = armsLengthPayers(chosen, ctx);
      if (payers !== fixture.distinctPayers.expect) failures.push(`distinct payers: expected ${fixture.distinctPayers.expect}, got ${payers}`);
      const accuracy = correct / fixture.cases.length;
      return {
        name: "arms-length", pass: falseAccepted === 0 && accuracy === 1 && payers === fixture.distinctPayers.expect,
        metrics: { accuracy, false_accepted: falseAccepted, distinct_payer_errors: Math.abs(payers - fixture.distinctPayers.expect) }, failures,
      };
    },
  };
}



const GATE_TOOLS = new Set(["cofactory_authorize_spend", "cofactory_capture_spend", "cofactory_void_spend", "cofactory_advance_stage", "cofactory_launch_company", "cofactory_top_up", "cofactory_kill_company", "cofactory_end_session"]);

/**
 * Traceability: a scripted factory run through the real tools, then every gate decision is checked. Each gate tool
 * call must have filed exactly one decision, and each decision must carry a cost snapshot and evidence that resolves.
 */
export function traceabilitySuite(): Suite {
  return {
    name: "traceability",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-trace-"));
      const book = openBook(join(dir, "cofactory.db"), { policy: { maxLiveCompanies: 2 } });
      const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher });
      const store = openObserveStore(join(dir, "observe.db"));
      const runtime = openRuntimeStore(join(dir, "runtime.db"));
      const observe = createObserver({ store, book });
      const sessions = createSessions({ store: runtime, book, workspaces: createWorkspaces(join(dir, "companies"), { git: false }), turns: { threadFor: () => "t", start: async () => {}, interrupt: async () => {} } });
      const failures: string[] = [];
      try {
        book.deposit(20_000, "owner");
        const lead = { botId: "lead", role: "lead" as const, companyId: null };
        book.seat(lead);
        const call = (seat: Parameters<typeof runTool>[0]["seat"], name: string, args: unknown) =>
          runTool({ book, truth, seat, actor: `${seat.role}:eval`, observe, sessions, session: runtime.liveFor(seat.botId) }, name, args);
        const launched = await call(lead, "cofactory_launch_company", { name: "Tender Watch", brief: "HVAC tender digests", cap_cents: 4_000 });
        await call(lead, "cofactory_launch_company", { name: "Too Small", brief: "x", cap_cents: 100 });
        const companyId = (launched.structuredContent as { company: { id: string } }).company.id;
        const ceo = { botId: "ceo", role: "ceo" as const, companyId };
        const builder = { botId: "builder", role: "builder" as const, companyId };
        book.seat(ceo);
        book.seat(builder);
        await sessions.request({ companyId, botId: "ceo", kind: "operating", trigger: "eval", objective: "o", doneWhen: "d" });
        const held = await call(builder, "cofactory_authorize_spend", { category: "infra", vendor: "porkbun", cents: 1_200, purpose: "domain" });
        const holdId = (held.structuredContent as { hold: { id: string } }).hold.id;
        await call(builder, "cofactory_capture_spend", { hold_id: holdId, receipt: "inv-1" });
        await call(builder, "cofactory_authorize_spend", { category: "distribution", vendor: "ads", cents: 500, purpose: "ads" });
        const second = await call(builder, "cofactory_authorize_spend", { category: "cogs", vendor: "api", cents: 300, purpose: "api" });
        await call(builder, "cofactory_void_spend", { hold_id: (second.structuredContent as { hold: { id: string } }).hold.id });
        await call(ceo, "cofactory_advance_stage", { to: "market", evidence: { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/gone" } });
        await call(ceo, "cofactory_advance_stage", { to: "market", evidence: { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/pricing" } });
        truth.recordEvent({ source: "mailbox", externalId: "cold", companyId, kind: "reply", occurredAt: 1, text: "keep me posted" });
        truth.recordEvent({ source: "mailbox", externalId: "hot", companyId, kind: "reply", occurredAt: 2, text: "How much for our office? Send me an invoice." });
        await call(ceo, "cofactory_advance_stage", { to: "sell", evidence: { kind: "selling_signal", source: "inbound", ref: "cold" } });
        await call(ceo, "cofactory_advance_stage", { to: "sell", evidence: { kind: "selling_signal", source: "inbound", ref: "hot" } });
        book.recordRevenue({ companyId, cents: 9_900, receipt: "ch_1" }, "stripe");
        await call(ceo, "cofactory_advance_stage", { to: "manage" });
        await call(ceo, "cofactory_end_session", { outcome: "done", summary: "no journal yet" });
        await call(ceo, "cofactory_journal", { did: "advanced to manage" });
        await call(ceo, "cofactory_end_session", { outcome: "done", summary: "advanced" });
        await call(lead, "cofactory_top_up", { company_id: companyId, cents: 1_000 });
        await call(lead, "cofactory_kill_company", { company_id: companyId, reason: "metric", why: "eval over" });

        const decisions = store.decisions();
        const gateCalls = store.toolCalls().filter((record) => GATE_TOOLS.has(record.tool));
        let traceable = 0;
        for (const decision of decisions) {
          const problem = traceProblem({ book, truth, runtime }, decision);
          if (problem) failures.push(`${decision.kind} ${decision.verdict}: ${problem}`);
          else traceable++;
        }
        const missing = Math.abs(gateCalls.length - decisions.length);
        if (missing) failures.push(`${gateCalls.length} gate tool calls but ${decisions.length} decisions`);
        const refused = decisions.filter((decision) => decision.verdict === "refused").length;
        const fraction = decisions.length ? traceable / decisions.length : 0;
        return {
          name: "traceability", pass: decisions.length >= 15 && fraction === 1 && missing === 0 && refused >= 5,
          metrics: { traceable: fraction, decisions: decisions.length, refused, missing_decision_errors: missing }, failures,
        };
      } finally {
        store.close(); runtime.close(); truth.close(); book.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export const FOUNDATION_SUITES: readonly Suite[] = [claimSuite(), evidenceClassSuite(), armsLengthSuite(), traceabilitySuite()];
