// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { FactoryTab, type SeatView } from "./FactoryTab";

afterEach(() => { document.body.innerHTML = ""; });

function mount(view: SeatView) {
  const host = document.createElement("div");
  document.body.append(host);
  flushSync(() => createRoot(host).render(createElement(FactoryTab, { view })));
  return host;
}

describe("the Factory tab", () => {
  it("shows a scout's work, its industries, its finds with their source, the first week, and what waits on the owner first", () => {
    const host = mount({
      seat: { role: "scout", companyId: null },
      work: { live: { objective: "Search this factory's industries for niches", startedAt: Date.now() - 5 * 60_000, rounds: 2 }, last: null },
      needsYou: { approvals: [{ id: "a1", kind: "launch", title: "Start Consign Payouts?", detail: "$50 to start, from a shortlisted dossier.", at: Date.now() }], inbox: [{ id: "m1", at: Date.now(), goal: "Close Idle Co?" }], alarms: [] },
      factory: {
        territories: [{ title: "Roofing Contractors", code: "238160", niches: 2 }, { title: "Marinas", code: "713930", niches: 0 }],
        finds: [{ quote: "we still reconcile remits by hand", site: "forum.roofers.test", url: "https://forum.roofers.test/t/1", at: Date.now() - 120_000 }],
        signals: 7,
        batch: { niches: 2, target: 3, closed: false },
        checklist: [{ id: "search", state: "running" }, { id: "shortlist", state: "todo" }, { id: "launch", state: "todo" }, { id: "live", state: "todo" }, { id: "dollar", state: "todo" }],
      },
    });
    const text = host.textContent ?? "";
    expect(text.indexOf("Needs you"), "what waits on the owner comes first").toBeLessThan(text.indexOf("Now"));
    expect(text).toContain("Close Idle Co?");
    expect(host.querySelector("[data-approval=launch]")?.textContent).toContain("Start Consign Payouts?$50 to start, from a shortlisted dossier.ApproveDecline");
    expect(text).toContain("Search this factory's industries for niches");
    expect(text).toContain("Searching · 2 of 3 niches");
    expect(text).toContain("Roofing Contractors2 niches");
    expect(text).toContain("“we still reconcile remits by hand”");
    expect(text).toContain("forum.roofers.test · 2 min ago");
    expect(host.querySelector("[data-factory-step=search]")?.getAttribute("data-factory-step-state")).toBe("running");
  });

  it("shows a company's money, days left to a paying customer, its sprint and the first-dollar gate", () => {
    const host = mount({
      seat: { role: "ceo", companyId: "c1" },
      work: { live: null, last: { status: "waiting", endedAt: Date.now() - 3_600_000, summary: "Offer page published" } },
      needsYou: { inbox: [], alarms: [{ kind: "rails_missing", detail: "the owner has not connected a Stripe key" }] },
      company: {
        name: "Consign Payouts", stage: "build", status: "live", capCents: 5_000, availableCents: 4_200, earnedCents: 0, daysLeft: 9, armed: false, live: false,
        sprint: { buyers: 4, contacts: 0, urgent: 0, committed: 0 },
        firstDollar: { paid: false, delivered: false, rehearsed: false, reached: false },
      },
    });
    const text = host.textContent ?? "";
    expect(text).toContain("The owner has not connected a Stripe key");
    expect(text).toContain("Offer page published");
    expect(text).toContain("Money left$42 of $50");
    expect(text, "before going live, the days are to go live").toContain("Days left to go liveIts five days to a paying customer start when you arm outreach9");
    expect(text).toContain("ContactedWaiting for your OK");
    expect(text).toContain("A stand-in did it again from the runbook");
  });
});
