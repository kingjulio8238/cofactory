// Connects a company's rails from an owner-only env file, so no secret is typed into a chat or a shell history.
// Usage: pnpm cofactory:connect --init [--env <file>]            writes a blank 0600 template
//        pnpm cofactory:connect --company <id> [--env <file>] [--url <server>]
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  env: { type: "string", default: join(homedir(), ".cofactory", "live.env") },
  url: { type: "string", default: "http://127.0.0.1:8941" },
  company: { type: "string" },
  init: { type: "boolean", default: false },
} });
const file = values.env!;

const TEMPLATE = `# Cofactory live rails. Owner-only (0600); never commit or paste this file.
# The company's own mailbox on its dedicated domain (IMAP/SMTP; hosts are optional when the provider is known).
MAIL_ADDRESS=
MAIL_PASSWORD=
MAIL_USERNAME=
MAIL_IMAP_HOST=
MAIL_IMAP_PORT=
MAIL_SMTP_HOST=
MAIL_SMTP_PORT=
# Stripe: a restricted live key (write: Products, Prices, Payment Links, Customers, Invoices) and the webhook signing secret.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# The public HTTPS origin that reaches this server's webhook port (e.g. a Cloudflare tunnel to 127.0.0.1:8942).
PUBLIC_HOOKS_URL=
# The business postal address printed on the offer page and under every outreach email.
POSTAL_ADDRESS=
# Your own addresses and domains, comma-separated: payments from them never count as customers.
OWNER_EMAILS=
OWNER_DOMAINS=
`;

if (values.init) {
  if (existsSync(file)) { console.error(`${file} already exists; edit it instead`); process.exit(2); }
  writeFileSync(file, TEMPLATE, { mode: 0o600 });
  console.log(`wrote ${file} (0600); fill it in, then run: pnpm cofactory:connect --company <id>`);
  process.exit(0);
}
if (!values.company) { console.error("give --company <id> (or --init to write the template)"); process.exit(2); }
if (!existsSync(file)) { console.error(`${file} does not exist; run with --init first`); process.exit(2); }
if ((statSync(file).mode & 0o077) !== 0) { console.error(`${file} is readable by others; run: chmod 600 ${file}`); process.exit(2); }

const env = Object.fromEntries(readFileSync(file, "utf8").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]).filter(([, value]) => value !== ""));
const list = (value: string | undefined) => (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const response = await fetch(`${values.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answer = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(`${path}: ${response.status} ${answer.error ?? ""}`);
  return answer;
}

if (env.MAIL_ADDRESS && env.MAIL_PASSWORD) {
  const answer = await post("/api/email/accounts", {
    address: env.MAIL_ADDRESS, password: env.MAIL_PASSWORD,
    ...(env.MAIL_USERNAME ? { username: env.MAIL_USERNAME } : {}),
    ...(env.MAIL_IMAP_HOST ? { imapHost: env.MAIL_IMAP_HOST } : {}), ...(env.MAIL_IMAP_PORT ? { imapPort: Number(env.MAIL_IMAP_PORT) } : {}),
    ...(env.MAIL_SMTP_HOST ? { smtpHost: env.MAIL_SMTP_HOST } : {}), ...(env.MAIL_SMTP_PORT ? { smtpPort: Number(env.MAIL_SMTP_PORT) } : {}),
  });
  console.log(`mailbox ${env.MAIL_ADDRESS}: ${answer.ok === false ? `NOT connected (${answer.error ?? answer.reason ?? "refused"})` : "connected"}`);
}
const rails = await post(`/api/cofactory/companies/${values.company}/rails`, {
  ...(env.MAIL_ADDRESS ? { mailbox: env.MAIL_ADDRESS } : {}),
  ...(env.STRIPE_SECRET_KEY ? { stripeSecretKey: env.STRIPE_SECRET_KEY } : {}),
  ...(env.STRIPE_WEBHOOK_SECRET ? { stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET } : {}),
  ...(env.PUBLIC_HOOKS_URL ? { publicHooksUrl: env.PUBLIC_HOOKS_URL } : {}),
  ...(env.POSTAL_ADDRESS ? { postalAddress: env.POSTAL_ADDRESS } : {}),
});
console.log("rails:", JSON.stringify(rails.rails, null, 2));
if (env.OWNER_EMAILS || env.OWNER_DOMAINS) {
  await post("/api/cofactory/related-parties", { emails: list(env.OWNER_EMAILS), domains: list(env.OWNER_DOMAINS) });
  console.log(`related parties: ${list(env.OWNER_EMAILS).length} emails, ${list(env.OWNER_DOMAINS).length} domains`);
}
console.log(`\nNext: pnpm cofactory:rails-check --company ${values.company} --data <live data dir> --dkim <selector>`);
