// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const card = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  card: {
    id, status, companyId: null, note: null, ...extra,
    body: {
      name: `Company ${id}`, headline: "Your monthly DIR fee report, done for you",
      priceToday: { url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month", amountCents: 60_000, per: "month" },
      offer: { priceCents: 15_000, per: "month" },
      rival: { name: "RemitCheck", url: "https://vendor-site.test/pricing", whatTheyMiss: "only sells to chains", priceCents: 4_900 },
      exampleBuyer: { name: "Riverside Pharmacy 1", url: "https://buyers-site.test/buyer-1" },
    },
  },
  niche: { buyer: "independent pharmacies in Ohio", job: "DIR fee reports", channel: "association forum" },
  quotes: [{ url: "https://forum-site.test/thread-1", site: "forum-site.test", quote: "it eats a whole weekend" }, { url: "https://qa-site.test/thread-2", site: "qa-site.test", quote: "we do it by hand" }],
});

const f = vi.hoisted(() => ({
  posts: [] as Array<{ path: string; body: unknown }>,
  view: null as unknown,
  dispatch: vi.fn(),
}));
vi.mock("@/state/store", () => ({
  useStore: () => ({ state: { selectedId: "lead", bots: [] }, dispatch: f.dispatch }),
  api: async (path: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") { f.posts.push({ path, body: JSON.parse(init.body ?? "{}") }); return { ok: true }; }
    if (path === "/api/cofactory/rail") return { onboarded: true, factory: { botIds: [], leadBotId: null, needs: 0 }, companies: [{ id: "co-1", name: "Company d", ceoBotId: "ceo-1", botIds: ["ceo-1"] }] };
    return f.view;
  },
}));
vi.mock("@/lib/app-links", () => ({ openExternalLink: vi.fn(async () => {}) }));
vi.stubEnv("VITE_COFACTORY", "");
const { FactoryHome } = await import("./FactoryHome");
const { factoryHomeOpen, openFactoryHome } = await import("@/lib/factory-home");
const { factoryScope } = await import("@/lib/factory-scope");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ""; f.posts.length = 0; f.dispatch.mockReset(); });

async function show(view: unknown) {
  f.view = view;
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => { createRoot(host).render(createElement(FactoryHome)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return host;
}
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === text)!;
const base = { search: { state: "searching", niches: 5, target: 8, signals: 14, sites: 9 }, finds: [], writing: [], cards: [], startCents: 5_000, startProblem: null };

describe("the factory's Home", () => {
  it("shows the search filling in, each card with its evidence, and sends the owner's Start and Pass", async () => {
    const host = await show({ ...base, writing: [{ nicheId: "n-3", buyer: "hatcheries", job: "biosecurity logbooks" }], cards: [card("a", "ready"), card("b", "ready")] });
    expect(host.querySelector("h1")!.textContent).toBe("Pick your first companies");
    expect(host.querySelector("[data-pick-search]")!.textContent).toBe("Your scout is searching: 5 of 8 ideas so far, from 14 quotes on 9 sites.");
    expect(host.querySelector("[data-pick-writing]")!.textContent).toBe("Checking the evidence: biosecurity logbooks, for hatcheries");
    const [first] = host.querySelectorAll<HTMLElement>("[data-pick-card]");
    expect(first!.textContent).toContain("Buyers pay$600/mo today");
    expect(first!.textContent).toContain("We charge$150/mo");
    expect(first!.querySelector("[data-pick-evidence]"), "the evidence opens on request").toBeNull();
    await act(async () => { button(first!, "See the evidence").click(); });
    expect(first!.querySelector("[data-pick-evidence]")!.textContent).toContain("A buyer who fits: Riverside Pharmacy 1");

    await act(async () => { button(first!, "Start with $50").click(); });
    expect(f.posts).toEqual([{ path: "/api/cofactory/cards/a", body: { decision: "start" } }]);

    const second = host.querySelectorAll<HTMLElement>("[data-pick-card]")[1]!;
    await act(async () => { button(second, "Pass").click(); });
    const reason = second.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "too close to legal work");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { second.querySelector<HTMLButtonElement>("[data-pick-pass-confirm]")!.click(); });
    expect(f.posts[1]).toEqual({ path: "/api/cofactory/cards/b", body: { decision: "pass", reason: "too close to legal work" } });
  });

  it("says what became of a started card, opens a launched company's CEO, and keeps Start off when the money is short", async () => {
    openFactoryHome();
    const host = await show({ ...base, search: { state: "idle", niches: 0, target: 0, signals: 0, sites: 0 }, startProblem: "fund the factory first",
      cards: [card("s", "started", { note: "not enough unallocated money" }), card("d", "launched", { companyId: "co-1" }), card("u", "unconfirmed", { note: "the buyer count does not check out" }), card("r", "ready")] });
    expect(host.querySelector("h1")!.textContent).toBe("Pick your next company");
    const [started, launched, unconfirmed, ready] = host.querySelectorAll<HTMLElement>("[data-pick-card]");
    expect(started!.textContent).toContain("It opens by itself once the full research holds up. Waiting on: not enough unallocated money.");
    expect(unconfirmed!.textContent).toContain("Couldn't confirm it: the buyer count does not check out. No money moved.");
    expect(button(ready!, "Start with $50").disabled).toBe(true);
    expect(ready!.textContent).toContain("You can't start one yet: fund the factory first.");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => { button(launched!, "Open Company d").click(); });
    expect(f.dispatch).toHaveBeenCalledWith({ type: "select", id: "ceo-1" });
    expect(factoryHomeOpen()).toBe(false);
    expect(factoryScope(), "and the window shows that company").toEqual({ kind: "company", companyId: "co-1", bots: ["ceo-1"] });
  });
});
