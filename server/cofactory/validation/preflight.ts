import type { CompanyRails } from "./rails.ts";

export interface PreflightDeps {
  resolveTxt(name: string): Promise<string[][]>;
  resolveMx(name: string): Promise<Array<{ exchange: string; priority: number }>>;
  fetch: typeof fetch;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const txt = async (deps: PreflightDeps, name: string) => {
  try { return (await deps.resolveTxt(name)).map((parts) => parts.join("")); } catch { return []; }
};

/**
 * Read-only checks that a company's rails can carry a real sprint: the mailbox domain receives mail and is authenticated
 * (MX, SPF, DMARC, and DKIM when a selector is given), the Stripe key works and is live, the webhook secret is present,
 * the public intake answers over HTTPS, and a postal address is on record. Nothing is sent and nothing is created.
 */
export async function preflightRails(companyId: string, rails: CompanyRails | null, deps: PreflightDeps, options: { dkimSelector?: string } = {}): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => { checks.push({ name, ok, detail }); };
  if (!rails) return [{ name: "rails", ok: false, detail: "no rails on record for this company" }];

  const domain = rails.mailbox?.split("@")[1]?.toLowerCase() ?? null;
  if (!domain) add("mailbox", false, "no mailbox connected");
  else {
    add("mailbox", true, rails.mailbox!);
    if (/^(gmail|googlemail|outlook|hotmail|yahoo|icloud|proton)\./.test(domain)) add("dedicated domain", false, `${domain} is a personal mail provider; outreach needs the company's own domain`);
    else add("dedicated domain", true, domain);
    let mx: Array<{ exchange: string }> = [];
    try { mx = await deps.resolveMx(domain); } catch {}
    add("MX", mx.length > 0, mx.length ? mx.map((record) => record.exchange).join(", ") : `${domain} has no MX record, so replies cannot arrive`);
    const spf = (await txt(deps, domain)).filter((record) => record.toLowerCase().startsWith("v=spf1"));
    add("SPF", spf.length === 1, spf.length === 1 ? spf[0]! : spf.length ? "more than one SPF record, which fails SPF" : "no SPF record");
    const dmarc = (await txt(deps, `_dmarc.${domain}`)).find((record) => record.toLowerCase().startsWith("v=dmarc1"));
    add("DMARC", Boolean(dmarc), dmarc ?? "no DMARC record at _dmarc." + domain);
    if (options.dkimSelector) {
      const dkim = (await txt(deps, `${options.dkimSelector}._domainkey.${domain}`)).find((record) => /p=\S{20,}/.test(record));
      add("DKIM", Boolean(dkim), dkim ? `selector ${options.dkimSelector} publishes a key` : `no DKIM key at ${options.dkimSelector}._domainkey.${domain}`);
    } else add("DKIM", false, "give the DKIM selector your mail provider uses to check it");
  }

  if (!rails.stripeSecretKey) add("Stripe key", false, "no Stripe key connected");
  else {
    const live = /^(sk|rk)_live_/.test(rails.stripeSecretKey);
    add("Stripe live mode", live, live ? "live key" : "a test key: payments through it never count as evidence");
    try {
      const response = await deps.fetch("https://api.stripe.com/v1/payment_links?limit=1", { headers: { authorization: `Bearer ${rails.stripeSecretKey}` } });
      add("Stripe key works", response.ok, response.ok ? "can read payment links" : `Stripe answered ${response.status}`);
    } catch (error) {
      add("Stripe key works", false, error instanceof Error ? error.message : String(error));
    }
  }
  add("Stripe webhook secret", Boolean(rails.stripeWebhookSecret), rails.stripeWebhookSecret ? "set" : "add a webhook endpoint for checkout.session.completed, invoice.paid and charge.refunded and paste its signing secret");

  if (!rails.publicHooksUrl) add("public intake", false, "no public HTTPS address connected");
  else {
    const url = `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/offer/${companyId}`;
    try {
      const response = await deps.fetch(url, { redirect: "manual" });
      add("public intake", response.status === 200 || response.status === 404, `${url} answered ${response.status}${response.status === 404 ? " (reachable; no offer page published yet)" : ""}`);
    } catch (error) {
      add("public intake", false, `${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  add("postal address", Boolean(rails.postalAddress), rails.postalAddress ?? "no postal address on record");
  return checks;
}
