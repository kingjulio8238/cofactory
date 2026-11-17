/** What an offer page says. Every claim on it must be one the dossier can source; the page itself only presents it. */
export interface OfferSpec {
  businessName: string;
  headline: string;
  /** Who it is for, in the buyer's words. */
  forWhom: string;
  /** What the buyer gets, as short lines. */
  deliverables: string[];
  priceLine: string;
  /** Where payment happens (a Stripe payment link), or null to take a request instead. */
  paymentUrl: string | null;
  /** The form's action on this server's intake, or null when no public intake is connected. */
  formAction: string | null;
  contactEmail: string;
  /** The sender's postal address, which commercial email law asks a business to give. */
  postalAddress: string;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** The offer as one self-contained page: plain, fast, readable on a phone, with a payment button and a request form. */
export function renderOfferPage(offer: OfferSpec): string {
  const form = offer.formAction ? `
  <form method="post" action="${escape(offer.formAction)}">
    <label>Name <input name="name" autocomplete="name" required></label>
    <label>Work email <input name="email" type="email" autocomplete="email" required></label>
    <label>What do you need? <textarea name="message" rows="3"></textarea></label>
    <input name="website" tabindex="-1" autocomplete="off" class="trap" aria-hidden="true">
    <button type="submit">Ask a question</button>
  </form>` : "";
  const pay = offer.paymentUrl ? `<p><a class="pay" href="${escape(offer.paymentUrl)}">Start now · ${escape(offer.priceLine)}</a></p>` : `<p class="price">${escape(offer.priceLine)}</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(offer.businessName)}</title>
<style>
body{font:17px/1.55 -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#fff;margin:0 auto;max-width:640px;padding:32px 16px}
h1{font-size:28px;line-height:1.2;margin:0 0 12px}.for{color:#555;margin:0 0 24px}ul{padding-left:20px}
.pay{display:inline-block;background:#1d1d1f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600}
form{display:grid;gap:12px;margin-top:28px;border-top:1px solid #e5e5ea;padding-top:24px}label{display:grid;gap:4px;font-size:15px}
input,textarea{font:inherit;padding:10px;border:1px solid #c7c7cc;border-radius:6px}button{font:inherit;padding:10px 16px;border:0;border-radius:6px;background:#e5e5ea}
.trap{position:absolute;left:-9999px}footer{margin-top:40px;color:#6e6e73;font-size:13px}
</style></head><body>
<h1>${escape(offer.headline)}</h1>
<p class="for">For ${escape(offer.forWhom)}</p>
<ul>${offer.deliverables.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>
${pay}${form}
<footer>${escape(offer.businessName)} · <a href="mailto:${escape(offer.contactEmail)}">${escape(offer.contactEmail)}</a> · ${escape(offer.postalAddress)}</footer>
</body></html>`;
}

/** Creates a Stripe payment link (product, price, link) for the offer, tagged with the company so payments route back. */
/** Bills one customer by email on the company's Stripe account: a one-line invoice, finalized and sent, due in `daysUntilDue`. */
export async function createInvoice(input: { secretKey: string; companyId: string; customerEmail: string; description: string; amountCents: number; currency?: string; daysUntilDue?: number }, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string | null }> {
  const call = async (path: string, params: Record<string, string>) => {
    const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
      method: "POST", headers: { authorization: `Bearer ${input.secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(),
    });
    const body = await response.json() as { id?: string; hosted_invoice_url?: string | null; error?: { message?: string } };
    if (!response.ok || !body.id) throw new Error(`Stripe ${path}: ${body.error?.message ?? response.status}`);
    return body;
  };
  const customer = await call("customers", { email: input.customerEmail, "metadata[company_id]": input.companyId });
  const invoice = await call("invoices", {
    customer: customer.id!, collection_method: "send_invoice", days_until_due: String(input.daysUntilDue ?? 14), pending_invoice_items_behavior: "exclude", "metadata[company_id]": input.companyId,
  });
  await call("invoiceitems", { customer: customer.id!, invoice: invoice.id!, amount: String(input.amountCents), currency: input.currency ?? "usd", description: input.description });
  const finalized = await call(`invoices/${invoice.id}/finalize`, {});
  await call(`invoices/${invoice.id}/send`, {});
  return { id: invoice.id!, url: finalized.hosted_invoice_url ?? null };
}

export async function createPaymentLink(input: { secretKey: string; companyId: string; name: string; unitAmountCents: number; currency?: string; interval?: "month" | "year" | null }, fetchImpl: typeof fetch = fetch): Promise<{ url: string; id: string }> {
  const call = async (path: string, params: Record<string, string>) => {
    const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
      method: "POST", headers: { authorization: `Bearer ${input.secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(),
    });
    const body = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !body.id) throw new Error(`Stripe ${path}: ${body.error?.message ?? response.status}`);
    return body;
  };
  const product = await call("products", { name: input.name, "metadata[company_id]": input.companyId });
  const price = await call("prices", {
    product: product.id!, unit_amount: String(input.unitAmountCents), currency: input.currency ?? "usd",
    ...(input.interval ? { "recurring[interval]": input.interval } : {}),
  });
  const link = await call("payment_links", { "line_items[0][price]": price.id!, "line_items[0][quantity]": "1", "metadata[company_id]": input.companyId });
  return { url: link.url!, id: link.id! };
}
