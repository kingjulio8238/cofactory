import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Membership } from "../../shared/cofactory/types.ts";
import { openBook, type Book } from "./book.ts";
import { fixtureFetcher } from "./evals/suites.ts";
import { openTruth, type Truth } from "./truth/store.ts";
import { routeProblem, runTool, toolsFor } from "./tools.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

function factory() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-tools-"));
  const book = openBook(join(dir, "cofactory.db"), { policy: { maxLiveCompanies: 2 } });
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher });
  truths.set(book, truth);
  cleanups.push(() => { book.close(); truth.close(); rmSync(dir, { recursive: true, force: true }); });
  book.deposit(10_000, "owner");
  const a = book.launch({ name: "A", brief: "a", capCents: 4_000 }, "owner");
  const b = book.launch({ name: "B", brief: "b", capCents: 4_000 }, "owner");
  if (!a.ok || !b.ok) throw new Error("launch failed");
  return { book, truth, a: a.company.id, b: b.company.id };
}

const text = (result: { content: Array<{ text: string }> }) => result.content[0]!.text;
const truths = new Map<Book, Truth>();
const call = (book: Book, seat: Membership, name: string, args: unknown = {}) => runTool({ book, truth: truths.get(book)!, seat, actor: `${seat.role}:bot` }, name, args);

describe("cofactory tools", () => {
  it("lists only the tools a seat may use", async () => {
    const names = (role: Parameters<typeof toolsFor>[0]) => toolsFor(role).map((tool) => tool.name);
    expect(names("builder")).toContain("cofactory_authorize_spend");
    expect(names("builder")).not.toContain("cofactory_advance_stage");
    expect(names("builder")).not.toContain("cofactory_launch_company");
    expect(names("ceo")).toContain("cofactory_advance_stage");
    expect(names("lead")).toEqual(expect.arrayContaining(["cofactory_launch_company", "cofactory_kill_company", "cofactory_top_up"]));
    expect(names("lead")).not.toContain("cofactory_authorize_spend");
    expect(toolsFor("ceo").find((tool) => tool.name === "cofactory_advance_stage")?.inputSchema).toMatchObject({ type: "object", required: ["to"] });
  });

  it("refuses a tool outside the seat, and malformed arguments, without touching the books", async () => {
    const { book, a } = factory();
    const builder: Membership = { botId: "b1", role: "builder", companyId: a };
    expect((await call(book, builder, "cofactory_launch_company", { name: "x", brief: "x", cap_cents: 3_000 }))).toMatchObject({ isError: true });
    expect(text((await call(book, builder, "cofactory_authorize_spend", { category: "infra", vendor: "v", cents: -5, purpose: "p" })))).toMatch(/invalid arguments: cents/);
    expect(book.entries().length).toBe(3);
  });

  it("a company seat can neither capture nor void another company's hold", async () => {
    const { book, a, b } = factory();
    const builderA: Membership = { botId: "b1", role: "builder", companyId: a };
    const builderB: Membership = { botId: "b2", role: "builder", companyId: b };
    const held = await call(book, builderA, "cofactory_authorize_spend", { category: "infra", vendor: "porkbun", cents: 1_000, purpose: "domain" });
    const authId = (held.structuredContent as { hold: { id: string } }).hold.id;
    expect((await call(book, builderB, "cofactory_capture_spend", { hold_id: authId, receipt: "r" }))).toMatchObject({ isError: true });
    expect((await call(book, builderB, "cofactory_void_spend", { hold_id: authId }))).toMatchObject({ isError: true });
    expect(book.authorization(authId)?.status).toBe("open");
    expect((await call(book, builderA, "cofactory_capture_spend", { hold_id: authId, receipt: "inv-1" }))).not.toHaveProperty("isError");
    expect(book.balance(`company:${a}`)).toBe(3_000);
  });

  it("follows the chain of command for typed messages", async () => {
    const { book, a, b } = factory();
    const exists = (id: string) => book.company(id) !== null;
    const builder: Membership = { botId: "b1", role: "builder", companyId: a };
    const ceo: Membership = { botId: "c1", role: "ceo", companyId: a };
    const lead: Membership = { botId: "l1", role: "lead", companyId: null };
    expect(routeProblem(builder, "ceo", a, exists)).toBeNull();
    expect(routeProblem(builder, "marketer", a, exists)).toMatch(/its CEO/);
    expect(routeProblem(builder, "owner", a, exists)).toMatch(/only the factory lead/);
    expect(routeProblem(ceo, "lead", a, exists)).toBeNull();
    expect(routeProblem(ceo, "ceo", b, exists)).toMatch(/own company/);
    expect(routeProblem(lead, "ceo", b, exists)).toBeNull();
    expect(routeProblem(lead, "builder", b, exists)).toMatch(/through its CEO/);
    expect(routeProblem(lead, "owner", null, exists)).toBeNull();
  });

  it("delivers a typed message with a standalone brief to the addressed seat's inbox", async () => {
    const { book, a } = factory();
    const ceo: Membership = { botId: "c1", role: "ceo", companyId: a };
    const builder: Membership = { botId: "b1", role: "builder", companyId: a };
    const sent = (await call(book, ceo, "cofactory_send", {
      type: "assign", to_role: "builder", reply_policy: "resume_requester",
      brief: { goal: "Ship a checkout page", known: "Stripe test keys are saved", done_when: "a test payment lands", constraints: "free hosting" },
    }));
    expect(sent).not.toHaveProperty("isError");
    const inbox = (await call(book, builder, "cofactory_inbox")).structuredContent as { messages: Array<{ type: string; brief: { doneWhen: string }; fromRole: string }> };
    expect(inbox.messages).toEqual([expect.objectContaining({ type: "assign", fromRole: "ceo", brief: expect.objectContaining({ doneWhen: "a test payment lands" }) })]);
    expect((await call(book, { botId: "m1", role: "marketer", companyId: a }, "cofactory_inbox")).structuredContent).toEqual({ messages: [] });
    expect((await call(book, ceo, "cofactory_send", { type: "report", to_role: "builder", reply_policy: "one_way", brief: { goal: "", done_when: "x" } }))).toMatchObject({ isError: true });
  });

  it("advances a stage only on evidence the world confirms", async () => {
    const { book, truth, a } = factory();
    const ceo: Membership = { botId: "c1", role: "ceo", companyId: a };
    const advance = (to: string, evidence: unknown) => call(book, ceo, "cofactory_advance_stage", { to, evidence });
    expect(text(await advance("market", { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/gone" }))).toMatch(/unreachable/);
    expect(text(await advance("market", { kind: "path_live", source: "form", ref: "form-77" }))).toMatch(/no external event form-77/);
    expect(await advance("market", { kind: "path_live", source: "webhook", ref: "https://fixtures.cofactory.test/pricing" })).not.toHaveProperty("isError");
    truth.recordEvent({ source: "mailbox", externalId: "msg-1", companyId: a, kind: "reply", occurredAt: 1, text: "Sounds cool, keep me posted." });
    expect(text(await advance("sell", { kind: "selling_signal", source: "inbound", ref: "msg-1" }))).toMatch(/hypothetical/);
    truth.recordEvent({ source: "mailbox", externalId: "msg-2", companyId: a, kind: "reply", occurredAt: 2, text: "How much for three stores? Send me an invoice." });
    expect(await advance("sell", { kind: "selling_signal", source: "inbound", ref: "msg-2" })).not.toHaveProperty("isError");
    expect(book.company(a)?.stage).toBe("sell");
  });

  it("checks a claim against the page for any seat", async () => {
    const { book, a } = factory();
    const scout: Membership = { botId: "s1", role: "scout", companyId: null };
    const marketer: Membership = { botId: "m1", role: "marketer", companyId: a };
    expect((await call(book, scout, "cofactory_check_claim", { url: "https://fixtures.cofactory.test/forum", quote: "nobody sells anything that fits a shop our size" })).structuredContent).toMatchObject({ check: { verdict: "verified" } });
    expect((await call(book, marketer, "cofactory_check_claim", { url: "https://fixtures.cofactory.test/pricing", quote: "Starts at $39 per store per month" })).structuredContent).toMatchObject({ check: { verdict: "missing" } });
  });

  it("gives the lead the portfolio and the auditor's view in its status", async () => {
    const { book } = factory();
    const status = (await call(book, { botId: "l1", role: "lead", companyId: null }, "cofactory_status")).structuredContent as { companies: unknown[]; unallocatedCents: number; recommendations: unknown[] };
    expect(status.companies).toHaveLength(2);
    expect(status.unallocatedCents).toBe(2_000);
    expect(status.recommendations).toEqual([]);
  });
});
