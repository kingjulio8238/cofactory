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
  /** The owner's go-ahead for this company to contact real people; nothing is sent while it is off. */
  outreachArmed: boolean;
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
  const blank = (): CompanyRails => ({ mailbox: null, stripeSecretKey: null, stripeWebhookSecret: null, formToken: randomBytes(18).toString("base64url"), publicHooksUrl: null, offerUrl: null, postalAddress: null, outreachArmed: false });

  return {
    /** The company's rails if it has any; never creates an entry, so public requests cannot grow the file. */
    peek(companyId: string): CompanyRails | null {
      const found = read()[companyId];
      return found ? { ...found, postalAddress: found.postalAddress ?? null, outreachArmed: found.outreachArmed === true } : null;
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
    /** The rails a company still needs before it can take money from a stranger, as the owner would name them. */
    missing(companyId: string): string[] {
      const rails = this.peek(companyId);
      return [
        !rails?.mailbox && "a mailbox to send from",
        !rails?.postalAddress && "a postal address",
        !rails?.publicHooksUrl && "a public HTTPS address for the intake",
        !rails?.stripeSecretKey && "a Stripe key",
        !rails?.stripeWebhookSecret && "the Stripe webhook secret",
      ].filter((item): item is string => Boolean(item));
    },
    /** What a seat or a page may see: whether each rail is connected, never the secrets themselves. */
    summary(companyId: string) {
      const rails = this.get(companyId);
      return {
        mailbox: rails.mailbox, stripe: Boolean(rails.stripeSecretKey), stripeWebhook: Boolean(rails.stripeWebhookSecret),
        publicHooksUrl: rails.publicHooksUrl, offerUrl: rails.offerUrl, postalAddress: rails.postalAddress ?? null, outreachArmed: rails.outreachArmed === true,
        formAction: rails.publicHooksUrl ? `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/form/${companyId}/${rails.formToken}` : null,
        stripeWebhookUrl: rails.publicHooksUrl ? `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/stripe/${companyId}` : null,
      };
    },
  };
}

export type Rails = ReturnType<typeof openRails>;
