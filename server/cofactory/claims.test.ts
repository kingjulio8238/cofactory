import { describe, expect, it } from "vitest";

import { unbackedClaims } from "./tools.ts";

describe("claims of messages a seat did not send", () => {
  it("catches the live lead's escalation that was never sent, and lets real sends, requests and plans through", () => {
    const live = "Rails are an owner-only step, so I escalated it to the owner and told the CEO to keep going. Owner notified, then I corrected the owner.";
    expect(unbackedClaims(live, new Set(["ceo"]))).toEqual([expect.stringContaining('"escalated it to the owner"')]);
    expect(unbackedClaims(live, new Set(["ceo", "owner"]))).toEqual([]);
    expect(unbackedClaims("Sent a consult to the Factory Lead about path_live evidence.", new Set())).toEqual([expect.stringContaining("to the lead")]);
    expect(unbackedClaims("The CEO asked me to escalate it to the owner; waiting on the owner.", new Set())).toEqual([]);
    expect(unbackedClaims("Will escalate to the owner next session.", new Set())).toEqual([]);
    expect(unbackedClaims("Rails are fine except Stripe (owner notified, corrected).", new Set())).toEqual([expect.stringContaining('"owner notified"')]);
    expect(unbackedClaims("The lead notified me that Stripe is pending.", new Set())).toEqual([]);
  });
});
