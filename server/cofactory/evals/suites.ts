import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArmsLengthContext, ClaimCheck, ClaimVerdict, EventKind, EvidenceClass } from "../../../shared/cofactory/evidence.ts";
import { guardedGet, type Answer } from "../../link-preview/net.ts";
import { armsLength, armsLengthPayers, classifyEvent } from "../truth/classify.ts";
import { openTruth, type PageFetcher } from "../truth/store.ts";
import type { Suite } from "./harness.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const FIXTURE_HOST = "fixtures.cofactory.test";
const readFixture = (name: string) => readFileSync(new URL(name, FIXTURES), "utf8");

/**
 * dusk's real guarded fetch with the network swapped for fixture files: the address checks still run, so a private
 * address is refused exactly as it would be live.
 */
export const fixtureFetcher: PageFetcher = (url) => guardedGet(url, {
  limit: 3_000_000, partial: true, accept: (type) => /^text\/html|^text\/plain/.test(type), headers: {}, signal: AbortSignal.timeout(5_000),
}, {
  resolve: async (host) => {
    if (host === FIXTURE_HOST) return [{ address: "93.184.216.34", family: 4 }];
    if (/^[\d.]+$/.test(host)) return [{ address: host, family: 4 }];
    throw new Error("no network in evals");
  },
  request: async (target): Promise<Answer> => {
    const page = { "/forum": "forum.html", "/pricing": "pricing.html", "/spa": "spa.html" }[target.pathname];
    if (!page) return { status: 404, location: null, type: "text/html", body: Buffer.from("not found"), truncated: false };
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

export const FOUNDATION_SUITES: readonly Suite[] = [claimSuite(), evidenceClassSuite(), armsLengthSuite()];
