# How dusk bot was built

A survey of this fork as of `76735c020` (dusk bot 0.2.15), written as the starting point for cofactory.

## Provenance and licence

- **Base:** `milind-soni/OpenMausBot` at `e7317a7`, imported whole on 2026-11-05 (commit `ddadba1c9`, 6,451 files:
  server, Electron shell, React UI, docs). The core architecture below predates dusk.
- **dusk's additions:** the grok-style skin and motion, dusk cloud and accounts with billing, the
  VPS link and relay, mobile and companion apps, the admin dashboard, the marketing site, and release tooling.
- **Pace:** 2,984 commits in 10 days (2026-11-05 to 11-14), almost all by one developer. 2,675 carry
  `Co-Authored-By: Claude Opus 5.5`, and about 1,860 trace back to two Claude Code sessions. Diff since the import: +812k / −299k lines.
- **Size now:** about 650k lines of source and about 500k lines of tests (server 253k, src 158k, electron 99k, apps 76k, scripts 46k, shared 20k).
- **Licence:**
  - **dusk's code:** [PolyForm Noncommercial 1.0.0](../../LICENSE), so commercial use needs a licence from dusk.bot.
  - **OpenMausBot:** the original code stays Apache 2.0 ([NOTICE](../../third_party/openmausbot/NOTICE)). Upstream is still active (24k stars, last pushed 2026-11-17).
  - **Trademarks:** "OpenMausBot"/"MausBot" and the mascot are trademarks; neither licence grants rights to them.

## Shape

```
Electron shell (electron/, plain .mjs)       React 19 + Vite 7 + Tailwind 4 UI (src/)
  │ forks as utility child, passes env           │ REST /api/*, SSE /api/events, WS for screen streams
  ▼                                              ▼
Harness server (server/, plain Node, TS type-stripping, no framework) on 127.0.0.1:8799
  registry → driver instances → agent CLIs (claude, codex, gemini, …) → canonical events → bus → store + SSE
  data: ~/.duskbot (JSON files + node:sqlite messages.db + per-thread NDJSON event logs + per-bot DuckDB)
```

## Server (`server/`, `shared/`)

- **Driver SPI:** [`server/contracts.ts`](../../server/contracts.ts) is the whole architecture.
  - `ProviderDriver` (L580) builds a `ProviderInstance`.
  - `ProviderAdapter` (L229) holds `sendTurn`, `interruptTurn`, `respondToRequest` and `onEvent`, plus a `capabilities` block that says which MCPs a driver can mount.
  - Canonical events live in `shared/runtime-events.ts` (`turn.*`, `item.*`, `content.delta`, `request.opened/resolved`, …).
- **Drivers:** registered in `server/drivers/builtIn.ts`.
  - **Claude:** `claude.ts` keeps one retained `claude` process per thread and speaks stream-json both ways.
  - **Codex:** `codex.ts` uses `codex app-server` JSON-RPC with a warm pool.
  - **ACP family:** `acp/core.ts` covers Gemini, Grok, Kimi, Cursor, OpenCode, Qwen, Copilot, ….
  - **API drivers:** OpenAI-compatible and others.
  - **Spawning:** every spawn goes through `server/procs.ts` (optional bubblewrap sandbox).
  - **Effect:** bots run on the user's own CLI subscriptions; the harness never holds model keys.
- **Turn path:**
  1. `server/routes/bot-messages.ts` calls `beginTurn` (`index.ts:8437`).
  2. `beginTurn` builds the prompt and `integrations`, then calls `adapter.sendTurn`.
  3. `server/harness/bus.ts` fans events in, merges deltas every 50 ms, redacts secrets, and appends them to `~/.duskbot/events/<thread>.ndjson`.
  4. About 20 subscribers in `index.ts` fold events into stored messages and `broadcast()` them over SSE.
- **Tools reach bots as MCP servers the harness mounts per turn:**
  - browser (`server/browser/`, agent-browser)
  - computer use (`@trycua/cua-driver`; local, container or VPS computers)
  - peer bots (`agents-mcp.ts`)
  - Composio
  - user MCPs (with OAuth handled by the harness)
  - a vault (`secret-vault.ts`, `saved-secrets.ts`, AES-GCM with the key in the OS keychain)
- **Approvals:**
  - Levels are `ask|edits|auto|full|custom` (`shared/approval-mode.ts`), mapped onto each CLI's permission mode.
  - Claude's asks route through `--permission-prompt-tool mcp__dusk__approve` to `permission-proxy.ts`.
  - Asks become chat cards (`request.opened`).
- **Memory:**
  - Each bot keeps a `MEMORY.md` plus topic files.
  - Background capture, "dream" and tidy jobs maintain them.
  - Recall fuses FTS5 BM25 and local embeddings (`memory-recall.ts`).
- **Routines and webhooks:** `routines.ts` schedules with croner; webhooks start routine runs and mark their payload untrusted.
- **Rooms** ("groups" in code): `room-*.ts`, with LLM routing in `decider/room-routing.ts`.
- **Trust:** `server/request-auth.ts`.
  - Loopback owner vs paired sessions.
  - Browsers never get loopback trust.
  - Mutations from the desktop need an `x-dusk-desktop-owner` token handed over Electron IPC.
- **MongoDB:** despite `AGENTS.md`, the local harness does not use it. Only the hosted `apps/dashboard` service imports `mongodb`.

## Client (`src/`, `electron/`)

- **UI:**
  - No router and no store library: one `useReducer` god-store (`src/state/store.tsx`, 3.4k lines, about 200 actions) plus about 76 small `useSyncExternalStore` modules.
  - `src/state/api.ts` handles REST; `src/lib/live-events.ts` holds the SSE client.
  - Components: 848 files, mostly flat, in `src/components`.
  - Theming: skins are `[data-skin]` blocks of CSS variables in `src/styles.css`.
  - i18n: hand-rolled, 16 locales.
- **Electron:**
  - `main.mjs` (3.7k lines) is a composition root over about 570 `create*()` modules.
  - It forks the harness with `utilityProcess` and owns the preload bridge `window.duskDesktop` (contract frozen in `electron/bridge-contract.json`).
  - It owns the keychain, deep links (`duskbot://`) and a custom signed auto-updater (`app-update.mjs`).
  - The Mac "notch" is an Electron overlay window, not Swift; the only Swift is the dictation helper.
- **Phone and browser:**
  - The harness serves the built UI itself, and remote browsers pair over `/pair`.
  - `apps/mobile` is Capacitor around `src/mobile/`.
  - `apps/companion` is a LAN sidecar.

## Hosted pieces (`apps/`, `deploy/`): none needed to run locally

| App | Role | Runs on |
|---|---|---|
| `apps/dashboard` | accounts, billing (Dodo), admin, self-hosted analytics, bug reports | Node + MongoDB on a Contabo VPS |
| `apps/cloud-service` | managed per-bot cloud computers | inside dashboard + a Cloudflare Worker |
| `apps/cloudflare/link-relay` | encrypted WS relay app↔VPS | CF Workers + Durable Objects |
| `apps/cloudflare/composio-broker` | hides dusk's Composio key | CF Worker + D1 |
| `apps/link-service` | one-line VPS installer, pairing | plain Node on VPSes |
| `apps/site` | dusk.bot marketing/docs | Node on VPS |
| `deploy/bot-desktop` | per-bot Linux desktop image `ghcr.io/duskbotai/dusk-desktop` | GHCR |

**Endpoints a fork must repoint** (about 246 `dusk.bot` references, many in tests and docs):
- `electron/cloud-account.mjs:10` (`DUSK_CLOUD_ORIGIN`; `scripts/dev-app.mjs:16` defaults dev to preview.dusk.bot)
- `server/update-check.ts:37` (update manifest and the pinned release key)
- `electron/app-update.mjs:17`
- `shared/dashboard-protocol.ts:12`
- `electron/vps-link-main.mjs:29`, `shared/mobile-link.ts:27`
- `electron/managed-composio.mjs:5`
- `shared/bot-desktop.ts`
- the wrangler configs

**Analytics** are self-hosted, run only in packaged builds, and are switched off with `DUSK_ANALYTICS=0`.

## Engineering process (what made 3k agent commits hold together)

- **`AGENTS.md`:** verify on isolated fixtures, never live data, and keep comments only for what code can't say.
- **Verification harness:**
  - `scripts/control-dusk.ts launch` starts a temp-home fixture with fake engines (`server/testing/fake-claude-cli`, `fake-codex-app-server`, …).
  - It is driven through the same MCP tools external clients use ([`docs/verification/README.md`](../verification/README.md)), and it keeps per-feature evidence.
- **Ratchet tests:**
  - `file-size-ratchet.test.ts`: no file over 1k lines may grow.
  - `index-route-ratchet.test.ts`: new routes go in `server/routes/*` factories.
  - Vocabulary and locale checks.
- **Other gates:**
  - visual baselines (`pnpm ui:baseline`, light/dark × sizes)
  - oxlint `--deny-warnings`
  - pre-push hook on changed files
- **CI:**
  - vitest sharded by recorded duration across macOS, Linux and Windows
  - offline behaviour evals (`evals/`)
  - a flake retry list
- **Release:**
  1. `prepare-release.yml` bumps the version.
  2. `release.yml` signs and notarizes on Mac and builds NSIS for Windows and deb/AppImage for Linux.
  3. It writes an Ed25519-signed `latest.json` and `SHA256SUMS`, then drafts a GitHub release.
  4. `scripts/publish-downloads.sh` publishes to `DuskBotAI/duskbot-releases` and dusk.bot.

## Gotchas

- **The server runs on Node type stripping:** a type-only import without `import type` passes `tsc` and crashes at boot.
- **`server/index.ts` is 16.7k lines** of wiring, subscribers and `beginTurn`. Read `contracts.ts` and `harness/` first.
- **Branding is everywhere:** `DUSK_*` env, `x-dusk-*` headers, `~/.duskbot`, `bot.dusk.app`, `duskbot://`, `window.duskDesktop`, plus legacy `~/.opengrokbot`.
- **First-run test-bot seeding can 403** on a cold start. It is a race with the desktop owner token reaching the harness; restarting the harness after deleting `~/.duskbot-test-bots/first-run-*.json` seeds them.
