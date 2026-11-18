# Cofactory — End State

Drop in a budget and a goal. A factory of specialized bots launches companies, goes to market early, reallocates to
winners, and kills losers — acting alone inside hard caps. Cofactory is the business harness on top of DuskBot, not a
rewrite of it.

## Vision

You put in $100 and a goal like "~$10k/month, fully autonomous." The factory goes to work: it picks ideas, launches
companies, sells as soon as there is something to sell, moves money toward what works, and shuts down what does not —
without asking you to approve every action.

Cofactory is our harness layer on top of DuskBot. DuskBot stays the agent runtime (persistent bots, memory, computers,
tools, routines). We stay separate: company templates, factory and specialist roles, stage machine, wallet,
business-oriented onboarding, and — later — the public share model. A public release needs a written license from
dusk.bot; until then we layer on official DuskBot and test on your own hustles, starting with Selltraces as a supplier.

- **Input:** a fixed budget (for example $100) plus goals. Cloud workspace by default, so the factory keeps working when
  your laptop is shut.
- **Autonomy:** bots act alone inside hard spend and sending caps. You are pulled in only for gated steps: KYC, legal
  attestations, new account verification, and anything outside policy.
- **Factory job:** actively launch new companies, reallocate to winners, kill losers, and reinvest profit into the next
  launch.
- **Company job:** follow one shared template: build → design → market → sell → manage/monitor. Market and sell early.
  Tools unlock per stage. Advance or kill on metrics, not vibes.
- **First test:** your hustles. Selltraces as a supplier first — not a marketplace clone, and not the higher-risk ideas
  until they clear legal and autonomy.

## User experience end to end

DuskBot onboarding is built for a general assistant. Ours is built for someone who wants companies started. The owner
should feel a deposit and a dashboard, not a blank chat with a helpful bot.

1. **Welcome** — one screen: you fund a factory, it launches and runs companies toward your goal, you watch them as cards.
2. **Account** — create the Cofactory account: the legal owner of the factory and the person share terms will bind later.
3. **Cloud by default** — the factory lives on a hosted, always-on workspace. Local or self-host is an advanced option.
4. **Import what you know** — skills, standing instructions, a network (audiences, inboxes, lists), and assets (domains,
   repos, brands, existing products).
5. **Budget and goals** — deposit size, revenue target (default ~$10k/month per company or for the portfolio — to
   confirm), and the autonomy bar: bots run it after one-time gates.
6. **Fund the wallet** — $100 in. The deposit is the factory wallet, covering intelligence (model tokens), infra, and
   distribution — not ads alone.
7. **Connect business rails once, KYC up front** — Stripe, domain registrar, email, socials, a deploy target (e.g.
   Vercel). Identity and business verification once, so bots fill saved logins later instead of inventing accounts.
8. **Seed ideas, or let the factory pick** — a backlog (Selltraces supplier, the rest when cleared) or the scout
   proposes. The factory launches only what fits budget, autonomy, and legal policy.
9. **Factory dashboard** — a board of company cards: name, stage, spend vs cap, revenue, next milestone, kill-or-advance
   recommendation. Chat is still there; the board is the home screen.
10. **Phone pairing** — standups, spend alerts, kill-switch notices, and the rare gated card land on your phone.

A typical week: glance at the board, answer any cards, maybe top up or freeze a company, read a short standup. The
factory starts the next company when budget allows.

## Factory capabilities

A small standing team, not one mega-bot. The lead owns the portfolio; specialists research, launch, and audit, and
review each other before money moves or a company goes live.

Flow: Owner → (deposit + goals) → Factory lead; lead ↔ Scout (find/score, pick or veto); lead → Launcher (allocate $);
Launcher → Company CEO + specialists (brief + cap); Company → Auditor (evidence); Auditor → lead (advance / kill /
reallocate); lead → Owner (escalate).

| Role | Owns | Does not do |
|---|---|---|
| Lead | Portfolio policy, who gets budget, when to launch or kill, owner escalation | Day-to-day building or outreach for a single company |
| Scout | Idea backlog, scoring, one-page briefs, post-mortems fed back into scores | Spending the company wallet or creating companies on its own |
| Launcher | Creating the company team from the template, allocating the cap, attaching rails, unlocking the first tool pack, handing the brief | Picking the idea or declaring a stage advanced |
| Auditor | Spend vs cap, stage metrics, traces, review sign-off, advance/kill/reallocate recommendations | Running the company or moving money without lead approval |

- **Pick:** score on autonomy, time-to-first-dollar, path to ~$10k/month, budget fit, legal/ToS risk, existing assets.
  High risk is a veto, not a debate.
- **Launch:** only when unallocated funds clear a minimum launch stake. Spawn a company team, set a hard sub-wallet,
  unlock Build tools, start the clock.
- **Reallocate:** frozen remainder from a killed company, plus profit, returns to unallocated. Winners can get a top-up
  after a selling signal. Losers do not keep idle cash.
- **Kill:** on metric fail, cap hit, legal flag, or stall. Wallet freezes, routines pause, outbound stops. The
  post-mortem updates the scout's scores.
- **Reinvest and launch again:** if stake remains and a scored idea is ready, start the next company without waiting.

## Company bot capabilities

Each company is its own team under a CEO, created from one shared template. Seller and operator join when demand
appears (starting rule: first qualified inbound or first paid conversion).

| Role | When | Job |
|---|---|---|
| CEO | Always | Runs the stage machine, sets priorities, reports to the factory lead, requests budget; cannot launch peer companies |
| Builder | Always | Ships the thinnest path from a stranger to money (or a fully instrumented lead) |
| Marketer | Always | Gets the offer in front of real people cheaply and measures it; reviews the builder's launch for convertibility |
| Seller | When demand appears | Closes, invoices, collects, hands off fulfillment; reviews pricing, refunds, outreach claims |
| Operator | When demand appears | Inbox, uptime, fulfillment, books, weekly metrics; reviews support quality and cost |

Default posture: short build, thin design pass in parallel, straight into market and sell. More building only after a
selling signal. A launch is not live until marketer and auditor have looked; outbound copy and pricing get a review
before spending reputation or money; the CEO cannot advance a stage without evidence the auditor can check.

| Stage | Goal | Advance when | Kill when |
|---|---|---|---|
| Build | A named offer and one unattended path to payment or a tracked lead (live page, capture, rails) | A stranger can complete the path; the bot can see the event (webhook, form, mailbox) | Path not working after the time box, burns > ~40% of company cap, or fulfillment needs you against the brief |
| Design | Trustworthy enough to convert: copy, simple visual system, previews | Copy and a coherent page are live (can finish with Build) | Never alone; only if it delays Market > 48 h |
| Market | Offer in front of real people, attention measured | Selling signal: qualified inbound, or a small tracked test with a documented result (incl. a clean no) | After the time box (e.g. 7 days or 30% of remaining budget on distribution) no attention and no learning worth a second test |
| Sell | Close, collect, fulfill, record revenue | First revenue, or a repeatable motion documented after N attempts | Can't fulfill without you, unit economics fail, or refunds/chargebacks unacceptable |
| Manage / monitor | Keep it running, improve the one funnel, or recommend kill/budget/related offer | Stay while revenue or a leading indicator grows inside the cap | A set window (e.g. 14 days) with no revenue and no pipeline, a legal/ToS flag, or no plausible path to the goal |

## Comms framework

Typed messages, against shared company state, under a single human owner, with reviews and full traces.

- **Every message carries:** a type (`assign`, `consult`, `review`, `report`, `escalate`, `advance`, `kill`,
  `budget_request`, `rework`); ids (company, stage, assignment, parent, budget authorization if money is involved); a
  standalone brief (goal, already known, done_when, constraints); an explicit reply policy (resume requester, report
  only, one-way notice).
- **Authority:** shared company state is the source of truth (offer, stage, metrics, ledger, assets, accounts, open
  reviews). Single owner: you. Escalation: specialist → CEO → factory lead → you. Review loops accept or rework with a
  concrete correction; unreviewed outbound and spend do not go out. Full traces of messages, tool calls, spend, and
  decisions are replayable.
- **Protocol, to evaluate:** near term on DuskBot's runtime (assignments, coordinate_bots, rooms) plus our own MCP tools
  for wallet, stage, and state. Before a public multi-tenant release, evaluate Google's A2A for agent identity, task
  lifecycle, and artifacts, keeping MCP as the tool and rails layer.

## Money layer

The deposit is a factory wallet with a hard ceiling; company wallets are hard sub-caps. Acting alone means authorized,
in-budget actions do not wait for a tap — not that a bot can outrun the cap or skip KYC.

| Bucket | On a $100 deposit | Rule |
|---|---|---|
| Factory reserve | $20 | Lead intelligence, retries, emergencies; not a slush fund |
| First company cap | $40 | Hard stop; one company never gets the whole deposit |
| Unallocated | $40 | Second launch or a top-up after a selling signal; launch only above a minimum stake (~$25, configurable) |
| Profit and leftovers | → unallocated | Killed companies surrender unused cash; revenue can be reinvested under the same caps |

| Category inside a company cap | Examples | Notes |
|---|---|---|
| Intelligence | Model tokens | Wire DuskBot's AI spend cap to this sub-cap |
| Infra | Domain, DNS, host, email | Prefer cheap/free hosting for a first test |
| Distribution | Ads, boosts, lists | Default $0 until a sell signal |
| COGS and fees | Stripe fees, APIs, fulfillment | Inside a gross-margin target |
| Gated | Anything that still needs you | Logged, never auto-spent |

- A Wallet service is the only spender of record for non-AI costs: quote, authorize, capture, refund, balance, ledger.
  Buy tools fail closed without an authorization.
- Outbound email, posts, and payments have a daily count cap. Start tight, or ask-every-time, until a sending policy is
  saved for that company.
- Kill switch: freeze wallet, pause routines, stop outbound. Triggers: cap hit, kill criteria, legal flag, owner
  command, stall.
- Append-only audit: time, company, category, vendor, amount, remaining, actor, receipt. Exportable.
- A $100 test proves the loop (pick, launch, market, measure, kill or continue); it is not expected to hit $10k/month.

## Rails and tools by stage

Rails are connected once at onboarding and reused. Tool packs unlock as stages advance. Company bots never get factory
tools (launching companies, master wallet, share ledger).

| Stage | Unlocked | Still gated |
|---|---|---|
| Build | Browser, shell, files, saved-login fill, domain/DNS, Vercel (or similar), email, GitHub, Stripe test then live after KYC, webhooks, form/marketplace APIs (e.g. Selltraces CLI) | First live Stripe, first registrar session if not saved, any new vendor signup |
| Design | Image tools, page and social previews, light copy and layout | Paid design tools on a small stake |
| Market | Social post and search, capped email outreach, analytics, listings; ads only with a pre-approved ads wallet and business account | First post from a personal account under ask-every-time; first ads account; no undeclared bot accounts |
| Sell | Stripe checkout, invoices, capped refunds, mailbox, calendar, CRM-lite in company state | Refunds above a threshold, custom contracts, non-standard terms |
| Manage | Routines, inbox triage, uptime, analytics, factory reporting | Sending policy still caps volume; legal flags escalate |

## Safety and trust

- **Pre-provisioned accounts only.** Bots use fill_login on rails you connected; no undeclared accounts in your name.
- **KYC and legal attestations are yours.** A bot must not click "I agree" or "I am a US resident" for you.
- **Payments stay on your rails.** Customer money goes through your KYC'd Stripe. No bot-owned bank account in v1.
- **Sending is capped and authenticated.** SPF, DKIM, DMARC; volume caps; no purchased lists in v1.
- **You can always see and stop.** Dashboard, traces, ledger, kill switch. Questions, missing credentials and CAPTCHAs
  surface as cards; do not bypass that.
- **License and legal are part of safety.** Running real businesses on DuskBot is commercial use and needs a dusk.bot
  work license; shipping Cofactory publicly or taking a share needs a written modify/distribute agreement. High-risk
  ideas are scout vetoes until counsel clears them.

## Success metrics

- **~$10k/mo company goal** — fully attended by bots except gated actions; a filter for ideas, not pass/fail for $100.
- **First-test bar: loop, not luck** — pick → live offer → a real market action → go or kill with a post-mortem, inside
  the cap.
- **Autonomy bar: owner time** — hours per week collapse to cards and standups.

| We measure | Why |
|---|---|
| Time to a live offer; time to first dollar (or a documented no) | The template reaches market fast |
| Cap integrity: no silent overrun, every spend in the ledger | Trust in act-alone mode |
| Share of actions that needed you, and why | Which gates to pre-clear vs which are inherent |
| Kill quality: killed companies actually dead; survivors earned their top-up | The factory's judgment, not its activity |
| Revenue, refunds, contribution after fees, cash left to reinvest | The portfolio is a financial object |

## Public business model

Anyone can run a factory. Cofactory takes a revenue share, equity, or both in the businesses those factories start:
terms accepted at launch, money collected on a real rail (e.g. Stripe Connect), both sides can export the ledger.
Stopping a bot does not void earned share. Not shipped until the dusk.bot license and counsel are in place. The factory
is the launcher of record, so share terms attach at company creation. Equity is a legal instrument software cannot mint.
Your own tests need no share split, but do need a clean ledger.

## Open questions

1. License path: layer on official DuskBot and ask dusk.bot for an OEM or modify/distribute license before any public
   release — confirmed?
2. Does the $100 deposit include model-token spend, or is intelligence billed separately? **Answered: neither. Model
   use is Cofactory's cost; the deposit is for real-world spend only.**
3. Which rails are pre-connected for the first test (Stripe live KYC, registrar, email, socials, Vercel/GitHub)?
4. Sending policy on day one: ask every time, or a small daily allow cap?
5. Is ~$10k/month a per-company goal, a portfolio goal, or an idea-selection filter only?
6. When exactly do seller and operator join? First qualified inbound, first payment, or factory judgment?
7. How many companies may be live at once on a small deposit?
8. Public take: revenue share, equity, or both — and who legally owns a company the factory starts for a user?
9. Cloud by default: host Cofactory cloud, use dusk cloud, or wrap either behind our account?
10. Comms: A2A, a DuskBot-native contract, or bridge both?
11. Confirm the Phase 3 guinea pig: Selltraces as supplier, other hustles held until they clear autonomy and legal.

References: dusk.bot license · DuskBot source · Agent2Agent (a2a-protocol.org) · Model Context Protocol · selltraces.com.
The spec mentions working notes at `/workspace/cofactory/template-design.md`; that file is not on this machine.
