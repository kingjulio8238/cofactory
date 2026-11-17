// Checks that a company's rails can carry a real sprint, without sending or creating anything.
// Usage: pnpm cofactory:rails-check --company <id> [--data <dusk data dir>] [--dkim <selector>]
import { resolveMx, resolveTxt } from "node:dns/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { preflightRails } from "../server/cofactory/validation/preflight.ts";
import { openRails } from "../server/cofactory/validation/rails.ts";

const { values } = parseArgs({ options: { company: { type: "string" }, data: { type: "string", default: process.env.DUSK_DATA_DIR ?? join(homedir(), ".duskbot") }, dkim: { type: "string" } } });
if (!values.company) {
  console.error("give --company <id>");
  process.exit(2);
}
const rails = openRails(join(values.data!, "cofactory-rails.json")).peek(values.company);
const checks = await preflightRails(values.company, rails, { resolveTxt, resolveMx, fetch }, values.dkim ? { dkimSelector: values.dkim } : {});
for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(22)} ${check.detail}`);
const failed = checks.filter((check) => !check.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} checks failed: not ready for a real sprint` : `\nall ${checks.length} checks passed: ready for a real sprint`);
console.log(rails?.outreachArmed ? "outreach is ARMED: the company may contact real people" : "outreach is not armed: nothing reaches a real person until the owner arms it");
process.exit(failed ? 1 : 0);
