import { join } from "node:path";

import { FACTORY_ROLES, type Membership } from "../../shared/cofactory/types.ts";
import { openBook, type Book } from "./book.ts";
import { openTruth, type Truth } from "./truth/store.ts";
import { COFACTORY_INSTRUCTIONS } from "./instructions.ts";
import { runTool, toolsFor, type ToolResult } from "./tools.ts";

export const COFACTORY_INTERNAL_MCP_PATH = "/api/internal/cofactory/mcp";

export interface CofactoryHostDeps {
  dataDir: string;
  proxy: { command: string; script: string; env: Record<string, string> };
  harnessUrl: () => string;
  tokenEnv: string;
  /** A turn-scoped capability for `botId`, kind "cofactory". */
  mint: (botId: string, turn: { threadId: string; generation: string }) => string;
}

export function createCofactoryHost(deps: CofactoryHostDeps) {
  let book: Book | null = null;
  let truth: Truth | null = null;
  const books = (): Book => (book ??= openBook(join(deps.dataDir, "cofactory.db")));
  const evidence = (): Truth => (truth ??= openTruth(join(deps.dataDir, "cofactory-evidence")));
  const seatOf = (botId: string): Membership | null => books().membership(botId);

  return {
    books,
    evidence,

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
      const result = await runTool({ book: books(), truth: evidence(), seat, actor: `${seat.role}:${ctx.botName}` }, params.name, params.arguments);
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
      book?.close();
      truth?.close();
      book = null;
      truth = null;
    },
  };
}

export type CofactoryHost = ReturnType<typeof createCofactoryHost>;
