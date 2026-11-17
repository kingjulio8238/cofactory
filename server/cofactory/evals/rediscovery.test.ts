import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { matchesTarget, profileFor, rediscoveryRecall, sameBuyer, type RediscoveryTarget } from "./rediscovery.ts";

const targets = JSON.parse(readFileSync(new URL("../../../docs/cofactory/research/rediscovery/targets.json", import.meta.url), "utf8")) as RediscoveryTarget[];

describe("rediscovery", () => {
  it("has a target set of real post-cutoff businesses, each with a launch and revenue quote", () => {
    expect(targets.length).toBeGreaterThanOrEqual(5);
    for (const target of targets) {
      expect(target.launch_date >= "2026-07").toBe(true);
      expect(target.revenue_evidence.quote.length).toBeGreaterThan(5);
      expect(target.buyer && target.job && target.domain).toBeTruthy();
    }
  });

  it("matches a niche found in other words, and not a different niche in the same trade", () => {
    const target = { buyer: "Airbnb hosts", job: "listing booking-conversion audit" };
    expect(matchesTarget(target, { buyer: "short-term rental hosts on Airbnb", job: "audit of a listing for bookings and conversion" })).toBeGreaterThan(0);
    expect(matchesTarget(target, { buyer: "Airbnb hosts", job: "cleaning crew scheduling" })).toBe(0);
    expect(matchesTarget(target, { buyer: "dentists", job: "listing audit" })).toBe(0);
  });

  it("scores recall over runs and builds a profile from the domain alone", () => {
    const [first] = targets;
    const result = rediscoveryRecall([
      { target: first!, candidates: [{ buyer: first!.buyer, job: first!.job }] },
      { target: { ...first!, buyer: "funeral homes", job: "obituary drafting" }, candidates: [{ buyer: "dentists", job: "recall reminders" }] },
    ]);
    expect(result.recall).toBe(0.5);
    expect(result.buyerRecall).toBe(0.5);
    expect(sameBuyer({ buyer: "Airbnb hosts" }, { buyer: "Small multi-property Airbnb/VRBO hosts and co-hosting companies" })).toBe(true);
    expect(sameBuyer({ buyer: "Vinted resellers" }, { buyer: "estate-sale companies" })).toBe(false);
    expect(profileFor(first!).inputs.map((input) => input.text)).toContain(first!.domain);
  });
});
