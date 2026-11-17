import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureFetcher } from "../evals/suites.ts";
import { openTruth, type PageFetcher } from "./store.ts";
import { htmlToText, quoteAppears } from "./text.ts";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

function truth(fetch: PageFetcher = fixtureFetcher) {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-truth-"));
  let at = 1_800_000_000_000;
  let calls = 0;
  const counted: PageFetcher = (url) => { calls++; return fetch(url); };
  const store = openTruth(dir, { fetch: counted, now: () => at, maxAgeMs: 60_000 });
  cleanups.push(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, dir, calls: () => calls, tick: (ms: number) => { at += ms; } };
}

describe("truth layer", () => {
  it("reads a page's visible text only", () => {
    const text = htmlToText("<html><head><title>T</title><script>secret()</script></head><body><!-- hidden --><p>Hello&nbsp;<b>there</b> &amp; you</p></body></html>");
    expect(text).toBe("Hello there & you");
  });

  it("needs every elided fragment, in order, and long enough to mean something", () => {
    const page = "We tried a big vendor but they wanted a contract. We went back to spreadsheets.";
    expect(quoteAppears("We tried a big vendor … We went back to spreadsheets", page).found).toBe(true);
    expect(quoteAppears("We went back to spreadsheets [...] We tried a big vendor", page).found).toBe(false);
    expect(quoteAppears("We ... spreadsheets", page).found).toBe(false);
  });

  it("keeps one content-addressed body per page and reuses a fresh snapshot", async () => {
    const { store, dir, calls, tick } = truth();
    const first = await store.snapshot("https://fixtures.cofactory.test/forum");
    const again = await store.snapshot("https://fixtures.cofactory.test/forum");
    expect(again.id).toBe(first.id);
    expect(calls()).toBe(1);
    tick(61_000);
    const later = await store.snapshot("https://fixtures.cofactory.test/forum");
    expect(later.id).not.toBe(first.id);
    expect(later.sha256).toBe(first.sha256);
    expect(readdirSync(join(dir, "snapshots"))).toEqual([`${first.sha256}.body`]);
    expect(await store.text(first.id)).toContain("nobody sells anything that fits a shop our size");
  });

  it("keeps every claim check, and they cannot be edited", async () => {
    const { store, dir } = truth();
    await store.checkClaim({ url: "https://fixtures.cofactory.test/pricing", quote: "Starts at $39 per store per month", subject: "dossier-1" });
    const raw = new DatabaseSync(join(dir, "evidence.db"));
    cleanups.push(() => raw.close());
    expect(raw.prepare("SELECT verdict, subject FROM claim_checks").all()).toEqual([{ verdict: "missing", subject: "dossier-1" }]);
    expect(() => raw.exec("UPDATE claim_checks SET verdict = 'verified'")).toThrow(/append-only/);
  });

  it("records an event once per source and id, however often it is delivered", () => {
    const { store } = truth();
    const input = { source: "stripe", externalId: "ch_1", kind: "payment" as const, occurredAt: 1, payerEmail: "dana@ruralrx.com", amountCents: 9_900 };
    const first = store.recordEvent(input);
    const again = store.recordEvent({ ...input, amountCents: 1 });
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, event: { id: first.event.id, amountCents: 9_900, evidenceClass: "committed" } });
    expect(store.events()).toHaveLength(1);
  });

  it("links a refund to its payment, in either arrival order", () => {
    const { store } = truth();
    store.recordEvent({ source: "stripe", externalId: "re_1", kind: "refund", refundOf: "ch_2", occurredAt: 2 });
    const late = store.recordEvent({ source: "stripe", externalId: "ch_2", kind: "payment", occurredAt: 1, payerEmail: "a@b.com", amountCents: 100 });
    expect(late.event.evidenceClass).toBe("rejected");
    store.recordEvent({ source: "stripe", externalId: "ch_3", kind: "payment", occurredAt: 3, payerEmail: "c@d.com", amountCents: 100 });
    store.recordEvent({ source: "stripe", externalId: "re_2", kind: "refund", refundOf: "ch_3", occurredAt: 4 });
    expect(store.refunded()).toEqual(new Set(["ch_2", "ch_3"]));
  });

  it("calls a page it cannot reach unreachable, never missing", async () => {
    const { store } = truth(async () => { throw new Error("socket hang up"); });
    expect(await store.checkClaim({ url: "https://example.com/x", quote: "anything that is long enough" })).toMatchObject({ verdict: "unreachable" });
  });
});
