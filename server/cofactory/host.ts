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
import { createDiscovery, type Discovery } from "./discovery/discovery.ts";
import { openLocalRegistry } from "./discovery/registry.ts";
import { openDiscoveryStore } from "./discovery/store.ts";
import { createDossiers, type Dossiers } from "./dossier/dossiers.ts";

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
  const discoveryService = (): Discovery => {
    if (discovery) return discovery;
    const registry = openLocalRegistry(join(deps.dataDir, "cofactory-registry.db"));
    registryClose = () => registry.close();
    discovery = createDiscovery({ store: openDiscoveryStore(join(deps.dataDir, "cofactory-discovery.db")), truth: evidence(), registry });
    dossiers = createDossiers({ store: discovery.store, truth: evidence(), registry, crossFactoryBlock: discovery.policy.crossFactoryBlock });
    return discovery;
  };
  const dossierService = (): Dossiers => { discoveryService(); return dossiers!; };
  const traceDeps = (): TraceDeps => ({ book: books(), truth: evidence(), observe: observe().store, runtime: runtimeParts()?.store ?? null, discovery: discoveryService().store });

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
    const launcher = deps.createBot ? createLauncher({ book: books(), workspaces, createBot: deps.createBot }) : undefined;
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
        book: books(), truth: evidence(), seat, actor: `${seat.role}:${ctx.botName}`, observe: observe(), discovery: discoveryService(), dossiers: dossierService(),
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
