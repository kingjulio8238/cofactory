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
import { createCards, searchSize, type Cards } from "./dossier/cards.ts";
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
import { closeIdleCompanies, openSettings, operatorDailyModelCents, startingStakeLimit } from "./settings.ts";
import { fixtureFetcher } from "./evals/suites.ts";
import { openApprovals, type Approval, type Approvals } from "./approvals.ts";
import type { KillReason, SpendCategory } from "../../shared/cofactory/types.ts";
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
  /** Called once a factory is open with its lead's bot: the lead becomes the chief of staff in place of dusk's helper. */
  factoryOpened?: (leadBotId: string) => void;
  /** Tells the owner something they would come back for (a card to decide on, a company opened), as a notification. */
  notifyOwner?: (text: string) => void;
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
  let cards: Cards | null = null;
  let registryClose: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking: Promise<void> | null = null;
  let tickAgain = false;
  let recovered: Promise<void> | null = null;
  const log = deps.log ?? ((line: string) => console.log(line));
  const books = (): Book => (book ??= openBook(join(deps.dataDir, "cofactory.db")));
  // COFACTORY_TRUTH_FIXTURES=1 (end-to-end tests only): evidence is read from the eval fixture pages, not the internet
  const evidence = (): Truth => (truth ??= openTruth(join(deps.dataDir, "cofactory-evidence"), process.env.COFACTORY_TRUTH_FIXTURES === "1" ? { fetch: fixtureFetcher } : {}));
  const seatOf = (botId: string): Membership | null => books().membership(botId);
  const observe = (): Observer => (observer ??= createObserver({ store: openObserveStore(join(deps.dataDir, "cofactory-observe.db")), book: books() }));
  let registry: ReturnType<typeof openLocalRegistry> | null = null;
  const registryOf = () => (registry ??= openLocalRegistry(join(deps.dataDir, "cofactory-registry.db")));
  const discoveryService = (): Discovery => {
    if (discovery) return discovery;
    const registry = registryOf();
    registryClose = () => registry.close();
    discovery = createDiscovery({ store: openDiscoveryStore(join(deps.dataDir, "cofactory-discovery.db")), truth: evidence(), registry });
    const cardsPerBatch = Number(process.env.COFACTORY_CARDS_PER_BATCH);
    cards = createCards({ store: discovery.store, truth: evidence(), ...(cardsPerBatch > 0 ? { perBatch: cardsPerBatch } : {}),
      onReady: (card) => deps.notifyOwner?.(`${card.body.name} is ready for you to look at: ${card.body.headline}`) });
    const perBatch = process.env.COFACTORY_DOSSIERS_PER_BATCH;
    dossiers = createDossiers({ store: discovery.store, truth: evidence(), registry, crossFactoryBlock: discovery.policy.crossFactoryBlock, ...(perBatch !== undefined && Number(perBatch) >= 0 ? { policy: { dossiersPerBatch: Number(perBatch) } } : {}) });
    return discovery;
  };
  const dossierService = (): Dossiers => { discoveryService(); return dossiers!; };
  const cardService = (): Cards => { discoveryService(); return cards!; };

  /** Why the owner cannot start a company from a card right now, or null: the money for its first stake must be there. */
  const startProblem = (): string | null => {
    const stake = startingStakeLimit(settings.get());
    if (stake <= 0) return "fund the factory first";
    return books().balance("unallocated") < stake ? `the factory has ${books().balance("unallocated")} cents left, and a company starts with ${stake}` : null;
  };

  function startCard(cardId: string, actor: "owner" | "factory"): { ok: true } | { ok: false; reason: string } {
    const problem = startProblem();
    if (problem) return { ok: false, reason: problem };
    const started = cardService().start(cardId);
    if (!started.ok) return started;
    observe().decide({ companyId: null, session: null, actor, kind: "card.start", verdict: "allowed", reason: `${started.card.body.name}: research its full dossier, then launch`, evidence: [{ type: "card", id: cardId }, { type: "niche", id: started.card.nicheId }] });
    void tick();
    return { ok: true };
  }

  /**
   * Carries started cards to a company: a clean full dossier is championed on the owner's word and launched; one that
   * did not hold up is marked unconfirmed with no money moved. When nothing is left for the owner to decide, the next
   * niches get cards, or a new search starts, while the money allows another company.
   */
  async function cardUpkeep(): Promise<void> {
    const deck = cardService(), store = discoveryService().store, launcher = runtimeParts()?.launcher;
    for (const card of deck.all()) {
      if (card.status === "ready" && settings.get().approvals.launch === "auto") startCard(card.id, "factory");
      if (card.status !== "started") continue;
      const niche = store.niche(card.nicheId)!;
      const dossier = dossierService().latest(card.nicheId);
      if (niche.status === "rejected" || dossier?.status === "dropped") {
        const why = dossier ? [...dossier.verification.criticalFailures, ...dossier.verification.structural, ...(dossier.score?.vetoes.map((item) => item.why) ?? [])].slice(0, 2).join("; ") : "";
        deck.settle(card.id, { status: "unconfirmed", note: why || "the full research did not hold up" });
        deps.notifyOwner?.(`${card.body.name} couldn't be confirmed: ${why || "the full research did not hold up"}. No money moved.`);
        continue;
      }
      if (dossier?.status === "scored") {
        dossierService().champion(dossier.id, "owner", `The owner chose ${card.body.name} from its card ("${card.body.headline}"), and its full dossier verified and scored without a veto.`, niche.signalIds.slice(0, 3));
      }
      const current = dossierService().latest(card.nicheId);
      if (!launcher || (current?.status !== "shortlisted" && current?.status !== "championed")) continue;
      const problem = startProblem();
      const launched = problem ? { ok: false as const, reason: problem }
        : await launcher.launch({ name: card.body.name, brief: card.body.headline, capCents: startingStakeLimit(settings.get()), dossierId: current.id, fromCard: true }, "owner");
      if (!launched.ok) {
        if (card.note !== launched.reason) deck.settle(card.id, { note: launched.reason });
        continue;
      }
      deck.settle(card.id, { status: "launched", companyId: launched.company.id, note: null });
      observe().decide({ companyId: launched.company.id, session: null, actor: "owner", kind: "company.launch", verdict: "allowed", reason: `started from its card: ${card.body.name}`, evidence: [{ type: "company", id: launched.company.id }, { type: "card", id: card.id }] });
      deps.notifyOwner?.(`${launched.company.name} is open.`);
    }
    const waiting = deck.all().some((card) => card.status === "ready" || card.status === "started") || deck.wanted().length > 0;
    if (waiting || process.env.COFACTORY_NEXT_SEARCH === "0" || !settings.get().onboardedAt || startProblem() || store.openBatch()) return;
    const last = store.batches().filter((batch) => batch.closedAt !== null).at(-1);
    if (!last) return;
    const picked = deck.select(last.id);
    for (const id of picked) observe().decide({ companyId: null, session: null, actor: "runtime", kind: "niche.card", verdict: "allowed", reason: "picked for a card: nothing was left for the owner to decide", evidence: [{ type: "niche", id }] });
    if (!picked.length) {
      const next = discoveryService().startBatch("the factory's next search", searchSize());
      if (next.ok) log(`cofactory: started the next search (${next.batch.target} niches)`);
    }
  }
  let validation: { sprints: Sprints; outreach: Outreach; rails: Rails; orders: Orders; folderOf(companyId: string): string; saveOffer(companyId: string, html: string): string } | null = null;
  const offerFile = (companyId: string) => join(deps.dataDir, "cofactory-companies", companyId, "offer", "index.html");
  const validationParts = () => {
    if (validation) return validation;
    const sprints = openSprints(join(deps.dataDir, "cofactory-sprints.db"), { truth: evidence(), policy: { sprintDays: settings.get().closeAfterDays } });
    const rails = openRails(join(deps.dataDir, "cofactory-rails.json"));
    const mail: MailPort = deps.mailDryRunFile ? dryRunMailPort(deps.mailDryRunFile)
      : deps.email ? duskMailPort(deps.email) : { send: async () => { throw new Error("email is not available on this server"); }, fetchNew: async () => [] };
    const outreach = createOutreach({ sprints, truth: evidence(), mail, mailboxFor: (companyId) => rails.peek(companyId)?.mailbox ?? null, postalAddressFor: (companyId) => rails.peek(companyId)?.postalAddress ?? null, cursor: sprints.cursor,
      armed: (companyId) => deps.mailDryRunFile !== undefined || rails.peek(companyId)?.outreachArmed === true,
      offerProblem: async (companyId) => {
        const offerUrl = rails.peek(companyId)?.offerUrl;
        if (!offerUrl) return "no offer page is published";
        if (deps.mailDryRunFile) return existsSync(offerFile(companyId)) ? null : "no offer page is saved";
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

  const settings = openSettings(join(deps.dataDir, "cofactory-settings.json"));
  let approvalStore: Approvals | null = null;
  const approvals = (): Approvals => (approvalStore ??= openApprovals(join(deps.dataDir, "cofactory-approvals.db")));

  /**
   * Carries out the owner's decision on a held step: approved, the launch, hold or close runs as the owner; either way
   * the seat that asked gets a message saying what happened.
   */
  async function settleApproval(id: string, approve: boolean, note: string | null): Promise<{ ok: true; approval: Approval; outcome: string } | { ok: false; reason: string }> {
    const approval = approvals().approval(id);
    if (!approval || approval.status !== "pending") return { ok: false, reason: "no pending approval with that id" };
    const book = books();
    let outcome = note ? `declined: ${note}` : "declined";
    if (approve) {
      const payload = approval.payload;
      if (approval.kind === "launch") {
        const launcher = runtimeParts()?.launcher;
        if (!launcher) return { ok: false, reason: "the runtime is not running" };
        const launched = await launcher.launch(payload as { name: string; brief: string; capCents: number; dossierId?: string }, "owner");
        if (!launched.ok) return { ok: false, reason: launched.reason };
        observe().decide({ companyId: launched.company.id, session: null, actor: "owner", kind: "company.launch", verdict: "allowed", reason: `approved: ${approval.title}`, evidence: [{ type: "company", id: launched.company.id }] });
        outcome = `approved: ${launched.company.name} is launched (company ${launched.company.id})`;
      } else if (approval.kind === "spend") {
        const spend = payload as { companyId: string; category: SpendCategory; vendor: string; cents: number };
        const held = book.authorize({ companyId: spend.companyId, category: spend.category, vendor: spend.vendor, cents: spend.cents }, "owner");
        if (!held.ok) return { ok: false, reason: held.reason };
        observe().decide({ companyId: spend.companyId, session: null, actor: "owner", kind: "spend.authorize", verdict: "allowed", reason: `approved: ${approval.title}`, evidence: [{ type: "hold", id: held.authorization.id }] });
        outcome = `approved: hold ${held.authorization.id} for ${spend.cents} cents at ${spend.vendor}; capture it with the receipt once charged`;
      } else {
        const close = payload as { companyId: string; reason: KillReason; why: string };
        const killed = book.kill(close.companyId, close.reason, "owner", close.why);
        if (!killed.ok) return { ok: false, reason: killed.reason };
        await runtimeParts()?.sessions.stopCompany(close.companyId, `closed by the owner: ${close.why}`);
        observe().decide({ companyId: close.companyId, session: null, actor: "owner", kind: "company.kill", verdict: "allowed", reason: `approved: ${close.why}; ${killed.releasedCents} cents returned`, evidence: [{ type: "company", id: close.companyId }] });
        outcome = `approved: closed, ${killed.releasedCents} cents back to the factory; write its post-mortem`;
      }
    }
    const settled = approvals().decide(id, approve ? "approved" : "declined", note)!;
    if (approval.kind === "close") runtimeParts()?.store.resolve(approval.companyId, "close_due");
    const toCompanyCeo = approval.kind === "spend" && approval.companyId !== null && book.company(approval.companyId)?.status === "live";
    book.send({
      type: "report", fromBotId: "owner", fromRole: "owner", toRole: toCompanyCeo ? "ceo" : "lead", companyId: toCompanyCeo ? approval.companyId : null,
      parentId: null, budgetAuthId: null, replyPolicy: "one_way",
      brief: { goal: `The owner ${approve ? "approved" : "declined"}: ${approval.title}`, known: outcome, doneWhen: "you carry on with it in mind", constraints: "" },
    });
    return { ok: true, approval: settled, outcome };
  }
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
  const traceDeps = (): TraceDeps => ({ book: books(), truth: evidence(), observe: observe().store, runtime: runtimeParts()?.store ?? null, discovery: discoveryService().store, sprints: validationParts().sprints,
    firstDollarCompanies: () => books().companies().filter((company) => validationParts().orders.firstDollar(company.id).reached).length });

  function runtimeParts(): Runtime | null {
    if (runtime) return runtime;
    const turns = deps.turns;
    if (!turns) return null;
    const store = openRuntimeStore(join(deps.dataDir, "cofactory-runtime.db"));
    const workspaces = createWorkspaces(join(deps.dataDir, "cofactory-companies"));
    const policy: RuntimePolicy = { ...DEFAULT_RUNTIME_POLICY, ...deps.policy };
    const port: TurnPort = {
      threadFor(botId, companyId, title) {
        // the bot's own chat whenever dusk gives one, so the owner sees the seat's work where they open the bot; a seat
        // that worked elsewhere before moves there with its next session
        const thread = turns.createThread(botId, title) ?? store.threadOf(botId, companyId);
        if (!thread) throw new Error("could not open a conversation for the seat");
        if (thread !== store.threadOf(botId, companyId)) store.setThread(botId, companyId, thread);
        return thread;
      },
      start: turns.start,
      interrupt: turns.interrupt,
    };
    const sessions = createSessions({ store, book: books(), workspaces, turns: port, policy, log, holdNew: () => {
      const ceiling = operatorDailyModelCents();
      if (!(ceiling > 0)) return null;
      const day = new Date(); day.setHours(0, 0, 0, 0);
      const used = books().entries({}).filter((entry) => entry.kind === "shadow" && entry.at >= day.getTime()).reduce((sum, entry) => sum + entry.cents, 0);
      if (used < ceiling) { store.resolve(null, "daily_ceiling"); return null; }
      store.raise(null, "daily_ceiling", `today's model use reached the operator's ceiling of $${(ceiling / 100).toFixed(2)}; new sessions start again tomorrow`);
      return "the factory reached today's ceiling on model use";
    } });
    const scheduler = createScheduler({ book: books(), truth: evidence(), store, sessions, discovery: discoveryService(), dossiers: dossierService(), cards: cardService() });
    const launcher = deps.createBot ? createLauncher({ book: books(), workspaces, createBot: deps.createBot, discovery: { store: discoveryService().store, registry: registryOf() } }) : undefined;
    runtime = { store, sessions, scheduler, launcher, policy };
    return runtime;
  }

  /**
   * A pass of the runtime: zombies swept, alarms checked, and due sessions started. A tick asked for while one runs is
   * owed one more pass when it ends, since whatever asked (a Start, a payment) may have changed what the pass would do.
   */
  function tick(): Promise<void> {
    if (ticking) { tickAgain = true; return ticking; }
    ticking = (async () => {
      do { tickAgain = false; await pass(); } while (tickAgain);
    })().finally(() => { ticking = null; });
    return ticking;
  }

  async function pass(): Promise<void> {
    const parts = runtimeParts();
    if (!parts) return;
    await recovered;
    try {
      await parts.sessions.sweep();
      for (const alarm of checkAlarms({ book: books(), truth: evidence(), store: parts.store, policy: parts.policy })) log(`cofactory: alarm ${alarm.kind}: ${alarm.detail}`);
      await sprintUpkeep(parts.store);
      await cardUpkeep();
      bookRevenue();
      closeIdleCompanies({ book: books(), settings: settings.get(), store: parts.store, observe: observe(), approvals: approvals(), armedAt: (companyId) => validationParts().rails.peek(companyId)?.armedAt ?? null, log });
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
    }
  }

  return {
    books,
    evidence,
    runtime: runtimeParts,
    observe,
    discovery: discoveryService,
    dossiers: dossierService,
    cards: cardService,
    startCard,
    startProblem,
    validation: validationParts,
    intakeDoor,
    settings,
    approvals,
    settleApproval,
    factoryOpened: (leadBotId: string) => deps.factoryOpened?.(leadBotId),
    relatedParties,
    setRelatedParties(value: { emails: string[]; domains: string[] }): void {
      writeFileAtomic(relatedFile, JSON.stringify(value), { mode: 0o600 });
    },
    bookRevenue,
    /** Whether a bot holds a Cofactory seat. A seat acts for a company, never as the owner: it gets no owner mailbox, phone or connected accounts, and mails only through the outreach gate. */
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
        book: books(), truth: evidence(), seat, actor: `${seat.role}:${ctx.botName}`, observe: observe(), discovery: discoveryService(), dossiers: dossierService(), cards: cardService(), validation: validationParts(), settings: settings.get, approvals: approvals(),
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
      cards = null;
      validation?.sprints.close();
      validation?.orders.close();
      approvalStore?.close();
      approvalStore = null;
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
