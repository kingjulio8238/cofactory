import { join } from "node:path";

import { DEFAULT_RUNTIME_POLICY, type RuntimePolicy } from "../../shared/cofactory/runtime.ts";
import { FACTORY_ROLES, type Membership } from "../../shared/cofactory/types.ts";
import { openBook, type Book } from "./book.ts";
import { COFACTORY_INSTRUCTIONS } from "./instructions.ts";
import { checkAlarms } from "./runtime/alarms.ts";
import { createLauncher, type Launcher, type LauncherDeps } from "./runtime/launcher.ts";
import { createScheduler, type Scheduler } from "./runtime/scheduler.ts";
import { createSessions, type Sessions, type TurnPort } from "./runtime/sessions.ts";
import { openRuntimeStore, type RuntimeStore } from "./runtime/store.ts";
import { createWorkspaces } from "./runtime/workspace.ts";
import { runTool, toolsFor, type ToolResult } from "./tools.ts";
import { openTruth, type Truth } from "./truth/store.ts";
import { createObserver, type Observer } from "./observe/observer.ts";
import { openObserveStore } from "./observe/store.ts";
import type { TraceDeps } from "./observe/trace.ts";
import type { EvidenceLink } from "../../shared/cofactory/observe.ts";
import { createDiscovery, type Discovery } from "./discovery/discovery.ts";
import { openLocalRegistry } from "./discovery/registry.ts";
import { openDiscoveryStore } from "./discovery/store.ts";
import { createDossiers, type Dossiers } from "./dossier/dossiers.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { EmailAccount } from "../email/store.ts";
import type { EmailGuard } from "../email/client.ts";
import { createIntakeDoor } from "./validation/intake.ts";
import { dryRunMailPort, duskMailPort } from "./validation/mail-dusk.ts";
import { createOutreach, type MailPort, type Outreach } from "./validation/outreach.ts";
import { openRails, type Rails } from "./validation/rails.ts";
import { openSprints, type Sprints } from "./validation/sprints.ts";
import { openOrders, type Orders } from "./validation/orders.ts";
import { createRehearsals } from "./validation/rehearsal.ts";
import { armsLength } from "./truth/classify.ts";
import { writeFileAtomic } from "../atomic.ts";

export const COFACTORY_INTERNAL_MCP_PATH = "/api/internal/cofactory/mcp";

/** COFACTORY_CADENCE_MS, COFACTORY_SESSION_MS and COFACTORY_SHORT_ROUND_MS shorten the runtime's clock for a simulated run. */
export function cofactoryPolicyFromEnv(env: NodeJS.ProcessEnv): Partial<RuntimePolicy> {
  const ms = (name: string) => (Number(env[name]) > 0 ? Number(env[name]) : undefined);
  const cadence = ms("COFACTORY_CADENCE_MS"), session = ms("COFACTORY_SESSION_MS"), short = ms("COFACTORY_SHORT_ROUND_MS");
  return {
    ...(cadence ? { cadenceMs: cadence } : {}),
    ...(session ? { operatingBudgetMs: session, deepBudgetMs: session, reserveMs: Math.min(DEFAULT_RUNTIME_POLICY.reserveMs, session / 10), zombieGraceMs: Math.min(DEFAULT_RUNTIME_POLICY.zombieGraceMs, session) } : {}),
    ...(short ? { shortRoundMs: short } : {}),
  };
}

export interface CofactoryHostDeps {
  dataDir: string;
  proxy: { command: string; script: string; env: Record<string, string> };
  harnessUrl: () => string;
  tokenEnv: string;
  /** A turn-scoped capability for `botId`, kind "cofactory". */
  mint: (botId: string, turn: { threadId: string; generation: string }) => string;
  /** How seats' turns run in dusk; without it the runtime does not start. */
  turns?: Omit<TurnPort, "threadFor"> & { createThread(botId: string, title: string): string | null };
  createBot?: LauncherDeps["createBot"];
  policy?: Partial<RuntimePolicy>;
  /** When set, outreach is written to this file instead of being sent, so a live run reaches no one. */
  mailDryRunFile?: string;
  /** dusk's connected mailboxes, which company outreach sends from and reads replies in. */
  email?: { store: { get(address: string): EmailAccount | null }; guard: EmailGuard };
  tickMs?: number;
  log?: (line: string) => void;
}

interface Runtime {
  store: RuntimeStore;
  sessions: Sessions;
  scheduler: Scheduler;
  launcher: Launcher | undefined;
  policy: RuntimePolicy;
}

export function createCofactoryHost(deps: CofactoryHostDeps) {
  let book: Book | null = null;
  let truth: Truth | null = null;
  let runtime: Runtime | null = null;
  let observer: Observer | null = null;
  let discovery: Discovery | null = null;
  let dossiers: Dossiers | null = null;
  let registryClose: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;
  let recovered: Promise<void> | null = null;
  const log = deps.log ?? ((line: string) => console.log(line));
  const books = (): Book => (book ??= openBook(join(deps.dataDir, "cofactory.db")));
  const evidence = (): Truth => (truth ??= openTruth(join(deps.dataDir, "cofactory-evidence")));
  const seatOf = (botId: string): Membership | null => books().membership(botId);
  const observe = (): Observer => (observer ??= createObserver({ store: openObserveStore(join(deps.dataDir, "cofactory-observe.db")), book: books() }));
  let registry: ReturnType<typeof openLocalRegistry> | null = null;
  const registryOf = () => (registry ??= openLocalRegistry(join(deps.dataDir, "cofactory-registry.db")));
  const discoveryService = (): Discovery => {
    if (discovery) return discovery;
    const registry = registryOf();
    registryClose = () => registry.close();
    discovery = createDiscovery({ store: openDiscoveryStore(join(deps.dataDir, "cofactory-discovery.db")), truth: evidence(), registry });
    const perBatch = process.env.COFACTORY_DOSSIERS_PER_BATCH;
    dossiers = createDossiers({ store: discovery.store, truth: evidence(), registry, crossFactoryBlock: discovery.policy.crossFactoryBlock, ...(perBatch !== undefined && Number(perBatch) >= 0 ? { policy: { dossiersPerBatch: Number(perBatch) } } : {}) });
    return discovery;
  };
  const dossierService = (): Dossiers => { discoveryService(); return dossiers!; };
  let validation: { sprints: Sprints; outreach: Outreach; rails: Rails; orders: Orders; folderOf(companyId: string): string; saveOffer(companyId: string, html: string): string } | null = null;
  const offerFile = (companyId: string) => join(deps.dataDir, "cofactory-companies", companyId, "offer", "index.html");
  const validationParts = () => {
    if (validation) return validation;
    const sprints = openSprints(join(deps.dataDir, "cofactory-sprints.db"), { truth: evidence() });
    const rails = openRails(join(deps.dataDir, "cofactory-rails.json"));
    const mail: MailPort = deps.mailDryRunFile ? dryRunMailPort(deps.mailDryRunFile)
      : deps.email ? duskMailPort(deps.email) : { send: async () => { throw new Error("email is not available on this server"); }, fetchNew: async () => [] };
    const outreach = createOutreach({ sprints, truth: evidence(), mail, mailboxFor: (companyId) => rails.peek(companyId)?.mailbox ?? null, postalAddressFor: (companyId) => rails.peek(companyId)?.postalAddress ?? null, cursor: sprints.cursor,
      offerProblem: async (companyId) => {
        const offerUrl = rails.peek(companyId)?.offerUrl;
        if (!offerUrl) return "no offer page is published";
        const check = await evidence().checkContains({ url: offerUrl, needle: `/hooks/cofactory/form/${companyId}/`, subject: `offer:${companyId}` });
        return check.verdict === "verified" ? null : `${offerUrl} is ${check.verdict} (${check.reason})`;
      }, });
    validation = {
      sprints, outreach, rails, orders: openOrders(join(deps.dataDir, "cofactory-orders.db")),
      folderOf: (companyId) => join(deps.dataDir, "cofactory-companies", companyId),
      saveOffer(companyId, html) {
        const file = offerFile(companyId);
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, html);
        return file;
      },
    };
    return validation;
  };
  const intakeDoor = createIntakeDoor({
    formToken: (companyId) => validationParts().rails.peek(companyId)?.formToken ?? null,
    stripeSecret: (companyId) => validationParts().rails.peek(companyId)?.stripeWebhookSecret ?? null,
    record: (input) => { evidence().recordEvent(input); },
    thanksUrl: (companyId) => { const offer = validationParts().rails.peek(companyId)?.offerUrl; return offer ? `${offer}#thanks` : null; },
    offerPage: (companyId) => (/^[\w-]+$/.test(companyId) && existsSync(offerFile(companyId)) ? readFileSync(offerFile(companyId), "utf8") : null),
  });

  const relatedFile = join(deps.dataDir, "cofactory-related.json");
  /** The owner's own addresses and domains, and those of anyone related: payments from them never count as customers. */
  const relatedParties = (): { emails: string[]; domains: string[] } => {
    try { return JSON.parse(readFileSync(relatedFile, "utf8")) as { emails: string[]; domains: string[] }; } catch { return { emails: [], domains: [] }; }
  };

  /**
   * Books each arm's-length payment as revenue, once, and each refund of a booked payment as a refund. A payment that
   * does not count (test mode, the owner's own card, under half the list price) is filed as a refused decision, once.
   */
  function bookRevenue(): void {
    const book = books(), truth = evidence(), parts = validationParts(), seen = parts.sprints.cursor;
    const related = relatedParties();
    const refunded = truth.refunded();
    for (const company of book.companies()) {
      const entries = book.entries({ companyId: company.id });
      const booked = new Set(entries.filter((entry) => entry.kind === "revenue").map((entry) => entry.receipt));
      const link = discoveryService().store.linkOf(company.id);
      const listPrice = link?.dossierId ? discoveryService().store.dossier(link.dossierId)?.body.offer.priceCents ?? null : null;
      for (const event of truth.events({ companyId: company.id })) {
        if (event.kind !== "payment" && event.kind !== "deposit") continue;
        if (booked.has(event.externalId)) {
          if (refunded.has(event.externalId) && !seen.get(`refund_booked:${event.id}`)) {
            book.recordRefund({ companyId: company.id, cents: event.amountCents ?? 0, receipt: `refund:${event.externalId}` }, "intake");
            parts.orders.refund(event.externalId);
            seen.set(`refund_booked:${event.id}`, 1);
          }
          continue;
        }
        if (seen.get(`revenue_judged:${event.id}`)) continue;
        const verdict = armsLength(event, { listPriceCents: listPrice ?? event.amountCents ?? 0, relatedEmails: related.emails, relatedDomains: related.domains, refunded });
        const cited: EvidenceLink[] = [{ type: "external_event", id: event.id, externalId: event.externalId, evidenceClass: event.evidenceClass }];
        if (verdict.ok && (event.amountCents ?? 0) > 0) {
          const entry = book.recordRevenue({ companyId: company.id, cents: event.amountCents!, receipt: event.externalId }, "intake");
          parts.orders.open({ companyId: company.id, eventId: event.id, externalId: event.externalId, customer: event.payerEmail, amountCents: event.amountCents! });
          observe().decide({ companyId: company.id, session: null, actor: "intake", kind: "revenue.record", verdict: "allowed", reason: `${event.amountCents} cents from ${event.payerEmail}${listPrice === null ? " (no list price on record)" : ""}`, evidence: [...cited, { type: "ledger_entry", id: entry.id }] });
        } else {
          observe().decide({ companyId: company.id, session: null, actor: "intake", kind: "revenue.record", verdict: "refused", reason: verdict.reasons.join("; ") || "zero amount", evidence: cited });
        }
        seen.set(`revenue_judged:${event.id}`, 1);
      }
    }
  }

  /** Reads each running sprint's mailbox and settles the sprint on its evidence; a failed sprint raises an alarm. */
  async function sprintUpkeep(store: RuntimeStore): Promise<void> {
    const parts = validationParts();
    for (const sprint of parts.sprints.runningAll()) {
      try {
        await parts.outreach.poll(sprint.companyId);
        store.resolve(sprint.companyId, "mail_failed");
      } catch (error) {
        store.raise(sprint.companyId, "mail_failed", `reading the mailbox failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const settled = parts.sprints.settle(sprint.id);
      if (settled?.status === "failed") store.raise(sprint.companyId, "sprint_failed", settled.outcome ?? "the sprint ended without enough evidence");
      if (settled && settled.status !== "running") log(`cofactory: sprint ${sprint.id.slice(0, 8)} ${settled.status}: ${settled.outcome}`);
    }
  }
  const traceDeps = (): TraceDeps => ({ book: books(), truth: evidence(), observe: observe().store, runtime: runtimeParts()?.store ?? null, discovery: discoveryService().store, sprints: validationParts().sprints });

  function runtimeParts(): Runtime | null {
    if (runtime) return runtime;
    const turns = deps.turns;
    if (!turns) return null;
    const store = openRuntimeStore(join(deps.dataDir, "cofactory-runtime.db"));
    const workspaces = createWorkspaces(join(deps.dataDir, "cofactory-companies"));
    const policy: RuntimePolicy = { ...DEFAULT_RUNTIME_POLICY, ...deps.policy };
    const port: TurnPort = {
      threadFor(botId, companyId, title) {
        const known = store.threadOf(botId, companyId);
        if (known) return known;
        const created = turns.createThread(botId, title);
        if (!created) throw new Error("could not open a conversation for the seat");
        store.setThread(botId, companyId, created);
        return created;
      },
      start: turns.start,
      interrupt: turns.interrupt,
    };
    const sessions = createSessions({ store, book: books(), workspaces, turns: port, policy, log });
    const scheduler = createScheduler({ book: books(), truth: evidence(), store, sessions, discovery: discoveryService(), dossiers: dossierService() });
    const launcher = deps.createBot ? createLauncher({ book: books(), workspaces, createBot: deps.createBot, discovery: { store: discoveryService().store, registry: registryOf() } }) : undefined;
    runtime = { store, sessions, scheduler, launcher, policy };
    return runtime;
  }

  /** One pass of the runtime: zombies swept, alarms checked, and due sessions started. */
  async function tick(): Promise<void> {
    const parts = runtimeParts();
    if (!parts || ticking) return;
    ticking = true;
    await recovered;
    try {
      await parts.sessions.sweep();
      for (const alarm of checkAlarms({ book: books(), truth: evidence(), store: parts.store, policy: parts.policy })) log(`cofactory: alarm ${alarm.kind}: ${alarm.detail}`);
      await sprintUpkeep(parts.store);
      bookRevenue();
      for (const company of books().companies().filter((candidate) => candidate.status === "live")) {
        const missing = validationParts().rails.missing(company.id);
        const detail = `the owner has not connected ${missing.join(", ")}; work that needs them waits, everything else goes ahead`;
        const open = parts.store.openAlarms(company.id).find((alarm) => alarm.kind === "rails_missing");
        if (open && (!missing.length || open.detail !== detail)) parts.store.resolve(company.id, "rails_missing");
        if (missing.length) parts.store.raise(company.id, "rails_missing", detail);
      }
      if (deps.createBot) {
        const createBot = deps.createBot;
        await createRehearsals({ orders: validationParts().orders, book: books(), truth: evidence(), store: parts.store, sessions: parts.sessions, observe: observe(), folderOf: validationParts().folderOf, packetRoot: join(deps.dataDir, "cofactory-rehearsals"), createBot }).upkeep();
      }
      const postmortems = new Set(discoveryService().store.postmortems().map((entry) => entry.companyId));
      for (const company of books().companies()) {
        if (company.status === "killed" && !postmortems.has(company.id)) parts.store.raise(company.id, "postmortem_missing", "a killed company needs its post-mortem (cofactory_postmortem)");
        else parts.store.resolve(company.id, "postmortem_missing");
      }
      await parts.scheduler.tick();
    } catch (error) {
      log(`cofactory: runtime tick failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      ticking = false;
    }
  }

  return {
    books,
    evidence,
    runtime: runtimeParts,
    observe,
    discovery: discoveryService,
    dossiers: dossierService,
    validation: validationParts,
    intakeDoor,
    relatedParties,
    setRelatedParties(value: { emails: string[]; domains: string[] }): void {
      writeFileAtomic(relatedFile, JSON.stringify(value), { mode: 0o600 });
    },
    bookRevenue,
    /** Whether a bot holds a Cofactory seat: a company seat sends mail only through the outreach gate. */
    seated: (botId: string) => seatOf(botId) !== null,
    traceDeps,
    tick,

    /** Notes the owner's part in a seat's turn: a question or an approval the person is asked for. */
    observeEvent(event: { type: string; threadId?: string; requestType?: string; tool?: string; summary?: string }): void {
      if (event.type !== "request.opened" || !event.threadId) return;
      const parts = runtimeParts();
      const seat = parts?.store.seatOfThread(event.threadId);
      if (!seat) return;
      observe().touch({
        companyId: seat.companyId, sessionId: parts!.store.liveFor(seat.botId)?.id ?? null,
        source: event.requestType === "question" ? "question" : "approval", kind: event.tool ?? event.requestType ?? "request", detail: event.summary ?? "",
      });
    },

    /** Recovers sessions a restart cut off, then ticks on an interval. */
    async start(): Promise<void> {
      const parts = runtimeParts();
      if (!parts || timer) return;
      recovered = parts.sessions.recover();
      await recovered;
      timer = setInterval(() => { void tick(); }, deps.tickMs ?? 30_000);
      timer.unref?.();
      void tick();
    },

    /** The stdio MCP server for a seated bot's turn; null for a bot with no seat. */
    integration(botId: string, turn: { threadId: string; generation: string }) {
      if (!seatOf(botId)) return null;
      return {
        command: deps.proxy.command,
        args: [deps.proxy.script, "cofactory"],
        env: { ...deps.proxy.env, [deps.tokenEnv]: deps.mint(botId, turn), DUSK_HARNESS_URL: deps.harnessUrl() },
      };
    },

    prompt(botId: string): string {
      const seat = seatOf(botId);
      if (!seat) return "";
      const factory = (FACTORY_ROLES as readonly string[]).includes(seat.role);
      const company = seat.companyId ? books().company(seat.companyId) : null;
      const where = factory ? "the factory, which owns the whole portfolio" : `the company "${company?.name ?? "unknown"}" (stage ${company?.stage ?? "?"}, ${company?.status ?? "?"})`;
      return `You hold the ${seat.role} seat in ${where}. ${COFACTORY_INSTRUCTIONS} Start with cofactory_status.`;
    },

    async rpc(request: { method?: unknown; params?: unknown } | null | undefined, ctx: { botId: string; botName: string; assertActive(): void }): Promise<{ tools: unknown[]; instructions: string } | ToolResult> {
      ctx.assertActive();
      const seat = seatOf(ctx.botId);
      if (!seat) throw Object.assign(new Error("this bot holds no Cofactory seat"), { status: 403 });
      if (request?.method === "tools/list") return { tools: toolsFor(seat.role), instructions: COFACTORY_INSTRUCTIONS };
      if (request?.method !== "tools/call") throw Object.assign(new Error("unsupported cofactory method"), { status: 400 });
      const params = (request.params && typeof request.params === "object" ? request.params : {}) as { name?: unknown; arguments?: unknown };
      const parts = runtimeParts();
      const result = await runTool({
        book: books(), truth: evidence(), seat, actor: `${seat.role}:${ctx.botName}`, observe: observe(), discovery: discoveryService(), dossiers: dossierService(), validation: validationParts(),
        session: parts?.store.liveFor(seat.botId) ?? null,
        ...(parts ? { sessions: parts.sessions } : {}), ...(parts?.launcher ? { launcher: parts.launcher } : {}),
      }, params.name, params.arguments);
      ctx.assertActive();
      return result;
    },

    /** A booked engine turn's API-equivalent price, recorded as shadow spend against the bot's seat. */
    costBooked(entry: { botId: string; usd: number; botName: string }): void {
      if (!(entry.usd > 0)) return;
      const seat = seatOf(entry.botId);
      if (!seat) return;
      const cents = Math.round(entry.usd * 100);
      if (cents < 1) return;
      books().recordShadow({ companyId: seat.companyId, cents, vendor: "model", note: entry.botName }, `${seat.role}:${entry.botName}`);
    },

    close(): void {
      if (timer) clearInterval(timer);
      timer = null;
      runtime?.store.close();
      observer?.store.close();
      observer = null;
      discovery?.store.close();
      registryClose?.();
      discovery = null;
      dossiers = null;
      validation?.sprints.close();
      validation?.orders.close();
      validation = null;
      registryClose = null;
      book?.close();
      truth?.close();
      runtime = null;
      book = null;
      truth = null;
    },
  };
}

export type CofactoryHost = ReturnType<typeof createCofactoryHost>;
