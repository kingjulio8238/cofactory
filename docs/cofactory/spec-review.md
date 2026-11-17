# Cofactory spec review: fit against the code, and what to change

Reviewed against this fork (dusk bot 0.2.15) and upstream OpenMausBot (`85461af`, 2026-11-17). Spec:
[end-state.md](end-state.md).

## Decisions (2026-11-17)

- **Runtime:** extend this dusk bot fork directly, keeping dusk's UI as the starting point. Upstream OpenMausBot was
  evaluated and works (a real Claude turn replied), but was not chosen. Licensing is deferred by the owner.
- **Intelligence:** runs on the owner's subscription, with API-equivalent cost recorded as shadow spend in the ledger.
- **Real-dollar caps:** a virtual card per company, with its limit enforced by the card network. The kill switch
  freezes the card.

## What the runtime already gives you (verified in code)

| Spec relies on | dusk fork | OpenMausBot (Apache) | Where |
|---|---|---|---|
| Persistent bots, memory, computers, routines, webhooks | yes | yes | `server/routines.ts`, `server/memory-*.ts`, `server/webhooks.ts` |
| Bot-to-bot work: assignments, `coordinate_bots`, rooms | yes | yes | `server/runtime/runtime.ts`, `server/runtime-coordinator.ts`, `server/room-*.ts` |
| Saved-login fill without the bot seeing secrets | yes | yes | `server/login-fill.ts`, `server/secret-vault.ts` |
| Questions, missing credentials, CAPTCHAs as cards | yes | yes | `server/runtime/questions.ts`, `server/host/human-check-watch.ts` |
| Daily outbound count cap per bot | yes (default 25/day at Full access) | **no** | `server/outbound-hold.ts`, `shared/outbound.ts:15` |
| Headless control: `duskbot team apply <yaml>`, jobs, wait | yes | yes | `docs/headless-cli.md` |
| External MCP control surface, per-bot Bot API, custom MCP servers per bot | yes | yes | `docs/mcp-server.md`, `docs/bot-api.md`, `docs/custom-mcp-servers.md` |

## What the spec assumes that is not there

- **"Wire DuskBot's per-bot weekly AI spend cap to the sub-cap."** dusk does have per-bot and per-routine weekly
  dollar caps (`server/spend.ts`). They count only priced usage rows, pause new work after the turn that crossed the
  cap, and reset weekly rather than holding a fixed company budget. There is also one account-wide weekly allowance
  (`server/allowance.ts`). On subscription engines the price is an API-equivalent estimate (`total_cost_usd`), not money
  spent. Cofactory now records that estimate per seat as shadow spend (`server/cofactory/host.ts`).
- **Everything business-shaped:** company state, stage machine, wallet, ledger, tool packs per stage, typed messages,
  the board, factory policy. All of this is Cofactory's to build, as the spec says.

## Recommended changes

1. **Hard caps are enforced outside the bots, by the rail itself.** A ledger the bots are asked to honour is a soft
   cap. Give each company:
   - its own payment card with a hard limit (e.g. Stripe Issuing or Privacy.com), and
   - its own model API key with a provider-side spend limit (e.g. an OpenRouter key with a credit limit, or an
     Anthropic Console workspace limit).

   The ledger then reconciles from those sources, and the kill switch is "freeze card, revoke key, pause routines,
   outbound off". This is what makes "acts alone" safe, and it holds even if the harness or a bot misbehaves.
2. **The Launcher and the Auditor are code, not bots.**
   - Launching is deterministic: apply the template, allocate the cap, mint the key and card, unlock the tool pack.
   - Most of the audit is checkable facts: ledger vs cap, and stage evidence as machine events (a Stripe payment
     webhook, a form submission, a mailbox reply).
   - An LLM auditor grading LLM workers is "vibes" again. Keep models for the scout, the lead's judgment calls and
     post-mortems.
   - Result: two standing factory bots instead of four, which is cheaper and harder to fool.
3. **Typed messages are typed by construction.**
   - State-changing messages (`advance`, `kill`, `budget_request`, review verdicts, `assign` with a budget) become
     tool calls on the Cofactory MCP server, with schemas the service validates and records.
   - Free-form chat stays for discussion, and the trace is the service's event log.
   - **Skip A2A for v1.** It solves interop across vendors' agents, and every agent here lives in one harness.
     Revisit only if outside agents need to join a factory.
4. **Build Cofactory inside dusk, in its own directories with thin hooks.**
   - The code lives in `server/cofactory/`, `shared/cofactory/` and `src/cofactory/`. Company state, the stage
     machine, the ledger and wallet, and factory policy all go there.
   - Bots reach it through one MCP server they mount. The board is a dusk screen.
   - dusk's own files change only at the hook points (route registration, tool mounting, the sidebar and home screen),
     so the fork can keep pulling dusk upstream.
5. **Intelligence budget.** A $40 company cap does not survive an API-billed Build stage of agentic coding.
   - For your private tests: run on your own subscription, and record API-equivalent cost as shadow spend in the
     ledger, so kill-quality metrics still see it.
   - The real-dollar wallet covers infra, distribution and COGS.
   - Public release: metered per-company keys, as in (1).

## Defaults I'd take on the open questions (no decision needed unless you disagree)

| # | Default |
|---|---|
| 4 | Ask every time until the first reviewed outbound batch, then a small per-company daily cap |
| 5 | ~$10k/month is an idea-selection filter, not a per-company pass/fail |
| 6 | Seller joins on the first qualified inbound; operator on the first payment |
| 7 | One live company until it reaches Sell or is killed; a second only if the minimum stake remains |
| 9 | Self-host the harness on your own VPS (`deploy/docker`); never dusk cloud (that is dusk's paid business) |
| 10 | Cofactory-native contract over MCP; A2A later, only for outside agents |
| 8 | Legal; parked until counsel |

## Build stages (by dependency)

1. **Base and repo shape:**
   - Choose the runtime.
   - Lay out Cofactory as its own package that talks to the runtime only through public surfaces.
   - Set up a fake-engine fixture for tests (`scripts/control-dusk.ts launch`).
2. **Company core:**
   - company state, stage machine, append-only ledger
   - the Cofactory MCP server with typed message and stage tools
   - one company template (CEO, builder, marketer) applied headlessly
3. **Hard caps and the kill switch:** a per-company model key and card, ledger reconciliation, freeze and revoke.
4. **Factory:** scout and lead bots, launcher and auditor as code, the board UI.
5. **First live test:** Selltraces as a supplier, on pre-connected rails.
6. **Owner funnel:** onboarding, always-on hosting, phone cards.
