import { z } from "zod";

import { COMPANY_ROLES, FACTORY_ROLES, KILL_REASONS } from "../../shared/cofactory/types.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { Book } from "../cofactory/book.ts";
import type { Truth } from "../cofactory/truth/store.ts";
import type { Launcher } from "../cofactory/runtime/launcher.ts";
import type { Sessions } from "../cofactory/runtime/sessions.ts";
import type { RuntimeStore } from "../cofactory/runtime/store.ts";
import { EVENT_KINDS } from "../../shared/cofactory/evidence.ts";
import { PASS, type RouteContext } from "./table.ts";

const cents = z.number().int().positive().max(100_000_000);
const seat = z.union([
  z.object({ botId: z.string().min(1), role: z.enum(FACTORY_ROLES), companyId: z.null().default(null) }),
  z.object({ botId: z.string().min(1), role: z.enum(COMPANY_ROLES), companyId: z.string().min(1) }),
]);
const COMPANY_ACTION = /^\/api\/cofactory\/companies\/([\w-]+)\/(freeze|unfreeze|kill|wake)$/;

export interface CofactoryRouteDeps {
  books: () => Book;
  evidence: () => Truth;
  runtime: () => { store: RuntimeStore; sessions: Sessions; launcher: Launcher | undefined } | null;
  tick: () => Promise<void>;
  owner: (auth: RequestAuth) => boolean;
  botExists: (botId: string) => boolean;
}

/** The owner's view and controls: deposits, seats, launches, revenue, and the kill switch. */
export function createCofactoryRoutes(deps: CofactoryRouteDeps) {
  return async (ctx: RouteContext): Promise<typeof PASS | void> => {
    const { path, method, res, json } = ctx;
    if (!path.startsWith("/api/cofactory/")) return PASS;
    if (!deps.owner(ctx.auth)) return json(res, 403, { error: "only the owner runs the factory" });
    const book = deps.books();
    const runtime = deps.runtime();
    if (method === "GET" && path === "/api/cofactory/state") {
      return json(res, 200, {
        unallocatedCents: book.balance("unallocated"), reserveCents: book.balance("reserve"), policy: book.policy,
        companies: book.companies().map((c) => ({ ...c, availableCents: book.available(c.id) })),
        members: book.members(), recommendations: book.audit(), ownerInbox: book.inbox("owner", null),
        runtime: runtime ? {
          liveSessions: runtime.store.liveSessions(), alarms: runtime.store.openAlarms(),
          recentSessions: [null, ...book.companies().map((c) => c.id)].flatMap((id) => runtime.store.sessionsFor(id, 5)),
        } : null,
      });
    }
    if (method === "GET" && path === "/api/cofactory/journal") {
      if (!runtime) return json(res, 503, { error: "the runtime is not running" });
      const companyId = ctx.url.searchParams.get("company");
      return json(res, 200, { entries: runtime.store.journal(companyId || null, 100) });
    }
    if (method === "GET" && path.startsWith("/api/cofactory/sessions/")) {
      if (!runtime) return json(res, 503, { error: "the runtime is not running" });
      const id = path.slice("/api/cofactory/sessions/".length);
      const session = runtime.store.session(id);
      if (!session) return json(res, 404, { error: "no such session" });
      return json(res, 200, { session, events: runtime.store.sessionEvents(id) });
    }
    if (method === "GET" && path === "/api/cofactory/ledger") {
      const companyId = ctx.url.searchParams.get("company") ?? undefined;
      return json(res, 200, { entries: book.entries(companyId ? { companyId } : {}) });
    }
    if (method === "GET" && path === "/api/cofactory/events") {
      const companyId = ctx.url.searchParams.get("company") ?? undefined;
      return json(res, 200, { events: deps.evidence().events(companyId ? { companyId } : {}) });
    }
    if (method !== "POST") return PASS;
    const body = await ctx.readBody(ctx.req);
    const parse = <S extends z.ZodType>(schema: S): z.infer<S> | null => {
      const parsed = schema.safeParse(body ?? {});
      if (parsed.success) return parsed.data;
      json(res, 400, { error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ") });
      return null;
    };
    const answer = (result: { ok: boolean; reason?: string }) => json(res, result.ok ? 200 : 409, result);

    if (path === "/api/cofactory/deposit") {
      const input = parse(z.object({ cents }));
      if (input) return json(res, 200, { entry: book.deposit(input.cents, "owner") });
      return;
    }
    if (path === "/api/cofactory/reserve") {
      const input = parse(z.object({ cents: z.number().int().min(0).max(100_000_000) }));
      if (!input) return;
      try { return json(res, 200, { entry: book.setReserve(input.cents, "owner") }); }
      catch (error) { return json(res, 409, { ok: false, reason: error instanceof Error ? error.message : String(error) }); }
    }
    if (path === "/api/cofactory/launch") {
      const input = parse(z.object({ name: z.string().min(1).max(120), brief: z.string().min(1).max(4_000), capCents: cents, team: z.boolean().default(true) }));
      if (!input) return;
      const launch = { name: input.name, brief: input.brief, capCents: input.capCents };
      if (input.team && runtime?.launcher) {
        const launched = await runtime.launcher.launch(launch, "owner");
        if (launched.ok) void deps.tick();
        return answer(launched);
      }
      return answer(book.launch(launch, "owner"));
    }
    if (path === "/api/cofactory/seats") {
      const input = parse(seat);
      if (!input) return;
      if (!deps.botExists(input.botId)) return json(res, 404, { error: "no such bot" });
      return answer(book.seat(input));
    }
    if (path === "/api/cofactory/unseat") {
      const input = parse(z.object({ botId: z.string().min(1) }));
      if (input) return json(res, 200, { ok: book.unseat(input.botId) });
      return;
    }
    if (path === "/api/cofactory/events") {
      const input = parse(z.object({
        source: z.string().min(1).max(60), externalId: z.string().min(1).max(200), companyId: z.string().min(1).nullable().default(null),
        kind: z.enum(EVENT_KINDS), occurredAt: z.number().int().positive(), payerEmail: z.string().max(320).nullable().default(null),
        amountCents: z.number().int().min(0).nullable().default(null), refundOf: z.string().max(200).nullable().default(null),
        testMode: z.boolean().default(false), text: z.string().max(20_000).nullable().default(null),
      }));
      if (!input) return;
      if (input.companyId && !book.company(input.companyId)) return json(res, 404, { error: "no such company" });
      return json(res, 200, deps.evidence().recordEvent(input));
    }
    if (path === "/api/cofactory/revenue") {
      const input = parse(z.object({ companyId: z.string().min(1), cents, receipt: z.string().min(1).max(500) }));
      if (!input) return;
      if (!book.company(input.companyId)) return json(res, 404, { error: "no such company" });
      return json(res, 200, { entry: book.recordRevenue(input, "owner") });
    }
    const action = COMPANY_ACTION.exec(path);
    if (action) {
      const [, companyId, verb] = action as unknown as [string, string, "freeze" | "unfreeze" | "kill" | "wake"];
      if (verb === "unfreeze") return answer(book.unfreeze(companyId, "owner"));
      if (verb === "wake") {
        if (!runtime) return json(res, 503, { error: "the runtime is not running" });
        const ceo = book.members().find((member) => member.companyId === companyId && member.role === "ceo");
        if (!ceo) return json(res, 409, { ok: false, reason: "no CEO is seated" });
        const input = parse(z.object({ objective: z.string().min(1).max(2_000), doneWhen: z.string().min(1).max(1_000), kind: z.enum(["operating", "deep"]).default("operating") }));
        if (!input) return;
        const started = await runtime.sessions.request({ companyId, botId: ceo.botId, kind: input.kind, trigger: "owner", objective: input.objective, doneWhen: input.doneWhen });
        return "refused" in started ? json(res, 409, { ok: false, reason: started.refused }) : json(res, 200, { ok: true, ...started });
      }
      const input = parse(z.object({ why: z.string().min(1).max(2_000), reason: z.enum(KILL_REASONS).default("owner") }));
      if (!input) return;
      const result = verb === "freeze" ? book.freeze(companyId, "owner", input.why) : book.kill(companyId, input.reason, "owner", input.why);
      if (result.ok) await runtime?.sessions.stopCompany(companyId, `${verb}: ${input.why}`);
      return answer(result);
    }
    return PASS;
  };
}
