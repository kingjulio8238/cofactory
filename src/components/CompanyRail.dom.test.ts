// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ dispatch: vi.fn(), state: { bots: [] as unknown[], selectedId: "lead" } }));
vi.mock("@/state/store", () => ({
  useStore: () => ({ state: f.state, dispatch: f.dispatch }),
  api: async () => ({
    onboarded: true,
    factory: { botIds: ["lead", "scout"], leadBotId: "lead", needs: 1 },
    companies: [
      { id: "a", name: "Consign Payouts", stage: "build", capCents: 5_000, availableCents: 4_200, live: false, needs: 2, botIds: ["ceo-a", "builder-a"], ceoBotId: "ceo-a" },
      { id: "b", name: "Tender Watch", stage: "market", capCents: 5_000, availableCents: 3_000, live: true, needs: 0, botIds: ["ceo-b"], ceoBotId: "ceo-b" },
    ],
  }),
}));
vi.stubEnv("VITE_COFACTORY", "");
const { CompanyRail } = await import("./CompanyRail");
const { factoryScope } = await import("@/lib/factory-scope");
const { factoryHomeOpen } = await import("@/lib/factory-home");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ""; f.dispatch.mockReset(); });

describe("the company rail", () => {
  it("lists the factory and each live company with what needs the owner, and scopes the window to the one chosen", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    await act(async () => { createRoot(host).render(createElement(CompanyRail)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const items = [...host.querySelectorAll<HTMLButtonElement>("[data-company-rail-item]")];
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(["Factory, needs you (1)", "Consign Payouts, needs you (2)", "Tender Watch"]);
    expect(items[1]!.title).toBe("Consign Payouts · Build · $42 of $50 · not live yet");
    expect(factoryScope(), "opens on the factory").toMatchObject({ kind: "factory", companyBots: ["ceo-a", "builder-a", "ceo-b"] });

    await act(async () => { items[1]!.click(); });
    expect(factoryScope()).toEqual({ kind: "company", companyId: "a", bots: ["ceo-a", "builder-a"] });
    expect(f.dispatch).toHaveBeenCalledWith({ type: "select", id: "ceo-a" });
    expect(items[1]!.getAttribute("aria-current")).toBe("page");

    f.dispatch.mockReset();
    await act(async () => { items[0]!.click(); });
    expect(factoryHomeOpen(), "the factory is its Home, the companies to pick from").toBe(true);
    expect(f.dispatch, "not the lead's chat").not.toHaveBeenCalled();
  });
});
