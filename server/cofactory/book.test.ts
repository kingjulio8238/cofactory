import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { openBook, type Book, type BookOptions } from "./book.ts";

const DAY = 24 * 60 * 60_000;
const open: Array<{ book: Book; dir: string }> = [];
afterEach(() => {
  for (const { book, dir } of open.splice(0)) {
    book.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function fresh(options: BookOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-book-"));
  let at = Date.UTC(2026, 10, 17);
  const book = openBook(join(dir, "cofactory.db"), { now: () => at, ...options });
  open.push({ book, dir });
  return { book, file: join(dir, "cofactory.db"), tick: (ms: number) => { at += ms; } };
}

function funded(options: BookOptions = {}) {
  const ctx = fresh(options);
  ctx.book.deposit(10_000, "owner");
  ctx.book.setReserve(2_000, "lead");
  const launched = ctx.book.launch({ name: "Selltraces supplier", brief: "List traces on Selltraces", capCents: 4_000 }, "launcher");
  if (!launched.ok) throw new Error(launched.reason);
  return { ...ctx, company: launched.company };
}

describe("cofactory book", () => {
  it("splits a $100 deposit into reserve, a capped company and unallocated", () => {
    const { book, company } = funded();
    expect(book.balance("reserve")).toBe(2_000);
    expect(book.balance(`company:${company.id}`)).toBe(4_000);
    expect(book.balance("unallocated")).toBe(4_000);
    expect(company).toMatchObject({ stage: "build", status: "live", capCents: 4_000 });
  });

  it("refuses a launch past the live limit, below the minimum stake, or beyond unallocated money", () => {
    const { book } = funded();
    expect(book.launch({ name: "Second", brief: "", capCents: 3_000 }, "launcher")).toMatchObject({ ok: false });
    const roomy = funded({ policy: { maxLiveCompanies: 3 } }).book;
    expect(roomy.launch({ name: "Tiny", brief: "", capCents: 1_000 }, "launcher")).toMatchObject({ ok: false, reason: expect.stringContaining("minimum stake") });
    expect(roomy.launch({ name: "Huge", brief: "", capCents: 5_000 }, "launcher")).toMatchObject({ ok: false, reason: expect.stringContaining("unallocated") });
  });

  it("spends only through an authorization, and never past what the company holds", () => {
    const { book, company } = funded();
    const auth = book.authorize({ companyId: company.id, category: "infra", vendor: "porkbun", cents: 1_200 }, "builder");
    if (!auth.ok) throw new Error(auth.reason);
    expect(book.available(company.id)).toBe(2_800);
    expect(book.authorize({ companyId: company.id, category: "infra", vendor: "vercel", cents: 3_000 }, "builder")).toMatchObject({ ok: false });
    expect(book.capture(auth.authorization.id, { cents: 1_500, receipt: "r1" }, "builder")).toMatchObject({ ok: false });
    const captured = book.capture(auth.authorization.id, { cents: 1_100, receipt: "porkbun-inv-1" }, "builder");
    expect(captured).toMatchObject({ ok: true, entry: { kind: "spend", cents: 1_100, vendor: "porkbun", category: "infra" } });
    expect(book.balance(`company:${company.id}`)).toBe(2_900);
    expect(book.capture(auth.authorization.id, { receipt: "again" }, "builder")).toMatchObject({ ok: false, reason: "authorization is captured" });
  });

  it("lets an unused hold lapse instead of pinning the money", () => {
    const { book, company, tick } = funded();
    const auth = book.authorize({ companyId: company.id, category: "cogs", vendor: "api", cents: 4_000 }, "builder");
    if (!auth.ok) throw new Error(auth.reason);
    expect(book.available(company.id)).toBe(0);
    tick(book.policy.authorizationTtlMs + 1);
    expect(book.available(company.id)).toBe(4_000);
    expect(book.capture(auth.authorization.id, { receipt: "late" }, "builder")).toMatchObject({ ok: false, reason: "authorization lapsed" });
  });

  it("keeps gated spend for the owner and distribution closed until a selling signal", () => {
    const { book, company } = funded();
    expect(book.authorize({ companyId: company.id, category: "gated", vendor: "x", cents: 100 }, "ceo")).toMatchObject({ ok: false });
    expect(book.authorize({ companyId: company.id, category: "distribution", vendor: "meta-ads", cents: 500 }, "marketer"))
      .toMatchObject({ ok: false, reason: expect.stringContaining("selling signal") });
  });

  it("advances stages only on evidence the auditor can look up", () => {
    const { book, company } = funded();
    expect(book.advance(company.id, "sell", null, "ceo")).toMatchObject({ ok: false });
    expect(book.advance(company.id, "market", null, "ceo")).toMatchObject({ ok: false, reason: expect.stringContaining("path_live") });
    expect(book.advance(company.id, "market", { kind: "path_live", source: "form", ref: "form-submit-123" }, "ceo")).toMatchObject({ ok: true });
    expect(book.advance(company.id, "sell", { kind: "selling_signal", source: "inbound", ref: "mail-42" }, "ceo")).toMatchObject({ ok: true });
    expect(book.advance(company.id, "manage", null, "ceo")).toMatchObject({ ok: false, reason: expect.stringContaining("revenue") });
    book.recordRevenue({ companyId: company.id, cents: 2_500, receipt: "ch_1" }, "stripe");
    expect(book.advance(company.id, "manage", null, "ceo")).toMatchObject({ ok: true, company: { stage: "manage" } });
    expect(book.events(company.id).map((event) => event.type)).toEqual(["launch", "advance", "advance", "advance"]);
    expect(book.balance("unallocated")).toBe(6_500);
  });

  it("freezing stops money moving and voids open holds", () => {
    const { book, company } = funded();
    const auth = book.authorize({ companyId: company.id, category: "infra", vendor: "porkbun", cents: 1_000 }, "builder");
    if (!auth.ok) throw new Error(auth.reason);
    expect(book.freeze(company.id, "owner", "kill switch")).toMatchObject({ ok: true });
    expect(book.capture(auth.authorization.id, { receipt: "r" }, "builder")).toMatchObject({ ok: false });
    expect(book.authorize({ companyId: company.id, category: "infra", vendor: "porkbun", cents: 100 }, "builder")).toMatchObject({ ok: false, reason: "company is frozen" });
    expect(book.unfreeze(company.id, "owner")).toMatchObject({ ok: true });
    expect(book.available(company.id)).toBe(4_000);
  });

  it("a kill returns the company's remaining money to unallocated and frees the slot", () => {
    const { book, company } = funded();
    const auth = book.authorize({ companyId: company.id, category: "infra", vendor: "porkbun", cents: 1_000 }, "builder");
    if (!auth.ok) throw new Error(auth.reason);
    book.capture(auth.authorization.id, { receipt: "inv" }, "builder");
    expect(book.kill(company.id, "metric", "lead", "no attention after 7 days")).toMatchObject({ ok: true, releasedCents: 3_000 });
    expect(book.balance(`company:${company.id}`)).toBe(0);
    expect(book.balance("unallocated")).toBe(7_000);
    expect(book.launch({ name: "Next", brief: "", capCents: 4_000 }, "launcher")).toMatchObject({ ok: true });
  });

  it("never lets a bucket go below zero", () => {
    const { book, company } = funded();
    expect(() => book.recordRefund({ companyId: company.id, cents: 4_001, receipt: "re_1" }, "seller")).toThrow(/cannot cover/);
    expect(book.balance("unallocated")).toBe(4_000);
  });

  it("records subscription model cost as shadow spend without moving money", () => {
    const { book, company } = funded();
    book.recordShadow({ companyId: company.id, cents: 730, vendor: "claude-opus", note: "turn t1" }, "harness");
    expect(book.balance(`company:${company.id}`)).toBe(4_000);
    expect(book.entries({ companyId: company.id }).at(-1)).toMatchObject({ kind: "shadow", from: null, to: null, category: "intelligence" });
  });

  it("refuses to edit or delete ledger rows, even with direct SQL", () => {
    const { book, file } = funded();
    const raw = new DatabaseSync(file);
    try {
      expect(() => raw.exec("UPDATE entries SET cents = 1")).toThrow(/append-only/);
      expect(() => raw.exec("DELETE FROM entries")).toThrow(/append-only/);
    } finally {
      raw.close();
    }
    expect(book.entries().length).toBe(3);
  });

  it("the auditor recommends a kill when build burns 40% of the cap, and on a stall", () => {
    const { book, company } = funded();
    expect(book.audit()).toEqual([]);
    const auth = book.authorize({ companyId: company.id, category: "infra", vendor: "vercel", cents: 1_600 }, "builder");
    if (!auth.ok) throw new Error(auth.reason);
    book.capture(auth.authorization.id, { receipt: "inv" }, "builder");
    expect(book.audit()).toEqual([expect.objectContaining({ companyId: company.id, action: "kill", killReason: "cap" })]);

    const other = funded();
    other.tick(8 * DAY);
    expect(other.book.audit()).toEqual([expect.objectContaining({ action: "kill", killReason: "stall" })]);
  });
});
