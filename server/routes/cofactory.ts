import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { z } from "zod";

import { EVENT_KINDS } from "../../shared/cofactory/evidence.ts";
import type { DecisionKind, EvidenceLink } from "../../shared/cofactory/observe.ts";
import { COMPANY_ROLES, FACTORY_ROLES, KILL_REASONS } from "../../shared/cofactory/types.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { Book } from "../cofactory/book.ts";
import { boardData, renderBoardHtml, renderBoardText } from "../cofactory/observe/board.ts";
import { costByStage } from "../cofactory/observe/cost.ts";
import type { Observer } from "../cofactory/observe/observer.ts";
import { autonomy, companyTrace, sessionTrace, type TraceDeps } from "../cofactory/observe/trace.ts";
import type { Launcher } from "../cofactory/runtime/launcher.ts";
import type { Sessions } from "../cofactory/runtime/sessions.ts";
import type { RuntimeStore } from "../cofactory/runtime/store.ts";
import type { Truth } from "../cofactory/truth/store.ts";
import type { Discovery } from "../cofactory/discovery/discovery.ts";
import type { Dossiers } from "../cofactory/dossier/dossiers.ts";
import type { Rails } from "../cofactory/validation/rails.ts";
import type { Sprints } from "../cofactory/validation/sprints.ts";
import type { Orders } from "../cofactory/validation/orders.ts";
import type { Settings } from "../cofactory/settings.ts";
import { seatView } from "../cofactory/seat-view.ts";
import type { Approval, Approvals } from "../cofactory/approvals.ts";
import { drawTerritories, territoryCode, territoryText } from "../cofactory/discovery/territories.ts";
import { PROFILE_FIELDS } from "../../shared/cofactory/discovery.ts";
import { PASS, type RouteContext } from "./table.ts";

const cents = z.number().int().positive().max(100_000_000);
const seat = z.union([
  z.object({ botId: z.string().min(1), role: z.enum(FACTORY_ROLES), companyId: z.null().default(null) }),
  z.object({ botId: z.string().min(1), role: z.enum(COMPANY_ROLES), companyId: z.string().min(1) }),
]);
const COMPANY_ACTION = /^\/api\/cofactory\/companies\/([\w-]+)\/(freeze|unfreeze|kill|wake)$/;
const TRACE = /^\/api\/cofactory\/trace\/(session|company)\/([\w-]+)$/;
const RAILS = /^\/api\/cofactory\/companies\/([\w-]+)\/rails$/;
const SEAT = /^\/api\/cofactory\/seat\/([\w-]+)$/;
const APPROVAL = /^\/api\/cofactory\/approvals\/([\w-]+)$/;
const DAY_MS = 24 * 60 * 60_000;

export interface CofactoryRouteDeps {
  books: () => Book;
  evidence: () => Truth;
  runtime: () => { store: RuntimeStore; sessions: Sessions; launcher: Launcher | undefined } | null;
  observe: () => Observer;
  discovery: () => Discovery;
  dossiers: () => Dossiers;
  validation: () => { sprints: Sprints; rails: Rails; orders: Orders };
  relatedParties?: { get(): { emails: string[]; domains: string[] }; set(value: { emails: string[]; domains: string[] }): void };
  settings?: Settings;
  factoryOpened?: (leadBotId: string) => void;
  approvals?: { store: () => Approvals; settle(id: string, approve: boolean, note: string | null): Promise<{ ok: true; approval: Approval; outcome: string } | { ok: false; reason: string }> };
  traceDeps: () => TraceDeps;
  tick: () => Promise<void>;
  owner: (auth: RequestAuth) => boolean;
  botExists: (botId: string) => boolean;
  /** The eval run history (`pnpm cofactory:eval`), whose last run the board shows. */
  evalHistoryFile?: string;
  now?: () => number;
}

function lastEvalRun(file: string | undefined): { pass: boolean; at: string; failing: string[] } | null {
  if (!file || !existsSync(file)) return null;
  const last = readFileSync(file, "utf8").trim().split("\n").at(-1);
  if (!last) return null;
  try {
    const card = JSON.parse(last) as { pass: boolean; at: string; suites: Array<{ name: string; pass: boolean }>; regressions: string[] };
    return { pass: card.pass, at: card.at, failing: [...card.suites.filter((suite) => !suite.pass).map((suite) => suite.name), ...card.regressions] };
  } catch {
    return null;
  }
}

/** The owner's view and controls: deposits, seats, launches, revenue, the kill switch, and the ops board and traces. */
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", IE: "Ireland", AU: "Australia", NZ: "New Zealand", DE: "Germany", FR: "France",
  NL: "Netherlands", BE: "Belgium", ES: "Spain", IT: "Italy", IN: "India",
};

export function createCofactoryRoutes(deps: CofactoryRouteDeps) {
  const now = deps.now ?? Date.now;
  return async (ctx: RouteContext): Promise<typeof PASS | void> => {
    const { path, method, res, json } = ctx;
    if (!path.startsWith("/api/cofactory/")) return PASS;
    if (!deps.owner(ctx.auth)) return json(res, 403, { error: "only the owner runs the factory" });
    const book = deps.books();
    const runtime = deps.runtime();
    const observe = deps.observe();

    if (method === "GET") {
      const companyParam = ctx.url.searchParams.get("company");
      if (path === "/api/cofactory/state") {
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
      if (path === "/api/cofactory/board" || path === "/api/cofactory/board.txt" || path === "/api/cofactory/board.json") {
        const data = boardData(deps.traceDeps(), now(), lastEvalRun(deps.evalHistoryFile));
        if (path.endsWith(".json")) return json(res, 200, data);
        const text = path.endsWith(".txt") ? renderBoardText(data) : renderBoardHtml(data);
        res.writeHead(200, { "content-type": path.endsWith(".txt") ? "text/plain; charset=utf-8" : "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(text);
        return;
      }
      const trace = TRACE.exec(path);
      if (trace) {
        const found = trace[1] === "session" ? sessionTrace(deps.traceDeps(), trace[2]!) : companyTrace(deps.traceDeps(), trace[2]!);
        return found ? json(res, 200, found) : json(res, 404, { error: `no such ${trace[1]}` });
      }
      if (path === "/api/cofactory/costs") {
        const ids = companyParam ? [companyParam] : book.companies().map((company) => company.id);
        return json(res, 200, { companies: ids.map((id) => ({ companyId: id, stages: costByStage(book, id) })) });
      }
      if (path === "/api/cofactory/decisions") return json(res, 200, { decisions: observe.store.decisions(companyParam ? { companyId: companyParam } : {}) });
      if (path === "/api/cofactory/autonomy") return json(res, 200, { companies: autonomy(deps.traceDeps(), now() - Number(ctx.url.searchParams.get("days") ?? 7) * DAY_MS) });
      if (path === "/api/cofactory/journal") {
        if (!runtime) return json(res, 503, { error: "the runtime is not running" });
        return json(res, 200, { entries: runtime.store.journal(companyParam || null, 100) });
      }
      if (path.startsWith("/api/cofactory/sessions/")) {
        if (!runtime) return json(res, 503, { error: "the runtime is not running" });
        const id = path.slice("/api/cofactory/sessions/".length);
        const session = runtime.store.session(id);
        if (!session) return json(res, 404, { error: "no such session" });
        return json(res, 200, { session, events: runtime.store.sessionEvents(id) });
      }
      const seatPath = SEAT.exec(path);
      if (seatPath && deps.settings) {
        const { sprints, orders, rails } = deps.validation();
        return json(res, 200, seatView({ botId: seatPath[1]!, book, runtime: runtime?.store ?? null, discovery: deps.discovery(), sprints, orders, rails, settings: deps.settings.get(), approvals: deps.approvals?.store() ?? null, now: now() }));
      }
      if (path === "/api/cofactory/approvals" && deps.approvals) {
        return json(res, 200, { approvals: deps.approvals.store().pending() });
      }
      if (path === "/api/cofactory/settings" && deps.settings) {
        const deposited = book.entries({}).filter((entry) => entry.kind === "deposit").reduce((sum, entry) => sum + entry.cents, 0);
        return json(res, 200, {
          settings: deps.settings.get(), profile: deps.discovery().profile(), depositedCents: deposited,
          staffed: book.members().filter((member) => member.companyId === null).map((member) => ({ role: member.role, botId: member.botId })),
          relatedParties: deps.relatedParties?.get() ?? { emails: [], domains: [] },
        });
      }
      if (path === "/api/cofactory/discovery") {
        const discovery = deps.discovery();
        const status = discovery.batchStatus();
        return json(res, 200, {
          profile: discovery.profile(), batch: status, batches: discovery.store.batches(),
          niches: discovery.store.niches(status ? { batchId: status.batch.id } : {}), signals: discovery.store.signals(status ? { batchId: status.batch.id } : {}),
        });
      }
      const railsPath = RAILS.exec(path);
      if (railsPath) return book.company(railsPath[1]!) ? json(res, 200, { rails: deps.validation().rails.summary(railsPath[1]!) }) : json(res, 404, { error: "no such company" });
      if (path === "/api/cofactory/orders") {
        const { orders } = deps.validation();
        const ids = companyParam ? [companyParam] : book.companies().map((company) => company.id);
        return json(res, 200, { companies: ids.map((id) => ({ companyId: id, orders: orders.list(id), rehearsals: orders.rehearsals(id), firstDollar: orders.firstDollar(id) })) });
      }
      if (path === "/api/cofactory/sprints") {
        const { sprints } = deps.validation();
        const ids = companyParam ? [companyParam] : book.companies().map((company) => company.id);
        return json(res, 200, { sprints: ids.map((id) => sprints.running(id)).filter((sprint) => sprint !== null).map((sprint) => ({
          sprint, evidence: sprints.evidence(sprint!.id), buyers: sprints.targets(sprint!.id).length, contacts: sprints.touches(sprint!.id).length,
        })) });
      }
      if (path === "/api/cofactory/dossiers") return json(res, 200, { niches: deps.dossiers().board(), stillNeedDossier: deps.dossiers().wanted() });
      if (path.startsWith("/api/cofactory/dossiers/")) {
        const dossier = deps.discovery().store.dossier(path.slice("/api/cofactory/dossiers/".length));
        return dossier ? json(res, 200, { dossier }) : json(res, 404, { error: "no such dossier" });
      }
      if (path === "/api/cofactory/ledger") return json(res, 200, { entries: book.entries(companyParam ? { companyId: companyParam } : {}) });
      if (path === "/api/cofactory/events") return json(res, 200, { events: deps.evidence().events(companyParam ? { companyId: companyParam } : {}) });
      return PASS;
    }

    if (method !== "POST") return PASS;
    const body = await ctx.readBody(ctx.req);
    const parse = <S extends z.ZodType>(schema: S): z.infer<S> | null => {
      const parsed = schema.safeParse(body ?? {});
      if (parsed.success) return parsed.data;
      json(res, 400, { error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ") });
      return null;
    };
    /** Every owner action is a touch; one at a gate is also a decision, with its evidence and cost. */
    const record = (companyId: string | null, kind: string, detail: string, decision?: { kind: DecisionKind; ok: boolean; reason: string; evidence: EvidenceLink[] }) => {
      observe.touch({ companyId, sessionId: null, source: "route", kind, detail });
      if (decision) observe.decide({ companyId, session: null, actor: "owner", kind: decision.kind, verdict: decision.ok ? "allowed" : "refused", reason: decision.reason, evidence: decision.evidence });
    };
    const answer = (result: { ok: boolean; reason?: string }) => json(res, result.ok ? 200 : 409, result);

    if (path === "/api/cofactory/profile") {
      const input = parse(z.object({
        inputs: z.array(z.object({ field: z.enum(PROFILE_FIELDS), text: z.string().min(1).max(300) })).max(60),
        constraints: z.array(z.string().max(300)).max(30).default([]), seedNiches: z.array(z.string().max(300)).max(30).default([]),
      }));
      if (!input) return;
      const result = deps.discovery().setProfile(input);
      record(null, "profile", result.ok ? `${result.profile.inputs.length} inputs` : result.reason);
      return answer(result);
    }
    if (path === "/api/cofactory/discovery/batches") {
      const input = parse(z.object({ note: z.string().max(1_000).default(""), target: z.number().int().min(1).max(200).optional() }));
      if (!input) return;
      const result = deps.discovery().startBatch(input.note, input.target);
      record(null, "discovery_batch", result.ok ? `target ${result.batch.target}` : result.reason);
      if (result.ok) void deps.tick();
      return answer(result);
    }
    if (path === "/api/cofactory/discovery/close") {
      const result = deps.discovery().closeBatch();
      record(null, "discovery_close", result.ok ? "closed" : result.reason);
      if (!result.ok) return answer(result);
      const selected = deps.dossiers().select(result.status.batch.id);
      for (const id of selected) observe.decide({ companyId: null, session: null, actor: "owner", kind: "niche.select", verdict: "allowed", reason: "selected for a dossier from the closed batch", evidence: [{ type: "niche", id }] });
      void deps.tick();
      return json(res, 200, { ...result, selectedForDossiers: selected });
    }
    const railsPost = RAILS.exec(path);
    if (railsPost) {
      const companyId = railsPost[1]!;
      if (!book.company(companyId)) return json(res, 404, { error: "no such company" });
      const input = parse(z.object({
        mailbox: z.string().email().nullable().optional(), stripeSecretKey: z.string().regex(/^(sk|rk)_(test|live)_[\w]+$/).nullable().optional(),
        stripeWebhookSecret: z.string().regex(/^whsec_[\w]+$/).nullable().optional(), publicHooksUrl: z.string().url().regex(/^https:\/\//).nullable().optional(),
        postalAddress: z.string().min(10).max(300).nullable().optional(), outreachArmed: z.boolean().optional(),
      }));
      if (!input) return;
      const { rails } = deps.validation();
      rails.set(companyId, Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)));
      record(companyId, "rails", Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined).join(", "));
      return json(res, 200, { ok: true, rails: rails.summary(companyId) });
    }
    const approvalPath = APPROVAL.exec(path);
    if (approvalPath && deps.approvals) {
      const input = parse(z.object({ decision: z.enum(["approve", "decline"]), note: z.string().trim().max(1_000).optional() }));
      if (!input) return;
      const settled = await deps.approvals.settle(approvalPath[1]!, input.decision === "approve", input.note || null);
      if (!settled.ok) return json(res, 409, { error: settled.reason });
      record(settled.approval.companyId, "approval", `${input.decision} ${settled.approval.kind}: ${settled.outcome}`);
      return json(res, 200, settled);
    }
    if (path === "/api/cofactory/settings" && deps.settings) {
      const input = parse(z.object({
        country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(), region: z.string().max(80).nullable().optional(),
        budgetCents: z.number().int().min(0).max(100_000_000).optional(), companyCapCents: z.number().int().min(0).max(100_000_000).optional(),
        allocation: z.enum(["fixed", "dynamic"]).optional(), closeAfterDays: z.number().int().min(2).max(30).optional(),
        goLiveDays: z.number().int().min(3).max(60).optional(), dailyModelCents: z.number().int().min(0).max(1_000_000).optional(),
        approvals: z.object({ launch: z.enum(["ask", "auto"]).optional(), spendOverCents: z.number().int().min(0).max(10_000_000).optional(), kill: z.enum(["ask", "tell"]).optional() }).optional(),
        onboarded: z.boolean().optional(),
        hunches: z.array(z.string().trim().min(3).max(300)).max(3).optional(), never: z.array(z.string().trim().min(2).max(300)).max(20).optional(),
      }));
      if (!input) return;
      const { onboarded, ...patch } = input;
      const saved = deps.settings.set({ ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)), ...(onboarded ? { onboardedAt: now() } : {}) });
      const deposited = book.entries({}).filter((entry) => entry.kind === "deposit").reduce((sum, entry) => sum + entry.cents, 0);
      if (saved.budgetCents > deposited) {
        const entry = book.deposit(saved.budgetCents - deposited, "owner");
        record(null, "deposit", `${entry.cents} cents to reach the ${saved.budgetCents}-cent budget`, { kind: "money.deposit", ok: true, reason: "the owner's monthly budget", evidence: [{ type: "ledger_entry", id: entry.id }] });
      }
      record(null, "settings", Object.keys(patch).join(", "));
      return json(res, 200, { settings: saved });
    }
    if (path === "/api/cofactory/related-parties" && deps.relatedParties) {
      const input = parse(z.object({ emails: z.array(z.string().email()).max(100).default([]), domains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)).max(100).default([]) }));
      if (!input) return;
      deps.relatedParties.set({ emails: input.emails.map((email) => email.toLowerCase()), domains: input.domains.map((domain) => domain.toLowerCase()) });
      record(null, "related_parties", `${input.emails.length} emails, ${input.domains.length} domains`);
      return json(res, 200, { ok: true });
    }
    if (path === "/api/cofactory/discovery/abandon") {
      const result = deps.discovery().abandonBatch();
      record(null, "discovery_abandon", result.ok ? `abandoned short: ${result.status.short.join("; ")}` : result.reason);
      return answer(result);
    }
    if (path === "/api/cofactory/dossiers/select") {
      const input = parse(z.object({ batchId: z.string().optional(), nicheIds: z.array(z.string()).max(50).optional() }));
      if (!input) return;
      const dossiers = deps.dossiers();
      const lastClosed = deps.discovery().store.batches().filter((batch) => batch.closedAt !== null).at(-1);
      const selected = input.nicheIds ? dossiers.selectNiches(input.nicheIds) : dossiers.select(input.batchId ?? lastClosed?.id ?? "");
      for (const id of selected) observe.decide({ companyId: null, session: null, actor: "owner", kind: "niche.select", verdict: "allowed", reason: "selected for a dossier by the owner", evidence: [{ type: "niche", id }] });
      record(null, "select_dossiers", `${selected.length} niches`);
      if (selected.length) void deps.tick();
      return json(res, 200, { ok: true, selected });
    }
    if (path === "/api/cofactory/factory/open" && deps.settings) {
      if (!runtime?.launcher) return json(res, 503, { error: "the runtime is not running" });
      const discovery = deps.discovery();
      let settings = deps.settings.get();
      if (!settings.seed) settings = deps.settings.set({ seed: randomUUID() });
      const existing = discovery.profile();
      let territories = (existing?.inputs ?? []).filter((input) => territoryCode(input.text) !== null).map((input) => input.text);
      if (!existing || !existing.inputs.some((input) => input.field === "domains")) {
        territories = drawTerritories(settings.seed!, 6).map(territoryText);
        const where = [settings.region, settings.country ? COUNTRY_NAMES[settings.country] ?? settings.country : null].filter(Boolean).join(", ");
        const set = discovery.setProfile({
          inputs: [...territories.map((text) => ({ field: "domains" as const, text })), ...(where ? [{ field: "geography" as const, text: where }] : [])],
          constraints: settings.never, seedNiches: settings.hunches,
        });
        if (!set.ok) return json(res, 400, { error: set.reason });
        record(null, "territories", territories.join("; "));
      }
      const staffed = await runtime.launcher.staffFactory();
      const lead = staffed.find((seat) => seat.role === "lead");
      if (lead) deps.factoryOpened?.(lead.botId);
      const batch = discovery.store.openBatch() ? null : discovery.startBatch("the factory's first search");
      if (batch?.ok) void deps.tick();
      deps.settings.set({ onboardedAt: settings.onboardedAt ?? now() });
      record(null, "factory_open", `${staffed.length} seats, ${territories.length} territories`);
      return json(res, 200, { ok: true, staffed, territories });
    }
    if (path === "/api/cofactory/factory/staff") {
      if (!runtime?.launcher) return json(res, 503, { error: "the runtime is not running" });
      const staffed = await runtime.launcher.staffFactory();
      record(null, "staff_factory", staffed.map((seat) => `${seat.role}${seat.created ? " created" : ""}`).join(", "));
      return json(res, 200, { ok: true, staffed });
    }
    if (path === "/api/cofactory/deposit") {
      const input = parse(z.object({ cents }));
      if (!input) return;
      const entry = book.deposit(input.cents, "owner");
      record(null, "deposit", `${input.cents} cents`, { kind: "money.deposit", ok: true, reason: `${input.cents} cents deposited`, evidence: [{ type: "ledger_entry", id: entry.id }] });
      return json(res, 200, { entry });
    }
    if (path === "/api/cofactory/reserve") {
      const input = parse(z.object({ cents: z.number().int().min(0).max(100_000_000) }));
      if (!input) return;
      try {
        const entry = book.setReserve(input.cents, "owner");
        record(null, "reserve", `${input.cents} cents`, { kind: "money.reserve", ok: true, reason: `reserve set to ${input.cents} cents`, evidence: entry ? [{ type: "ledger_entry", id: entry.id }] : [] });
        return json(res, 200, { entry });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        record(null, "reserve", reason, { kind: "money.reserve", ok: false, reason, evidence: [] });
        return json(res, 409, { ok: false, reason });
      }
    }
    if (path === "/api/cofactory/launch") {
      const input = parse(z.object({ name: z.string().min(1).max(120), brief: z.string().max(4_000).default(""), capCents: cents, team: z.boolean().default(true), dossierId: z.string().optional() }));
      if (!input) return;
      if (!input.dossierId && !input.brief.trim()) return json(res, 400, { error: "give a brief, or a dossierId to launch from" });
      if (input.dossierId && !(input.team && runtime?.launcher)) return json(res, 400, { error: "launching from a dossier needs the runtime and a team" });
      const launch = { name: input.name, brief: input.brief, capCents: input.capCents, ...(input.dossierId ? { dossierId: input.dossierId } : {}) };
      const result = input.team && runtime?.launcher ? await runtime.launcher.launch(launch, "owner") : book.launch(launch, "owner");
      const companyId = result.ok ? result.company.id : null;
      record(companyId, "launch", input.name, { kind: "company.launch", ok: result.ok, reason: result.ok ? `${input.name} with a ${input.capCents}-cent cap` : result.reason, evidence: companyId ? [{ type: "company", id: companyId }] : [] });
      if (result.ok) void deps.tick();
      return answer(result);
    }
    if (path === "/api/cofactory/seats") {
      const input = parse(seat);
      if (!input) return;
      if (!deps.botExists(input.botId)) return json(res, 404, { error: "no such bot" });
      const result = book.seat(input);
      record(input.companyId, "seat", `${input.role} ${input.botId}`, { kind: "seat.change", ok: result.ok, reason: result.ok ? `seated ${input.role}` : result.reason, evidence: input.companyId ? [{ type: "company", id: input.companyId }] : [] });
      return answer(result);
    }
    if (path === "/api/cofactory/unseat") {
      const input = parse(z.object({ botId: z.string().min(1) }));
      if (!input) return;
      const was = book.membership(input.botId);
      const removed = book.unseat(input.botId);
      record(was?.companyId ?? null, "unseat", input.botId, { kind: "seat.change", ok: removed, reason: removed ? `unseated ${was?.role}` : "no such seat", evidence: was?.companyId ? [{ type: "company", id: was.companyId }] : [] });
      return json(res, 200, { ok: removed });
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
      const recorded = deps.evidence().recordEvent(input);
      if (!recorded.duplicate) record(input.companyId, "relay_event", `${input.kind} via ${input.source} ${input.externalId}`);
      return json(res, 200, recorded);
    }
    if (path === "/api/cofactory/revenue") {
      const input = parse(z.object({ companyId: z.string().min(1), cents, receipt: z.string().min(1).max(500) }));
      if (!input) return;
      if (!book.company(input.companyId)) return json(res, 404, { error: "no such company" });
      const entry = book.recordRevenue(input, "owner");
      record(input.companyId, "revenue", `${input.cents} cents ${input.receipt}`, { kind: "revenue.record", ok: true, reason: `${input.cents} cents, receipt ${input.receipt}`, evidence: [{ type: "ledger_entry", id: entry.id }] });
      return json(res, 200, { entry });
    }
    const action = COMPANY_ACTION.exec(path);
    if (action) {
      const [, companyId, verb] = action as unknown as [string, string, "freeze" | "unfreeze" | "kill" | "wake"];
      const evidence: EvidenceLink[] = [{ type: "company", id: companyId }];
      if (verb === "unfreeze") {
        const result = book.unfreeze(companyId, "owner");
        record(companyId, "unfreeze", "", { kind: "company.unfreeze", ok: result.ok, reason: result.ok ? "unfrozen" : result.reason, evidence });
        return answer(result);
      }
      if (verb === "wake") {
        if (!runtime) return json(res, 503, { error: "the runtime is not running" });
        const ceo = book.members().find((member) => member.companyId === companyId && member.role === "ceo");
        if (!ceo) return json(res, 409, { ok: false, reason: "no CEO is seated" });
        const input = parse(z.object({ objective: z.string().min(1).max(2_000), doneWhen: z.string().min(1).max(1_000), kind: z.enum(["operating", "deep"]).default("operating") }));
        if (!input) return;
        record(companyId, "wake", input.objective);
        const started = await runtime.sessions.request({ companyId, botId: ceo.botId, kind: input.kind, trigger: "owner", objective: input.objective, doneWhen: input.doneWhen });
        return "refused" in started ? json(res, 409, { ok: false, reason: started.refused }) : json(res, 200, { ok: true, ...started });
      }
      const input = parse(z.object({ why: z.string().min(1).max(2_000), reason: z.enum(KILL_REASONS).default("owner") }));
      if (!input) return;
      const result = verb === "freeze" ? book.freeze(companyId, "owner", input.why) : book.kill(companyId, input.reason, "owner", input.why);
      record(companyId, verb, input.why, { kind: verb === "freeze" ? "company.freeze" : "company.kill", ok: result.ok, reason: result.ok ? `${verb}: ${input.why}` : result.reason, evidence });
      if (result.ok) await runtime?.sessions.stopCompany(companyId, `${verb}: ${input.why}`);
      return answer(result);
    }
    return PASS;
  };
}
