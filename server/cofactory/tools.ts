import { z } from "zod";

import {
  COMPANY_ROLES,
  FACTORY_ROLES,
  KILL_REASONS,
  MESSAGE_TYPES,
  REPLY_POLICIES,
  SPEND_CATEGORIES,
  STAGES,
  type FactoryMessage,
  type Membership,
  type Role,
} from "../../shared/cofactory/types.ts";
import type { Book } from "./book.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { verifyEvidence } from "./truth/gate.ts";
import { POSTMORTEM_CAUSES } from "./discovery/store.ts";
import type { FactorySettings } from "./settings.ts";
import type { Truth } from "./truth/store.ts";
import type { Launcher } from "./runtime/launcher.ts";
import type { Sessions } from "./runtime/sessions.ts";
import type { Observer } from "./observe/observer.ts";
import type { Discovery } from "./discovery/discovery.ts";
import type { Dossiers } from "./dossier/dossiers.ts";
import { giveawayProblem, type Outreach } from "./validation/outreach.ts";
import type { Rails } from "./validation/rails.ts";
import type { Sprints } from "./validation/sprints.ts";
import { createInvoice, createPaymentLink, renderOfferPage } from "./validation/offer.ts";
import { fileInside, runbookProblem, type Orders } from "./validation/orders.ts";
import { OUTREACH_CHANNELS } from "../../shared/cofactory/validation.ts";
import { SIGNAL_KINDS, SOURCE_TYPES } from "../../shared/cofactory/discovery.ts";
import type { DecisionKind, EvidenceLink } from "../../shared/cofactory/observe.ts";
import type { Session } from "../../shared/cofactory/runtime.ts";

export type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

const ok = (value: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
const refused = (reason: string): ToolResult => ({ isError: true, content: [{ type: "text", text: `refused: ${reason}` }] });

const SPENDERS: readonly Role[] = COMPANY_ROLES;
const ALL: readonly Role[] = [...FACTORY_ROLES, ...COMPANY_ROLES];

const brief = z.object({
  goal: z.string().min(1).max(2_000),
  known: z.string().max(4_000).default(""),
  done_when: z.string().min(1).max(2_000),
  constraints: z.string().max(2_000).default(""),
});
const evidence = z.object({
  kind: z.enum(["path_live", "selling_signal", "repeatable_motion"]),
  source: z.enum(["webhook", "form", "mailbox", "payment", "test_result", "inbound"]),
  ref: z.string().min(1).max(500),
  note: z.string().max(1_000).optional(),
});
const cents = z.number().int().positive().max(100_000_000);
const cited = z.object({ url: z.string().url().max(2_000), quote: z.string().min(6).max(1_500) });
const per = z.enum(["month", "year", "job", "hour"]);
const dossierBody = z.object({
  buyers: z.array(z.object({ name: z.string().min(2).max(200), url: z.string().url().max(2_000), contactUrl: z.string().url().max(2_000), whyFit: z.string().max(500) })).max(15),
  pains: z.array(cited.extend({ sourceType: z.enum(SOURCE_TYPES) })).max(20),
  spend: z.array(cited.extend({ amountCents: z.number().int().nonnegative(), per })).max(10),
  buyerCount: cited.extend({ value: z.number().int().nonnegative() }),
  incumbents: z.array(z.object({ name: z.string().min(1).max(200), url: z.string().url().max(2_000), whatTheyMiss: z.string().max(1_000), priceCents: z.number().int().nonnegative().nullable() })).max(10),
  gap: z.object({ why: z.string().max(2_000), hiddenReasonsRuledOut: z.string().max(2_000) }),
  firstTen: z.object({ channel: z.string().max(300), steps: z.string().max(3_000) }),
  failureModes: z.array(z.string().max(500)).max(10),
  risks: z.object({ licensedAdvice: z.boolean(), regulatedClaims: z.boolean(), platformTos: z.string().max(200).nullable(), gatekeeperShare: z.number().min(0).max(1), procurement: z.boolean(), notes: z.string().max(2_000) }),
  offer: z.object({
    archetype: z.enum(["done_for_you", "monitoring", "micro_tool", "templates", "directory"]), priceCents: z.number().int().positive(), per: z.enum(["month", "year", "job"]),
    humanAlternative: cited.extend({ amountCents: z.number().int().positive(), per, hoursPerMonth: z.number().positive().optional() }),
    costToServeCents: z.number().int().nonnegative(),
  }),
});

export interface ToolContext {
  book: Book;
  truth: Truth;
  seat: Membership;
  actor: string;
  sessions?: Sessions;
  launcher?: Launcher;
  now?: () => number;
  observe?: Observer;
  discovery?: Discovery;
  dossiers?: Dossiers;
  validation?: { sprints: Sprints; outreach: Outreach; rails: Rails; orders: Orders; folderOf(companyId: string): string; saveOffer(companyId: string, html: string): string };
  /** The owner's standing choices: the per-company cap a launch may not exceed. */
  settings?: () => FactorySettings;
  /** The seat's running session, which decisions and tool calls are filed under. */
  session?: Session | null;
}

const ADDRESSEES = "owner|ceo|lead|scout|builder|marketer|seller|operator";
const SENT_TO = new RegExp(`\\b(?:escalated|sent|reported|wrote|forwarded|passed)\\b(?:\\s+(?:it|this|that|them|these|the \\w+|a \\w+|an \\w+))?\\s+(?:up\\s+)?to\\s+the\\s+(?:factory\\s+)?(${ADDRESSEES})\\b`, "gi");
const NOTIFIED = new RegExp(`\\b(?:the\\s+)?(?:factory\\s+)?(${ADDRESSEES})\\s+(?:was\\s+|has been\\s+)?(?:notified|alerted)\\b(?!\\s+(?:me|us)\\b)`, "gi");
const TOLD = new RegExp(`\\b(?:told|asked|notified|informed|messaged|alerted|corrected|pinged|updated)\\s+the\\s+(?:factory\\s+)?(${ADDRESSEES})\\b`, "gi");

/**
 * Claims in a seat's own words that it messaged someone this session ("escalated it to the owner", "told the CEO")
 * with no typed message from it to that role since the session began. A summary must not report work that was not done.
 */
export function unbackedClaims(text: string, sentTo: ReadonlySet<string>): string[] {
  const firstPerRole = new Map<string, string>();
  for (const match of [...text.matchAll(SENT_TO), ...text.matchAll(TOLD), ...text.matchAll(NOTIFIED)].sort((x, y) => x.index! - y.index!)) {
    const role = match[1]!.toLowerCase();
    if (!sentTo.has(role) && !firstPerRole.has(role)) firstPerRole.set(role, match[0]);
  }
  return [...firstPerRole.entries()]
    .map(([role, phrase]) => `you wrote "${phrase}" but sent no message to the ${role} this session; send it with cofactory_send (to_role "${role}") or say what you actually did`);
}

function sentThisSession(ctx: ToolContext): Set<string> {
  const since = ctx.session?.startedAt ?? 0;
  return new Set(ctx.book.messagesAfter(0).filter(({ message }) => message.fromBotId === ctx.seat.botId && message.at >= since).map(({ message }) => message.toRole));
}

/** Files a gate decision with its evidence and the cost it was made at. */
function decide(ctx: ToolContext, kind: DecisionKind, verdict: "allowed" | "refused", reason: string, evidence: EvidenceLink[], companyId: string | null = ctx.seat.companyId): void {
  ctx.observe?.decide({ companyId, session: ctx.session ?? null, actor: ctx.actor, kind, verdict, reason, evidence });
}

interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  roles: readonly Role[];
  input: S;
  run(args: z.infer<S>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

const spec = <S extends z.ZodType>(value: ToolSpec<S>) => value as unknown as ToolSpec<z.ZodType>;

const TOOLS: ToolSpec<z.ZodType>[] = [
  spec({
    name: "cofactory_status",
    description: "Your seat, and the state you act on: your company (stage, cap, money left, recent ledger) or, for the factory lead and scout, the whole portfolio with the auditor's recommendations.",
    roles: ALL,
    input: z.object({}),
    run(_args, { book, seat }) {
      if (seat.companyId === null) {
        return ok({
          seat, unallocatedCents: book.balance("unallocated"), reserveCents: book.balance("reserve"),
          companies: book.companies().map((c) => ({ ...c, availableCents: book.available(c.id) })),
          recommendations: book.audit(),
        });
      }
      const company = book.company(seat.companyId);
      return ok({ seat, company, availableCents: book.available(seat.companyId), recentLedger: book.entries({ companyId: seat.companyId }).slice(-15) });
    },
  }),
  spec({
    name: "cofactory_authorize_spend",
    description: "Ask for a hold on your company's money before any real-dollar purchase. Nothing may be bought without one. Returns a hold id to capture once the vendor charges, or the reason it was refused.",
    roles: SPENDERS,
    input: z.object({ category: z.enum(SPEND_CATEGORIES), vendor: z.string().min(1).max(200), cents, purpose: z.string().min(1).max(500) }),
    run(args, ctx) {
      const { book, seat, actor } = ctx;
      const result = book.authorize({ companyId: seat.companyId!, category: args.category, vendor: args.vendor, cents: args.cents }, actor);
      if (!result.ok) { decide(ctx, "spend.authorize", "refused", `${args.cents} cents ${args.category} at ${args.vendor}: ${result.reason}`, []); return refused(result.reason); }
      decide(ctx, "spend.authorize", "allowed", `${args.cents} cents ${args.category} at ${args.vendor} for ${args.purpose}`, [{ type: "hold", id: result.authorization.id }]);
      return ok({ hold: result.authorization });
    },
  }),
  spec({
    name: "cofactory_capture_spend",
    description: "Record the real charge against a hold, with the vendor's receipt or invoice id. cents defaults to the held amount and may not exceed it.",
    roles: SPENDERS,
    input: z.object({ hold_id: z.string().min(1), cents: cents.optional(), receipt: z.string().min(1).max(500) }),
    run(args, ctx) {
      const { book, seat, actor } = ctx;
      if (book.authorization(args.hold_id)?.companyId !== seat.companyId) { decide(ctx, "spend.capture", "refused", "no hold with that id for this company", []); return refused("no hold with that id for your company"); }
      const result = book.capture(args.hold_id, { ...(args.cents !== undefined ? { cents: args.cents } : {}), receipt: args.receipt }, actor);
      if (!result.ok) { decide(ctx, "spend.capture", "refused", result.reason, [{ type: "hold", id: args.hold_id }]); return refused(result.reason); }
      decide(ctx, "spend.capture", "allowed", `${result.entry.cents} cents, receipt ${args.receipt}`, [{ type: "hold", id: args.hold_id }, { type: "ledger_entry", id: result.entry.id }]);
      return ok({ entry: result.entry, availableCents: book.available(seat.companyId!) });
    },
  }),
  spec({
    name: "cofactory_void_spend",
    description: "Release a hold you no longer need, so its money is available again.",
    roles: SPENDERS,
    input: z.object({ hold_id: z.string().min(1) }),
    run(args, ctx) {
      const { book, seat } = ctx;
      if (book.authorization(args.hold_id)?.companyId !== seat.companyId) { decide(ctx, "spend.void", "refused", "no hold with that id for this company", []); return refused("no hold with that id for your company"); }
      const voided = book.voidAuthorization(args.hold_id);
      decide(ctx, "spend.void", voided ? "allowed" : "refused", voided ? "hold released" : "no open hold with that id", [{ type: "hold", id: args.hold_id }]);
      return voided ? ok({ voided: args.hold_id }) : refused("no open hold with that id");
    },
  }),
  spec({
    name: "cofactory_advance_stage",
    description: "Move your company to its next stage. Market needs path_live evidence, Sell needs selling_signal evidence, Manage needs recorded revenue or repeatable_motion evidence. The ref is checked against the world: path_live may be the offer page's URL (it must load for a stranger) or a recorded event id; selling_signal must be a recorded reply, form or payment event that reads urgent or committed; repeatable_motion must be a recorded payment.",
    roles: ["ceo"],
    input: z.object({ to: z.enum(STAGES), evidence: evidence.optional() }),
    async run(args, ctx) {
      const { book, truth, seat, actor } = ctx;
      const links: EvidenceLink[] = [];
      let because = "";
      if (args.evidence) {
        const checked = await verifyEvidence(truth, seat.companyId!, args.evidence);
        if (checked.link) links.push(checked.link);
        if (!checked.ok) { decide(ctx, "stage.advance", "refused", `to ${args.to}: evidence did not check out: ${checked.reason}`, links); return refused(`evidence did not check out: ${checked.reason}`); }
        because = checked.reason;
      } else if (args.to === "manage") {
        const revenue = book.entries({ companyId: seat.companyId! }).filter((entry) => entry.kind === "revenue");
        links.push(...revenue.map((entry): EvidenceLink => ({ type: "ledger_entry", id: entry.id })));
        because = `${revenue.length} revenue entries`;
      }
      const result = book.advance(seat.companyId!, args.to, args.evidence ?? null, actor);
      decide(ctx, "stage.advance", result.ok ? "allowed" : "refused", result.ok ? `to ${args.to}${because ? `: ${because}` : ""}` : `to ${args.to}: ${result.reason}`, links);
      return result.ok ? ok({ company: result.company }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_check_claim",
    description: "Check a claim against the live web before relying on it: the URL must load, and a quote must appear on the page word for word (an elided quote needs every part, in order). Verdicts: verified, missing (page read, quote not there), unreachable, unverifiable (page too thin to judge, often script-rendered). Every check is kept.",
    roles: ALL,
    input: z.object({ url: z.string().min(1).max(2_000), quote: z.string().max(2_000).optional() }),
    async run(args, { truth, seat }) {
      const check = await truth.checkClaim({ url: args.url, quote: args.quote ?? null, subject: seat.companyId ? `company:${seat.companyId}` : `seat:${seat.botId}` });
      return ok({ check });
    },
  }),
  spec({
    name: "cofactory_journal",
    description: "Write this session's journal entry: what you did, what you learned, what comes next, and what blocks you. Every later session starts from the journal, not from this chat, so write what the next session needs. Required before cofactory_end_session.",
    roles: ALL,
    input: z.object({ did: z.string().min(1).max(4_000), learned: z.string().max(4_000).default(""), next: z.string().max(2_000).default(""), blockers: z.string().max(2_000).default("") }),
    run(args, ctx) {
      const { seat, sessions } = ctx;
      if (!sessions) return refused("the runtime is not running");
      const unbacked = unbackedClaims(args.did, sentThisSession(ctx));
      if (unbacked.length) return refused(unbacked.join("; "));
      return ok({ entry: sessions.journal(seat, args) });
    },
  }),
  spec({
    name: "cofactory_end_session",
    description: "End your current session once its objective is met (done), when you are waiting on something outside (waiting: name it and give wake_in_hours), or when you cannot progress (blocked). The session ends when this turn finishes. Refused until this session has a journal entry.",
    roles: ALL,
    input: z.object({
      outcome: z.enum(["done", "waiting", "blocked"]),
      summary: z.string().min(1).max(2_000),
      waiting_on: z.string().max(500).optional(),
      wake_in_hours: z.number().positive().max(24 * 14).optional(),
    }),
    run(args, ctx) {
      const { seat, sessions, now } = ctx;
      if (!sessions) return refused("the runtime is not running");
      if (args.outcome === "waiting" && (!args.waiting_on?.trim() || args.wake_in_hours === undefined)) return refused("waiting needs waiting_on (what you wait for) and wake_in_hours");
      const unbacked = unbackedClaims(args.summary, sentThisSession(ctx));
      if (unbacked.length) return refused(unbacked.join("; "));
      const summary = args.outcome === "waiting" ? `${args.summary} (waiting on: ${args.waiting_on})` : args.summary;
      const nextWakeAt = args.wake_in_hours === undefined ? null : (now ?? Date.now)() + args.wake_in_hours * 60 * 60_000;
      const ended = sessions.requestEnd(seat, { outcome: args.outcome, summary, nextWakeAt });
      decide(ctx, "session.end", ended.ok ? "allowed" : "refused", ended.ok ? `${args.outcome}: ${summary}` : ended.reason, ctx.session ? [{ type: "session", id: ctx.session.id }] : []);
      return ended.ok ? ok({ ending: { sessionId: ended.session.id, outcome: args.outcome } }) : refused(ended.reason);
    },
  }),
  spec({
    name: "cofactory_profile",
    description: "The factory's profile: the owner's own inputs (domains, skills, network, assets, geography, languages, interests), each with an id a niche must cite, the owner's constraints, any seed niches to look into, and the open discovery batch with what it still needs.",
    roles: ["scout", "lead"],
    input: z.object({}),
    run(_args, { discovery }) {
      if (!discovery) return refused("discovery is not running");
      const profile = discovery.profile();
      if (!profile) return refused("the owner has not set the factory profile yet");
      return ok({ profile, batch: discovery.batchStatus() });
    },
  }),
  spec({
    name: "cofactory_record_signal",
    description: "Record one piece of demand evidence you found on a public page: a complaint, an 'I'd pay for', a 'why doesn't someone', a long-lived workaround, a job post with a budget, a regulation, a price, or a registry count. The quote must be copied word for word from the page (at least six words); it is fetched and checked, and refused if it is not there. Only recorded signals can back a niche.",
    roles: ["scout"],
    input: z.object({
      url: z.string().url().max(2_000), quote: z.string().min(1).max(1_500), kind: z.enum(SIGNAL_KINDS), source_type: z.enum(SOURCE_TYPES),
      buyer_hint: z.string().min(1).max(200), job_hint: z.string().min(1).max(300),
    }),
    async run(args, ctx) {
      if (!ctx.discovery) return refused("discovery is not running");
      const result = await ctx.discovery.recordSignal({ url: args.url, quote: args.quote, kind: args.kind, sourceType: args.source_type, buyerHint: args.buyer_hint, jobHint: args.job_hint });
      const link = result.checkId === undefined ? [] : [{ type: "claim_check" as const, id: result.checkId, url: args.url }];
      if (!result.ok) { decide(ctx, "signal.record", "refused", `${args.kind} from ${args.url}: ${result.reason}`, link, null); return refused(result.reason); }
      if (!result.duplicate) decide(ctx, "signal.record", "allowed", `${args.kind} (${args.source_type}) from ${result.signal.site}`, [...link, { type: "signal", id: result.signal.id }], null);
      return ok({ signal: result.signal, duplicate: result.duplicate });
    },
  }),
  spec({
    name: "cofactory_propose_niche",
    description: "Propose one extremely niche business: one buyer, one job they pay to get done, one channel that reaches them. It must rest on at least 3 recorded signals from at least 3 different sites and 2 kinds of source, at least one of them buyers in their own words (forum, review, job board, Q&A, social or marketplace page), cite at least one of the owner's input ids, and say precisely what incumbents miss and why the gap exists. Mark boring (operations-heavy, tedious) and cross_field (crosses an owner input with an unrelated field) honestly: the batch has quotas for both. Refused if it duplicates this factory's niches or a niche another factory holds.",
    roles: ["scout"],
    input: z.object({
      buyer: z.string().min(3).max(200), job: z.string().min(3).max(300), channel: z.string().min(3).max(200), why_gap: z.string().min(1).max(2_000),
      signal_ids: z.array(z.string()).min(1).max(20), unique_input_ids: z.array(z.string()).min(1).max(10), boring: z.boolean(), cross_field: z.boolean(),
    }),
    run(args, ctx) {
      if (!ctx.discovery) return refused("discovery is not running");
      const result = ctx.discovery.proposeNiche({ buyer: args.buyer, job: args.job, channel: args.channel, whyGap: args.why_gap, signalIds: args.signal_ids, uniqueInputIds: args.unique_input_ids, boring: args.boring, crossField: args.cross_field });
      const signals = args.signal_ids.filter((id) => ctx.discovery!.store.signal(id)).map((id) => ({ type: "signal" as const, id }));
      if (!result.ok) { decide(ctx, "niche.propose", "refused", `${args.buyer} · ${args.job}: ${result.reason}`, signals, null); return refused(result.reason); }
      decide(ctx, "niche.propose", "allowed", `${result.niche.buyer} · ${result.niche.job} · ${result.niche.channel}`, [{ type: "niche", id: result.niche.id }, ...signals], null);
      return ok({ niche: result.niche, batch: ctx.discovery.batchStatus() });
    },
  }),
  spec({
    name: "cofactory_discovery_status",
    description: "Where the open discovery batch stands: niches and signals so far, the boring and cross-field shares, and what it still needs.",
    roles: ["scout", "lead"],
    input: z.object({}),
    run(_args, { discovery }) {
      if (!discovery) return refused("discovery is not running");
      const status = discovery.batchStatus();
      if (!status) return refused("no discovery batch has been started");
      const niches = discovery.store.niches({ batchId: status.batch.id }).map((niche) => ({ id: niche.id, buyer: niche.buyer, job: niche.job, channel: niche.channel, boring: niche.boring, crossField: niche.crossField, density: niche.density }));
      return ok({ status, niches });
    },
  }),
  spec({
    name: "cofactory_close_batch",
    description: "Close the open discovery batch once it has its target number of niches and meets the boring and cross-field quotas. Closing selects the strongest candidates for dossiers.",
    roles: ["scout", "lead"],
    input: z.object({}),
    run(_args, ctx) {
      const { discovery, dossiers } = ctx;
      if (!discovery) return refused("discovery is not running");
      const closed = discovery.closeBatch();
      if (!closed.ok) return refused(closed.reason);
      const selected = dossiers?.select(closed.status.batch.id) ?? [];
      for (const id of selected) decide(ctx, "niche.select", "allowed", "selected for a dossier from the closed batch", [{ type: "niche", id }], null);
      return ok({ status: closed.status, selectedForDossiers: selected });
    },
  }),
  spec({
    name: "cofactory_submit_dossier",
    description: [
      "Submit the dossier for a selected niche: the one-page case code can check. Every URL is fetched and every quote must be on its page.",
      "Needs: 5-10 buyers (a page proving each exists and a public contact page); at least 5 practitioner pain quotes from buyers' own pages on 2+ sites and 2+ kinds of source (forums, reviews, Q&A; job ads may be at most half, since they show spend, not pain);",
      "what buyers spend today (amountCents must be the amount in the quote); the buyer count (value must be the number in its quote); incumbents and what they miss;",
      "why the gap exists and which hidden reasons (monopoly, regulation) you ruled out; a concrete plan for the first ten customers; 3+ specific failure modes;",
      "risks; and the offer, whose price must be at most a third of the human alternative (cited) with at least half the price left after the cost to serve the heaviest customer.",
      "It is then asked 10 random questions answered only from verified evidence (more than 3 unknown fails), and scored. A failed dossier can be fixed and resubmitted.",
    ].join(" "),
    roles: ["scout"],
    input: z.object({ niche_id: z.string().min(1), dossier: dossierBody }),
    async run(args, ctx) {
      if (!ctx.dossiers) return refused("dossiers are not running");
      const result = await ctx.dossiers.submit(args.niche_id, args.dossier);
      if (!result.ok) { decide(ctx, "dossier.submit", "refused", result.reason, [{ type: "niche", id: args.niche_id }], null); return refused(result.reason); }
      const { dossier } = result;
      const links = dossier.verification.claims.filter((claim) => claim.checkId !== null).map((claim) => ({ type: "claim_check" as const, id: claim.checkId!, url: claim.url }));
      decide(ctx, "dossier.submit", dossier.status === "failed" || dossier.status === "dropped" ? "refused" : "allowed",
        `v${dossier.version} ${dossier.status}: score ${dossier.score?.score ?? "-"}, ${Math.round(dossier.verification.verifiedShare * 100)}% verified, ${dossier.qa.unknown} unknown${dossier.score?.vetoes.length ? `, vetoes: ${dossier.score.vetoes.map((item) => item.veto).join(", ")}` : ""}`,
        [{ type: "dossier", id: dossier.id }, ...links], null);
      return ok({
        status: dossier.status, version: dossier.version, score: dossier.score,
        verification: { verifiedShare: dossier.verification.verifiedShare, failedClaims: dossier.verification.claims.filter((claim) => claim.verdict !== "verified"), criticalFailures: dossier.verification.criticalFailures, structural: dossier.verification.structural },
        qa: dossier.qa,
      });
    },
  }),
  spec({
    name: "cofactory_dossiers",
    description: "Every niche past discovery with its newest dossier: status, score, vetoes and champion. Also lists selected niches that still need a dossier.",
    roles: ["scout", "lead"],
    input: z.object({}),
    run(_args, { dossiers }) {
      if (!dossiers) return refused("dossiers are not running");
      return ok({ niches: dossiers.board(), stillNeedDossier: dossiers.wanted() });
    },
  }),
  spec({
    name: "cofactory_champion",
    description: "Champion a clean dossier the score left off the shortlist, so it goes on to a cheap validation test. Say specifically what the score misses and cite at least one verified signal id or claim check id. Vetoed or unverified dossiers cannot be championed.",
    roles: ["scout", "lead"],
    input: z.object({ dossier_id: z.string().min(1), why: z.string().min(1).max(2_000), evidence: z.array(z.string()).min(1).max(10) }),
    run(args, ctx) {
      if (!ctx.dossiers) return refused("dossiers are not running");
      const result = ctx.dossiers.champion(args.dossier_id, ctx.actor, args.why, args.evidence);
      decide(ctx, "dossier.champion", result.ok ? "allowed" : "refused", result.ok ? args.why.slice(0, 200) : result.reason, [{ type: "dossier", id: args.dossier_id }], null);
      return result.ok ? ok({ dossier: { id: result.dossier.id, status: result.dossier.status, champion: result.dossier.champion } }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_start_sprint",
    description: "Start this company's validation sprint: list named buyers now; the week starts at the first outreach, which needs the offer page to load for a stranger. A week to put the offer in front of named buyers and get an answer from the world. It passes on one real payment, or on urgent replies from 3 different buyers; it fails when the week runs out. Returns the rails connected (mailbox, Stripe, public intake) and the outreach caps.",
    roles: ["ceo"],
    input: z.object({}),
    run(_args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const started = ctx.validation.sprints.start({ companyId: ctx.seat.companyId!, offerUrl: ctx.validation.rails.get(ctx.seat.companyId!).offerUrl });
      decide(ctx, "sprint.start", started.ok ? "allowed" : "refused", started.ok ? `sprint ends ${new Date(started.sprint.endsAt).toISOString()}` : started.reason, started.ok ? [{ type: "sprint", id: started.sprint.id }] : []);
      return started.ok ? ok({ sprint: started.sprint, rails: ctx.validation.rails.summary(ctx.seat.companyId!), caps: ctx.validation.sprints.policy }) : refused(started.reason);
    },
  }),
  spec({
    name: "cofactory_add_buyer",
    description: "Add a named buyer to the running sprint's contact list. Give the page that shows their public contact route (for email, the address must appear on that page). No bought lists, no guessed addresses; suppressed addresses are refused for good.",
    roles: ["ceo", "marketer", "seller"],
    input: z.object({ name: z.string().min(2).max(200), address: z.string().min(3).max(500), channel: z.enum(OUTREACH_CHANNELS), source_url: z.string().url().max(2_000) }),
    async run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const sprint = ctx.validation.sprints.running(ctx.seat.companyId!);
      if (!sprint) return refused("no sprint is running; the CEO starts one");
      const added = await ctx.validation.sprints.addTarget(sprint.id, { name: args.name, address: args.address, channel: args.channel, sourceUrl: args.source_url });
      decide(ctx, "sprint.add_buyer", added.ok ? "allowed" : "refused", added.ok ? `${args.name} via ${args.channel}` : added.reason, added.ok ? [{ type: "claim_check", id: added.target.sourceCheckId, url: args.source_url }, { type: "sprint", id: sprint.id }] : [{ type: "sprint", id: sprint.id }]);
      return added.ok ? ok({ buyer: added.target }) : refused(added.reason);
    },
  }),
  spec({
    name: "cofactory_send_outreach",
    description: "Email one buyer on the sprint's list from the company's mailbox. Write to them as a person: who you are, the specific problem you can take off their hands, the price, one clear next step. The opt-out line (first contact) and the company's postal address are added for you, so write neither. Never give the first order away. Refused when the buyer is suppressed or a cap is reached (per day, per sprint, two contacts per buyer at least three days apart). Replies come back as events.",
    roles: ["ceo", "marketer", "seller"],
    input: z.object({ buyer_id: z.string().min(1), subject: z.string().min(3).max(200), text: z.string().min(20).max(5_000) }),
    async run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const sprint = ctx.validation.sprints.running(ctx.seat.companyId!);
      if (!sprint) return refused("no sprint is running; the CEO starts one");
      const sent = await ctx.validation.outreach.send(sprint.id, args.buyer_id, { subject: args.subject, text: args.text });
      decide(ctx, "outreach.send", sent.ok ? "allowed" : "refused", sent.ok ? `email "${args.subject}"` : sent.reason, sent.ok ? [{ type: "touch", id: sent.touchId }, { type: "sprint", id: sprint.id }] : [{ type: "sprint", id: sprint.id }]);
      return sent.ok ? ok({ sent: { messageId: sent.messageId } }) : refused(sent.reason);
    },
  }),
  spec({
    name: "cofactory_sprint_status",
    description: "The running sprint: days left, the buyer list with contacts made, evidence so far (committed events, urgent buyers), caps left, and which rails are connected.",
    roles: ["ceo", "builder", "marketer", "seller", "operator"],
    input: z.object({}),
    run(_args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const sprint = ctx.validation.sprints.running(ctx.seat.companyId!);
      const rails = ctx.validation.rails.summary(ctx.seat.companyId!);
      if (!sprint) return ok({ sprint: null, rails });
      const touches = ctx.validation.sprints.touches(sprint.id);
      return ok({
        sprint, rails, evidence: ctx.validation.sprints.evidence(sprint.id), contactsUsed: touches.length,
        buyers: ctx.validation.sprints.targets(sprint.id).map((target) => ({ ...target, contacts: touches.filter((touch) => touch.targetId === target.id).length, suppressed: Boolean(ctx.validation!.sprints.suppressed(target.address)) })),
      });
    },
  }),
  spec({
    name: "cofactory_publish_offer",
    description: "Write the offer page: headline, who it is for, what they get, the price, and (when connected) the payment link and a request form. It is served from the company's public intake address. The contact email and postal address on it come from the company's rails, set by the owner; never put a person's details on it yourself. Only say what the dossier can source.",
    roles: ["ceo", "builder"],
    input: z.object({
      business_name: z.string().min(2).max(120), headline: z.string().min(5).max(200), for_whom: z.string().min(5).max(300),
      deliverables: z.array(z.string().min(3).max(300)).min(1).max(8), price_line: z.string().min(2).max(120),
      payment_url: z.string().regex(/^https:\/\/buy\.stripe\.com\/[\w-]+$/, "a Stripe payment link from cofactory_payment_link").nullable().default(null),
    }),
    run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const companyId = ctx.seat.companyId!;
      const rails = ctx.validation.rails.summary(companyId);
      const giveaway = giveawayProblem([args.headline, args.for_whom, ...args.deliverables, args.price_line].join("\n"));
      if (giveaway) {
        decide(ctx, "offer.publish", "refused", giveaway, [{ type: "company", id: companyId }]);
        return refused(giveaway);
      }
      if (!rails.postalAddress) {
        decide(ctx, "offer.publish", "refused", "no postal address on the company's rails", [{ type: "company", id: companyId }]);
        return refused("the company has no postal address yet; the owner sets it on the company's rails before any page goes public");
      }
      const html = renderOfferPage({ businessName: args.business_name, headline: args.headline, forWhom: args.for_whom, deliverables: args.deliverables, priceLine: args.price_line, paymentUrl: args.payment_url, formAction: rails.formAction, contactEmail: rails.mailbox, postalAddress: rails.postalAddress });
      const saved = ctx.validation.saveOffer(companyId, html);
      const url = rails.publicHooksUrl ? `${rails.publicHooksUrl.replace(/\/$/, "")}/hooks/cofactory/offer/${companyId}` : null;
      if (url) ctx.validation.rails.set(companyId, { offerUrl: url });
      decide(ctx, "offer.publish", "allowed", url ? `live at ${url}` : `saved to ${saved}; no public address connected yet`, [{ type: "company", id: companyId }]);
      return ok({ savedTo: saved, url, note: url ? "Check it loads for a stranger, then use the URL as path_live evidence." : "The owner connects a public address (publicHooksUrl) before the page can be reached." });
    },
  }),
  spec({
    name: "cofactory_payment_link",
    description: "Create a Stripe payment link for the offer on the company's own Stripe account (connected by the owner). Payments made through it come back as events automatically.",
    roles: ["ceo", "builder", "seller"],
    input: z.object({ name: z.string().min(2).max(200), price_cents: z.number().int().positive().max(10_000_000), interval: z.enum(["month", "year"]).nullable().default("month") }),
    async run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const rails = ctx.validation.rails.get(ctx.seat.companyId!);
      if (!rails.stripeSecretKey) return refused("the company's Stripe account is not connected; the owner connects it");
      try {
        const link = await createPaymentLink({ secretKey: rails.stripeSecretKey, companyId: ctx.seat.companyId!, name: args.name, unitAmountCents: args.price_cents, interval: args.interval });
        decide(ctx, "payment_link.create", "allowed", `${args.name} at ${args.price_cents} cents`, [{ type: "company", id: ctx.seat.companyId! }]);
        return ok({ paymentLink: link });
      } catch (error) {
        return refused(error instanceof Error ? error.message : String(error));
      }
    },
  }),
  spec({
    name: "cofactory_orders",
    description: "The company's paid orders (open, delivered, refunded), its stand-in rehearsals, and where it stands on the first-dollar gate: paid, delivered, and served again by a stand-in from the runbook alone.",
    roles: COMPANY_ROLES,
    input: z.object({}),
    run(_args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const { orders } = ctx.validation;
      const companyId = ctx.seat.companyId!;
      return ok({ orders: orders.list(companyId), rehearsals: orders.rehearsals(companyId), firstDollar: orders.firstDollar(companyId), folder: ctx.validation.folderOf(companyId) });
    },
  }),
  spec({
    name: "cofactory_deliver_order",
    description: "Record that a paid order was delivered: a summary and the delivered file's path relative to the company folder. RUNBOOK.md in the company folder must already say, step by step, how to serve an order like this one, updated since the order came in. A stand-in passes rehearsal true and a path relative to its packet folder.",
    roles: ["ceo", "builder", "seller", "operator"],
    input: z.object({ order_id: z.string().min(1), summary: z.string().min(20).max(2_000), deliverable: z.string().min(1).max(500), rehearsal: z.boolean().default(false) }),
    run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const { orders, folderOf } = ctx.validation;
      const companyId = ctx.seat.companyId!;
      const order = orders.order(args.order_id);
      if (!order || order.companyId !== companyId) return refused("no such order in this company");
      const payment = ctx.truth.event(order.eventId);
      const cited: EvidenceLink[] = payment ? [{ type: "external_event", id: payment.id, externalId: payment.externalId, evidenceClass: payment.evidenceClass }] : [{ type: "company", id: companyId }];
      if (args.rehearsal) {
        const rehearsal = orders.rehearsalOfBot(ctx.seat.botId);
        if (!rehearsal || rehearsal.orderId !== order.id || rehearsal.status !== "pending") return refused("this seat has no rehearsal of that order to deliver");
        const file = fileInside(rehearsal.dir, args.deliverable);
        if (!file.ok) return refused(file.reason);
        orders.rehearsalDelivered(rehearsal.id, args.deliverable);
        ctx.book.send({
          type: "review", fromBotId: ctx.seat.botId, fromRole: "operator", toRole: "lead", companyId, parentId: null, budgetAuthId: null, replyPolicy: "report_only",
          brief: {
            goal: `Judge the bus-factor rehearsal of order ${order.id.slice(0, 8)} in company ${companyId}: would the customer accept the stand-in's work as readily as the original?`,
            known: `Original: ${join(folderOf(companyId), order.deliverable ?? "")} (${order.summary ?? ""}). Stand-in, working from the packet alone: ${join(rehearsal.dir, args.deliverable)} (${args.summary}).`,
            doneWhen: "cofactory_rehearsal_verdict is recorded with what differs and why",
            constraints: "Judge the work the customer receives, not the wording. Missing steps the stand-in had to guess are a failure of the runbook, not of the stand-in.",
          },
        });
        decide(ctx, "order.deliver", "allowed", `rehearsal of ${order.id.slice(0, 8)} delivered: ${args.deliverable}`, cited);
        return ok({ rehearsal: { ...rehearsal, status: "delivered", deliverable: args.deliverable }, next: "the factory lead judges it" });
      }
      if (ctx.seat.role === "operator") return refused("a stand-in only delivers its rehearsal");
      if (order.status !== "open") return refused(`that order is ${order.status}`);
      const folder = folderOf(companyId);
      const file = fileInside(folder, args.deliverable);
      if (!file.ok) { decide(ctx, "order.deliver", "refused", file.reason, cited); return refused(file.reason); }
      const runbook = runbookProblem(folder, order.openedAt);
      if (runbook) { decide(ctx, "order.deliver", "refused", runbook, cited); return refused(runbook); }
      const delivered = orders.deliver(order.id, { by: ctx.actor, summary: args.summary, deliverable: args.deliverable });
      decide(ctx, "order.deliver", "allowed", `${order.id.slice(0, 8)} delivered: ${args.deliverable}`, cited);
      return ok({ order: delivered, firstDollar: orders.firstDollar(companyId) });
    },
  }),
  spec({
    name: "cofactory_message_customer",
    description: "Email a paying customer from the company's mailbox about their order: delivery, questions, receipts. Only addresses with an order, and never one that asked not to be contacted; prospects are reached through a sprint.",
    roles: ["ceo", "builder", "seller"],
    input: z.object({ to: z.string().email(), subject: z.string().min(2).max(200), text: z.string().min(10).max(20_000) }),
    async run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const { outreach, orders } = ctx.validation;
      const companyId = ctx.seat.companyId!;
      const sent = await outreach.sendCustomer(companyId, { to: args.to, subject: args.subject, text: args.text, isCustomer: (address) => orders.isCustomer(companyId, address) });
      decide(ctx, "customer.message", sent.ok ? "allowed" : "refused", sent.ok ? `${args.to}: ${args.subject}` : sent.reason, [{ type: "company", id: companyId }]);
      return sent.ok ? ok({ sent: true, messageId: sent.messageId }) : refused(sent.reason);
    },
  }),
  spec({
    name: "cofactory_invoice",
    description: "Send a Stripe invoice from the company's account to a buyer who asked to pay that way. Only to someone who wrote to the company (a reply or a form on record); the payment comes back as an event when it is paid.",
    roles: ["ceo", "seller"],
    input: z.object({ customer_email: z.string().email(), description: z.string().min(5).max(500), amount_cents: z.number().int().positive().max(10_000_000), days_until_due: z.number().int().min(1).max(60).default(14) }),
    async run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const companyId = ctx.seat.companyId!;
      const rails = ctx.validation.rails.get(companyId);
      if (!rails.stripeSecretKey) return refused("the company's Stripe account is not connected; the owner connects it");
      const address = args.customer_email.toLowerCase();
      const wrote = ctx.truth.events({ companyId }).find((event) => (event.kind === "reply" || event.kind === "form_submit") && event.payerEmail?.toLowerCase() === address);
      if (!wrote) { decide(ctx, "invoice.create", "refused", `${address} has not written to the company`, [{ type: "company", id: companyId }]); return refused("invoice only a buyer who wrote to the company asking to pay"); }
      const cited: EvidenceLink[] = [{ type: "external_event", id: wrote.id, externalId: wrote.externalId, evidenceClass: wrote.evidenceClass }];
      try {
        const invoice = await createInvoice({ secretKey: rails.stripeSecretKey, companyId, customerEmail: address, description: args.description, amountCents: args.amount_cents, daysUntilDue: args.days_until_due });
        decide(ctx, "invoice.create", "allowed", `${args.amount_cents} cents to ${address}: ${args.description}`, cited);
        return ok({ invoice });
      } catch (error) {
        return refused(error instanceof Error ? error.message : String(error));
      }
    },
  }),
  spec({
    name: "cofactory_rehearsal_verdict",
    description: "Judge a stand-in's rehearsal: did the stand-in, working only from the handoff packet, serve the order as well as the original? Passing it completes the first-dollar gate; failing it sends the company back to rewrite its runbook. Either way the stand-in's seat is released.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), passed: z.boolean(), note: z.string().min(30).max(2_000) }),
    run(args, ctx) {
      if (!ctx.validation) return refused("validation is not running");
      const { orders } = ctx.validation;
      const rehearsal = orders.rehearsals(args.company_id).at(-1);
      if (!rehearsal || rehearsal.status !== "delivered") return refused("that company has no delivered rehearsal waiting for a verdict");
      orders.rehearsalVerdict(rehearsal.id, args.passed, args.note);
      ctx.book.unseat(rehearsal.botId);
      decide(ctx, "rehearsal.verdict", "allowed", `${args.passed ? "passed" : "failed"}: ${args.note}`, [{ type: "company", id: args.company_id }], args.company_id);
      return ok({ passed: args.passed, firstDollar: orders.firstDollar(args.company_id) });
    },
  }),
  spec({
    name: "cofactory_postmortem",
    description: "Write the post-mortem of a killed company: the cause, the one assumption the evidence disproved, the lesson for picking the next niche, and the ids of the events, claim checks or signals it rests on. Future niche selection is penalised for resembling it.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), cause: z.enum(POSTMORTEM_CAUSES), falsified: z.string().min(20).max(1_000), lesson: z.string().min(20).max(1_000), evidence: z.array(z.string()).min(1).max(20) }),
    run(args, ctx) {
      const store = ctx.discovery?.store;
      if (!store) return refused("discovery is not running");
      const company = ctx.book.company(args.company_id);
      if (!company || company.status !== "killed") return refused("only a killed company gets a post-mortem");
      if (store.postmortems().some((entry) => entry.companyId === args.company_id)) return refused("this company already has its post-mortem");
      const link = store.linkOf(args.company_id);
      const niche = link ? store.niche(link.nicheId) : null;
      const entry = { id: randomUUID(), companyId: args.company_id, nicheId: niche?.id ?? null, at: (ctx.now ?? Date.now)(), buyer: niche?.buyer ?? company.name, job: niche?.job ?? company.brief.slice(0, 200), cause: args.cause, falsified: args.falsified, lesson: args.lesson, evidence: args.evidence };
      store.addPostmortem(entry);
      decide(ctx, "postmortem.write", "allowed", `${args.cause}: ${args.falsified}`, [{ type: "company", id: args.company_id }], args.company_id);
      return ok({ postmortem: entry });
    },
  }),
  spec({
    name: "cofactory_send",
    description: "Send a typed message to another seat. Specialists address their CEO, a CEO addresses its own team or the factory lead, the lead and scout address any company's CEO or each other, and only the lead escalates to the owner. The brief must stand alone.",
    roles: ALL,
    input: z.object({
      type: z.enum(MESSAGE_TYPES),
      to_role: z.enum([...FACTORY_ROLES, ...COMPANY_ROLES, "owner"]),
      company_id: z.string().optional(),
      parent_id: z.string().optional(),
      budget_auth_id: z.string().optional(),
      brief,
      reply_policy: z.enum(REPLY_POLICIES),
    }),
    run(args, { book, seat }) {
      const companyId = seat.companyId ?? args.company_id ?? null;
      const problem = routeProblem(seat, args.to_role, companyId, (id) => book.company(id) !== null);
      if (problem) return refused(problem);
      if (args.parent_id && !book.message(args.parent_id)) return refused("no message with that parent_id");
      const sent: FactoryMessage = book.send({
        type: args.type, fromBotId: seat.botId, fromRole: seat.role, toRole: args.to_role, companyId,
        parentId: args.parent_id ?? null, budgetAuthId: args.budget_auth_id ?? null,
        brief: { goal: args.brief.goal, known: args.brief.known, doneWhen: args.brief.done_when, constraints: args.brief.constraints },
        replyPolicy: args.reply_policy,
      });
      return ok({ message: sent });
    },
  }),
  spec({
    name: "cofactory_inbox",
    description: "The typed messages addressed to your seat, newest last.",
    roles: ALL,
    input: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    run(args, { book, seat }) {
      return ok({ messages: book.inbox(seat.role, seat.companyId, args.limit ?? 20) });
    },
  }),
  spec({
    name: "cofactory_launch_company",
    description: "Launch a company with a hard cap taken from unallocated money: its books, its workspace and brief, and a seated team (CEO, builder, marketer). Give dossier_id to launch from a shortlisted or championed dossier: its brief, buyers and offer carry over and the niche is claimed for good. Refused below the minimum stake, past the live-company limit, or beyond unallocated money.",
    roles: ["lead"],
    input: z.object({ name: z.string().min(1).max(120), brief: z.string().max(4_000).default(""), cap_cents: cents, dossier_id: z.string().optional() }),
    async run(args, ctx) {
      const { book, actor, launcher } = ctx;
      if (!args.dossier_id && !args.brief.trim()) return refused("give a brief, or a dossier_id to launch from");
      const ownerCap = ctx.settings?.().companyCapCents ?? 0;
      if (ownerCap > 0 && args.cap_cents > ownerCap) {
        const reason = `the owner caps each company at ${ownerCap} cents`;
        decide(ctx, "company.launch", "refused", `${args.name} with ${args.cap_cents} cents: ${reason}`, [], null);
        return refused(reason);
      }
      const input = { name: args.name, brief: args.brief, capCents: args.cap_cents, ...(args.dossier_id ? { dossierId: args.dossier_id } : {}) };
      if (input.dossierId && !launcher) return refused("launching from a dossier needs the runtime");
      const result = launcher ? await launcher.launch(input, actor) : book.launch(input, actor);
      if (!result.ok) { decide(ctx, "company.launch", "refused", `${args.name} with ${args.cap_cents} cents: ${result.reason}`, [], null); return refused(result.reason); }
      decide(ctx, "company.launch", "allowed", `${args.name} with a ${args.cap_cents}-cent cap`, [{ type: "company", id: result.company.id }], result.company.id);
      return ok({ company: result.company, ...("team" in result ? { team: result.team } : {}) });
    },
  }),
  spec({
    name: "cofactory_top_up",
    description: "Give a live company more money from unallocated, after a selling signal.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), cents }),
    run(args, ctx) {
      const result = ctx.book.topUp(args.company_id, args.cents, ctx.actor);
      decide(ctx, "company.top_up", result.ok ? "allowed" : "refused", result.ok ? `${args.cents} cents` : result.reason, [{ type: "company", id: args.company_id }], args.company_id);
      return result.ok ? ok({ company: result.company }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_kill_company",
    description: "Stop a company for good: its holds are voided and its remaining money returns to unallocated. Give the reason and what the post-mortem should teach the scout.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), reason: z.enum(KILL_REASONS), why: z.string().min(1).max(2_000) }),
    async run(args, ctx) {
      const { book, actor, sessions } = ctx;
      const result = book.kill(args.company_id, args.reason, actor, args.why);
      decide(ctx, "company.kill", result.ok ? "allowed" : "refused", result.ok ? `${args.reason}: ${args.why}` : result.reason, [{ type: "company", id: args.company_id }], args.company_id);
      if (result.ok) await sessions?.stopCompany(args.company_id, `killed: ${args.why}`);
      return result.ok ? ok({ company: result.company, releasedCents: result.releasedCents }) : refused(result.reason);
    },
  }),
];

/** Who may address whom; null when the route is allowed. */
export function routeProblem(seat: Membership, to: Role | "owner", companyId: string | null, companyExists: (id: string) => boolean): string | null {
  if (to === "owner") return seat.role === "lead" ? null : "only the factory lead escalates to the owner";
  if (seat.companyId === null) {
    if ((FACTORY_ROLES as readonly string[]).includes(to)) return null;
    if (to !== "ceo") return "the factory addresses a company through its CEO";
    if (!companyId || !companyExists(companyId)) return "company_id must name an existing company";
    return null;
  }
  if (companyId !== seat.companyId) return "a company seat writes only inside its own company";
  if (seat.role === "ceo") return to === "lead" || (COMPANY_ROLES as readonly string[]).includes(to) ? null : "a CEO addresses its own team or the factory lead";
  return to === "ceo" ? null : "a specialist addresses its CEO";
}

export function toolsFor(role: Role) {
  return TOOLS.filter((tool) => tool.roles.includes(role)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input, { io: "input" }),
  }));
}

export async function runTool(ctx: ToolContext, name: unknown, args: unknown): Promise<ToolResult> {
  const { seat } = ctx;
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool || !tool.roles.includes(seat.role)) return refused(`${String(name)} is not a tool for the ${seat.role} seat`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) return refused(`invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}`);
  const started = Date.now();
  const result = await tool.run(parsed.data, ctx);
  ctx.observe?.toolCall({
    sessionId: ctx.session?.id ?? null, companyId: seat.companyId, botId: seat.botId, role: seat.role, tool: tool.name,
    ok: !result.isError, summary: result.content[0]?.text.slice(0, 300) ?? "", tookMs: Date.now() - started,
  });
  return result;
}
