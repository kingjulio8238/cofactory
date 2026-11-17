# Paul Graham, batch 1: ideas and discovery

Rules for the Cofactory pipeline (discover → dossier → validate → launch → first dollar → kill/continue), distilled from 15 essays. Each essay was read in full from paulgraham.com on 2026-11-17. Quotes are verbatim.

Recurring translation: PG's "self" (your own needs, your friends, your prepared mind) does not exist for an agent. Cofactory's stand-ins are (1) the owner's own domain and network, (2) hired niche experts, and (3) observed evidence from real people. Advice that leans on the founder's own taste becomes a rule about which of those three supplied the signal.

---

## How to Get Startup Ideas
https://paulgraham.com/startupideas.html

1. **Depth beats breadth (the "well").**
   (a) "you can either build something a large number of people want a small amount, or something a small number of people want a large amount."
   (b) Pipeline rule: the dossier must name one segment and show at least 5 distinct prospects with urgent-pain evidence: a costly workaround in use (spreadsheet, freelancer, manual process, paid substitute), or time or money lost per week. Market size counts only as a minimum-revenue floor and never as a positive score at discovery.
   (c) Does not transfer: PG wants the well *plus* "a fast path out." A bootstrapped niche business does not need the path out to be worth running. Score expansion paths only at the continue gate.

2. **Who wants it right now, from an unknown vendor?**
   (a) "Who wants this so much that they'll use it even when it's a crappy version one made by a two-person startup they've never heard of?"
   (b) Pipeline rule: validation requires a list of named, reachable buyers (person, company, contact channel), each linked to their evidence. If the factory cannot produce 10, the candidate fails.
   (c) Does not transfer: an AI-run company is even less known than "a two-person startup." Each candidate must also carry a trust path: a hired expert as the public face, pay-on-result pricing, a guarantee, or a free first deliverable.

3. **Plausible-sounding is the default failure mode.**
   (a) "So if all you know about a startup idea is that it sounds plausible, you have to assume it's bad."
   (b) Pipeline rule: every LLM-generated idea starts at a prior of *reject*. It advances only on external evidence artifacts (URLs, quotes, payments). Classify each prospect response as `committed` (paid, pre-ordered, signed an LOI), `urgent` (a current workaround or cost) or `hypothetical` ("Yeah, maybe I could see using something like that."). `hypothetical` gets weight 0, because "Sum that reaction across the entire population, and you have zero users."

4. **Made-up ideas converge.** This is the anti-convergence principle.
   (a) "when people make up startup ideas, they tend to make up the same ones."
   (b) Pipeline rule: each candidate must cite at least 1 input unique to this factory (the owner's domain, a hired expert's claim, a local market, private data). Embed every candidate and dedupe it against the cross-factory registry. Penalize candidates within radius r of ideas other factories are already pursuing, and reject exact matches.

5. **A competitor is not a kill. Lock-in is.**
   (a) "unless you discover a competitor with the sort of lock-in that would prevent users from choosing you, don't discard the idea."
   (b) Pipeline rule: count competitors as demand evidence. Kill only on lock-in (multi-year contracts, data gravity, regulatory exclusivity, network effects). Require a one-sentence "overlooked thesis" naming what incumbents miss. "An X that doesn't suck" fails.
   (c) Does not transfer: in an *extremely* niche market the revenue ceiling is tiny, so one adequate incumbent can saturate it. Add a kill when an incumbent already serves the exact segment well at or below the planned price.

6. **Mine stated demand, inside judgeable domains, and sell before you build.**
   (a) "Why doesn't someone make x?  If someone made x we'd buy it in a second."
   (b) Pipeline rule: discovery scrapes forums, reviews, job posts and support threads for demand phrases ("why doesn't someone", "I'd pay for", "is there a tool that") as the primary source. Ideas outside the owner's or a hired expert's domain are down-weighted (PG's Dunning-Kruger point). Run Buchheit's test from the essay's notes: attempt to sell before building. A failed sale must log what buyers asked for instead.

## Organic Startup Ideas
https://paulgraham.com/organic.html

1. **Become the user.**
   (a) "I'd encourage anyone starting a startup to become one of its users, however unnatural it seems."
   (b) Pipeline rule: the dossier must include a dogfood trace. An agent performs the target user's task with today's tools and logs the steps, time and failure points. If no friction is found, the candidate fails.
   (c) Does not transfer: "what do you wish someone would make for you?" has no subject for a bot. Use the owner's or an expert's own wishes, plus the dogfood trace.

2. **Newly fixable needs are the gold.**
   (a) "There's nothing more valuable than an unmet need that is just becoming fixable."
   (b) Pipeline rule: score feature `enabler_age`. Cite the dated change (a new API, rule, price drop or model capability) that makes the fix possible now. Ideas that were feasible 5+ years ago and are still unsolved need an explanation of why.

3. **Free open source caps the price.**
   (a) "It's hard to compete directly with open source software."
   (b) Pipeline rule: if a free or OSS tool already solves the job for this segment, kill unless the dossier names the chargeable part (hosting, done-for-you service, data, compliance).

## Ideas for Startups
https://paulgraham.com/ideas.html

1. **An idea is a question, not a blueprint.**
   (a) "The initial idea is just a starting point-- not a blueprint, but a question."
   (b) Pipeline rule: store each candidate as a falsifiable hypothesis with an explicit kill criterion and a pivot log. A pivot that keeps the evidence base counts as progress, not failure.

2. **Bite off a subset.**
   (a) "is there some way to bite off some subset of the problem, then gradually expand from there?"
   (b) Pipeline rule: each candidate needs a wedge spec deliverable within a fixed fraction (for example 25%) of its budget cap. Reject candidates whose smallest sellable unit exceeds that.

3. **Intolerable plus possible.**
   (a) "finding the problem intolerable and feeling it must be possible to solve it."
   (b) Pipeline rule: two required dossier fields, each scored separately. `pain_intensity` must be evidenced, not inferred. `feasibility_proof` must be a working spike or prototype output on a real sample.

4. **Turn a luxury into a commodity.**
   (a) "People must want something if they pay a lot for it."
   (b) Pipeline rule: a discovery generator finds jobs that a niche currently buys from humans at high prices (consultants, agencies, specialists, bookkeepers) and targets an AI-delivered version at least 10x cheaper. A current price paid is the strongest demand proof available.

5. **Cross distant fields.**
   (a) "you have a better chance of generating those if you combine stuff from distant fields."
   (b) Pipeline rule: the generator crosses the owner's domain with a randomly sampled second domain per run. This is a cheap divergence lever, because each factory's crossings differ.

6. **The final-stage question.**
   (a) "will people actually pay for this?"
   (b) Pipeline rule: a hard gate before launch requires at least 1 payment, deposit or signed commitment.
   (c) Does not transfer: "Design for Exit" (build for multiple acquirers) does not apply to bootstrapped ventures whose goal is revenue.

## Schlep Blindness
https://paulgraham.com/schlep.html

1. **Schleps define the company.**
   (a) "A company is defined by the schleps it will undertake."
   (b) Pipeline rule: the dossier lists every required schlep, each tagged `agent_absorbable` (paperwork, ugly portals, data cleaning, compliance forms, integration grind) or `human_gate` (licensing, identity, in-person, signatures). Agent-absorbable schleps add to a moat score. Human-gate schleps subtract owner-hours at a stated cost.
   (c) Does not transfer: PG says schleps are mostly an illusion that founders' energy overcomes. For Cofactory, human-gate schleps are real, scarce owner time, so cost them rather than ignore them.

2. **Feared ideas are undervalued.**
   (a) "That scariness makes ambitious ideas doubly valuable."
   (b) Pipeline rule: score feature `tedium_barrier`. When the main reason competitors are absent is tedium the agents can absorb, raise the score.
   (c) Does not transfer: agents have no unconscious aversion, but they have a mirror bias: they drift toward pure-software, easy-to-describe SaaS ideas. Enforce a quota of ops-heavy and service-heavy candidates in every discovery batch.

3. **Take yourself out of the picture.**
   (a) "what problem do I wish someone else would solve for me?"
   (b) Pipeline rule: ask every hired expert and every interviewee exactly this question, and log the answers verbatim as discovery inputs.

## Frighteningly Ambitious Startup Ideas
https://paulgraham.com/ambitious.html

1. **Win the initial core. The long term comes later.**
   (a) "Don't worry if something you want to do will constrain you in the long term, because if you don't get that initial core of users"
   (b) Pipeline rule: discovery and launch scoring has no long-term architecture or scalability terms. Optimize only for the first paying segment.

2. **Start deceptively small and expand toward demand.**
   (a) "Start with something you know works, and when you expand, expand westward."
   (b) Pipeline rule: expansion happens only to an adjacent segment that shows inbound or comparable evidence, never to a pre-planned roadmap target.

3. **Humans inside the machine.**
   (a) "You make something that looks to the user like the sufficiently smart compiler, but inside has people"
   (b) Pipeline rule: allow Wizard-of-Oz delivery. Hired experts plus agents deliver the service before it is automated, and automation priority follows the most-repeated manual steps in the delivery log.

4. **Price from the buyer's time.**
   (a) "Considering how much time I spend in email, it's kind of scary to think how much I'd be justified in paying."
   (b) Pipeline rule: price anchor = (hours saved per month × buyer's hourly value). Record this anchor in the dossier next to the planned price.
   (c) Does not transfer: the ideas themselves (search engines, replacing universities) are far outside a capped-budget niche factory. Kill any candidate whose wedge exceeds the budget cap.

## Why Smart People Have Bad Ideas
https://paulgraham.com/bronze.html

1. **Never take the first idea.**
   (a) "spend at least a couple days considering different ideas, instead of going with the first that comes into your head."
   (b) Pipeline rule: each discovery run generates at least N (for example 30) candidates and ranks them on one rubric. Generation order carries no weight.

2. **Sunk cost is not evidence (the still life effect).**
   (a) "having invested time in something doesn't make it good."
   (b) Pipeline rule: at every gate, a fresh agent with no build history re-scores the dossier. Spend-to-date and effort are excluded from its input.

3. **Pick the highest-paying option, not the first viable one.**
   (a) "Is this, of all the things we could make, the thing people will pay most for?"
   (b) Pipeline rule: the portfolio is ranked by expected revenue per budget dollar. At each gate the venture is compared against the current best queued alternative.

4. **Muck pays, fun doesn't.**
   (a) "Work people like doesn't pay well, for reasons of supply and demand."
   (b) Pipeline rule: penalize hobbyist-saturated domains (games, creator tools, recipe or event sites, dev toys). Add a bonus for unglamorous B2B operations.

5. **A niche is not an impoverished market (hyenas).**
   (a) "Watch people who have money to spend, see what they're wasting their time on, cook up a solution, and try selling it to them."
   (b) Pipeline rule: segment members must already demonstrably spend at least $X a year on adjacent tools or services. Reject niches chosen *to avoid competition* when they have no proven spend. Trade press is a cheap discovery source ("Reading the Wall Street Journal for a week should give anyone ideas").

## How to Get New Ideas
https://paulgraham.com/getideas.html

1. **Collect anomalies, not ideas.**
   (a) "The way to get new ideas is to notice anomalies: what seems strange, or missing, or broken?"
   (b) Pipeline rule: discovery agents emit raw anomaly records `{type: strange|missing|broken, source_url, quote, date}`, not business ideas. Ideas are synthesized only from clusters of at least k anomalies from independent sources. This matches startupideas note 6: log "Not startup ideas, just the raw gaps and anomalies."

2. **Zoom in until the gaps show.**
   (a) "when you learn enough to get close to one, you'll notice it's full of gaps."
   (b) Pipeline rule: run discovery depth-first, at least 3 levels into a sub-sub-domain (for example dentistry → orthodontics → aligner-lab billing) before it may emit anomalies. Shallow domain scans are not accepted as input.

## Crazy New Ideas
https://paulgraham.com/newideas.html

1. **Expert-proposed implausible ideas get a hearing.**
   (a) "Most implausible-sounding ideas are in fact bad and could be safely dismissed. But not when they're proposed by reasonable domain experts."
   (b) Pipeline rule: when a hired expert proposes an idea the scorer rates implausible, it may not be auto-rejected. It goes to evidence-gathering with an up-weight. Cross-domain experts get the same treatment (note 1).

2. **Critics must falsify, not just attack.**
   (a) "it's easy to launch a devastating attack on a new idea, and anyone who does will seem clever"
   (b) Pipeline rule: a critic or red-team agent must attach a falsifying test (a query, an outreach experiment, a data check) to each objection. Objections without a test do not reduce the score.

3. **Size the bet by payoff.**
   (a) "it's worth working on something that only has a 10% chance of succeeding if it would make things more than 10x better."
   (b) Pipeline rule: rank by expected value per budget dollar (p(first dollar) × revenue if it works ÷ cost).
   (c) Does not transfer: PG limits this to math, engineering and hard science, and a capped niche factory cannot hold many long shots. Cap long-shot candidates at a fixed share of the portfolio.

## What Microsoft Is this the Altair Basic of?
https://paulgraham.com/altair.html

1. **A lame-looking idea needs its "path out" named, but only at the continue gate.**
   (a) "Now it's a puzzle, and the burden is on me to solve it." (said of a lame-sounding idea)
   (b) Pipeline rule: at kill-or-continue, the review lists named expansion paths (adjacent niches the same delivery serves) to choose between *continue and expand* and *harvest as is*. "Sounds small or lame" is never a kill reason by itself.
   (c) Does not transfer: PG is screening for a giant company. A niche venture can be a good outcome with no path out.

## The Ronco Principle
https://paulgraham.com/ronco.html

1. **In small connected niches, reputation is the real policy.**
   (a) "In a sufficiently connected and unpredictable world, you can't seem good without being good."
   (b) Pipeline rule: no deceptive outreach, and disclose that the business is AI-run where asked. Cap cold-outreach volume per niche community, with a cross-factory cap so many factories do not spam the same few hundred people. Track complaints and unsubscribes per venture, and auto-pause at a threshold.

## The Power of the Marginal
https://paulgraham.com/marginal.html

1. **A healthy idea stream is mostly wrong.**
   (a) "If most of your ideas aren't stupid, you're probably being too conservative."
   (b) Pipeline rule: a calibration metric. If the evidence stage kills less than about 70% of candidates, the generator is too conservative, so raise its temperature and domain spread.

2. **Cheap and lightweight wins.**
   (a) "cheap things spread faster, and lightweight things evolve faster."
   (b) Pipeline rule: prefer candidates with the lowest cost-to-first-dollar and the shortest iteration loop. Track cycle time per experiment as a factory-level metric.

3. **Target what incumbents can't cannibalize or find undignified.**
   (a) "companies just don't want to see a path whose immediate effect is to cut an existing source of revenue."
   (b) Pipeline rule: score feature `incumbent_conflict`. It is true when the incumbent's revenue model (hourly billing, seat licenses, agency retainers) prevents it from offering the cheap version.

4. **Keep customer and build in one head.**
   (a) "The needs of customers and the means of satisfying them are all in one head."
   (b) Pipeline rule: each venture has one persistent dossier that every agent reads and writes. Handoffs between discovery, build and sales agents must carry the raw customer quotes, not just summaries.

5. **Jump on platforms dismissed as "not ready for real work".**
   (a) "yeah, it's popular and cheap, but not ready yet for real work, jump on it."
   (b) Pipeline rule: score bonus for building on platforms or channels under about 3 years old where the segment already gathers.

## Six Principles for Making New Things
https://paulgraham.com/newthings.html

1. **Find the real problem, ship crude, iterate.**
   (a) "launch as soon as you can, so you start learning from users what you should have been making."
   (b) Pipeline rule: the v1 scope is the single job the dossier marks as the "real problem" (Viaweb's real problem was site design, not transaction processing). Track time from validation pass to first live user, and alarm when it exceeds a budget-scaled limit.

2. **Simple solutions to overlooked problems.**
   (a) "simple solutions (b) to overlooked problems (c) that actually need to be solved"
   (b) Pipeline rule: three dossier checks: solution complexity (prefer fewer components), overlookedness (few or no direct solutions), and need (the evidence-class rule above).
   (c) Does not transfer: "deliver them as informally as possible" worked because a credible human showed up in person. An unknown AI vendor needs *more* trust signals, not fewer. Informality is fine in product polish but not in trust.

## Fashionable Problems
https://paulgraham.com/fp.html

1. **Everyone works on the same small corner.**
   (a) "only a small fraction of the space of possibilities has been explored, because they've all worked on similar things."
   (b) Pipeline rule: keep a cross-factory occupancy map of pursued ideas in embedding space. Score novelty as distance to the nearest k pursued ventures, and route generators toward sparse regions.

2. **Look in "played out" fields.**
   (a) "one of the best places to look is in fields that people think have already been fully explored"
   (b) Pipeline rule: seed discovery with old, boring industries (trades, local government suppliers, niche manufacturing, compliance) at a fixed share of each batch.
   (c) Does not transfer: "genuinely love what you're doing" as protection does not apply to agents. The occupancy map replaces it.

## The Airbnbs
https://paulgraham.com/airbnbs.html

1. **Ramen profitability is "airborne".**
   (a) "This is the point where you no longer need investors' permission to continue existing."
   (b) Pipeline rule: each venture defines ramen = monthly revenue ≥ its monthly run cost (tokens, infra, expert fees, priced owner-hours). First dollar is the validate milestone. Ramen is the continue threshold.

2. **Growth versus noise.**
   (a) "it was hard to say for sure whether it was growth or just random fluctuation."
   (b) Pipeline rule: decide continue or kill on a weekly revenue series of at least 3 points (Airbnb's was $460 → $897 → $1428), never on one week.

3. **Start with the hottest subset.**
   (a) "The way to get growth started in something like Airbnb is to focus on the hottest subset of the market."
   (b) Pipeline rule: launch to the sub-segment with the strongest measured demand signal (search volume, inbound inquiries, anomaly density). Put unscalable effort there first (Airbnb's founders photographed hosts' listings themselves). For an AI venture, that effort comes from a hired local expert.
   (c) Does not transfer: Airbnb survived a year of no growth on its founders' credit cards and conviction. An agent's persistence is free but its budget is capped, so "keep going" must come from the gate rule, not from conviction.

## How to Start Google
https://paulgraham.com/google.html

1. **Sticking doors: workarounds that have persisted for years.**
   (a) "To the people in the shop it must seem like this mysterious natural phenomenon that the door sticks"
   (b) Pipeline rule: search for long-lived workaround artifacts, such as warning notices, manual how-to guides, paid spreadsheet templates and FAQ entries about the same pain, dated at least 1 year old. Persistence is evidence that the need is real and unsolved.

2. **"Would be really sad to lose."**
   (a) "would be really sad to lose if you shut it down"
   (b) Pipeline rule: after launch, survey users with "how would you feel if this shut down?" and require a minimum share of "very sad/disappointed" answers to continue. Count repeat usage without prompting as the behavioral version.
   (c) Does not transfer: "build things for yourself and your friends" has no subject for a bot. The owner's network and hired experts are the closest substitute.

---

## Strongest rules from this batch

1. **Evidence class beats plausibility.** LLM-generated ideas start at *reject*. Only external artifacts advance them. Responses are scored committed > urgent > hypothetical, and hypothetical = 0. (startupideas)
2. **Well-shaped demand.** At least 5 to 10 named, reachable buyers with urgent pain shown by a costly workaround in use. Market breadth is a floor, never a score. (startupideas)
3. **Anti-convergence by construction.** Each candidate cites at least 1 input unique to this factory (owner domain, hired expert, local or private data). Embed-dedupe against a cross-factory occupancy map, penalize dense regions, and seed a fixed share from "played-out" boring industries and distant-field crossings. (startupideas n7, fp, ideas)
4. **Discover from anomalies and stated demand, not brainstorming.** Log raw strange/missing/broken records, "why doesn't someone make X / I'd pay for" phrases and long-lived workarounds. Synthesize ideas only from clusters of independent anomalies, depth-first in a sub-sub-domain. (getideas, startupideas, google)
5. **The niche must already spend money.** Find jobs bought from humans at high prices and deliver them at least 10x cheaper. Reject "impoverished" niches chosen to avoid competition. Favor needs that are *newly fixable* (a dated enabler) and incumbents whose revenue model can't cannibalize. (ideas, bronze, organic, marginal)
6. **Sell before build. Ship crude v1 to the hottest sub-segment.** At least 1 payment or commitment before launch. Track time to first user and first dollar. (startupideas n15, ideas, newthings, airbnbs)
7. **Score schleps by who bears them.** Agent-absorbable tedium is a moat (+). Human-gate schleps cost priced owner-hours (−). Force a quota of ops-heavy candidates to counter LLM drift toward easy SaaS. (schlep, startupideas)
8. **Competitors are not a kill.** Lock-in is a kill. So is an incumbent already serving the exact niche well at or below the planned price, and so is a free OSS substitute with no chargeable part. Require a one-line "what incumbents overlook" thesis. (startupideas, organic)
9. **Breadth and sunk-cost hygiene.** Generate N of at least 30 and rank on one rubric. A fresh agent with no build history re-scores at every gate. Critics must attach a falsifying test, and expert-proposed "crazy" ideas cannot be auto-rejected. If the evidence stage kills less than about 70%, the generator is too conservative. (bronze, newideas, marginal)
10. **Kill or continue on a run-cost-based ramen threshold.** Continue when monthly revenue ≥ the venture's full run cost, judged on at least 3 weekly points plus "very sad to lose" or repeat-use evidence. Expansion paths matter only here. (airbnbs, google, altair)
