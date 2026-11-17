import type { Decision, EvidenceLink } from "../../../shared/cofactory/observe.ts";
import type { Book } from "../book.ts";
import type { RuntimeStore } from "../runtime/store.ts";
import type { Truth } from "../truth/store.ts";
import { costByStage, costSnapshot } from "./cost.ts";
import type { ObserveStore } from "./store.ts";
import type { DiscoveryStore } from "../discovery/store.ts";
import type { Sprints } from "../validation/sprints.ts";

export interface TraceDeps {
  book: Book;
  truth: Truth;
  observe: ObserveStore;
  runtime: RuntimeStore | null;
  discovery?: DiscoveryStore | null;
  sprints?: Sprints | null;
}

/** Looks an evidence link up where it lives; null means the decision points at nothing. */
export function resolveEvidence(deps: Pick<TraceDeps, "book" | "truth" | "runtime" | "discovery" | "sprints">, link: EvidenceLink): unknown {
  switch (link.type) {
    case "claim_check": return deps.truth.claimCheck(link.id);
    case "external_event": return deps.truth.event(link.id);
    case "hold": return deps.book.authorization(link.id);
    case "ledger_entry": return deps.book.entries().find((entry) => entry.id === link.id) ?? null;
    case "company": return deps.book.company(link.id);
    case "session": return deps.runtime?.session(link.id) ?? null;
    case "signal": return deps.discovery?.signal(link.id) ?? null;
    case "niche": return deps.discovery?.niche(link.id) ?? null;
    case "dossier": return deps.discovery?.dossier(link.id) ?? null;
    case "sprint": return deps.sprints?.sprint(link.id) ?? null;
    case "touch": return deps.sprints?.touch(link.id) ?? null;
  }
}

/** Stage moves and money that need a record behind them when allowed. */
const NEEDS_EVIDENCE = new Set(["stage.advance", "spend.authorize", "spend.capture", "company.launch", "company.kill", "company.top_up", "revenue.record", "signal.record", "niche.propose", "niche.select", "dossier.submit", "dossier.champion", "sprint.start", "sprint.add_buyer", "outreach.send"]);

/**
 * Whether a decision can be traced: its cost snapshot is present, and every link resolves. An allowed decision of a
 * kind that moves a stage or money must also carry at least one link (a move to design needs none).
 */
export function traceProblem(deps: Pick<TraceDeps, "book" | "truth" | "runtime" | "discovery" | "sprints">, decision: Decision): string | null {
  const cost = decision.cost;
  if (!cost || typeof cost.companyShadowCents !== "number" || typeof cost.companySpentCents !== "number") return "no cost snapshot";
  const freeMove = decision.kind === "stage.advance" && /^to design\b/.test(decision.reason);
  if (decision.verdict === "allowed" && NEEDS_EVIDENCE.has(decision.kind) && !decision.evidence.length && !freeMove) return "allowed with no evidence";
  for (const link of decision.evidence) if (!resolveEvidence(deps, link)) return `evidence ${link.type} ${String(link.id)} does not resolve`;
  return null;
}

/** Everything one session did: its trail, journal, tool calls, decisions with resolved evidence, owner touches and cost. */
export function sessionTrace(deps: TraceDeps, sessionId: string) {
  const session = deps.runtime?.session(sessionId) ?? null;
  if (!session) return null;
  const decisions = deps.observe.decisions({ sessionId });
  return {
    session,
    events: deps.runtime!.sessionEvents(sessionId),
    journal: deps.runtime!.journal(session.companyId, 500).filter((entry) => entry.sessionId === sessionId),
    toolCalls: deps.observe.toolCalls({ sessionId }),
    decisions: decisions.map((decision) => ({ ...decision, resolved: decision.evidence.map((link) => ({ link, record: resolveEvidence(deps, link) })), problem: traceProblem(deps, decision) })),
    ownerTouches: deps.observe.touches({ companyId: session.companyId }).filter((touch) => touch.sessionId === sessionId),
    cost: costSnapshot(deps.book, session.companyId, session),
  };
}

type TimelineItem = { at: number; source: string; text: string; ref?: string };

/** One company's whole story in time order: its books, the outside world, its sessions, decisions and the owner. */
export function companyTrace(deps: TraceDeps, companyId: string) {
  const company = deps.book.company(companyId);
  if (!company) return null;
  const timeline: TimelineItem[] = [];
  for (const event of deps.book.events(companyId)) timeline.push({ at: event.at, source: "books", text: `${event.type} by ${event.actor} ${JSON.stringify(event.data)}` });
  for (const entry of deps.book.entries({ companyId })) if (entry.kind !== "shadow") timeline.push({ at: entry.at, source: "ledger", text: `${entry.kind} ${entry.cents} cents${entry.vendor ? ` ${entry.vendor}` : ""}${entry.receipt ? ` receipt ${entry.receipt}` : ""}`, ref: entry.id });
  for (const event of deps.truth.events({ companyId })) timeline.push({ at: event.receivedAt, source: "world", text: `${event.kind} via ${event.source} (${event.evidenceClass})${event.text ? `: ${event.text.slice(0, 160)}` : ""}`, ref: event.id });
  for (const session of deps.runtime?.sessionsFor(companyId, 500) ?? []) {
    timeline.push({ at: session.startedAt, source: "session", text: `${session.role} ${session.kind} session started (${session.trigger}): ${session.objective}`, ref: session.id });
    if (session.endedAt) timeline.push({ at: session.endedAt, source: "session", text: `${session.role} session ${session.status}: ${session.stopReason ?? ""}`, ref: session.id });
  }
  for (const entry of deps.runtime?.journal(companyId, 500) ?? []) timeline.push({ at: entry.at, source: "journal", text: `${entry.role}: ${entry.did}${entry.next ? ` | next: ${entry.next}` : ""}` });
  const decisions = deps.observe.decisions({ companyId });
  for (const decision of decisions) timeline.push({ at: decision.at, source: "decision", text: `${decision.kind} ${decision.verdict} by ${decision.actor}: ${decision.reason}`, ref: decision.id });
  for (const touch of deps.observe.touches({ companyId })) timeline.push({ at: touch.at, source: "owner", text: `${touch.source} ${touch.kind}: ${touch.detail}` });
  timeline.sort((a, b) => a.at - b.at);
  return {
    company,
    costByStage: costByStage(deps.book, companyId),
    cost: costSnapshot(deps.book, companyId, null),
    untraceable: decisions.flatMap((decision) => { const problem = traceProblem(deps, decision); return problem ? [{ decision: decision.id, kind: decision.kind, problem }] : []; }),
    timeline,
  };
}

/** Owner touches against the work the seats did on their own, per company: the autonomy metric. */
export function autonomy(deps: TraceDeps, since: number) {
  const calls = deps.observe.toolCalls({ limit: 100_000 }).filter((call) => call.at >= since);
  const touches = deps.observe.touches({ since });
  const keys = new Set<string | null>([...calls.map((call) => call.companyId), ...touches.map((touch) => touch.companyId)]);
  return [...keys].map((companyId) => {
    const seatActions = calls.filter((call) => call.companyId === companyId).length;
    const ownerActions = touches.filter((touch) => touch.companyId === companyId);
    return {
      companyId, seatActions, ownerTouches: ownerActions.length,
      ownerShare: seatActions + ownerActions.length ? ownerActions.length / (seatActions + ownerActions.length) : 0,
      why: Object.entries(ownerActions.reduce<Record<string, number>>((counts, touch) => ({ ...counts, [`${touch.source}:${touch.kind}`]: (counts[`${touch.source}:${touch.kind}`] ?? 0) + 1 }), {})),
    };
  });
}
