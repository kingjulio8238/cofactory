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

## After the fixes: a second run (`bd6903a90`)

**What was fixed:**
- **Hours:** an hourly price needs its hours quoted from a page.
- **Vendor pages:** a vendor's pages never count as buyers talking, and a card needs buyers' words on two sites that
  aren't vendors.
- **Price kind:** a card says who set today's price.
- **Risk fields:** the platform risk is a named platform and term, or none.

**Checking run 1's cards:** run 1's three cards are rejected under the new rules. Two have unsourced hours, and all
three have only one non-vendor buyer site.

**Second run:** a fresh factory with six new industries (pet retail, software, nurseries, title offices, apparel
contractors, meat wholesale), same settings.

| Step | Run 1 | Run 2 |
|---|---|---|
| Search of 8 ideas | 35 min, $6.18 | 89 min, $16.14 (two sessions; the scout fanned out to 51 subagents before recording anything) |
| First card | 40 min, $6.99 | 95 min; the card itself took 6 min and $1.05 |
| All three cards | 48 min, $8.42 | 116 min, $19.80 |
| A card failed, then fixed | none | NurseryClear: v1 and v2 refused (one non-vendor buyer site); v3 added a checked buyer quote and passed |

**The three cards:**
- **CloseGuard Verify:** wire-fraud and seller-ID checks for one- and two-person Ohio title shops.
  - **Price:** labelled honestly as *CertifID's list price*, $48 a closing. We'd charge $14.
  - **Buyer evidence:** a BiggerPockets thread and a job post.
- **NurseryClear:** phytosanitary paperwork done right for small nurseries. $50 a shipment today; $15 from us.
  - **Buyer evidence:** a growing forum and a Q&A site, the second added by the scout when its first two tries were
    refused.
- **PackReady:** factory-ready tech packs for solo apparel founders.
  - **Price:** a freelancer's $220 rate. We'd charge $65.
  - **Buyer evidence:** three job posts.

**What still isn't right:**
1. **Search speed varies widely by run.** Run 2's scout researched for 37 minutes before recording a single quote. It
   spent more than run 1's whole search, so it hit the $15 ceiling before the cards. That ceiling was raised to $22 for
   this run only. A search should record as it goes, and the first search should be bounded by time.
2. **Who set the price is the scout's own word.** NurseryClear's "a buyer says what they pay" is really a nursery's own
   shipping fee. The only contradiction caught is a rival's site. A cheap second check could catch more: who wrote the
   price's page, compared with the declared kind.
3. **Cards cost more under the stricter rules:** $1.05 and $2.08 against $0.59. That is the price of the evidence the
   owner asked for.

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
