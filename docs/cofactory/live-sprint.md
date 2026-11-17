# Running a real sprint

The P3 and P4 exit gate is a real sprint: one company, its own mail domain, its own Stripe account and a public
intake address. It contacts named buyers for at most a week, within the outreach caps, and nothing reaches a person
until the owner arms it.

The live server keeps its data in `~/.cofactory/live` and uses ports 8941 (app) and 8942 (webhooks). It is separate
from the dusk the owner uses day to day. Secrets live in `~/.cofactory/live.env` (0600), never in a chat or a shell
history.

## The owner: once, before the sprint

1. **Domain and mailbox.** Register a domain for the company (not your personal one) and a mailbox on it with any host
   that gives IMAP and SMTP (Fastmail, Migadu, Zoho, Google Workspace).
   - Publish MX, one SPF record, DKIM and a DMARC record (`v=DMARC1; p=none` is enough to start).
   - Note the DKIM selector your host uses.
   - Send nothing from it yet.
2. **Stripe.** Create an account for the company and finish activation so live mode works.
   - Create a **restricted key** with write access to Products, Prices, Payment Links, Customers and Invoices.
3. **Public address for the webhook port.** For example:
   `cloudflared tunnel --url http://127.0.0.1:8942`
   The address must be HTTPS. A named tunnel on your domain survives restarts; a quick tunnel does not.
4. **Postal address.** A real address that can receive mail, such as a mailbox service. US commercial email law
   requires one.
5. **Fill `~/.cofactory/live.env`.** Leave `STRIPE_WEBHOOK_SECRET` empty for now.

## Then, in order

1. Start the live server, staff the factory and launch the company from the shortlisted dossier. The scout is unseated
   and the deposit equals the company's cap, so the lead cannot launch others. The company's sessions prepare the
   offer and the buyer list; outreach is refused until it is armed.
2. Connect the rails: `pnpm cofactory:connect --company <id>`.
3. In Stripe, add a webhook endpoint at the `stripeWebhookUrl` that step 2 prints, for the events
   `checkout.session.completed`, `invoice.paid` and `charge.refunded`. Put its signing secret in the env file and run
   step 2 again.
4. Preflight: `pnpm cofactory:rails-check --company <id> --data ~/.cofactory/live --dkim <selector>`. Every check
   must pass.
5. **The owner reads the offer page and the first drafts, then arms outreach:**
   `curl -XPOST 127.0.0.1:8941/api/cofactory/companies/<id>/rails -H 'content-type: application/json' -d '{"outreachArmed":true}'`.
   Setting it to `false` stops all outreach at once.

## While it runs

- `/api/cofactory/sprints` and `/api/cofactory/orders` show the sprint, its evidence and any orders.
- `/api/cofactory/state` shows `ownerInbox` (the lead's escalations) and the open alarms.
- Every reply, "stop" and bounce is read from the mailbox on each tick. A "stop" or a bounce is suppressed for good.
- The sprint passes on one live payment or on urgent replies from 3 different buyers. It fails a week after the first
  contact.
