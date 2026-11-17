import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import type { EventInput } from "../truth/store.ts";
import { createIntakeDoor, stripeEventToInput, verifyStripeSignature } from "./intake.ts";

const NOW = Date.UTC(2026, 10, 18, 9);
const sign = (payload: string, secret: string, at = NOW) => {
  const t = Math.floor(at / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
};

const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

async function intake() {
  const recorded: EventInput[] = [];
  const door = createIntakeDoor({
    formToken: (company) => (company === "c1" ? "tok-123" : null), stripeSecret: (company) => (company === "c1" ? "whsec_test" : null),
    record: (input) => recorded.push(input), thanksUrl: () => "https://offer.test/thanks", now: () => NOW,
  });
  const server = createServer(async (req, res) => { if (!(await door(req, res, new URL(req.url!, "http://x")))) { res.writeHead(404); res.end(); } });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body: string, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", body, headers, redirect: "manual" });
  return { recorded, post };
}

const CHECKOUT = { type: "checkout.session.completed", livemode: true, created: NOW / 1000, data: { object: { id: "cs_1", payment_intent: "pi_1", payment_status: "paid", amount_total: 9_900, customer_details: { email: "dana@ruralrx.com" } } } };

describe("cofactory intake", () => {
  it("accepts only a fresh, correctly signed Stripe delivery", () => {
    const payload = JSON.stringify(CHECKOUT);
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test"), "whsec_test", NOW)).toEqual({ ok: true });
    expect(verifyStripeSignature(payload, sign(payload, "whsec_other"), "whsec_test", NOW)).toMatchObject({ ok: false, reason: "signature does not match" });
    expect(verifyStripeSignature(`${payload} `, sign(payload, "whsec_test"), "whsec_test", NOW)).toMatchObject({ ok: false });
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test", NOW - 10 * 60_000), "whsec_test", NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("tolerance") });
    expect(verifyStripeSignature(payload, undefined, "whsec_test", NOW)).toMatchObject({ ok: false });
  });

  it("turns a paid checkout into a payment and a refund into a refund of the same payment", () => {
    expect(stripeEventToInput(CHECKOUT, "c1")).toMatchObject({ source: "stripe", externalId: "pi_1", kind: "payment", amountCents: 9_900, payerEmail: "dana@ruralrx.com", testMode: false });
    expect(stripeEventToInput({ ...CHECKOUT, livemode: false }, "c1")).toMatchObject({ testMode: true });
    expect(stripeEventToInput({ type: "charge.refunded", livemode: true, data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 9_900 } } }, "c1")).toMatchObject({ kind: "refund", refundOf: "pi_1" });
    expect(stripeEventToInput({ type: "checkout.session.completed", data: { object: { payment_status: "unpaid" } } }, "c1")).toBeNull();
    expect(stripeEventToInput({ type: "customer.created", data: { object: {} } }, "c1")).toBeNull();
  });

  it("records a signed Stripe delivery and refuses a forged one over HTTP", async () => {
    const { recorded, post } = await intake();
    const payload = JSON.stringify(CHECKOUT);
    expect((await post("/hooks/cofactory/stripe/c1", payload, { "stripe-signature": sign(payload, "whsec_test") })).status).toBe(200);
    expect((await post("/hooks/cofactory/stripe/c1", payload, { "stripe-signature": sign(payload, "whsec_forged") })).status).toBe(400);
    expect((await post("/hooks/cofactory/stripe/c2", payload, { "stripe-signature": sign(payload, "whsec_test") })).status).toBe(404);
    expect(recorded.map((input) => input.kind)).toEqual(["payment"]);
  });

  it("records a form submission behind its token, redirects to thanks, and drops a honeypot", async () => {
    const { recorded, post } = await intake();
    const body = new URLSearchParams({ name: "Dana", email: "Dana@RuralRx.com", message: "How much for three stores?" }).toString();
    const ok = await post("/hooks/cofactory/form/c1/tok-123", body, { "content-type": "application/x-www-form-urlencoded" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://offer.test/thanks");
    expect((await post("/hooks/cofactory/form/c1/wrong-token", body)).status).toBe(404);
    expect((await post("/hooks/cofactory/form/c1/tok-123", `${body}&website=spam.example`)).status).toBe(303);
    expect(recorded).toEqual([expect.objectContaining({ kind: "form_submit", payerEmail: "dana@ruralrx.com", text: "Name: Dana. How much for three stores?" })]);
  });
});
