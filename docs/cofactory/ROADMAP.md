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
| Foundations | [F4 Observability](#f4-observability) | Not started | Every gate decision is traceable to its evidence and its cost |
| Pipeline | [P1 Discovery](#p1-discovery) | Not started | Signals 100% verified; divergence under the ceiling across 10 simulated profiles |
| Pipeline | [P2 Dossiers and scoring](#p2-dossiers-and-scoring) | Not started | Claim verifier ≥ 95%; adversarial Q&A; post-cutoff rediscovery baseline |
| Pipeline | [P3 Offer and validation](#p3-offer-and-validation) | Not started | One real sprint completed inside its cap, gates fed by real events |
| Pipeline | [P4 First dollar](#p4-first-dollar) | Not started | First arm's-length dollar, or a clean, post-mortemed kill |
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

**Scope:** traces per session, an internal ops board, shadow and real cost per stage, and an owner-touch log.

## Pipeline

### P1 Discovery
Factory profile, signal miner and store, niche synthesis (buyer × job × channel), divergence across factories,
and a claim registry.

### P2 Dossiers and scoring
Deep-session dossiers, practitioner evidence from the web, the rubric, vetoes and the champion rule.

### P3 Offer and validation
Offer page, payment link, outreach on any channel inside send caps, and a validation sprint of 7 days or less.

### P4 First dollar
Concierge fulfilment, invoices, the bus-factor test, and post-mortems that feed scoring.

## Product

### X1 Owner experience
The board as home, inbox cards, standups, the kill switch, onboarding and the phone.

### X2 Hard rails and scale
A virtual card and model key per company, multiple factories, and calibration re-fit on post-mortems.

## Progress log

- **2026-11-17:** F0 done. Roadmap approved. F1 and F2 started.
- **2026-11-17:** F1 done and F2 core done. Stage gates now read the world. 34 unit tests pass, and `pnpm cofactory:eval` passes. Next: F3, runtime and persistence.
- **2026-11-17:** F3 done: sessions, journal, company folders, keep-working re-entry, restart recovery, zombie sweep, scheduler (cadence, event and message wakes), alarms and the launcher. 15 runtime tests plus a real-server kill and restart e2e. Next: F4, observability.
