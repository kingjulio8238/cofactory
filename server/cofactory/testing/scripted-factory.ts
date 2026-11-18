// A Cofactory on a real dusk server whose seats run on the fake engine, each seat's turns scripted by a routes file the
// fake engine re-reads every turn. The lifecycle test and `pnpm cofactory:walkthrough` both drive a factory with it.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { verificationServerArgs, verificationServerEnvironment } from "../../../scripts/control-dusk.ts";
import { goodDossier } from "../evals/dossier-suites.ts";

const FAKE_CLI = fileURLToPath(new URL("../../testing/fake-claude-cli.ts", import.meta.url));

export type Call = { server: "cofactory"; tool: string; arguments: Record<string, unknown> };
export const tool = (name: string, args: Record<string, unknown> = {}): Call => ({ server: "cofactory", tool: name, arguments: args });
/** Every scripted session ends: a journal line, then done, so the next script runs on the seat's next wake. */
export const ending = (did: string): Call[] => [tool("cofactory_journal", { did }), tool("cofactory_end_session", { outcome: "done", summary: did })];

export interface ScriptedFactory {
  url: string;
  hooks: string;
  dataDir: string;
  outbox: string;
  child: ChildProcess;
  /** The scripts for the seats' next turns, keyed by a marker in the turn's prompt ("Factory scout ·", "CEO ·", ...). */
  routes(next: Record<string, Call[]>): void;
  call(method: string, path: string, body?: unknown): Promise<Record<string, any>>;
  until<T>(what: string, probe: () => Promise<T | undefined | null | false>, timeoutMs?: number): Promise<T>;
  stop(): void;
}

/** Starts the server in `dataDir` (short enough for a Unix socket path inside it) on `port`, webhooks on `port + 1`. */
export async function startScriptedFactory(dataDir: string, port: number): Promise<ScriptedFactory> {
  mkdirSync(join(dataDir, "tmp"), { recursive: true });
  writeFileSync(join(dataDir, "config.json"), JSON.stringify({ features: { smartSetupChoices: false }, instances: { claude: { driver: "claudeAgent", displayName: "Verification fixture", config: { cli: FAKE_CLI } } } }));
  const routesFile = join(dataDir, "routes.json"), outbox = join(dataDir, "outbox.jsonl"), logFile = join(dataDir, "server.log");
  // a seat with nothing scripted, or a session's follow-up round, ends at once rather than idling through its budget
  const routes = (next: Record<string, Call[]>) => writeFileSync(routesFile, JSON.stringify({ ...next, " continues: ": ending("nothing more to do"), "Cofactory session": ending("nothing to do") }));
  routes({});
  const url = `http://127.0.0.1:${port}`;
  const env = {
    ...verificationServerEnvironment({ FAKE_CLAUDE_MCP_TOOL_ROUTES: routesFile }, dataDir, port), DUSK_NO_TEST_BOTS: "1",
    COFACTORY_TRUTH_FIXTURES: "1", COFACTORY_FIRST_SEARCH_NICHES: "3", COFACTORY_NEXT_SEARCH: "0", COFACTORY_MAIL_DRY_RUN: outbox,
    COFACTORY_TICK_MS: "400", COFACTORY_CADENCE_MS: "1500", COFACTORY_SHORT_ROUND_MS: "1",
  };
  const child = spawn(process.execPath, verificationServerArgs(env), { env, detached: true, stdio: ["ignore", openSync(logFile, "a"), openSync(logFile, "a")] });
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return response.json() as Promise<Record<string, any>>;
  };
  const until = async <T>(what: string, probe: () => Promise<T | undefined | null | false>, timeoutMs = 60_000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await probe().catch(() => undefined);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const decisions = await call("GET", "/api/cofactory/decisions").catch(() => ({ decisions: [] }));
    const recent = (decisions.decisions as Array<{ kind: string; verdict: string; reason: string }>).filter((d) => d.kind !== "session.end").slice(-12).map((d) => `${d.kind} ${d.verdict}: ${d.reason}`);
    throw new Error(`timed out waiting for ${what}\nlast decisions: ${JSON.stringify(recent, null, 1)}\n${readFileSync(logFile, "utf8").slice(-2_500)}`);
  };
  const stop = () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  };
  await until("the server", async () => (await fetch(`${url}/api/health`)).ok);
  return { url, hooks: `http://127.0.0.1:${port + 1}`, dataDir, outbox, child, routes, call, until, stop };
}

/** The scout's first turn: four quotes from fixture pages, scripted before the factory opens so its first wake finds them. */
export function scriptFirstSearch(factory: ScriptedFactory): void {
  const signal = (url: string, quote: string, source_type: string) => tool("cofactory_record_signal", { url, quote, kind: "complaint", source_type, buyer_hint: "pharmacies", job_hint: "reconciliation" });
  factory.routes({ "Factory scout ·": [
    signal("https://forum-site.test/thread-1", "reconciling the remits by hand eats a whole weekend every month for store number 1", "forum"),
    signal("https://jobs-site.test/jobs", "Budget: $600 per month, fixed price, long term.", "job_board"),
    signal("https://board-site.test/regulator", "Records must be retained for three years and produced to the Board within ten business days of a request", "regulator"),
    signal("https://qa-site.test/thread-2", "reconciling the remits by hand eats a whole weekend every month for store number 2", "qa"),
    ...ending("recorded four signals"),
  ] });
}

/** A card the scripted scout submits for a niche; every claim on it is a fixture page. */
export const scriptedCard = (nicheId: string, name: string) => tool("cofactory_submit_card", {
  niche_id: nicheId, name, headline: `${name}: the monthly report one-store pharmacies need, done for them`,
  price_today: { url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month, fixed price, long term.", amount_cents: 60_000, per: "month", kind: "job_post_budget" },
  offer: { price_cents: 15_000, per: "month" },
  rival: { name: "RemitCheck Enterprise", url: "https://vendor-site.test/pricing", what_they_miss: "sells software to chains of 25+ stores; one-store owners still do the work", price_cents: 4_900 },
  example_buyer: { name: "Riverside Pharmacy 1", url: "https://buyers-site.test/buyer-1" },
  risks: { licensed_advice: false, regulated_claims: false, notes: "" },
});

/** The names the three scripted niches' cards carry, strongest niche first. */
export const CARD_NAMES = ["Riverside Recon", "Appeal Desk", "Binder Keep"] as const;

export interface ShownCard { card: { id: string; nicheId: string; status: string; body: { name: string } } }

/**
 * After the factory opens: three niches on the scout's signals, the search closed, and a card for each; each niche's
 * full dossier is scripted too, for whichever the owner starts. Resolves once all three cards are ready.
 */
export async function searchToCards(factory: ScriptedFactory): Promise<{ niches: string[]; cards: Record<string, ShownCard["card"]> }> {
  const { call, until, routes } = factory;
  const signals = await until("four signals", async () => {
    const found = (await call("GET", "/api/cofactory/discovery")).signals as Array<{ id: string }>;
    return found.length >= 4 ? found.map((signal) => signal.id) : null;
  });
  const input = ((await call("GET", "/api/cofactory/settings")).profile.inputs as Array<{ id: string; field: string }>).find((item) => item.field === "domains")!.id;
  const niche = (job: string, ids: string[], extra: Record<string, boolean>) => tool("cofactory_propose_niche", {
    buyer: "independent pharmacies in Ohio", job, channel: "association forum", signal_ids: ids, unique_input_ids: [input], boring: false, cross_field: false, ...extra,
    why_gap: "Vendors sell software seats needing an analyst; one-store owners need the finished monthly report instead.",
  });
  routes({ "Factory scout ·": [
    niche("monthly DIR fee reconciliation report", signals, { boring: true }),
    niche("PBM audit appeal letters", signals.slice(0, 3), { cross_field: true }),
    niche("board records binder upkeep", signals.slice(1), {}),
    ...ending("proposed three niches"),
  ] });
  const niches = await until("three niches", async () => {
    const found = (await call("GET", "/api/cofactory/discovery")).niches as Array<{ id: string }>;
    return found.length >= 3 ? found.map((item) => item.id) : null;
  });
  // every niche's card and full dossier are scripted before the search closes, so each finds its research ready
  routes({
    ...Object.fromEntries(niches.flatMap((id, index) => [
      [`cofactory_submit_card (niche_id ${id})`, [scriptedCard(id, CARD_NAMES[index]!), ...ending("submitted the card")]],
      [`cofactory_submit_dossier (niche_id ${id})`, [tool("cofactory_submit_dossier", { niche_id: id, dossier: goodDossier() }), ...ending("submitted the dossier")]],
    ])),
    "Factory scout ·": [tool("cofactory_close_batch"), ...ending("closed the search")],
  });
  const shown = await until("three ready cards", async () => {
    const cards = (await call("GET", "/api/cofactory/cards")).cards as ShownCard[];
    return cards.filter((entry) => entry.card.status === "ready").length >= 3 ? cards : null;
  });
  return { niches, cards: Object.fromEntries(shown.map((entry) => [entry.card.body.name, entry.card])) };
}

/** The owner's Start on a card; resolves with the company once its full dossier holds up and it launches. */
export async function startFromCard(factory: ScriptedFactory, cardId: string): Promise<{ id: string; name: string; brief: string }> {
  const started = await factory.call("POST", `/api/cofactory/cards/${cardId}`, { decision: "start" });
  if (!started.ok) throw new Error(`Start was refused: ${started.error}`);
  return factory.until("the company to launch", async () => {
    const card = ((await factory.call("GET", "/api/cofactory/cards")).cards as ShownCard[]).find((entry) => entry.card.id === cardId)?.card as { companyId?: string } | undefined;
    if (!card?.companyId) return null;
    return ((await factory.call("GET", "/api/cofactory/state")).companies as Array<{ id: string; name: string; brief: string }>).find((company) => company.id === card.companyId);
  });
}
