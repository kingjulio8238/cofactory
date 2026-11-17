// `pnpm cofactory:eval`: runs every Cofactory eval suite, prints the scorecard, appends it to the run history, and
// exits 1 on a failing suite or a regression against the last passing run.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { renderScorecard, runSuites } from "../server/cofactory/evals/harness.ts";
import { FOUNDATION_SUITES } from "../server/cofactory/evals/suites.ts";

const historyFile = process.env.COFACTORY_EVAL_HISTORY || join(homedir(), ".cofactory", "evals", "history.jsonl");
let rev: string | null = null;
try { rev = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { rev = null; }

const card = await runSuites(FOUNDATION_SUITES, { historyFile, rev });
console.log(renderScorecard(card));
console.log(`history: ${historyFile}`);
process.exit(card.pass ? 0 : 1);
