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
    run(args, { book, seat, actor }) {
      const result = book.authorize({ companyId: seat.companyId!, category: args.category, vendor: args.vendor, cents: args.cents }, actor);
      return result.ok ? ok({ hold: result.authorization }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_capture_spend",
    description: "Record the real charge against a hold, with the vendor's receipt or invoice id. cents defaults to the held amount and may not exceed it.",
    roles: SPENDERS,
    input: z.object({ hold_id: z.string().min(1), cents: cents.optional(), receipt: z.string().min(1).max(500) }),
    run(args, { book, seat, actor }) {
      if (book.authorization(args.hold_id)?.companyId !== seat.companyId) return refused("no hold with that id for your company");
      const result = book.capture(args.hold_id, { ...(args.cents !== undefined ? { cents: args.cents } : {}), receipt: args.receipt }, actor);
      return result.ok ? ok({ entry: result.entry, availableCents: book.available(seat.companyId!) }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_void_spend",
    description: "Release a hold you no longer need, so its money is available again.",
    roles: SPENDERS,
    input: z.object({ hold_id: z.string().min(1) }),
    run(args, { book, seat }) {
      if (book.authorization(args.hold_id)?.companyId !== seat.companyId) return refused("no hold with that id for your company");
      return book.voidAuthorization(args.hold_id) ? ok({ voided: args.hold_id }) : refused("no open hold with that id");
    },
  }),
  spec({
    name: "cofactory_advance_stage",
    description: "Move your company to its next stage. Market needs path_live evidence, Sell needs selling_signal evidence, Manage needs recorded revenue or repeatable_motion evidence. The ref is checked against the world: path_live may be the offer page's URL (it must load for a stranger) or a recorded event id; selling_signal must be a recorded reply, form or payment event that reads urgent or committed; repeatable_motion must be a recorded payment.",
    roles: ["ceo"],
    input: z.object({ to: z.enum(STAGES), evidence: evidence.optional() }),
    async run(args, { book, truth, seat, actor }) {
      if (args.evidence) {
        const checked = await verifyEvidence(truth, seat.companyId!, args.evidence);
        if (!checked.ok) return refused(`evidence did not check out: ${checked.reason}`);
      }
      const result = book.advance(seat.companyId!, args.to, args.evidence ?? null, actor);
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
    description: "Launch a company from a scored idea with a hard cap taken from unallocated money. Refused below the minimum stake, past the live-company limit, or beyond unallocated money.",
    roles: ["lead"],
    input: z.object({ name: z.string().min(1).max(120), brief: z.string().min(1).max(4_000), cap_cents: cents }),
    run(args, { book, actor }) {
      const result = book.launch({ name: args.name, brief: args.brief, capCents: args.cap_cents }, actor);
      return result.ok ? ok({ company: result.company }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_top_up",
    description: "Give a live company more money from unallocated, after a selling signal.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), cents }),
    run(args, { book, actor }) {
      const result = book.topUp(args.company_id, args.cents, actor);
      return result.ok ? ok({ company: result.company }) : refused(result.reason);
    },
  }),
  spec({
    name: "cofactory_kill_company",
    description: "Stop a company for good: its holds are voided and its remaining money returns to unallocated. Give the reason and what the post-mortem should teach the scout.",
    roles: ["lead"],
    input: z.object({ company_id: z.string().min(1), reason: z.enum(KILL_REASONS), why: z.string().min(1).max(2_000) }),
    run(args, { book, actor }) {
      const result = book.kill(args.company_id, args.reason, actor, args.why);
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
  return tool.run(parsed.data, ctx);
}
