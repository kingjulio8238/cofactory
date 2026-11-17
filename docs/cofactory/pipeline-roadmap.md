# Cofactory pipeline and roadmap (for approval)

**Decisions (2026-11-17):**
- **Outreach:** the factory does whatever the job needs to reach buyers: 1:1 messages, community posts, listings,
  calls booked by email. It always stays inside its daily send caps and the law (opt-out, no purchased lists,
  authenticated domains).
- **No paid experts in v1.** Niche understanding comes from the model plus persistent web research; human ground
  truth comes from real buyers during validation.
- **Evals run through every stage.** Each stage ships with its own evals; no stage runs live without them.

**The promise:** cofactory.co finds an extremely niche business that only your factory would find, and takes it to
its first arm's-length dollar with you handling only identity and legal gates. Everything up to that dollar is in
scope here; operating a company after revenue comes later.

The rules below come from 76 Paul Graham essays. The per-essay notes, with verbatim quotes checked against the
source text, are in [research/pg/](research/pg/). They also draw on the ULR longrun harness and the code already
built ([spec-review.md](spec-review.md), [niche-factory.md](niche-factory.md)).

## 1. Ten rules the whole pipeline obeys

1. **Gates read the world, never agent prose.** A stage passes only on externally checkable evidence: a payment
   charge id, a real reply thread, a signed commitment, a URL that resolves for a stranger. Self-reports, LLM-persona
   "users" and LLM grades of dossiers never pass a gate. (users, segway, before, founder mode)
2. **Only landed, arm's-length money counts.** It must be settled, from a payer unrelated to the owner, experts,
   Cofactory or another factory, at ≥ 50% of list price. "Would pay", letters of intent, free pilots and
   factory-to-factory sales count as 0. Code enforces this. (yahoo, startuplessons, 13sentences)
3. **Evidence beats plausibility.** A model-generated idea starts at *reject*. Responses are scored committed >
   urgent > hypothetical, and hypothetical is worth 0. The best ideas often look bad, so no "sounds good" judge.
   (startupideas, swan, googles)
4. **Few buyers who need it badly.** Require 5–10 named, reachable buyers whose urgent pain shows in a costly
   workaround they already use. Market size is a floor, never a score. (startupideas, ds)
5. **Sell before you build; concierge before code.** The first dollar comes from a crude offer: a page, a payment
   link and fulfilment done by hand by agents. Build spend unlocks only after a customer has paid.
   Automate a step once it has been repeated 3 or more times. (ds, ideas, newthings, webstartups)
6. **The niche already spends money, and one buyer can say yes.** The job is bought from humans today and we deliver
   it ≥ 10× cheaper. The price sits under the buyer's card-payable discretion. Procurement, committee or platform
   approval paths take a heavy penalty. (ideas, artistsship, powerful, mit)
7. **Tedium is a moat when agents bear it.** Favour boring, operations-heavy niches where incumbents' prices are
   mostly human labour. Keep a quota of these, because models drift toward easy SaaS ideas. (schlep, notnot)
8. **Default alive, or kill fast and cleanly.** Every venture computes default-alive daily on a final budget. The
   company cannot veto its own kill. Kills argue only forward value, ignore sunk cost, and their post-mortem feeds
   scoring. A clean disproof counts as a success. (aord, pinch, prcmc, great work)
9. **Resourceful, not just relentless.** Tactics change at thresholds set in advance; a strategy change needs linked
   evidence; at most 2 identical retries. A `waiting` status needs a named dependency and the next wake time.
   (relres, persistence, word)
10. **Diverge through inputs.** Optimal search converges, so each factory's niches must come from inputs unique to
    it, and a registry keeps any niche to one factory. (startupideas n7, webstartups, prcmc)

## 2. The pipeline (everything up to the first dollar)

Each step has an owner, an output, a **gate checked by code**, and a budget released for that stage only.

| # | Step | Who | Output | Gate (code-checked) |
|---|---|---|---|---|
| 0 | **Factory profile** | Owner, once | Owner's domains, skills, network, assets, geography, language, constraints; optional seed niches | Profile has ≥ 3 unique inputs, or the factory derives them from deep research into the owner's stated interests |
| 1 | **Signal mining** | AI | Raw signal store: complaints, "I'd pay for", "why doesn't someone", long-lived workarounds, job posts with budgets, regulator changes, registries. Each signal stored with URL, timestamp and verbatim text. | Signals verified as fetched (stored snapshot and hash). Sources diverse: ≥ 3 independent source types per cluster. |
| 2 | **Niche synthesis** | AI | ≥ 30 candidate niches per batch, each = buyer × job × channel, built only from clusters of independent signals. A fixed share comes from boring industries and from crossing the owner's inputs with a second field. | Each candidate cites ≥ 1 factory-unique input; no cluster from a single source |
| 3 | **Dossier** (deep session, 1–3 h) | AI | One page: named buyers (5–10 with contact route), pain quotes, existing spend and price evidence, what incumbents overlook and why the gap exists, the first-10-customers plan, failure modes, risks | **Verifier code:** every link resolves and every quote appears on its page (fetched); every buyer count and price has a source. **Adversarial Q&A:** 10 random questions, ≤ 3 "unknown". |
| 4 | **Score, veto, claim** | Code plus one champion agent | Rubric score; vetoes (licensed advice, regulated claims, ToS, gatekeeper > 50%, procurement path); claim in the cross-factory registry | Never averaged judges: one champion with cited evidence can advance a candidate to a cheap test. Registry claim succeeds (no near-duplicate). |
| 5 | **Practitioner evidence** | AI (persistent web research) | Practitioners' own words on this pain and what they pay, from forums, reviews, job posts and public talks, beyond the dossier's sources | ≥ 5 distinct practitioners quoted with verified links; the real human check happens in validation (step 7) |
| 6 | **Offer** | AI | Archetype chosen (done-for-you deliverable, monitoring, micro-tool, template, directory), price, promise, offer page, payment link | Page live to a stranger; price ≤ ⅓ of the human alternative; unit economics hold at the heaviest 10% of usage |
| 7 | **Validation sprint** (≤ 7 days) | AI, any channel that reaches the buyers, inside send caps and the law | Targeted contacts to named buyers, posts where they gather, listings; replies, calls booked, pre-orders | Evidence classed committed / urgent / hypothetical; pass = ≥ 1 committed (deposit or payment) or ≥ N urgent from distinct buyers |
| 8 | **Concierge first dollar** | AI | Hand-delivered first order, invoice, receipt, customer contact owned | **Arm's-length payment landed** (rule 2). Bus-factor test: a fresh operator started from the dossier and journal alone can serve the next order. |
| ✕ | **Kill at any step** | Code thresholds plus the lead | Frozen money returned; a post-mortem that names the falsified assumption | Post-mortem updates the niche graph and the scout's priors |

The cheap stages run wide and the expensive ones run narrow: about 30 candidates → 5 dossiers → 2 offers → 1
validation sprint per factory cycle. If more than about 70% of dossiers survive scoring, or nearly every validation
passes, the factory is picking ideas that are too safe; that is an alarm.

## 3. Not the same business for everyone

- **Inputs:**
  - Each niche must cite a factory-unique input: the owner's domain, network or assets, local or
    private data, or a language or geography.
  - Discovery seeds rotate across source domains per factory.
- **Registry:**
  - A cross-factory claim registry blocks near-duplicates (buyer × job × channel, embedding plus rule match), and
    density penalties discourage crowded regions.
  - A claimed niche is exclusive while it is live, and released when killed.
- **Learning is shared, choices are not:** operating learnings (what converts and how) are pooled across factories;
  niche choices are never shared.
- **Measured:** pairwise niche similarity across factories is tracked as an eval metric (section 4), with a ceiling.

## 4. How we know the pipeline is good enough to trust

Nothing goes live until these pass, measured on fixtures first:

| Eval | What it measures | Pass bar to start live runs |
|---|---|---|
| **Claim verification** | Share of dossier claims (links, quotes, counts, prices) the verifier confirms | ≥ 95% |
| **Adversarial Q&A** | Dossier depth: questions answered from evidence, not invented | ≤ 3 unknown in 10, with no invented answers on spot check |
| **Outcome agreement** | Scout rank versus what real buyers did in validation (replies, commitments), since there are no paid experts | Rank correlation clearly above chance after ≥ 20 sprints; measured, not assumed |
| **Rediscovery (post-cutoff)** | Recall of real niche businesses that appeared after the model's knowledge cutoff (marketplace listings with verified revenue), from signals alone | Measured baseline; must improve release over release |
| **Divergence** | Niche overlap across 10 simulated owner profiles | Mean pairwise similarity under a set ceiling; zero exact duplicates |
| **Calibration (live)** | Scout score versus validation outcome, and versus first dollar | Correlation reported each cycle; the scoring model is re-fit on post-mortems |
| **Cost per qualified niche** | Shadow and real spend per dossier and per sprint | Within budget model |
| **Pass-rate band** | Kill rates per stage | Inside the band in section 2 (not too safe, not too loose) |

Evals run on dusk's fake-engine fixtures for the plumbing, then on real models for quality. Every capability ships
with its check.

## 5. The harness that runs it

This extends dusk's runtime with episodic persistence, porting the lessons from the ULR longrun harness:

- **Many bounded sessions, not one long one.** Each session is woken by a cadence or an event (payment, reply, form). Deep sessions (1–3 h) are only for dossiers and builds; the 20-hour run plateaued at about 3.5 h.
- **Company journal:**
  - The journal lives outside chat history and is injected at the start of every session.
  - A session must append to it, and code checks this.
  - Rules live in files, not in context.
- **Keep-working re-entry:** native CLIs that stop before their `done_when` are re-entered within the session budget.
- **Budgets:**
  - Each session has a wall-clock and shadow-cost budget.
  - Each company has its real-dollar cap: holds now, a virtual card later.
  - Agents see one line of remaining budget.
- **Heartbeat and fake-work alarm:**
  - Every action is tagged internal or external.
  - Spend with no new external event raises an alarm.
  - A company is `stalled` after N days without an external event.
  - Under 50% core work in a Validate or Sell session is flagged.
- **Autonomy follows trust:** a seat's autonomy level tracks its verified-claim rate, and one false report drops it a
  level.
- **Durable and capped:**
  - Each company's workspace is a git repo, committed every session.
  - Hosting is always-on, with server-side lifetime caps.
  - Rail keys never reach engines.

## 6. Roadmap: foundations, then the pipeline, then product

| Layer | Stage | Builds | Exit gate |
|---|---|---|---|
| **Foundations** | F0 Books and control (done) | Ledger, holds, stages, kill, seats, typed messages, Cofactory tools in dusk | Done: 18 tests plus fixture e2e |
| | F1 Truth layer | Evidence store: fetched snapshots with hashes, link and quote verification, external-event intake (payment, form, reply webhooks), evidence classes (committed / urgent / hypothetical), arm's-length checks | A hand-made set of true and false claims and events is classified correctly |
| | F2 Eval harness | Fixtures, labelled good/bad sets, scorecards, run history, regression runs on every change, pass-rate bands | Runs in one command; flags a planted regression |
| | F3 Runtime and persistence | Episodic sessions, company journal, keep-working re-entry, session budgets, cadence and event wakes, heartbeat, fake-work alarm, typed-message delivery, launcher seating a team, restart safety | A fake-engine company survives kills, restarts and a multi-day simulated run with no zombie state |
| | F4 Observability | Traces per session, internal ops board, shadow and real cost per stage, owner-touch log | Every gate decision is traceable to its evidence and its cost |
| **Pipeline** | P1 Discovery | Factory profile, signal miner, niche synthesis, divergence, claim registry | 100% of signals verified; divergence under the ceiling across 10 simulated profiles |
| | P2 Dossiers and scoring | Deep-session dossier, practitioner evidence, rubric, vetoes, champion rule | Claim verifier ≥ 95%; adversarial Q&A; post-cutoff rediscovery baseline |
| | P3 Offer and validation | Offer page, payment link, any-channel outreach inside caps, sprint loop | One real sprint completed inside its cap, with every gate fed by real events |
| | P4 First dollar | Concierge fulfilment, invoice, bus-factor test, post-mortems feeding scoring | First arm's-length dollar, or a clean, post-mortemed kill |
| **Product** | X1 Owner experience | Board, inbox cards, standup, kill switch, onboarding, phone | You run a full cycle from cards alone |
| | X2 Hard rails and scale | Per-company card and model key, multiple factories, calibration re-fit | Calibration and divergence hold across ≥ 3 owner profiles |
