import { describe, expect, it } from "vitest";

import { preflightRails, type PreflightDeps } from "./preflight.ts";
import type { CompanyRails } from "./rails.ts";

const ready: CompanyRails = {
  mailbox: "hello@tenderwatch.co", stripeSecretKey: "rk_live_abc", stripeWebhookSecret: "whsec_x", formToken: "t",
  publicHooksUrl: "https://hooks.tenderwatch.co", offerUrl: null, postalAddress: "100 Main St, Columbus, OH 43215",
};

const dns: Record<string, string[][]> = {
  "tenderwatch.co": [["v=spf1 include:_spf.mail.test ~all"]],
  "_dmarc.tenderwatch.co": [["v=DMARC1; p=none"]],
  "s1._domainkey.tenderwatch.co": [["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC"]],
};
const deps = (overrides: Partial<PreflightDeps> = {}): PreflightDeps => ({
  resolveTxt: async (name) => { if (!dns[name]) throw new Error("ENOTFOUND"); return dns[name]!; },
  resolveMx: async () => [{ exchange: "mx.mail.test", priority: 10 }],
  fetch: (async (url: string) => new Response("", { status: String(url).includes("stripe") ? 200 : 404 })) as typeof fetch,
  ...overrides,
});

describe("rails preflight", () => {
  it("passes complete live rails without sending anything", async () => {
    const calls: string[] = [];
    const checks = await preflightRails("c1", ready, deps({ fetch: (async (url: string, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${url}`); return new Response("", { status: String(url).includes("stripe") ? 200 : 404 }); }) as typeof fetch }), { dkimSelector: "s1" });
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true);
  });

  it("names each missing or unsafe rail", async () => {
    const checks = await preflightRails("c1", { ...ready, mailbox: "owner@gmail.com", stripeSecretKey: "sk_test_abc", stripeWebhookSecret: null, postalAddress: null }, deps({ resolveMx: async () => [] }));
    expect(checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(["dedicated domain", "MX", "SPF", "DMARC", "DKIM", "Stripe live mode", "Stripe webhook secret", "postal address"]);
    expect(await preflightRails("c1", null, deps())).toMatchObject([{ name: "rails", ok: false }]);
  });
});
