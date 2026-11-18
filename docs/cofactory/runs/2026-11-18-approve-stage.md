# Run: the approve stage on a real model (2026-11-18)

**Setup:**
- A fresh, isolated factory, separate from the owner's app and data.
- Claude Sonnet 5 on the owner's Claude Code sign-in.
- Based in Ohio, with a $500 monthly budget and dynamic allocation.
- Six industries drawn by the factory: radio broadcasting, port and harbor operations, aircraft engine parts,
  nonresidential property managers, funeral homes, flour milling.
- An operator model ceiling of $15 a day.

**Result:** the gate passed. Cards reached the owner in 40 minutes, and a started company opened by itself 30 minutes
after Start. Model use came to about $12.74 at API prices. The previous design produced no dossier in a full day for
$25.

## Timeline (UTC)

| Time | Elapsed | What happened | Model use so far |
|---|---|---|---|
| 05:56 | 0 | Factory opened: territories drawn, lead and scout staffed, search started | $0 |
| 06:10 | 14 min | First idea proposed (CAM and certificate-of-insurance work for property managers) | — |
| 06:31 | 35 min | 8 ideas from 27 quotes, each checked on its page; quotas met | $6.18 |
| 06:32 | 36 min | Search closed; 3 ideas picked for cards | $6.40 |
| 06:36 | **40 min** | **First card ready: ReconComply** | $6.99 |
| 06:44 | 48 min | All three cards ready (ReconComply, TraceBirth, BenchComply) | $8.42 |
| 06:45 | 49 min | Owner (tester) starts BenchComply and passes on ReconComply | |
| 07:05 | 69 min | Full dossier v1 fails: score 73.5, vetoes platform_tos, procurement, unverified | $11.16 |
| 07:15 | **79 min** | v2 fails (unverified); **v3 shortlisted (score 72.5, 100% verified)**; **BenchComply opens by itself** | $12.74 |

## The three cards

**BenchComply (started, now open).**
- **Offer:** monthly utility data collection and multi-city energy benchmarking filing, before every deadline.
- **Price:** buyers pay $470/mo today (Gridium's small-building price). We charge $139/mo.
- **Rival:** EnergyPrint, which gathers the data but doesn't track each city's deadlines and penalties.
- **Example buyer:** Lincoln Property Company.
- **Evidence:** Philadelphia's $300 fine after 30 days; a case study on manual bill collection; Gridium on overstretched
  property staff.

**TraceBirth (ready, undecided).**
- **Offer:** back-to-birth traceability files for life-limited aircraft parts.
- **Price:** today's figure is a $125/h shop rate times **8 hours a month the scout assumed**. We charge $299/mo.
- **Rival:** Veryon, which stores records but rebuilds no history.
- **Example buyer:** Carson Helicopters.
- **Evidence:** Duncan Aviation on overhauls delayed for weeks by missing records.

**ReconComply (passed).**
- **Offer:** CAM reconciliation against lease language, plus certificate-of-insurance tracking, for property managers.
- **Price:** $17/h with assumed hours. We charge $79/mo.
- **Why passed:** the price comparison rests on unsourced hours.

## What the run showed (to fix next)

1. **Unsourced hours.** An hourly price is turned into a monthly one with an hours-per-month figure nobody sourced. It
   happened on two of the three cards. A card should require a quoted monthly figure, or a quoted hours figure.
2. **Vendor pages as buyer evidence.** A vendor's own page stands in for the buyer:
   - the rival's site was one of ReconComply's three "buyer" quotes;
   - BenchComply's "price today" is a vendor's list price.

   That is a real spend signal, but it is not a buyer's own words.
3. **Risk fields misread.** The dossier's first attempt was vetoed by how the scout filled in the risk fields. It wrote
   a sentence where "none" belonged, and it marked procurement as true. The fields' wording needs to be plainer.
4. **The scout didn't close its own search.** It ended its session without closing the search. The runtime now closes a
   complete search itself (`f74a100e6`).

## How to review

- **The pages:** open http://127.0.0.1:5398 while the view server runs (factory icon → Home). The factory's runtime is
  off, so nothing runs or spends there. Messaging one of its bots would use your Claude sign-in.
- **The records:** the data folder is `/private/tmp/claude-501/-Users-juliansaks-Desktop-code-cofactory/91cf0647-5977-4cdb-96e2-aed5a64ff653/scratchpad/shadow2`.

## Your feedback

Per card: would you have pressed Start, Pass (and why), or wanted something on the card that wasn't there?

- BenchComply:
- TraceBirth:
- ReconComply:
- The Pick page itself:
