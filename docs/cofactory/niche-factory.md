# Cofactory: the niche company factory

The selling point is that cofactory.co launches extremely niche companies. These are businesses too small or too
specific for a human founder to bother with, but profitable at $1k–$10k a month because the factory runs them almost
for free. This page covers the pipeline that produces them and the harness that keeps them running.

## What "extremely niche" means (so the scout can be held to it)

A niche is **one buyer × one job × one channel**, and it qualifies only with evidence:

| Test | Passes when |
|---|---|
| Buyer | One sentence names a role in an industry in a situation ("independent pharmacies in Texas filing DIR-fee reconciliations") |
| Countable | The buyers can be enumerated: a list, a registry, a directory. Hundreds to a few thousand, not "SMBs". |
| Pain | At least 5 independent, verbatim complaints, each with a URL (forum, review, job post, regulator notice) |
| Money | Proof someone already pays: job-board budgets, an existing tool's price, a consultant's rate |
| Channel | A place the buyers gather, or a way to reach them one by one, that a bot may use within the sending policy |
| Autonomy | The deliverable can be produced and delivered by bots; any human work is a hired expert, not the owner |
| Risk | No licensed-profession advice, no regulated claims, no platform ToS conflict (the scout vetoes) |

Breadth is the factory's advantage: a human picks one niche and is stuck with it; the factory can test dozens.

## Archetype × niche

Building a new company from scratch per niche does not scale. Instead, a small number of **archetypes** get deep,
versioned playbooks, and each niche is plugged into one:

| Archetype | What is sold | Why it fits niches |
|---|---|---|
| Done-for-you deliverable | A recurring report, filing pack, content set, audit, produced by bots | Niche buyers pay for specific outcomes; bots fulfil |
| Monitoring / data subscription | Alerts and digests on a niche's regulations, tenders, listings, prices | Cheap to run once built; recurring revenue |
| Micro-tool | One calculator/generator/checker for one job | Small build, searchable long-tail demand |
| Templates / digital product | Packs specific to one trade or workflow | Zero fulfilment, needs only distribution |
| Niche directory / lead-gen | A list or marketplace the niche lacks | Sells to the vendors who serve the niche |

**Start with two: done-for-you deliverables and monitoring subscriptions.**
- They are the most autonomous to fulfil and the least build-heavy.
- They get to a first payment fastest.

Each playbook defines:
- the team
- the instructions for each seat
- the stage tool packs
- the evidence events for each stage
- the kill thresholds
- the starter skills (landing page, checkout, outreach sequence, fulfilment routine)

A playbook gets better with every company that runs it.

## The pipeline

| Step | Who | Output | Verified by |
|---|---|---|---|
| 1. Discover | AI | Candidate niches mined from long-tail demand: job boards, forums, app/tool reviews, regulator changes, public business registries | Count and diversity of sources |
| 2. Dossier | AI | One page per niche covering every test above, every claim with a link | Code: links resolve, quotes appear on the linked page, buyer count has a source |
| 3. Expert check (optional) | Hired human | A paid niche practitioner (e.g. a 30-minute paid review) confirms the pain and the price | A recorded verdict, paid as `cogs` from the company cap |
| 4. Validate before build | AI | Offer page plus 20–50 targeted, capped contacts in the niche; pre-orders or deposits | Replies, form submits, payments (webhook events) |
| 5. Build / fulfil | AI | The archetype's thinnest deliverable | A stranger completes the path |
| 6. Sell / operate | AI (+ hired experts if the playbook says) | Revenue, a running routine | Ledger revenue rows |
| 7. Kill or scale | Code + lead | Post-mortem, or a top-up and a sibling niche | Auditor rules; the post-mortem updates scoring |

**AI-human, the right way.** The owner is never the human in the loop for ordinary work. Humans enter in two ways:
- **As hired, paid, reviewed vendors:** a niche expert, a fulfilment specialist. This mirrors the independent experts
  in your specialist worlds.
- **As the owner at identity and legal gates only.**

This keeps owner hours near zero while putting real domain truth where a model is weakest.

**Factory learning.** Every dossier, validation result and post-mortem goes into a niche graph. The scout's scoring
model learns from it, measured by kill quality and time to first dollar per archetype. That accumulated graph is the
moat.

## The harness: extend dusk, port the ULR lessons, do not run one long session

What the ULR longrun study showed:
- A single 20-hour session cost about $970 on Opus and $1,870 on GPT.
- One run plateaued after about 3.5 hours.
- The harness gets no feedback mid-run.
- Native CLIs quit early, which is why `keepworking.py` exists.

A company lives for weeks and gets real feedback from the market, so the right shape is **episodic persistence**:
many bounded work sessions over durable state, each one woken by a cadence or an event.

dusk already has the durable backbone: `server/runtime/` is a SQLite job tree with an append-only event trail, wake
lanes, resume, and restart-safe turns. Routines and webhooks provide cadence and events. What we add:

| Piece | From | In Cofactory |
|---|---|---|
| Company journal outside chat history | longrun's `PROGRESS.md` | A journal file per company, injected at the start of every session. A session is not complete until the journal has a new entry; code checks this. |
| Keep-working re-entry | `keepworking.py` | When a CLI turn ends before its `done_when` and inside its session budget, the runtime re-enters it with a continue prompt |
| Session budget | longrun's spend guard and clock | Each session gets wall-clock and shadow-cost caps from the company cap. Bounded deep sessions (1–3 h) only for dossier research and build. |
| Cadence and events | dusk routines and webhooks | A daily operating session per live company, plus wakes on payment, form, mail and expert-verdict events |
| Heartbeat and stall | longrun heartbeat and board | The auditor flags a company whose journal or evidence is older than its stage allows |
| Durable checkpoints | longrun git-bundle egress | Each company's workspace is a git repo, committed at the end of every session |
| Key relay | `key_relay.py` | Engines never hold real rail keys. They act through Cofactory tools, which is already the design for money. |
| Always on, server-side capped | longrun Modal caps | Hosted dusk (`duskbot serve`) with a lifetime cap on every rented machine |

The market is the grader: unlike ULR, every session can be scored by real events (replies, payments, refunds). The
auditor feeds those back into the next session's brief.
