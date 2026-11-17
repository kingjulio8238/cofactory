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
| Foundations | [F3 Runtime and persistence](#f3-runtime-and-persistence) | Not started | A fake-engine company survives kills, restarts and a multi-day simulated run with no zombie state |
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

**Scope:**
- Episodic sessions over dusk's runtime.
- A company journal outside chat, which code checks was written.
- Keep-working re-entry when a CLI stops early.
- Session budgets.
- Cadence and event wakes.
- A heartbeat and a fake-work alarm.
- Typed-message delivery.
- A launcher that seats a team from a playbook.

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
