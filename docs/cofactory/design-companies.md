# Design: companies as the app

Status: agreed direction (2026-11-18). Owner decisions: a dropdown per company in the sidebar with no factory group and no
lead or scout; an approve stage before the first company starts; the CEO hires focused agents; the CEO reviews all work
and the owner sees everything.

## What the owner sees

The sidebar is the org chart of their companies, and nothing else. The factory's lead and scout keep working, but as
machinery: their output reaches the owner as candidates to approve, money moves and company dashboards, never as chats.

```
┌──────────────────────────┐ ┌────────────────────────────────────────────────────┐
│ Home                  2● │ │ Riverside Recon                     Build · day 3  │
│                          │ │                                                    │
│ ▾ Riverside Recon   $150 │ │  Earned $150   Spent $12   Left $38   5 days left  │
│     Dashboard            │ │                                                    │
│     Review            3  │ │  Buyers 24 → contacted 18 → replied 4 → paid 1     │
│     CEO               ●  │ │                                                    │
│     Head of Outreach     │ │  Agents                                            │
│     Remit Reconciler     │ │   CEO               reviewing 2 drafts     now     │
│ ▸ Hatchery Ledger     $0●│ │   Head of Outreach  wrote 6 emails         4m ago  │
│ ▸ Boiler Logbook      $0 │ │   Remit Reconciler  idle, next order Fri           │
│                          │ │                                                    │
│                          │ │  Live                                              │
│                          │ │   09:14 payment $150 from Riverside Pharmacy 1     │
│                          │ │   09:02 CEO accepted October report                │
│                          │ │   08:40 reply from owner3@… "send pricing"         │
└──────────────────────────┘ └────────────────────────────────────────────────────┘
```

- **Home** (a page, not a bot): new companies to approve, the portfolio (each company's earnings, spend and days
  left), and the factory's settings. Its dot counts what needs the owner across everything.
- **One dropdown per company**: only the open one is expanded. Its header carries earnings and a needs-you dot.
  Inside are Dashboard, Review and the agents, CEO first and then by reporting line. Agents are named by title alone,
  since the dropdown already says which company.
- The owner's own non-Cofactory bots and dusk bot stay hidden in Cofactory mode.
- It replaces `CompanyRail` and `factory-scope`. `Sidebar.tsx` is at its line limit, so this is a new component the
  app renders in Cofactory mode, not more edits to `Sidebar`.

## Approve stage

The app opens on Home's **Pick your first companies**, never on a chat. Candidates arrive as cards while the scout
works. The owner can leave, and a notification brings them back.

```
Pick your first companies                       scout: searching ●
┌─────────────────────────────────────────────────────────────┐
│ DIR fee reports for one-store pharmacies, Ohio              │
│ $150/mo · buyers say "a whole weekend every month" (4 sites)│
│ rival: RemitCheck, $49+/mo, chains of 25+ only              │
│ [Start with $50]   [Pass]   [See the evidence]              │
├─────────────────────────────────────────────────────────────┤
│ Hatchery biosecurity logbooks        checking 2 of 3 sources│
└─────────────────────────────────────────────────────────────┘
```

**Speed is the real blocker.** In the live run, a full day of model use (the $25 ceiling) produced 30 niches and no
dossier. The approve stage needs a first card quickly, so discovery splits in two:

1. **First pass, for the card:** about 8 niches, and the 3 strongest get a light dossier. That covers the buyer, the job,
   a price someone pays today, a rival, and 3 verified quotes from 3 sites. It's enough to decide, and every claim on the
   card is still checked against its source.
2. **Full dossier, after Start:** the rest of the dossier is researched and verified once the owner says Start. The
   company launches when it is shortlisted. If verification fails, the owner is told why and no money moves.

**Pass** teaches the scout: the reason feeds the factory's "never" list and its next search.

Target to measure on a real-model run before building further: time and model cost to the first card.

The territory draw drops NAICS catch-alls ("All Other Legal Services", "All Other Miscellaneous Schools and
Instruction"). They make vague territories and read badly.

## Org: the CEO hires focused agents

A company starts with its **CEO** alone. The CEO hires agents for one job each, and retires them when the job is done.

**An agent has:**
- a title ("Head of Outreach", "Remit Reconciler");
- a charter: what it does, and for whom;
- one measurable output ("10 personalised first emails a day to listed buyers", "each paid order's report within 48 h");
- **capabilities** picked from a fixed set:
  - research;
  - outreach drafts;
  - publish;
  - deliver;
  - code;
- a model budget, a reporting line, its own chat, memory and journal.

**Titles are free text; capabilities are the security boundary.** The tool list an agent gets comes from its
capabilities, not its title. Outward actions keep their gates: outreach only once the owner armed it, and spend within
the company's cap.

**Two harnesses:**

| | CEO harness (exists: company sessions) | Agent harness (new) |
|---|---|---|
| Wakes on | cadence, events (reply, payment, order), owner messages | a brief from the CEO; cadence only if the charter is recurring |
| Each session | reads the dashboard, hires, briefs, reviews the queue, reports | works one brief inside the envelope, then submits work |
| Ends with | journal + end_session | `submit_work` (artifact, summary, evidence) + journal |
| Persistence | journal, memory, workspace | the same, plus its charter and its open briefs |

**New tools:**
- CEO: `hire` (title, charter, output, capabilities, budget), `brief`, `review` (accept / revise with a note),
  `retire`.
- Agent: `submit_work`.

The existing fixed seats (builder, marketer, seller, operator) become hires the CEO makes as it needs them. The
bus-factor rehearsal stays: a stand-in serves an order from the delivering agent's runbook.

**Limits, because model use is our cost:**
- about 6 agents per company;
- 2 working at once per company;
- each company gets a share of the operator's daily model ceiling, weighted towards companies that earn;
- `fake_work` per agent: model spend with no accepted work raises it to the CEO.

## Review: the CEO checks everything, the owner sees everything

A **work item** is anything an agent makes:
- an email draft;
- the offer page;
- a deliverable;
- a piece of research;
- code.

Each one moves through these states:

```
submitted ──► CEO: checks (claims verified, file exists, charter's output met) + judgment
                 ├─ revise ──► back to the agent with the note
                 └─ accept ──► outward-facing? ── yes ──► owner approves ──► shipped
                                                └─ no ───────────────────────► done
```

The **Review** page for each company has three sections:
- **Needs your OK**: only outward-facing work (first emails, the offer page, the first delivery to a customer);
- **Accepted by the CEO**;
- **Sent back**.

Each item shows a preview of the work, the CEO's note and the evidence. The owner can **Flag** anything: it becomes a
brief to the CEO and counts against the agent in the CEO's next review. Today's offer page and first-email gates move
into this flow.

## Dashboard: live, per company

Most of the numbers already exist; they only need a page.

| Number | Source |
|---|---|
| Earned, spent, cap, left | the book's ledger |
| Days left (to go live, to a paying customer) | rails `armedAt`, settings |
| Funnel: buyers → contacted → replied → paid → delivered | sprints, touches, inbound, orders |
| Agents: working now, last output, model use today | sessions, work items, shadow cost |
| Live feed | the decisions log (already traced to evidence) |
| First-dollar gate | orders, rehearsals |

Real-time comes from a server-sent stream of the decisions log. There is no polling loop per widget.

## Build order

Each stage passes its test before the next starts.

1. **Approve stage with the fast first pass.** It is the blocker to the first dollar and to the live run.
   *Test:* a real-model shadow run, measuring time and cost to the first card. Then the walkthrough ends in Pick, not a
   chat.
2. **Sidebar and Home.** Company dropdowns, no rail, no lead or scout.
   *Test:* walkthrough and DOM tests.
3. **Company dashboard.** Read-only, from existing data, live.
   *Test:* the lifecycle test checks its numbers at each step.
4. **Agents and review.** Hire, brief, submit, review and retire, capabilities, the agent harness, and the Review page;
   the fixed seats are retired.
   *Test:* the lifecycle test has the CEO hire two agents, send one draft back, accept the other, and the owner approve
   the outward one.
