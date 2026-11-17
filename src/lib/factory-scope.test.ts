import { describe, expect, it } from "vitest";

import { inFactoryScope } from "./factory-scope";

describe("the window's factory scope", () => {
  it("shows everything outside Cofactory, the factory and the owner's own bots in the factory, and one crew in a company", () => {
    expect(inFactoryScope({ kind: "all" }, "any")).toBe(true);
    const factory = { kind: "factory" as const, companyBots: ["ceo-a", "builder-a"] };
    expect(inFactoryScope(factory, "lead")).toBe(true);
    expect(inFactoryScope(factory, "my-own-bot")).toBe(true);
    expect(inFactoryScope(factory, "ceo-a")).toBe(false);
    const company = { kind: "company" as const, companyId: "a", bots: ["ceo-a", "builder-a"] };
    expect(inFactoryScope(company, "builder-a")).toBe(true);
    expect(inFactoryScope(company, "lead")).toBe(false);
  });
});
