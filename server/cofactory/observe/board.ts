import { cloudGate } from "./cloud-gate.ts";
import { autonomy, companyTrace, type TraceDeps } from "./trace.ts";

const DAY_MS = 24 * 60 * 60_000;

/** Everything the internal ops board shows, gathered in one read. */
export function boardData(deps: TraceDeps, now: number, evals: { pass: boolean; at: string; failing: string[] } | null = null) {
  const companies = deps.book.companies().map((company) => {
    const trace = companyTrace(deps, company.id)!;
    const events = deps.truth.events({ companyId: company.id });
    const lastOutside = events.length ? Math.max(...events.map((event) => event.receivedAt)) : null;
    return {
      id: company.id, name: company.name, stage: company.stage, status: company.status, capCents: company.capCents,
      availableCents: deps.book.available(company.id), spentCents: trace.cost.companySpentCents, shadowCents: trace.cost.companyShadowCents,
      costByStage: trace.costByStage, lastOutsideAt: lastOutside, untraceable: trace.untraceable.length,
      liveSessions: deps.runtime?.liveSessions().filter((session) => session.companyId === company.id) ?? [],
      alarms: deps.runtime?.openAlarms(company.id) ?? [],
    };
  });
  return {
    at: now,
    unallocatedCents: deps.book.balance("unallocated"),
    reserveCents: deps.book.balance("reserve"),
    companies,
    liveSessions: deps.runtime?.liveSessions() ?? [],
    alarms: deps.runtime?.openAlarms() ?? [],
    decisions: deps.observe.decisions({ limit: 40 }).reverse(),
    touches: deps.observe.touches({ since: now - 7 * DAY_MS }).reverse().slice(0, 40),
    autonomy: autonomy(deps, now - 7 * DAY_MS),
    cloudGate: cloudGate({ book: deps.book, truth: deps.truth, firstDollarCompanies: deps.firstDollarCompanies ?? (() => 0) }, now),
    evals,
  };
}

export type BoardData = ReturnType<typeof boardData>;

const dollars = (cents: number | null) => (cents === null ? "–" : `$${(cents / 100).toFixed(2)}`);
const ago = (now: number, at: number | null) => {
  if (at === null) return "never";
  const minutes = Math.round((now - at) / 60_000);
  return minutes < 60 ? `${minutes}m ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1_440)}d ago`;
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const nameOf = (data: BoardData, companyId: string | null) => (companyId === null ? "factory" : data.companies.find((company) => company.id === companyId)?.name ?? companyId.slice(0, 8));

/** A plain board for a terminal: one row per company, then live sessions and alarms. */
export function renderBoardText(data: BoardData): string {
  const lines = [`Cofactory board · ${new Date(data.at).toISOString()} · unallocated ${dollars(data.unallocatedCents)} · reserve ${dollars(data.reserveCents)}${data.evals ? ` · evals ${data.evals.pass ? "PASS" : `FAIL (${data.evals.failing.join(", ")})`}` : ""}`];
  lines.push("company              | stage   | status | cap     | avail   | spent   | model   | last outside | live | alarms | untraceable");
  for (const company of data.companies) {
    lines.push([
      company.name.slice(0, 20).padEnd(20), company.stage.padEnd(7), company.status.padEnd(6), dollars(company.capCents).padEnd(7),
      dollars(company.availableCents).padEnd(7), dollars(company.spentCents).padEnd(7), dollars(company.shadowCents).padEnd(7),
      ago(data.at, company.lastOutsideAt).padEnd(12), String(company.liveSessions.length).padEnd(4),
      (company.alarms.map((alarm) => alarm.kind).join(",") || "–").padEnd(6), String(company.untraceable),
    ].join(" | "));
  }
  if (data.liveSessions.length) {
    lines.push("", "live sessions:");
    for (const session of data.liveSessions) lines.push(`  ${session.id.slice(0, 8)} ${nameOf(data, session.companyId)} ${session.role} ${session.kind} (${session.trigger}) round ${session.rounds}, started ${ago(data.at, session.startedAt)}, ends by ${new Date(session.startedAt + session.budgetMs).toISOString()}`);
  }
  if (data.alarms.length) {
    lines.push("", "alarms:");
    for (const alarm of data.alarms) lines.push(`  ${nameOf(data, alarm.companyId)} ${alarm.kind}: ${alarm.detail}`);
  }
  lines.push("", `cloud gate: ${data.cloudGate.ready ? "READY to build Cofactory's own cloud" : "not yet"}`);
  for (const criterion of data.cloudGate.criteria) lines.push(`  ${criterion.met ? "ok  " : "    "} ${criterion.name}: ${criterion.value} (needs ${criterion.target})`);
  return lines.join("\n");
}

/** The internal ops board as one self-refreshing page. It is for operating the factory, not the product's UI. */
export function renderBoardHtml(data: BoardData): string {
  const row = (cells: string[]) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  const head = (cells: string[]) => `<tr>${cells.map((cell) => `<th>${cell}</th>`).join("")}</tr>`;
  const companies = data.companies.map((company) => row([
    `<a href="/api/cofactory/trace/company/${company.id}">${escapeHtml(company.name)}</a>`, company.stage, company.status, dollars(company.capCents),
    dollars(company.availableCents), dollars(company.spentCents), dollars(company.shadowCents),
    company.costByStage.map((span) => `${span.stage} ${dollars(span.shadowCents + span.spentCents)}`).join(" → "),
    ago(data.at, company.lastOutsideAt), String(company.liveSessions.length),
    company.alarms.map((alarm) => `<span class="bad">${alarm.kind}</span>`).join(" ") || "–",
    company.untraceable ? `<span class="bad">${company.untraceable}</span>` : "0",
  ])).join("");
  const sessions = data.liveSessions.map((session) => row([
    `<a href="/api/cofactory/trace/session/${session.id}">${session.id.slice(0, 8)}</a>`, escapeHtml(nameOf(data, session.companyId)), session.role, session.kind,
    escapeHtml(session.trigger), String(session.rounds), ago(data.at, session.startedAt), new Date(session.startedAt + session.budgetMs).toISOString().slice(11, 16),
  ])).join("");
  const alarms = data.alarms.map((alarm) => row([escapeHtml(nameOf(data, alarm.companyId)), `<span class="bad">${alarm.kind}</span>`, escapeHtml(alarm.detail), ago(data.at, alarm.raisedAt)])).join("");
  const decisions = data.decisions.map((decision) => row([
    new Date(decision.at).toISOString().slice(5, 16).replace("T", " "), escapeHtml(nameOf(data, decision.companyId)), decision.kind,
    decision.verdict === "allowed" ? "allowed" : `<span class="bad">refused</span>`, escapeHtml(decision.actor), escapeHtml(decision.reason),
    decision.evidence.map((link) => escapeHtml(`${link.type}`)).join(", ") || "–", `${dollars(decision.cost.companyShadowCents)} model / ${dollars(decision.cost.companySpentCents)} spent`,
  ])).join("");
  const autonomyRows = data.autonomy.map((item) => row([
    escapeHtml(nameOf(data, item.companyId)), String(item.seatActions), String(item.ownerTouches), `${Math.round(item.ownerShare * 100)}%`,
    escapeHtml(item.why.map(([why, count]) => `${why} ×${count}`).join(", ") || "–"),
  ])).join("");
  const evals = data.evals ? (data.evals.pass ? `evals PASS (${escapeHtml(data.evals.at)})` : `<span class="bad">evals FAIL: ${escapeHtml(data.evals.failing.join(", "))}</span>`) : "evals: no run yet";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="15">
<title>Cofactory ops</title><style>
:root{--ink:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--bad:#c62828;--bg:#fff}
body{font:13px/1.45 -apple-system,system-ui,sans-serif;color:var(--ink);background:var(--bg);margin:16px}
h1{font-size:17px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px}p{color:var(--muted);margin:0 0 8px}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td:nth-child(6){white-space:normal}th{color:var(--muted);font-weight:600}.bad{color:var(--bad);font-weight:600}a{color:inherit}
</style></head><body>
<h1>Cofactory ops</h1><p>${new Date(data.at).toISOString()} · unallocated ${dollars(data.unallocatedCents)} · reserve ${dollars(data.reserveCents)} · ${evals}</p>
<h2>Companies</h2><table>${head(["company", "stage", "status", "cap", "available", "spent", "model", "cost by stage", "last outside event", "live", "alarms", "untraceable"])}${companies || row(["none yet"])}</table>
<h2>Live sessions</h2><table>${head(["session", "company", "seat", "kind", "trigger", "rounds", "started", "ends by (UTC)"])}${sessions || row(["none"])}</table>
<h2>Alarms</h2><table>${head(["company", "alarm", "detail", "raised"])}${alarms || row(["none"])}</table>
<h2>Decisions at gates</h2><table>${head(["when (UTC)", "company", "decision", "verdict", "by", "why", "evidence", "cost then"])}${decisions || row(["none yet"])}</table>
<h2>Owner touches, last 7 days</h2><table>${head(["company", "seat actions", "owner touches", "owner share", "why"])}${autonomyRows || row(["none"])}</table>
</body></html>`;
}
