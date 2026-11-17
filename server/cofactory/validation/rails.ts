import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync } from "node:fs";

import { writeFileAtomic } from "../../atomic.ts";

/**
 * A company's business rails, connected once by the owner: the mailbox it sends from, its Stripe keys, its form token,
 * and the public base URL its pages and intake are reached at. Secrets live in an owner-only file (0600) beside the data.
 */
export interface CompanyRails {
  mailbox: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  formToken: string;
  /** Public origin of this server's webhook receiver, e.g. https://hooks.example.com. */
  publicHooksUrl: string | null;
  offerUrl: string | null;
  /** The business's postal address, set by the owner: shown on the offer page and under every outreach email. */
  postalAddress: string | null;
}

type RailsFile = Record<string, CompanyRails>;

export function openRails(file: string) {
  const read = (): RailsFile => {
    if (!existsSync(file)) return {};
    try { return JSON.parse(readFileSync(file, "utf8")) as RailsFile; } catch { return {}; }
  };
  const write = (data: RailsFile) => {
    writeFileAtomic(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    try { chmodSync(file, 0o600); } catch {}
  };
  const blank = (): CompanyRails => ({ mailbox: null, stripeSecretKey: null, stripeWebhookSecret: null, formToken: randomBytes(18).toString("base64url"), publicHooksUrl: null, offerUrl: null, postalAddress: null });

  return {
    /** The company's rails if it has any; never creates an entry, so public requests cannot grow the file. */
    peek(companyId: string): CompanyRails | null {
      const found = read()[companyId];
      return found ? { ...found, postalAddress: found.postalAddress ?? null } : null;
    },
    get(companyId: string): CompanyRails {
      const data = read();
      if (!data[companyId]) { data[companyId] = blank(); write(data); }
      return data[companyId]!;
    },
    set(companyId: string, patch: Partial<Omit<CompanyRails, "formToken">>): CompanyRails {
      const data = read();
      data[companyId] = { ...(data[companyId] ?? blank()), ...patch };
      write(data);
      return data[companyId]!;
    },
    /** What a seat or a page may see: whether each rail is connected, never the secrets themselves. */
    summary(companyId: string) {
      const rails = this.get(companyId);
      return {
        mailbox: rails.mailbox, stripe: Boolean(rails.stripeSecretKey), stripeWebhook: Boolean(rails.stripeWebhookSecret),
        publicHooksUrl: rails.publicHooksUrl, offerUrl: rails.offerUrl, postalAddress: rails.postalAddress ?? null,
        formAction: rails.publicHooksUrl ? `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/form/${companyId}/${rails.formToken}` : null,
        stripeWebhookUrl: rails.publicHooksUrl ? `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/stripe/${companyId}` : null,
      };
    },
  };
}

export type Rails = ReturnType<typeof openRails>;
