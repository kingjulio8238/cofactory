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
import { verifyEvidence } from "./truth/gate.ts";
import type { Truth } from "./truth/store.ts";
import type { Launcher } from "./runtime/launcher.ts";
import type { Sessions } from "./runtime/sessions.ts";
import type { Observer } from "./observe/observer.ts";
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

export interface ToolContext {
  book: Book;
  truth: Truth;
  seat: Membership;
  actor: string;
  sessions?: Sessions;
  launcher?: Launcher;
  now?: () => number;
  observe?: Observer;
  /** The seat's running session, which decisions and tool calls are filed under. */
  session?: Session | null;
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
    run(args, { seat, sessions }) {
      if (!sessions) return refused("the runtime is not running");
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
      const summary = args.outcome === "waiting" ? `${args.summary} (waiting on: ${args.waiting_on})` : args.summary;
      const nextWakeAt = args.wake_in_hours === undefined ? null : (now ?? Date.now)() + args.wake_in_hours * 60 * 60_000;
      const ended = sessions.requestEnd(seat, { outcome: args.outcome, summary, nextWakeAt });
      decide(ctx, "session.end", ended.ok ? "allowed" : "refused", ended.ok ? `${args.outcome}: ${summary}` : ended.reason, ctx.session ? [{ type: "session", id: ctx.session.id }] : []);
      return ended.ok ? ok({ ending: { sessionId: ended.session.id, outcome: args.outcome } }) : refused(ended.reason);
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
    description: "Launch a company from a scored idea with a hard cap taken from unallocated money: its books, its workspace and brief, and a seated team (CEO, builder, marketer). Refused below the minimum stake, past the live-company limit, or beyond unallocated money.",
    roles: ["lead"],
    input: z.object({ name: z.string().min(1).max(120), brief: z.string().min(1).max(4_000), cap_cents: cents }),
    async run(args, ctx) {
      const { book, actor, launcher } = ctx;
      const input = { name: args.name, brief: args.brief, capCents: args.cap_cents };
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
