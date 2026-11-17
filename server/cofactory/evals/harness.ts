import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SuiteResult {
  name: string;
  pass: boolean;
  /** Higher is better, except a metric named `false_*` or `*_errors`, where lower is better. */
  metrics: Record<string, number>;
  /** One line per case that went wrong, so a failure can be read without rerunning. */
  failures: string[];
}

export interface Suite {
  name: string;
  run(): Promise<SuiteResult>;
}

export interface Scorecard {
  at: string;
  rev: string | null;
  pass: boolean;
  suites: SuiteResult[];
  regressions: string[];
}

const lowerIsBetter = (metric: string) => metric.startsWith("false_") || metric.endsWith("_errors");

/** Metrics that got worse than the last passing scorecard, beyond `tolerance`. */
export function regressionsAgainst(previous: Scorecard | null, current: readonly SuiteResult[], tolerance = 1e-9): string[] {
  if (!previous) return [];
  const out: string[] = [];
  for (const suite of current) {
    const before = previous.suites.find((candidate) => candidate.name === suite.name);
    if (!before) continue;
    for (const [metric, value] of Object.entries(suite.metrics)) {
      const old = before.metrics[metric];
      if (old === undefined) continue;
      const worse = lowerIsBetter(metric) ? value > old + tolerance : value < old - tolerance;
      if (worse) out.push(`${suite.name}.${metric}: ${old} -> ${value}`);
    }
  }
  return out;
}

export function lastPassing(historyFile: string): Scorecard | null {
  if (!existsSync(historyFile)) return null;
  const lines = readFileSync(historyFile, "utf8").split("\n").filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      const card = JSON.parse(lines[index]!) as Scorecard;
      if (card.pass) return card;
    } catch {
      continue;
    }
  }
  return null;
}

/** Runs every suite, compares with the last passing run, and appends the scorecard to the history when given one. */
export async function runSuites(suites: readonly Suite[], options: { historyFile?: string; rev?: string | null; now?: () => Date } = {}): Promise<Scorecard> {
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    try {
      results.push(await suite.run());
    } catch (error) {
      results.push({ name: suite.name, pass: false, metrics: {}, failures: [`suite crashed: ${error instanceof Error ? error.message : String(error)}`] });
    }
  }
  const regressions = regressionsAgainst(options.historyFile ? lastPassing(options.historyFile) : null, results);
  const card: Scorecard = {
    at: (options.now?.() ?? new Date()).toISOString(), rev: options.rev ?? null,
    pass: results.every((result) => result.pass) && regressions.length === 0, suites: results, regressions,
  };
  if (options.historyFile) {
    mkdirSync(dirname(options.historyFile), { recursive: true });
    appendFileSync(options.historyFile, `${JSON.stringify(card)}\n`);
  }
  return card;
}

export function renderScorecard(card: Scorecard): string {
  const lines = [`${card.pass ? "PASS" : "FAIL"}  ${card.at}${card.rev ? `  ${card.rev}` : ""}`];
  for (const suite of card.suites) {
    const metrics = Object.entries(suite.metrics).map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(3)}`).join("  ");
    lines.push(`  ${suite.pass ? "ok  " : "FAIL"}  ${suite.name.padEnd(18)} ${metrics}`);
    for (const failure of suite.failures) lines.push(`          - ${failure}`);
  }
  for (const regression of card.regressions) lines.push(`  REGRESSION  ${regression}`);
  return lines.join("\n");
}
