# Cofactory roadmap: layers and stages

This is the living reference for what is built, what each stage is for, and how each one is proven done. Update a
stage's row and its section when its status changes. The rules behind the pipeline are in
[pipeline-roadmap.md](pipeline-roadmap.md); the research behind them is in [research/pg/](research/pg/).

**Order:** foundations first, then the pipeline, then product.
- Every gate reads evidence from the world, so the truth layer and evals come before any capability.
- Persistence is proven on fake engines before a real multi-day run.
- Each stage's real output becomes the next stage's eval input.
- Polish waits for real runs.

| Layer | Stage | Status | Exit gate |
|---|---|---|---|
| Foundations | [F0 Books and control](#f0-books-and-control) | Done | 18 unit tests plus a fixture run where a bot's engine calls the tools |
| Foundations | [F1 Truth layer](#f1-truth-layer) | Done | Hand-made true/false claims and events are classified correctly |
| Foundations | [F2 Eval harness](#f2-eval-harness) | Done (core) | Runs in one command; flags a planted regression |
| Foundations | [F3 Runtime and persistence](#f3-runtime-and-persistence) | Done | A fake-engine company survives kills, restarts and a multi-day simulated run with no zombie state |
| Foundations | [F4 Observability](#f4-observability) | Done | Every gate decision is traceable to its evidence and its cost |
| Pipeline | [P1 Discovery](#p1-discovery) | Done | Signals 100% verified; divergence under the ceiling across 10 simulated profiles |
| Pipeline | [P2 Dossiers and scoring](#p2-dossiers-and-scoring) | Done | Claim verifier ≥ 95%; adversarial Q&A; post-cutoff rediscovery baseline |
| Pipeline | [P3 Offer and validation](#p3-offer-and-validation) | Built; the real sprint waits on the owner's rails | One real sprint completed inside its cap, gates fed by real events |
| Pipeline | [P4 First dollar](#p4-first-dollar) | Built; the live gate waits on the P3 rails | First arm's-length dollar, or a clean, post-mortemed kill |
| Product | [X1 Owner experience](#x1-owner-experience) | Not started | The owner runs a full cycle from cards alone |
| Product | [X2 Hard rails and scale](#x2-hard-rails-and-scale) | Not started | Calibration and divergence hold across ≥ 3 owner profiles |

## Foundations

### F0 Books and control

**Why:** money and authority have to be exact before anything acts alone.

- **Built:**
  - `server/cofactory/book.ts`: one SQLite file holding companies, an append-only ledger, spend holds, stage events,
    seats and typed messages.
  - `server/cofactory/stages.ts`: evidence-gated stage moves and the auditor's code rules.
  - `server/cofactory/tools.ts`: per-seat MCP tools.
  - `server/cofactory/host.ts`: mounts the tools for seated bots and records shadow cost.
  - `server/routes/cofactory.ts`: owner routes.
- **Proof:**
  - `server/cofactory/*.test.ts`.
  - A fixture run where a seated bot's engine called status, hold, refused distribution spend, sent a typed report,
    and was refused a lead-only tool.

### F1 Truth layer

**Why:** every gate reads the world, not agent prose. If the evidence is weak, every later stage passes on fake
progress.

**Scope:**
- An evidence store: fetched page snapshots with hashes (content-addressed).
- Claim verification: does the link resolve, does the quote appear on the page.
- External-event intake, idempotent by source and external id.
- Evidence classes: committed > urgent > hypothetical.
- Arm's-length payment checks: unrelated payer, ≥ 50% of list price, not test mode, not refunded.

**Proof:** the F2 suites for quotes, evidence classes and arm's length all pass.

**Built:**

| File | What it does |
|---|---|
| `shared/cofactory/evidence.ts` | Wire types: snapshot, claim verdicts, external events, evidence classes, the arm's-length context |
| `server/cofactory/truth/text.ts` | The visible text of a page (scripts, styles and comments dropped) and quote matching. Matching ignores case, curly quotes, dashes and spacing. An elided quote needs every part in order, each at least 3 words. |
| `server/cofactory/truth/store.ts` | The evidence store (`<data>/cofactory-evidence/`). Fetches go through dusk's SSRF-guarded fetch, snapshots are kept by sha256, claim checks are append-only, and events are recorded once per (source, external id). Refunds link to their payments in either arrival order. |
| `server/cofactory/truth/classify.ts` | Evidence classes, where only a payment, deposit or signed order is ever `committed`; arm's-length checks; distinct real payers |
| `server/cofactory/truth/gate.ts` | Stage evidence checked against the world. A URL must load for a stranger. A selling signal must be a recorded event that reads urgent or committed. A repeatable motion must rest on money. |

**Wired into dusk:**
- `cofactory_advance_stage` now refuses evidence that does not check out.
- A new `cofactory_check_claim` tool is open to every seat.
- New owner routes: `GET/POST /api/cofactory/events`.

**Verdicts are kept distinct:**
- `missing`: the page was read and the quote isn't on it.
- `unreachable`: the page could not be fetched.
- `unverifiable`: under 400 characters of text, likely rendered by script.

A page that can't be read is never counted as false, and never as true.

**Proof:**
- `server/cofactory/truth/store.test.ts`.
- A fixture run where a CEO bot's engine advanced Build → Market on a live URL. It was refused Market → Sell on a "keep me posted" reply (hypothetical), then advanced on "How much for three stores? Send me an invoice" (urgent).
- A redelivered event was recorded once.

### F2 Eval harness

**Why:** evals run through every stage, so the harness exists before the things it measures.

**Scope:**
- Labelled fixtures with no network needed.
- Suites with pass bars.
- A scorecard per run and a run history.
- A regression check against the last passing run.
- One command to run it all.

**Proof:** the harness passes on the real code and fails on a deliberately broken verifier.

**Built:**
- `server/cofactory/evals/harness.ts`: suites, scorecards, the run history, and regression checks against the last
  passing run. A `false_*` or `*_errors` metric counts as lower-is-better.
- `server/cofactory/evals/suites.ts`: three suites, `claims`, `evidence-classes` and `arms-length`.
- Fixtures in `server/cofactory/evals/fixtures/`. The evals use dusk's real guarded fetch with the network swapped
  for fixture files, so the private-address block is exercised too.
- `pnpm cofactory:eval` runs it all; history goes to `~/.cofactory/evals/history.jsonl`
  (override with `COFACTORY_EVAL_HISTORY`).

**Bars:**

| Suite | Bar |
|---|---|
| claims | accuracy ≥ 0.95 and `false_verified` = 0 |
| evidence-classes | accuracy ≥ 0.85 and `false_committed` = 0 |
| arms-length | accuracy = 1 |

**Current run:**

| Suite | Result |
|---|---|
| claims | 20/20 |
| evidence-classes | 28/30 (0.933) |
| arms-length | 12/12, distinct payers right |

**Proof:** `server/cofactory/evals/harness.test.ts`. Planted faults all fail the run: a gullible verifier, a
classifier that turns enthusiasm into a commitment, and an arm's-length check that forgets refunds. A metric that
slips below the last passing run fails even while its bar still passes.

**Known limits, to fix with real data in P3:**
- The reply set is hand-written, and the rule-based classifier misses 2 of its 30 cases:
  - r02, a pricing request phrased politely;
  - p05, a claimed payment in text, which correctly stays non-committed but is labelled urgent.
- Real labelled replies from validation sprints replace this set.
- Later stages add their suites to the same harness.

### F3 Runtime and persistence

**Why:** companies live for weeks. Restart and stall bugs are cheap to find with fake engines and expensive to find
mid-launch.

**Shape: many bounded sessions over durable state, not one long session.** The ULR longrun study (`specialist-index`,
`harness/longrun*.py`, `keepworking.py`) informed this:
- a single 20-hour session cost $970–$1,870 and plateaued at about 3.5 h;
- native CLIs quit early;
- rules kept only in context are lost at compaction.

| Piece | Where | Ported from ULR |
|---|---|---|
| Sessions | `server/cofactory/runtime/sessions.ts` | `keepworking.py` |

A session is one seat's bounded stretch of work:
- `operating`: 45 min.
- `deep`: 3 h.
- `event`: woken by outside events.
- `inbox`: woken by typed messages.

How a session runs:
- It starts with a full envelope: objective, done-when, budget, BRIEF.md, the last 8 journal entries, what woke it,
  and open alarms.
- When the seat's turn ends early, the session is re-entered with a short continue prompt saying how many minutes
  remain.
- The runtime stops it at the time budget (with a 2-min reserve) or the model budget (500 shadow cents).
- It also stops after 5 rounds in a row under 90 s (a seat that only acknowledges), or after 20 rounds.
- The seat ends a session with `cofactory_end_session`: `done`, `waiting` (must name what it waits on and when to
  wake), or `blocked`. This is refused until the session has a journal entry.

| Piece | Where | Ported from ULR |
|---|---|---|
| Journal | `cofactory_journal` tool; `server/cofactory/runtime/store.ts` (append-only table); `JOURNAL.md` in the company folder | `PROGRESS.md` outside history |

- Every session starts from the journal, not from chat.
- A session that ends without the seat writing to the journal gets a runtime entry and an `unjournaled` alarm.

| Piece | Where | Ported from ULR |
|---|---|---|
| Company folder | `server/cofactory/runtime/workspace.ts` → `<data>/cofactory-companies/<id>/` | git-bundle checkpoints |

- `BRIEF.md` holds the standing rules every session reads first, so rules live in files.
- The folder is a git repository committed at the end of every session.
- git is found even on a sealed PATH; without it the folder still works, just unversioned.

| Piece | Where | Ported from ULR |
|---|---|---|
| Restart recovery | `sessions.recover()` | `--resume` with "result lost" |

- After a restart, a session that still has time is re-entered with a note that its last action may or may not have
  finished.
- A session with no time left ends as `interrupted`.

| Piece | Where | Ported from ULR |
|---|---|---|
| Zombie sweep | `sessions.sweep()` | server-side lifetime caps |

A session past its budget plus 15 min without settling is interrupted, alarmed and ended.

| Piece | Where | Ported from ULR |
|---|---|---|
| Scheduler | `server/cofactory/runtime/scheduler.ts` | — |

- **Cadence:** one operating session per day for each CEO and for the lead, or at the wake time a `waiting` seat asked
  for.
- **Event wakes:** new outside events for a company wake its CEO, with the events in the prompt.
- **Typed messages:** each message wakes the seat it is addressed to. Every seat has its own cursor, so one busy seat
  never holds back another.
- Every cursor is in the store, so a restart neither skips nor repeats a wake.

| Piece | Where | Ported from ULR |
|---|---|---|
| Heartbeat and alarms | `server/cofactory/runtime/alarms.ts` | heartbeat and the stale board |

| Alarm | Raised when |
|---|---|
| `stalled` | No outside event for 3 days |
| `fake_work` | ≥ 1,500 shadow cents spent since the last outside event |
| `journal_stale` | No journal entry across 2 cadences while sessions ran |
| `unstaffed` | No CEO is seated |
| `zombie` | A session ran past its budget without settling |
| `unjournaled` | A session ended without the seat writing to the journal |

A condition that clears resolves its alarm.

| Piece | Where | Ported from ULR |
|---|---|---|
| Launcher | `server/cofactory/runtime/launcher.ts` | — |

- Launching creates the books, the company folder and BRIEF.md, plus three dusk bots (CEO, builder, marketer) with
  Full access, seated.
- The lead's `cofactory_launch_company` tool uses it, and so does the owner's `POST /api/cofactory/launch`.

**Wiring in dusk:**
- Turns run through dusk's own `startTurn`, unattended, with the automation (untrusted-data) boundary, and
  `onSettled` reports back.
- Each seat works in one task thread per company.
- The runtime starts with the server: it recovers sessions, then ticks every 30 s.
- `COFACTORY_RUNTIME=0` turns it off.
- For simulated runs, `COFACTORY_TICK_MS`, `COFACTORY_CADENCE_MS`, `COFACTORY_SESSION_MS` and
  `COFACTORY_SHORT_ROUND_MS` shorten the clocks.
- Owner routes:
  - `GET /api/cofactory/state`, which now includes live sessions, recent sessions and alarms
  - `GET /api/cofactory/journal`
  - `GET /api/cofactory/sessions/:id`, the session with its event trail
  - `POST /api/cofactory/companies/:id/wake`
- Freeze and kill now cancel the company's running sessions.

**Proof:**
- `server/cofactory/runtime/runtime.test.ts` has 15 tests on a fake clock. They cover:
  - the envelope
  - re-entry
  - the journal gate
  - short-round stop
  - time and model budgets
  - restart recovery
  - the zombie sweep
  - kill
  - cadence and waiting wakes
  - event wakes
  - per-seat message delivery
  - alarms
  - the launcher
  - **a simulated week:** hourly ticks with an outside reply, a typed message and a restart. It ends with no zombie,
    no seat running two sessions at once, every session journaled, 6 or more cadence sessions each for the CEO and
    the lead, one event wake and one message wake.
- Removing the journal gate, the short-round stop or the event cursor each fails a test.
- `server/cofactory/runtime/runtime.e2e.test.ts` runs on a real dusk server with the fake engine:
  1. launch a staffed company;
  2. the CEO's session starts;
  3. the server is **SIGKILLed mid-turn** and started again;
  4. the session is recovered (`restarted` in its trail), re-entered, journaled and completed;
  5. `JOURNAL.md` and the git checkpoint are on disk, with no zombie and no live session left.

### F4 Observability

**Why:** we can't tune what we can't see, and "share of actions that needed the owner" is the autonomy metric.

**Exit gate:** every decision at a gate can be traced to its evidence and its cost.

| Piece | Where | What it does |
|---|---|---|
| Observation log | `server/cofactory/observe/store.ts` → `<data>/cofactory-observe.db` | Append-only decisions at gates, tool calls and owner touches |
| Decisions | `decide()` in `server/cofactory/tools.ts` and the owner routes | Each one carries its evidence and the company's cost at that moment (detail below) |
| Tool calls | `runTool` | Every Cofactory tool call, with seat, session, ok/refused, a result summary and duration |
| Owner touches | owner routes; `observeEvent` on dusk's `request.opened` | Every time the owner acts. Manually relaying an outside event counts too, until webhooks feed events directly. |
| Cost by stage | `server/cofactory/observe/cost.ts` | Model cost and real spend booked while the company sat in each stage, from its own event trail |
| Traces | `server/cofactory/observe/trace.ts` | Session trace and company trace (detail below) |
| Autonomy | `autonomy()` | Seat actions against owner touches per company, with the reasons |
| Ops board | `server/cofactory/observe/board.ts`; `GET /api/cofactory/board` (page, refreshes every 15 s), `board.txt`, `board.json`; `pnpm cofactory:board [--url] [--watch N]` | Factory money, last eval run, one row per company, live sessions, alarms, the last 40 decisions with evidence and cost, and owner share over 7 days. Internal operations, not the product UI (that is X1). |

**Decisions in detail:**
- Covers stage moves, spend holds, charges and voids, launch, top-up, kill, freeze, revenue, seats, deposits, reserve
  and session ends, whether allowed or refused.
- Evidence links resolve in the evidence store or the books: claim check, external event, hold, ledger entry,
  company, session.
- Cost: the company's model cost, real spend and available money at that moment, plus the deciding session's model
  cost.

**Traces in detail:**
- **Session trace:** the session's trail, journal, tool calls, decisions with their evidence looked up, owner touches,
  and cost.
- **Company trace:** one timeline covering the books, ledger, outside world, sessions, journal, decisions and owner,
  plus cost by stage. It also lists every untraceable decision.
- `traceProblem` defines traceable: a cost snapshot is present and every link resolves. An allowed move of a stage or
  money must carry a link (a move to design needs none).

**New routes:**
- `GET /api/cofactory/trace/session/:id`
- `GET /api/cofactory/trace/company/:id`
- `GET /api/cofactory/costs`
- `GET /api/cofactory/decisions`
- `GET /api/cofactory/autonomy`
- `GET /api/cofactory/board`

**Proof:**
- **`traceability` eval suite** (in `pnpm cofactory:eval`): a scripted factory run through the real tools.
  - It produces 16 decisions, 5 of them refused.
  - Bar: 100% traceable, and exactly one decision per gate tool call. Current result: traceable = 1.
  - Removing one tool's decision fails it, and so does pointing a decision at a made-up ledger entry.
- **`server/cofactory/observe/observe.test.ts`:**
  - cost split by stage
  - a decision filed with a claim-check link and its cost
  - company timeline order with nothing untraceable
  - owner share
  - the board in text and HTML, with anything bots or buyers wrote escaped
- **`runtime.e2e.test.ts` extended on a real server:**
  - The session trace holds the seat's real MCP tool calls and decisions, allowed and refused.
  - The company trace has no untraceable decision.
  - The board page and text render.
  - Autonomy reports the owner's launch as the company's one touch.

**A bug the board found:**
- On a default fixture the first operating session ended `interrupted`. dusk fires a turn's settle while its
  conversation is still winding down, so the next round's start was refused with "already working".
- Fix: a refused round start is retried with backoff (0.5–16 s, 6 tries, each logged as `start_retry`) before the
  session is given up.
- Covered by a test. On the fixture, the session now runs its rounds and stops correctly at `short_rounds` for a fake
  seat that only acknowledges, which the board shows as an `unjournaled` alarm.

## Pipeline

### P1 Discovery

**Why:** it is the widest and cheapest stage and feeds everything after it. "Not the same business for everyone" has to
hold from the first candidate.

| Piece | Where | What it does |
|---|---|---|
| Factory profile | `server/cofactory/discovery/discovery.ts` `setProfile`; `POST /api/cofactory/profile` | The owner's own inputs (domains, skills, network, assets, geography, languages, interests), each with a stable id, plus constraints and optional seed niches. At least 3 inputs. |
| Signals | `cofactory_record_signal` (scout) | A verbatim quote of at least 6 words from a public page, with a kind and a source type. It is stored only if the truth layer finds the quote on the fetched page, so 100% of stored signals are verified by construction. Every attempt, refused or not, is a `signal.record` decision linked to its claim check, which makes the model's fabrication rate visible. The same quote is stored once. |
| Niches | `cofactory_propose_niche` (scout) | One buyer × one job × one channel (rules below) |
| Registry | `server/cofactory/discovery/registry.ts` (`<data>/cofactory-registry.db`) | Which factory holds which niche. Candidate claims expire after 30 days unless they go live. The interface is ready for a hosted registry shared across servers. |
| Similarity | `server/cofactory/discovery/similarity.ts` | Weighted token Jaccard over buyer (0.45), job (0.45) and channel (0.1), and token-cosine theme overlap between portfolios |
| Batches | `startBatch` / `closeBatch`; tools `cofactory_profile`, `cofactory_discovery_status`, `cofactory_close_batch`; `POST /api/cofactory/discovery/batches`, `/discovery/close`, `GET /api/cofactory/discovery` | A batch targets 30 niches, with at least 20% boring and 20% cross-field. Closing is refused while it is short. |
| Scout sessions | `wakeForDiscovery` in the scheduler | While a batch is open and short, the scout gets deep sessions (3 h, 3,000 shadow cents) whose prompt carries the owner's inputs with ids, constraints, seed niches and progress. After 4 sessions a batch raises `discovery_stuck` and stops waking the scout. |
| Factory staff | `launcher.staffFactory()`; `POST /api/cofactory/factory/staff` | Creates and seats the lead and the scout (rules below) |

**Niche rules (`proposeNiche`):**
- At least 3 verified signals, from at least 3 different sites and at least 2 kinds of source.
- At least one signal in buyers' own words: a forum, review, job board, Q&A, social or marketplace page. Added after
  the live run below.
- Cites at least one owner input id.
- A specific gap: why incumbents miss it, in at least 40 characters.
- Not a near-copy of this factory's own niches (similarity ≥ 0.75).
- Not held by another factory (similarity ≥ 0.6).
- Density (how many other factories hold niches within 0.3 similarity) is recorded.

**The scout's standing method** follows the Paul Graham rules:
- start from the owner's inputs and go deep into one sub-sub-domain;
- look for observed demand, not plausibility;
- quote word for word;
- favour buyers who already pay humans a lot;
- treat boring work as a moat;
- name the gap precisely;
- meet the quotas.

**Deviation from the plan:** the plan said "≥ 3 independent source types per cluster". Code requires 3 sites and 2
source types, because three distinct source types is rare for an extremely niche market. This is a policy value
(`DEFAULT_DISCOVERY_POLICY.minSourceTypes`) to revisit once the dossier stage measures how well each setting predicts
real buyer response.

**Evals (`pnpm cofactory:eval`):**

| Suite | What it checks | Result |
|---|---|---|
| `signals` | Real quotes stored; a paraphrase, an invented budget, a script-only quote, a dead page and a too-short quote refused; every stored signal points at a verified check; a repeat stored once | 10/10, `stored_verified` = 1 |
| `niche-rules` | Too few signals, one site, no owner input, a vague gap and an own near-duplicate refused; a valid niche and a different job accepted; another factory blocked from a held niche | 8/8 |
| `divergence` | 10 simulated owners whose generators are pulled toward the same 10 popular ideas, as models are. Bar: no cross-factory near-duplicates, mean theme overlap ≤ 0.2, every factory keeps ≥ 4 niches | Overlap 0.043 with the registry vs 0.717 without it; 0 duplicates |

The `divergence` suite tests the mechanism with fixture generators. The same divergence measured across real-model
owners belongs to the live runs.

**Truth layer change:** PDFs are read now.
- A regulator's PDF guidance was refused in the live run, because only HTML and plain-text pages were accepted.
- The evidence store now extracts a PDF's text layer with dusk's own PDF worker, and fetched pages may be up to 10 MB.
- A PDF with no text layer is `unverifiable`, never `missing`.
- The claims suite gained a PDF quote that verifies and an altered one that does not (22/22).

**Live smoke (2026-11-17), a real model:**
- Setup: the worktree server with Claude Code on the owner's sign-in, a synthetic profile (independent pharmacy
  operations, claims data, Ohio, state compliance), a batch target of 3, and only the scout seated.

| Measure | Result |
|---|---|
| Model time | 8.2 min over 2 sessions: 8.0 min to fill the batch, then 0.2 min to close it on the next wake |
| API-equivalent model cost | $1.29 (shadow, on the subscription) |
| Signals | 9 stored from 9 sites; 1 refused (a PDF, before the fix above); 0 fabricated quotes |
| Niches | 3 accepted, all specific (detail below) |
| Traceability | Every decision traceable; the journal was written in both sessions |

The three niches:
1. Ohio independent pharmacies: PBM 835 remittance and DIR-fee clawback reconciliation, with the appeals filed.
2. Small Ohio cannabis operators: DCC training records, SOP upkeep and the annual third-party certification pack.
3. 340B contract pharmacies and rural covered entities: audit-ready eligibility documentation between HRSA audits.

**What the run taught:**
- The scout leaned on news, vendor and regulator pages; only 1 of 9 signals was buyers' own words. Under the new
  buyer-voice rule, 2 of the 3 niches would have been refused, which sends the scout to forums and job boards. Its own
  journal named the same next step ("Ohio cannabis operator forums/Reddit for direct operator complaints").
- A complete batch left open is closed by the next scout wake, cheaply.

**Proof:**
- `server/cofactory/discovery/discovery.test.ts` covers:
  - similarity and site grouping
  - profile ids stable across edits
  - a full batch through the scout's tools, with every decision traceable
  - scheduler wakes, and `discovery_stuck` after the session allowance
- Live smoke on a real model: see the progress log.

### P2 Dossiers and scoring

**Why:** this is the expensive filter. A plausible niche is cheap; one whose buyers, prices, pain and gap all check
out against the world is not. Paul Graham's rules decide the gates: "discover, not persuade", "few who need it
badly", "one buyer can say yes", "never average judges".

**Flow:**
1. A closed batch selects its strongest candidates (top 5 by their own evidence: buyer-voice signals, sites, boring,
   owner inputs, crowding).
2. The scout gets a deep session per selected niche, with the niche's signals and any earlier dossier's failures in
   the prompt.
3. The scout submits a structured dossier, which code verifies, interrogates and scores.
4. The best clean scores make the shortlist, and a shortlisted niche's registry claim goes live.
5. A niche with no passing dossier after 2 sessions that actually ran is rejected.

| Piece | Where | What it does |
|---|---|---|
| Dossier contract | `shared/cofactory/dossier.ts` | Buyers, practitioner pains, spend, buyer count, incumbents, gap, first-ten plan, failure modes, risks, offer (detail below) |
| Verifier | `server/cofactory/dossier/verify.ts` | Checks every link and quote against the page, with critical and structural checks (detail below) |
| Adversarial Q&A | `server/cofactory/dossier/qa.ts` | 10 questions drawn from a bank of 16, seeded by the niche and version, answered only from verified evidence. More than 3 unknown fails. |
| Scoring and vetoes | `server/cofactory/dossier/score.ts` | Weighted features and 10 hard vetoes (detail below) |
| Service | `server/cofactory/dossier/dossiers.ts` | Selection, versioned submissions, the shortlist, and the champion rule: one seat may advance a clean, unshortlisted dossier with at least one cited verified signal or claim check, and a specific reason. Vetoed or unverified dossiers cannot be championed. Scores are never averaged. |
| Tools | `cofactory_submit_dossier`, `cofactory_dossiers`, `cofactory_champion`; closing a batch now selects | Every submission is a `dossier.submit` decision linked to each claim check behind it |
| Routes | `GET /api/cofactory/dossiers`, `GET /api/cofactory/dossiers/:id`, `POST /api/cofactory/dossiers/select` (by batch or by niche ids, including re-selecting a rejected niche), `POST /api/cofactory/discovery/abandon` | — |
| Rediscovery | `server/cofactory/evals/rediscovery.ts`, `pnpm cofactory:rediscovery`, `docs/cofactory/research/rediscovery/targets.json` | Real niche businesses launched after the model's cutoff. The profile is built from each one's domain alone, and recall measures whether the factory finds that niche. |

**The dossier contract** is built so that code can check every claim. It holds:
- 5–10 buyers, each with a page and a public contact page;
- practitioner pains, each with its source type;
- spend lines whose amount must be in their quote;
- a buyer count whose value must be in its quote;
- incumbents and what they miss;
- the gap and the hidden reasons ruled out;
- a first-ten plan;
- failure modes;
- risks;
- an offer with a cited human alternative and the cost to serve.

**The verifier:**
- Every link loads, and every quote is on its page. This uses the truth layer, so PDFs are read too.
- Critical checks: the buyer count and the human-alternative price must be the numbers stated in their own quotes.
- Structural checks:
  - at least 5 reachable buyers;
  - at least 5 practitioner pages from buyers' own sources on 2 or more sites;
  - a verified spend line;
  - 3 specific failure modes;
  - a specific gap and first-ten plan.
- Pass bar: at least 95% of claims verified, with no critical or structural failure.

**Scoring** weights seven features:

| Feature | Weight |
|---|---|
| Demand | 0.2 |
| Money | 0.2 |
| Price advantage | 0.15 |
| Reach × buyer-count band | 0.15 |
| Moat (boring, owner inputs) | 0.1 |
| Incumbent gap | 0.1 |
| Crowding | 0.1 |

The ten hard vetoes:
- licensed advice;
- regulated claims;
- a platform's terms;
- a gatekeeper over 50%;
- a procurement path, or a price over a card limit of $500 a month;
- an unverified dossier;
- a failed Q&A;
- a price above a third of the human alternative;
- under 50% margin at the heaviest usage;
- a niche another factory now holds live.

**Evals (`pnpm cofactory:eval`, now 10 suites):**

| Suite | What it checks | Result |
|---|---|---|
| `dossier-verifier` | A hand-labelled good dossier and 8 ways to get it wrong: invented pains, an inflated buyer count, a wrong human price, dead buyers, one-site voices, news posing as practitioners, a vague plan, a wrong spend amount | 9/9, `false_pass` = 0, good dossier 100% verified |
| `adversarial-qa` | The full dossier passes all 20 seeded draws; a thin one (or one with failed evidence) fails all 20; draws are deterministic | Pass |
| `scoring` | Each of 9 veto cases fires; a strong dossier outranks a weak one (71.9 vs 57.6); shortlist and champion rules hold | Pass |

- Breaking the buyer-count check, the Q&A's evidence check or the price-ratio veto each fails its suite.

**Live dossier runs (2026-11-17), on a real model:**

*Ohio cannabis compliance (DCC training records and SOP upkeep):*
- **v1** failed. All 22 claims verified, but it reused job-ad URLs, leaving 2 distinct practitioner pages. It was
  priced at $1,500 a month, over the card limit, and the scout flagged regulated claims itself.
- **v2**, 30 minutes later, was shortlisted with a score of 69.7:
  - the price dropped to $299 a month against a verified $1,000-a-month consultancy alternative;
  - the offer was narrowed to documentation upkeep, which cleared the regulated-claims flag;
  - 5 distinct practitioner pages.
- **The catch:** all 8 "pain" quotes were job-ad boilerplate ("Must be 21+, pass a background check…"). They are on
  their pages, so they verified, but they are not buyers describing pain. The verifier checked that each quote exists,
  not that it shows pain.
- **The fix:** practitioner pain must come from at least 2 kinds of buyer-voice source, and at most half of the pages
  may be job ads, which show spend, not pain.
  - The `dossier-verifier` suite gained a `job-ads-as-pain` case.
  - Re-verifying the live v2 against real pages under the new rule fails it for exactly that reason, which is the right
    outcome: in this niche the scout found no buyer complaints.

*Consignment-shop payout reconciliation and W-9/1099 handling:*
- This dossier was researched by the rediscovery factory's scout.
- It passed on v3, after the scout narrowed the offer to "mechanical execution only" to clear a licensed-advice veto
  and found a fifth genuine practitioner page.

**Risk flags:** the scout declares its own flags, so a model could clear a veto by under-declaring. Now
`undeclaredRisks` reads the dossier's own words (the job, the gap, the first-ten plan, what incumbents miss) for
regulated topics: tax (1099, W-9, filings), legal, medical, financial advice, insurance and immigration. When a topic
appears, the dossier fails unless it either raises a flag or explains, in the risk notes, why no licence or regulated
claim is involved.
- The `dossier-verifier` suite gained two cases: undeclared tax work fails, and the same work scoped in the notes passes.
- All five live dossiers written so far give the same verdict under the rule. The consignment dossier v3 already scopes
  its 1099 work in its notes.

**Runtime fixes the live runs forced:**
- Startup recovery now leaves alone sessions the same process started. A session started right after boot was being
  re-entered while its first turn still ran.
- A busy conversation is retried for about 5 minutes, then the stale turn is interrupted. After a hard kill, dusk
  resumes the cut turn by itself and holds the conversation for minutes.
- Only sessions that actually ran a round count toward an allowance. Two sessions that never started had used up a
  niche's dossier allowance.

**Rediscovery:**
- The runner sets a neutral profile from each target's domain ("what people in <domain> pay to have solved"). The
  first version said "back-office work in <domain>", which steered the scout; only neutral-profile runs are scored.
- `COFACTORY_DOSSIERS_PER_BATCH=0` keeps dossier work out of rediscovery runs.
- The target set has 5 businesses with revenue verified by their payment providers, launched July–October 2026: small
  revenue, and 3 of the 5 only moderately niche.
- **Baseline, neutral profile, 5 targets, 3 niches each:**
  - Exact recall is **0/5**.
  - Buyer-level recall (`sameBuyer`: most of the target's buyer words appear in a candidate's buyer) is **3/5**.

  | Target | Same buyers? | The scout's closest niche |
  |---|---|---|
  | Pouncio (Vinted auto-buying) | yes | Multi-marketplace resellers: per-item payout and fee reconciliation |
  | amirelay (Vinted 3PL in France) | no | Walmart WFS sellers: lost or damaged inventory reimbursement claims |
  | Roast My BnB (listing audits) | yes | Multi-property Airbnb/VRBO hosts: occupancy-tax registration and filings in every jurisdiction |
  | HotelBase (direct-booking concierge) | yes | Independent hotels: OTA commission invoice audits |
  | Beautyflow (salon software, Belgium) | no | US booth-rent salons: 1099 worker-classification setup |

  The scout reaches the right buyers but chooses narrower, back-office jobs than the targets, which are
  software products. Exact match against one known business measures the wrong thing for a scout built to find niches
  nobody else holds. The rediscovery eval is kept as a regression signal: buyer recall should not fall. The real
  measure of niche quality is P3's sprint outcomes.

### P3 Offer and validation

**Why:** this is the first time real buyers judge us. Gates read only what they do: replies, form submissions,
payments.

| Piece | Where | What it does |
|---|---|---|
| Sprints | `server/cofactory/validation/sprints.ts` (`<data>/cofactory-sprints.db`) | One company, one week, named buyers. Pass/fail rule below. |
| Buyer list | `addTarget` | Each buyer needs a page proving their contact route is public. For email the exact address must appear on that page (`truth.checkContains`). No bought lists, no guessed addresses. |
| Gate | `authorizeTouch` | Refuses suppressed buyers; enforces caps of 20 a day and 60 a sprint, and 2 contacts per buyer at least 3 days apart. The opt-out line goes on first contact. |
| Suppression | `suppress` | Unsubscribes, bounces and rejections, permanent across every company on the server; a database trigger forbids deletion |
| Outreach | `server/cofactory/validation/outreach.ts` | Detail below |
| Intake | `server/cofactory/validation/intake.ts`, on dusk's public webhook receiver via an `IngressDoor` | Detail below |
| Offer page | `server/cofactory/validation/offer.ts` | A self-contained page with a payment button, a request form and the postal address and contact the law asks for. Served from the public intake, so the page and its form share one origin. |
| Payment links | `createPaymentLink` | Stripe product, price and link, tagged with the company |
| Rails | `server/cofactory/validation/rails.ts` (`<data>/cofactory-rails.json`, 0600) | Each company's mailbox, Stripe keys, form token and public URL. The owner sets them with `POST /api/cofactory/companies/:id/rails`. Responses show which rails are connected, never the secrets. |
| Tools | `cofactory_start_sprint` (CEO), `cofactory_add_buyer`, `cofactory_send_outreach`, `cofactory_sprint_status`, `cofactory_publish_offer`, `cofactory_payment_link` | Each one files a traceable decision |
| Upkeep | every tick | Polls each running sprint's mailbox and settles the sprint; raises `sprint_failed` or `mail_failed` |
| dusk changes | `server/email/client.ts`; `server/index.ts` | `sendMessage` accepts custom headers. A seated bot no longer gets dusk's own email tools or their prompt section, so every outreach email passes the Cofactory gate. |

**Sprint rule:** a sprint passes on one committed (paid, live-mode) event, or on urgent replies from 3 different
buyers. It fails when the week runs out.

**Outreach:**
- Mail is sent from the company's own mailbox, connected in dusk over IMAP/SMTP, by the server and never by a bot turn.
- It carries a `List-Unsubscribe` header, and each send is logged with its Message-ID.
- Polling turns replies into evidence, matched to the message they answer.
- A "stop" or a bounce is suppressed at once, for good.

**Intake:**
- `POST /hooks/cofactory/stripe/<company>` checks Stripe's HMAC signature within a 5-minute tolerance. A paid Checkout
  session becomes a payment; a refunded charge becomes a refund of that payment.
- `POST /hooks/cofactory/form/<company>/<token>` takes offer-page forms. The token is checked in constant time,
  there is a honeypot field, a submission is recorded once per sender, message and day, and the buyer is redirected to
  a thank-you page.
- `GET /hooks/cofactory/offer/<company>` serves the offer page with a strict CSP.

**Evals:**
- The `outreach-gate` suite has 20 cases:
  - guessed addresses and unverifiable pages refused;
  - opt-out on first contact only;
  - the gap between contacts, suppression, and the daily, sprint and time-box caps;
  - forged versus signed Stripe deliveries;
  - test-mode payments marked.
- Result: 20/20, `false_allowed` = 0.

**Proof:**
- `validation.test.ts`, 4 tests: the buyer list, the gate and caps, replies with stops, bounces and the 3-buyer pass,
  and payment versus time box.
- `intake.test.ts`, 4 tests: signatures, event mapping, HTTP forgery and the form.
- **`validation.e2e.test.ts` on a real dusk server:**
  1. The CEO's engine starts a sprint and publishes the offer, which is then served from the public webhook port.
  2. It lists a buyer whose page verifies.
  3. Its outreach is refused because no mailbox is connected.
  4. A forged Stripe webhook is rejected; a signed one records the payment and passes the sprint.
  5. No decision is untraceable.

**Rails preflight:** `pnpm cofactory:rails-check --company <id> [--data <dir>] [--dkim <selector>]` checks a
company's rails without sending or creating anything:
- the mailbox domain: a dedicated domain, not a personal provider, with MX, a single SPF record, DMARC, and DKIM when a
  selector is given;
- Stripe: a live key that can read payment links, and the webhook secret;
- the public intake answers over HTTPS;
- a postal address is on record.

It exits non-zero until every check passes. On the shadow rails, 7 of 10 checks fail, as they should.

**Going live:** [`live-sprint.md`](live-sprint.md) gives the steps:
- a separate data dir and ports;
- secrets loaded from a 0600 env file by `pnpm cofactory:connect`;
- the preflight;
- the owner's per-company `outreachArmed` switch. Outreach is refused until it is on; dry runs are always armed.

The consignment-payout dossier re-verifies against the live web under today's rules: 100% of claims verified, no
critical or structural failures.

**What the exit gate still needs (the owner's identity and legal gates):**
- **A mailbox for the company.** A dedicated domain with SPF, DKIM and DMARC, connected in dusk.
- **A Stripe account.** A restricted key that can create payment links, plus a webhook endpoint pointed at
  `/hooks/cofactory/stripe/<company>` with its signing secret.
- **A public HTTPS address for the webhook port**, for example a Cloudflare tunnel or a reverse proxy.
- **The owner's go-ahead before any real person is contacted.**

### P4 First dollar

**Why:** the pipeline ends at the first arm's-length dollar, and P4 makes that dollar mean something. It must be a
real payment, the work must be delivered by hand, and the work must not live only in one bot's head.

| Piece | Where | What it does |
|---|---|---|
| Launch from a dossier | `launcher.launch({ dossierId })`, `cofactory_launch { dossier_id }`, `POST /api/cofactory/launch { dossierId }` | Only a shortlisted or championed dossier launches a company. The brief is built from it: buyer, job, offer against the human alternative, why the gap exists, first-ten plan, named buyers, failure modes, risks. The niche is claimed in the local and cross-factory registries, and the company is linked to its niche and dossier. |
| Revenue booking | `bookRevenue` in `host.ts`, every tick | Detail below |
| Related parties | `POST /api/cofactory/related-parties` (`<data>/cofactory-related.json`, 0600) | The owner's own emails and domains; payments from them never count as customers |
| Orders | `server/cofactory/validation/orders.ts` (`<data>/cofactory-orders.db`) | Every booked payment opens one order. `cofactory_deliver_order` closes it, with two conditions below. An order open for more than 3 days raises `order_overdue`. |
| Customer mail | `cofactory_message_customer` | Only addresses with an order and never a suppressed one. Prospects are reached only through a sprint. |
| Invoices | `cofactory_invoice`, `createInvoice` | A Stripe invoice, finalized and sent, only to someone who wrote to the company. `invoice.paid` comes back as a payment through the same intake. |
| Bus-factor rehearsal | `server/cofactory/validation/rehearsal.ts`, every tick | Detail below |
| First-dollar gate | `orders.firstDollar(companyId)`, `GET /api/cofactory/orders`, `cofactory_orders` | Reached when an unrefunded arm's-length payment, its delivered order and a passed rehearsal all stand |
| Post-mortems | `cofactory_postmortem` (lead), `postmortems` table in the discovery store | Detail below |
| Company folder in every session | `sessions.ts` envelope | Every company session is told where its folder is, except a stand-in's, which is told only its packet |

**Revenue booking:**
- Each payment and deposit is booked as revenue once.
- It must pass the arm's-length check:
  - live mode;
  - not from a related party;
  - at least half the dossier's list price;
  - not refunded.
- A refund of a booked payment is booked as a refund.
- Every payment is filed as a decision, `revenue.record`, whether allowed or refused.

**Delivering an order** requires:
- the deliverable is a non-empty file inside the company folder (`..`, absolute paths and links that leave it are refused);
- RUNBOOK.md is at least 300 characters and was written after the order came in.

**Bus-factor rehearsal:**
1. After the first delivered order, a new stand-in bot takes the `operator` seat.
2. It gets a handoff packet in a separate folder: BRIEF.md, RUNBOOK.md, JOURNAL.md, and ORDER.md (the payment and the customer's own messages, never the deliverable).
3. It must serve the order again from the packet and deliver with `rehearsal: true`.
4. The lead compares the two pieces of work and records `cofactory_rehearsal_verdict`. The stand-in's seat is then released.
5. If the rehearsal fails, or the stand-in ends without delivering, `rehearsal_failed` is raised. A new rehearsal starts only after RUNBOOK.md is rewritten.

**Post-mortems:**
- Each records:
  - the cause;
  - the one falsified assumption;
  - the lesson;
  - the evidence ids.
- A killed company without one raises `postmortem_missing`.
- Each one lowers the pre-score of candidate niches that resemble it (similarity above 0.3), so a disproved idea is not retried in new words.

**Evals:**
- The `first-dollar-gate` suite has 17 cases:
  - one order per payment;
  - missing, absolute, escaping and linked deliverables;
  - missing, thin and stale runbooks;
  - double delivery;
  - every partial gate state, including a refund after the gate was reached.
- Result: 17/17, `false_pass` = 0.

**Proof:**
- `orders.test.ts`, 4 tests:
  1. Delivery refusals in order, with the decision citing the committed payment.
  2. Customer-only mail.
  3. The full rehearsal loop: the packet holds no deliverable and no company folder; refusals outside the packet and for a non-rehearsal delivery; a failed verdict, an alarm, no retry until the runbook changes, then a second stand-in passes and the gate is reached.
  4. A stand-in that gives up fails the rehearsal with its reason, and an overdue order raises an alarm.
- `dossier.test.ts`: launch from a dossier, and the post-mortem penalty.
- **`validation.e2e.test.ts` on a real dusk server:**
  1. The signed payment is booked as 9,900 cents of revenue.
  2. It opens an order for the buyer.
  3. Once the owner's address is declared related, the owner's own payment is refused as revenue on record.

**Known limits:**
- The stand-in is told not to open the company folder but, as a Full-access bot, could. The lead's comparison is the
  check; an identical copy is the signal.
- The lead judges the rehearsal, so the verdict is a model judgement. The gate's other two legs are deterministic.

**Shadow run (2026-11-17), a real-model company with `COFACTORY_MAIL_DRY_RUN`:**

Set-up:
- The company was launched from the live consignment-payout dossier.
- The mailbox was a dry-run file.
- The public address does not resolve, and Stripe is not connected.

In one 2-minute session, the CEO:
1. published the offer;
2. tried a payment link, which was refused because Stripe is not connected;
3. started the sprint;
4. checked whether the page loads (it does not, by claim check and by its own fetch);
5. refused to advance without evidence, and asked the lead what to do.

It found three faults, all fixed:

| Fault | Fix |
|---|---|
| The page footer carried **the owner's personal email**, which the bot found in its environment, and **an invented postal address** (a registered agent's office, "c/o Cofactory"). | The page's contact email and postal address now come only from the rails the owner sets (`postalAddress`, `mailbox`). Publishing is refused without a postal address. Every outreach email ends with that address and is refused without one. The brief forbids putting anyone's own details on a page or in mail. `payment_url` must be a Stripe payment link. |
| The CEO offered **a free first month**, which can produce no committed evidence inside the sprint. | The brief says not to give the first orders away, and to offer a money-back guarantee on a paid first month instead. |
| **The sprint's week started before any buyer could be reached**, so the time box was being spent on a page nobody could load. | The week now starts at the first contact. The first contact is refused until the offer page loads for a stranger, checked by fetching it and finding its own form. |

The CEO also spent its session finding out that the rails were missing. Each tick now raises a `rails_missing` alarm
naming what the owner has not connected, kept current as rails arrive. Every session sees it in its envelope, and the
owner sees it in `/api/cofactory/state`.

**Second shadow run:**
- The dry-run first contact was allowed, so the company got as far as outreach.
- It listed 4 buyers, each with a public contact route verified on their own page. A contact page that did not show the
  address was refused.
- It drafted 2 emails and correctly refused to email a buyer reachable only by a form or by phone.
- The lead escalated the missing rails to the owner.
- Both drafts still opened with **"Free trial"**: the written rule in the brief was ignored. So the rule is now a gate.
  `giveawayProblem` refuses an outreach email or an offer page that gives the first order away ("free trial", "first
  month free", "on us"). A money-back guarantee and a free call are still allowed.
- The drafts also wrote their own opt-out line. The tool now says the opt-out line and the postal address are added
  for the writer.
- **The lead claimed actions it never took.** Its summaries said "escalated it to the owner", "corrected the owner" and
  "owner notified", but it sent the owner nothing; its only sends went to the CEO and the scout. Now `unbackedClaims`
  makes `cofactory_journal` and `cofactory_end_session` refuse any claim of having messaged a seat or the owner when no
  typed message went from that seat to that role this session. Requests ("the CEO asked me to escalate") and plans
  ("will escalate") pass.
- **A seat looked at driving the owner's own phone** to call a buyer reachable only by phone. dusk had given it the
  USB-phone tool, which happened to be busy. A seat acts for a company, never as the owner. Seated bots now get none of
  these: the owner's USB phone, the paired device, or the owner's connected accounts (Composio); they also never had
  dusk's mailbox. Buyers reachable only by form or phone stay off the outreach list until the company has a channel of
  its own.

The `outreach-gate` eval grew to 30 cases:
- postal address on first and follow-up emails;
- refused without a postal address;
- refused while the offer does not load;
- the week starting at the first contact;
- two giveaways refused, and a guarantee and a free call allowed.

**The exit gate** is the first arm's-length dollar, delivered and rehearsed, or a clean, post-mortemed kill. It needs
the P3 rails and a real sprint, so it waits on the owner.

## Product

### X1 Owner experience
The board as home, inbox cards, standups, the kill switch, onboarding and the phone.

**Built so far, all inside dusk's own shell:**
- **First run:** see [`onboarding-flow.md`](onboarding-flow.md). It ends with the factory opening on its own territories.
- **Characters:** your agent characters replace dusk's pixel mascots, and each role has its own look. A company's crew
  shares the company's colour. The app icon, the menu-bar glyph and the startup screen use them too.
- **Factory tab** in the bot panel:
  - Needs you, with Approve and Decline;
  - what the bot is doing now;
  - the first week, the territories and the latest finds;
  - per company: money, days to a paying customer, the sprint and the first-dollar gate.
- **Company rail:** the factory plus one character per live company, with a dot for what needs the owner. Choosing
  one scopes the sidebar to its crew.
- **Owner controls:**
  - launches, large spends and closes wait for approval when the owner asked;
  - 5 days to a paying customer, counted from going live, and 14 days to go live at all.
- **Model use is Cofactory's cost, never the owner's.** The owner's budget is only for real-world spend (domains, ads,
  payment fees), and onboarding says the AI work is on us. The daily ceiling on model use is the operator's guard
  (`COFACTORY_DAILY_MODEL_CENTS`, $25 by default), not an owner setting, and never appears in Needs you.
- **The factory lead is the chief of staff,** seats work in their own chat, and packaged builds never take dusk.bot's
  updates.

**Still to do:**
- renaming the packaged app and its bundle id (release scripts, computer-use permissions);
- dusk's remaining pixel illustrations.


### X2 Hard rails and scale
A virtual card and model key per company, multiple factories, and calibration re-fit on post-mortems.

**Cofactory's own cloud: deferred until its gate opens.** dusk's hosted cloud is all in this repo:
- `apps/dashboard`: the account service, with billing on Dodo Payments;
- `apps/cloud-service`: one InstaBox microVM per customer;
- a Cloudflare edge Worker and the link services.

So we can run our own copy. It needs:
- accounts: Cloudflare, InstaBox, a VPS, MongoDB, a mail sender, and Dodo, or a new Stripe provider;
- our own signing keys;
- about a dozen hard-coded `dusk.bot` addresses changed;
- a deploy and release pipeline of our own;
- the licence settled.

`docs/cloud-pro.md` describes an older Fly.io design and is out of date.

The gate is read from the factory's own records, by `server/cofactory/observe/cloud-gate.ts`, and shown at the foot of
the ops board ("cloud gate: not yet" / "READY"). All three must hold:

| Criterion | Target | Why |
|---|---|---|
| Companies past the first-dollar gate | 3 or more | The product works before we host it |
| Customers kept waiting 6 h+ while the factory was offline, over 30 days | 2 or more | Running on the owner's computer is costing money. Measured as an inbound reply, payment or form received more than 6 h after it happened. |
| Revenue over 30 days against one cloud machine | 3 times the monthly cost of one machine or more | Hosting pays for itself. `COFACTORY_CLOUD_MONTHLY_CENTS` holds the cost, an estimate of $30 until a provider quote. |

Also needed, but not measurable from the records: the backend's licence (PolyForm Noncommercial) is settled with its
holder before Cofactory sells hosting.

## From here (2026-11-17)

**The goal:** prove the factory makes the owner money, then share it with friends. Each stage starts when the one before it
passes its gate.

**A: First dollar.** This is the P3 and P4 exit gate.
1. **The approve stage** (built, `design-companies.md` stage 1): a search of 8 ideas, three checked cards on the owner's
   Home, Start or Pass, and a company that launches once its full dossier holds up. First real card in 40 minutes for
   about $7 of model use.
2. **Go live in the app:**
   - the rails checklist with live checks (`pnpm cofactory:rails-check` behind a screen);
   - Stripe's webhook created by the app;
   - a preview of the offer page and the first emails;
   - an **Arm** button in the Factory tab, in place of the `curl` call.

  `pnpm cofactory:walkthrough` runs a throwaway factory on the fake engine for clicking through by hand, from the welcome
  screen to a launched company; `server/cofactory/lifecycle.e2e.test.ts` runs the whole life, through the first dollar
  and a close, on every change.
3. **The owner's rails:** a domain and mailbox, Stripe, a postal address, and a public address for the intake.
4. **The first real sprint:** a paying customer, delivered and rehearsed, or a clean close with its post-mortem.

*Gate:* one company past the first-dollar gate.

**B: Safe to leave running:**
- sessions survive restarts with their journals;
- what needs the owner reaches them off the Mac, by email or notification digest, until there is a Cofactory phone app;
- scores are calibrated against real outcomes.

*Gate:* a week of unattended running with no lost session and every approval answered.

**C: Ready for friends:**
- **Cofactory pays for the model:** an engine Cofactory provides and pays for, in place of the owner's own Claude Code
  sign-in, with its cost per factory on the ops board;
- the app's own name, bundle id and release signing;
- its own account service, or no account;
- location pre-fill and the optional edge step;
- dusk's remaining screens and offers replaced.

*Gate:* a friend installs it, opens a factory, and reaches a launch request without help.

**D: Scale (X2):**
- several owners and factories;
- per-company virtual cards;
- the cloud, behind the cloud gate;
- the backend's licence settled before hosting is sold.

## Progress log

- **2026-11-17:** F0 done. Roadmap approved. F1 and F2 started.
- **2026-11-17:** F1 done and F2 core done. Stage gates now read the world. 34 unit tests pass, and `pnpm cofactory:eval` passes. Next: F3, runtime and persistence.
- **2026-11-17:** F3 done: sessions, journal, company folders, keep-working re-entry, restart recovery, zombie sweep, scheduler (cadence, event and message wakes), alarms and the launcher. 15 runtime tests plus a real-server kill and restart e2e. Next: F4, observability.
- **2026-11-17:** F4 done: an append-only log of decisions with evidence and cost, tool calls and owner touches; cost by stage; session and company traces; autonomy; the ops board (page, text, CLI). The traceability eval passes at 100%. The board caught a round-start race, now fixed. Foundations F0–F4 are complete. Next: P1, discovery.
- **2026-11-17:** P2 done:
  - dossiers verified claim by claim;
  - seeded adversarial Q&A;
  - scoring with hard vetoes;
  - the champion rule;
  - a buyer-voice rule, job ads at most half;
  - undeclared-risk checks;
  - rediscovery baseline 0/5 exact, 3/5 same buyers.

  P3 and P4 are built:
  - sprints, outreach gate, intake, rails and preflight;
  - orders, the bus-factor rehearsal, the first-dollar gate and post-mortems.

  Two shadow runs on a real model found 8 faults, all fixed. Next: the owner connects rails for a real sprint.
- **2026-11-17:** P1 done: factory profile, verified signals, niche rules, the cross-factory registry, discovery batches and scout sessions, factory staffing; evals for signals, niche rules and divergence (overlap 0.043 with the registry vs 0.717 without). Live smoke on a real model: 3 specific niches from 9 verified signals for $1.29 of model use. Fixes from it: PDFs are now read, and every niche needs buyers' own words. Next: P2, dossiers and scoring.
