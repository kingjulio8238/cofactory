import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openBook } from "../book.ts";
import { fixtureFetcher } from "../evals/suites.ts";
import { openTruth } from "../truth/store.ts";
import { cloudGate } from "./cloud-gate.ts";

const HOUR = 60 * 60_000;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

describe("the cloud gate", () => {
  it("opens only when companies earn, customers waited on an offline factory, and revenue pays for a machine", () => {
    const dir = mkdtempSync(join(tmpdir(), "cofactory-gate-"));
    let at = Date.UTC(2026, 10, 18, 9);
    const book = openBook(join(dir, "book.db"), { now: () => at, policy: { maxLiveCompanies: 5 } });
    const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now: () => at });
    cleanups.push(() => { book.close(); truth.close(); rmSync(dir, { recursive: true, force: true }); });
    let proven = 0;
    const gate = () => cloudGate({ book, truth, firstDollarCompanies: () => proven }, at);
    expect(gate()).toMatchObject({ ready: false, criteria: [{ met: false }, { met: false }, { met: false }] });

    book.deposit(20_000, "owner");
    const company = book.launch({ name: "A", brief: "x", capCents: 4_000 }, "lead");
    if (!company.ok) throw new Error(company.reason);
    book.recordRevenue({ companyId: company.company.id, cents: 9_000, receipt: "pi_1" }, "intake");
    for (const [index, late] of [[1, 8 * HOUR], [2, 7 * HOUR], [3, 10 * 60_000]] as const) {
      truth.recordEvent({ source: "mailbox", externalId: `<r${index}@x>`, companyId: company.company.id, kind: "reply", occurredAt: at - late, payerEmail: `b${index}@x.test`, text: "yes please" });
    }
    proven = 2;
    expect(gate().criteria.map((criterion) => criterion.met)).toEqual([false, true, true]);
    proven = 3;
    expect(gate().ready).toBe(true);
    at += 31 * 24 * HOUR;
    expect(gate().ready, "a month later the waits and revenue have aged out").toBe(false);
  });
});
