import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { EventInput } from "../truth/store.ts";

/**
 * Stripe's webhook signature (Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.payload">), checked against
 * the endpoint's signing secret, within a tolerance that stops replays of an old delivery.
 */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, nowMs: number, toleranceSeconds = 300): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "no Stripe-Signature header" };
  const parts = header.split(",").map((part) => part.trim().split("=") as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isFinite(timestamp) || !signatures.length) return { ok: false, reason: "malformed Stripe-Signature header" };
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return { ok: false, reason: "signature timestamp outside the tolerance" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  const match = signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "signature does not match" };
}

/** A Stripe event as evidence: a paid Checkout session is a payment, a refunded charge is a refund, the rest is ignored. */
export function stripeEventToInput(event: { type?: string; livemode?: boolean; created?: number; data?: { object?: Record<string, any> } }, companyId: string): EventInput | null {
  const object = event.data?.object;
  if (!object) return null;
  const occurredAt = (event.created ?? Math.floor(Date.now() / 1000)) * 1000;
  if (event.type === "checkout.session.completed" && object.payment_status === "paid") {
    return {
      source: "stripe", externalId: String(object.payment_intent ?? object.id), companyId, kind: "payment", occurredAt,
      payerEmail: object.customer_details?.email ?? object.customer_email ?? null, amountCents: Number(object.amount_total ?? 0), testMode: event.livemode === false,
    };
  }
  if (event.type === "charge.refunded") {
    return {
      source: "stripe", externalId: String(object.id), companyId, kind: "refund", occurredAt, refundOf: object.payment_intent ? String(object.payment_intent) : null,
      amountCents: Number(object.amount_refunded ?? 0), testMode: event.livemode === false,
    };
  }
  return null;
}

/** A form submission as evidence; the same message from the same sender on the same day is one event. */
export function formToInput(fields: URLSearchParams, companyId: string, nowMs: number): EventInput {
  const email = (fields.get("email") ?? "").trim().toLowerCase() || null;
  const message = (fields.get("message") ?? "").trim().slice(0, 5_000);
  const name = (fields.get("name") ?? "").trim().slice(0, 200);
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return {
    source: "form", externalId: createHash("sha256").update(`${companyId}|${email ?? ""}|${message}|${day}`).digest("hex").slice(0, 32),
    companyId, kind: "form_submit", occurredAt: nowMs, payerEmail: email, text: [name && `Name: ${name}`, message].filter(Boolean).join(". ") || null,
  };
}

export interface IntakeDeps {
  /** The company's form token and Stripe signing secret, from the vault; null when the company has none. */
  formToken(companyId: string): string | null;
  stripeSecret(companyId: string): string | null;
  record(input: EventInput): void;
  /** Where a buyer lands after a form submission. */
  thanksUrl(companyId: string): string | null;
  /** The company's published offer page, served at GET /hooks/cofactory/offer/<company>. */
  offerPage?(companyId: string): string | null;
  now?: () => number;
}

const send = (res: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8", headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(body);
};

async function rawBody(req: IncomingMessage, limit = 256 * 1024): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The public intake on the webhook receiver: `POST /hooks/cofactory/form/<company>/<token>` for offer-page forms and
 * `POST /hooks/cofactory/stripe/<company>` for Stripe. Everything that arrives here is recorded as an external event,
 * which is the only way demand reaches a gate.
 */
export function createIntakeDoor(deps: IntakeDeps) {
  const now = deps.now ?? Date.now;
  return async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    const offer = /^\/hooks\/cofactory\/offer\/([\w-]+)$/.exec(url.pathname);
    if (offer && req.method === "GET") {
      const page = deps.offerPage?.(offer[1]!) ?? null;
      if (page) send(res, 200, page, "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action *; img-src https: data:" });
      else send(res, 404, "not found");
      return true;
    }
    const form = /^\/hooks\/cofactory\/form\/([\w-]+)\/([\w-]+)$/.exec(url.pathname);
    const stripe = /^\/hooks\/cofactory\/stripe\/([\w-]+)$/.exec(url.pathname);
    if (!form && !stripe) return false;
    if (req.method !== "POST") { send(res, 405, "POST only"); return true; }
    const body = await rawBody(req);
    if (body === null) { send(res, 413, "too large"); return true; }
    if (form) {
      const [, companyId, token] = form;
      const expected = deps.formToken(companyId!);
      const given = Buffer.from(token!), wanted = Buffer.from(expected ?? "");
      if (!expected || given.length !== wanted.length || !timingSafeEqual(given, wanted)) { send(res, 404, "not found"); return true; }
      const fields = new URLSearchParams(body);
      if (fields.get("website")) { send(res, 303, "", "text/plain", { location: deps.thanksUrl(companyId!) ?? "about:blank" }); return true; }
      deps.record(formToInput(fields, companyId!, now()));
      const thanks = deps.thanksUrl(companyId!);
      if (thanks) send(res, 303, "", "text/plain", { location: thanks });
      else send(res, 200, "<!doctype html><title>Thank you</title><p>Thank you. We will be in touch shortly.</p>", "text/html; charset=utf-8");
      return true;
    }
    const companyId = stripe![1]!;
    const secret = deps.stripeSecret(companyId);
    if (!secret) { send(res, 404, "not found"); return true; }
    const verdict = verifyStripeSignature(body, req.headers["stripe-signature"] as string | undefined, secret, now());
    if (!verdict.ok) { send(res, 400, verdict.reason); return true; }
    let event: Parameters<typeof stripeEventToInput>[0];
    try { event = JSON.parse(body); } catch { send(res, 400, "not JSON"); return true; }
    const input = stripeEventToInput(event, companyId);
    if (input) deps.record(input);
    send(res, 200, JSON.stringify({ received: true, recorded: Boolean(input) }), "application/json");
    return true;
  };
}
