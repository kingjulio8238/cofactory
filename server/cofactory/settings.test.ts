import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openBook } from "./book.ts";
import { createObserver } from "./observe/observer.ts";
import { openObserveStore } from "./observe/store.ts";
import { openRuntimeStore } from "./runtime/store.ts";
import { closeIdleCompanies, DEFAULT_SETTINGS, startingStakeLimit, topUpProblem, type FactorySettings } from "./settings.ts";

const DAY = 24 * 60 * 60_000;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

describe("the owner's money settings", () => {
  const dynamic: FactorySettings = { ...DEFAULT_SETTINGS, budgetCents: 50_000 };
  const fixed: FactorySettings = { ...DEFAULT_SETTINGS, budgetCents: 50_000, allocation: "fixed", companyCapCents: 4_000 };

  it("starts a company with a tenth of the month under dynamic allocation, and at the cap under fixed", () => {
    expect(startingStakeLimit(dynamic)).toBe(5_000);
    expect(startingStakeLimit({ ...dynamic, budgetCents: 10_000 }), "never below the minimum stake").toBe(2_500);
    expect(startingStakeLimit(fixed)).toBe(4_000);
  });

  it("tops up only what is earning under dynamic allocation, and never past the cap under fixed", () => {
    expect(topUpProblem(dynamic, { capCents: 5_000 }, 10_000, 0)).toMatch(/made money/);
    expect(topUpProblem(dynamic, { capCents: 5_000 }, 10_000, 4_500)).toBeNull();
    expect(topUpProblem(fixed, { capCents: 4_000 }, 1, 9_000)).toMatch(/caps each company/);
  });

  it("closes a company with no paying customer after the owner's days, or asks first when the owner approves closes", () => {
    const dir = mkdtempSync(join(tmpdir(), "cofactory-close-"));
    let at = Date.UTC(2026, 10, 18, 9);
    const book = openBook(join(dir, "book.db"), { now: () => at, policy: { maxLiveCompanies: 3 } });
    const store = openRuntimeStore(join(dir, "runtime.db"), () => at);
    const observeStore = openObserveStore(join(dir, "observe.db"));
    cleanups.push(() => { book.close(); store.close(); observeStore.close(); rmSync(dir, { recursive: true, force: true }); });
    const observe = createObserver({ store: observeStore, book });
    book.deposit(20_000, "owner");
    const idle = book.launch({ name: "Idle Co", brief: "x", capCents: 4_000 }, "lead");
    const earning = book.launch({ name: "Earning Co", brief: "x", capCents: 4_000 }, "lead");
    if (!idle.ok || !earning.ok) throw new Error("launch");
    book.recordRevenue({ companyId: earning.company.id, cents: 4_500, receipt: "pi_1" }, "intake");
    const run = (settings: FactorySettings) => closeIdleCompanies({ book, settings, store, observe, now: () => at });

    at += 4 * DAY;
    run(DEFAULT_SETTINGS);
    expect(book.company(idle.company.id)!.status, "inside the five days").toBe("live");

    at += 1 * DAY + 1;
    run({ ...DEFAULT_SETTINGS, approvals: { ...DEFAULT_SETTINGS.approvals, kill: "ask" } });
    run({ ...DEFAULT_SETTINGS, approvals: { ...DEFAULT_SETTINGS.approvals, kill: "ask" } });
    expect(book.company(idle.company.id)!.status).toBe("live");
    expect(book.inbox("owner", null).filter((message) => message.type === "kill"), "asked once").toHaveLength(1);

    run(DEFAULT_SETTINGS);
    expect(book.company(idle.company.id)!.status).toBe("killed");
    expect(book.company(earning.company.id)!.status, "a company with a paying customer stays").toBe("live");
    expect(observeStore.decisions().filter((decision) => decision.kind === "company.kill").map((decision) => decision.reason)).toEqual([expect.stringContaining("no paying customer 5 days after launch")]);
  });
});
