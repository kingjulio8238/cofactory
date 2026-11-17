# PG batch 2: users, launching, making something people want

What these essays mean for an autonomous factory that runs extremely niche, bootstrapped companies. Quotes are verbatim from the essays. Each essay was fetched as full HTML, not as a summary. "Does not transfer" marks the places where PG assumes human founders, VC funding, or a broad market.

---

## 1. Do Things that Don't Scale
https://paulgraham.com/ds.html

**1.1 Users come from manual recruiting, not from waiting.**
- "You can't wait for users to come to you. You have to go out and get them."
- Pipeline rule: Launch cannot start until there is a list of named prospects: at least 20 individually identified buyers, each with a reachable channel. Track personal outreach per week, reply rate, and week-over-week growth in paying customers. A plan whose only acquisition is passive (SEO, a marketplace listing, ads) fails the gate.
- Does not transfer: "give me your laptop" and door-to-door both need a person who is physically present and trusted. High-volume bot cold outreach is spam: it gets accounts banned and breaks CAN-SPAM and GDPR. Cap outreach per opportunity, personalise every message, use channels where contact is expected or consented, and send in-person steps to hired niche experts.

**1.2 An idea is a vector: what you build, plus the unscalable thing you do to start.**
- "an idea where there is nothing you can do to get going ... is probably a bad idea, at least for those founders."
- Pipeline rule: Every dossier has an `unscalable_start` field. It must say where the first 10 buyers gather, how agents reach them without the owner's identity, and what gets done by hand. If the field is empty or generic ("social media", "content marketing"), the dossier is rejected automatically. Score feature: how reachable the first 10 buyers are for agents.

**1.3 Be the software: deliver by hand, then automate the bottleneck.**
- "If you can find someone with a problem that needs solving and you can solve it manually, go ahead"
- Pipeline rule: The first dollar must be earnable with a concierge service that agents perform by hand. Product-build spend stays locked until at least 1 customer has paid and been served this way. Log every manual step; automate first the steps repeated 3 or more times.
- Transfers better than for humans, because agent labour is cheap. The risk is Stripe's "practical joke": the customer believes the work is automatic or done by a human. Disclose that the service is AI-run wherever law or honesty requires it.

**1.4 Contained fire: start in a subset where you can reach critical mass.**
- "It's always worth asking if there's a subset of the market in which you can get a critical mass of users quickly."
- Pipeline rule: The dossier names a beachhead segment with a counted size (N reachable entities) and an estimated time to the first 10 customers. Score on how fast that segment can be reached.
- Does not transfer: Note 8 says to prefer the subset that signs up fastest over the one that pays most. With no VC money for a growth phase, Cofactory needs willingness to pay above 0 from the first segment.

**1.5 Insanely great experience, not product: ship at a quantum of utility, then attend to every user.**
- "get something in front of users as soon as it has a quantum of utility, and then see what they do with it."
- Pipeline rule: Ship v1 once it does one job end to end. Make up for its gaps with service: an agent answers early customers within 1 hour, and every early customer gets an individual follow-up. Track response time and repeat use for each customer.

**1.6 No Big Launch, no partnerships as the growth engine.**
- "All you need from a launch is some initial core of users."
- Pipeline rule: No budget for launch events, embargoed press, or a Product Hunt-style launch as the primary gate. Flag as high risk any plan whose first revenue depends on a deal with a large partner. Continue/kill reads how happy and how retained the first cohort is, not launch-day signups.

## 2. What I've Learned from Users
https://paulgraham.com/users.html

**2.1 What you learned from users is the test.**
- "Explain what you've learned from users."
- Pipeline rule: Every stage report has a "learned from users" section. It needs at least 3 concrete user statements or behaviours, each sourced (thread ID, call note, payment record), and each one must have changed a decision. A report with none fails the gate.

**2.2 Stop hacking the test.**
- "trains you to win by hacking the test instead of actually doing whatever it's supposed to measure."
- Pipeline rule: Gates read only real-world artefacts that can be checked from outside: payment-processor charge IDs, email or DM thread IDs, signed commitments. Prose an agent wrote about its own progress never satisfies a gate. This is the LLM reward-hacking failure in PG's words.

**2.3 An acquisition problem is often a product problem.**
- "Would you use this yourself, if you hadn't built it?"
- Pipeline rule: When acquisition stalls, triage checks product need first: do the prospects who engaged convert or come back? Only then does it add channels.
- Does not transfer: an agent is never a user of a niche product, so its "yes" means nothing. A real member of the target group or a hired niche expert has to answer this question.

**2.4 Founders misjudge which problem will kill the company.**
- "One is of moderate importance, one doesn't matter at all, and one will kill the company"
- Pipeline rule: Each week a reviewer agent outside the operating team ranks the risks and names exactly one "killer". Most of the next week's budget goes to the killer.
- Shard reviewers: each company gets a dedicated reviewer with persistent context, not a shared pool. PG's O(n²) "batch that broke YC" is the failure this avoids.

**2.5 Act at a resolution of a week or less.**
- "ideally at a resolution of a week or less — and then try those ideas and measure how well they worked."
- Pipeline rule: Every experiment states a hypothesis, a metric, and a deadline of 7 days or less (shorter is fine for agents). An experiment with no measurable result by its deadline closes as failed. Note 5 applies: the right cadence depends on the problem type.

## 3. The Other Half of "Artists Ship"
https://paulgraham.com/artistsship.html

**3.1 Every check has a cost.**
- "Whenever someone in an organization proposes to add a new check, they should have to explain not just the benefit but the cost."
- Pipeline rule: Each gate records its cost in agent dollars and latency, plus its kill rate. Audit the kills against later outcomes. Remove a gate whose kills do not predict failure. Ask the owner for approval only where law requires it.

**3.2 The harder a buyer is to sell to, the more you must charge, so pick buyers who can say yes alone.**
- "software costing up to about $1000 could be bought by individual managers without any additional approvals."
- Pipeline rule: Score feature "single-buyer purchase". The price sits under the buyer's discretionary threshold: card-payable, under about $1k a year for B2B. Opportunities that need procurement, a committee, or an RFP before the first dollar take a heavy penalty.
- Does not transfer: PG's answer is to charge $50k. An AI-run bootstrapped company cannot babysit enterprise sales cycles.

**3.3 Release with no external checks.**
- "If you have an idea for a new feature in the morning, you can write it and push it to the production servers before lunch."
- Pipeline rule: Track deploy latency, from change to production with no human in the loop. Penalise ventures on platforms that gate every release behind review (see 11.1).

## 4. A Version 1.0 (laundry.html)
https://paulgraham.com/laundry.html

This URL is an early draft of "The Age of the Essay", not an essay about users. It holds three rules for research agents.

**4.1 Ask what surprised them.**
- "the best way to get information out of them was to ask what surprised them."
- Pipeline rule: Every customer or expert interview script includes "What surprised you about X?" and "How is it different from what you expected?"

**4.2 Diff against a prediction made in advance.**
- "make a conscious effort to visualize the place beforehand, so I'll have a detailed image to diff with reality."
- Pipeline rule: Research agents write down their predicted answers before researching a niche. The dossier's novelty score is the number of findings that contradict those predictions. A niche with zero surprises probably was not researched.

**4.3 Calibrate; don't hedge.**
- "Sticking a perfunctory perhaps onto every statement may shield us from blame, but it tells the reader nothing."
- Pipeline rule: Each dossier claim carries an explicit confidence and its source. A lint flags blanket hedging words on claims that have no confidence value.

## 5. Web 2.0
https://paulgraham.com/web20.html

**5.1 Don't maltreat users.**
- "Never make users register, unless you need to in order to store something for them."
- Pipeline rule: A deterministic lint runs on every launch page. It counts the required fields before the user gets value, fails on email-confirmation gating, and fails on default opt-in to marketing email. Score: steps to first value.

**5.2 When unsure, say yes.**
- "just answer "yes" whenever you're unsure. Err on the side of generosity."
- Pipeline rule: Support agents follow a default-yes policy. Refunds, extensions, and exceptions under a set dollar cap are granted with no escalation.

**5.3 Real demand shows up as workarounds, not promotion.**
- "Users had been climbing in through the window for years before Apple finally moved the door."
- Pipeline rule: Tag every demand source as organic (people already hacking workarounds, unpaid builders, forum complaints) or promotional (vendor marketing, press, conference hype). Give organic workaround evidence the highest weight. Reject an opportunity whose demand evidence is all promotional.

**5.4 Don't let anyone fly under you.**
- "we tell startups that they should try to make as little money as possible."
- Pipeline rule (the part that transfers): The dossier names the cheapest and easiest existing alternative in the niche. Proceed only with a stated advantage in price or ease.
- Does not transfer: "give it away free" and "shrink the market" need ad-scale traffic. A niche business with tens of customers has to charge from day one.

## 6. The Future of Web Startups
https://paulgraham.com/webstartups.html

**6.1 Minimal v1; let users design the rest.**
- "release a minimal version one quickly, then let the needs of the users determine what to do next."
- Pipeline rule: Cap v1 scope at one job to be done. Order the post-launch backlog only by user requests or observed behaviour that cite a source, never by agent ideas alone.

**6.2 Others have your idea.**
- "Other people have your idea, and they'll be increasingly likely to do something about it."
- Pipeline rule: This is the convergence risk. Before committing, compare the opportunity by embedding similarity against a registry of the opportunities other factories are pursuing. Above the threshold, the factory must differentiate (another segment, or the owner's own expertise) or drop it. Track time from discovery to first outreach.

**6.3 Many cheap startups permit a portfolio approach to risk.**
- "they can start to look at the world in the same portfolio-optimizing way as investors."
- Pipeline rule: Treat each factory as a portfolio of hard-capped bets. Choose ideas with more variance than a single founder would accept, cap the downside with budget, and kill fast.

## 7. Snapshot: Viaweb, June 1998
https://paulgraham.com/vw.html

**7.1 Cost-to-serve can eat a flat price.**
- "I once calculated how much Frederick's was costing us in bandwidth, and it was about $300/month."
- Pipeline rule: Check unit economics per customer. Cost to serve (LLM tokens, API calls, expert hours) must stay below price for the top decile of usage. Otherwise add usage caps or tiered pricing before launch. This matters more for AI-run services than it did for Viaweb.

**7.2 The site is a funnel to one trial.**
- "The whole site was organized like a funnel, directing people to the test drive."
- Pipeline rule: The launch page has one primary call to action (try it, book it, or buy it). Track visitor-to-trial conversion.

**7.3 Use your own product.**
- "we wanted to experience what our users did."
- Does not transfer: agents cannot dogfood a niche product for, say, veterinarians. Instead, agents run the product end to end on real customer tasks during the concierge phase (1.3), and a paid niche expert trials it.

## 8. What Business Can Learn from Open Source
https://paulgraham.com/opensource.html

**8.1 Free amateurs can beat paid professionals.**
- "they can't pay people enough to build something better than a group of inspired hackers will build for free."
- Pipeline rule: The competitor scan must look for free, open-source, or hobbyist tools in the niche. If an enthusiast community already maintains a good free tool, take a heavy penalty.

**8.2 Bottom-up selection beats top-down judgement.**
- "People just produce whatever they want; the good stuff spreads, and the bad gets ignored."
- Pipeline rule: Generate several variants (offer, copy, price) and let real-world response (clicks, replies, payments) choose among them, not an agent's opinion. Draw no conclusion before a minimum number of real exposures.

**8.3 Love is the hard part; monetising it is the easy part.**
- "It's a lot harder to create something people love than to take something people love and figure out how to make money from it."
- Pipeline rule: Continue/kill tracks love signals (unprompted repeat use, referrals, complaints when it is down) next to revenue. Revenue without retention is not a "continue".

## 9. The Submarine
https://paulgraham.com/submarine.html

**9.1 Made-up numbers spread.**
- "But people like numbers. And so this one is now replicated all over the Internet, like a little worm of its own."
- Pipeline rule: Every market-size or count figure in a dossier must trace to a primary source with a stated method. A citation-chain check finds the earliest occurrence. Flag any figure that bottoms out in a guess, a trend piece, or a vendor press release.
- Does not transfer: PG seeded the "5000 stores" estimate and then cited it to claim 20% share. The factory must never plant figures or pose as press.

**9.2 Trend stories are usually PR.**
- "Trend articles like this are almost always the work of PR firms."
- Pipeline rule: Down-weight evidence from trend articles. For each one, run "look for the client": find the commercial beneficiary named after the quoted experts. If one exists, tag the source as promotional.

**9.3 Trade press is a cheap, honest channel.**
- "some will print your press releases almost verbatim, if you take the trouble to write them to read like articles."
- Pipeline rule: For B2B niches, list the niche trade publications and newsletters as a launch channel. Pitch genuinely useful, true information (benchmarks, how-tos), never puffery.

## 10. The Trouble with the Segway
https://paulgraham.com/segway.html

**10.1 Focus groups miss what selling to real users reveals.**
- "If they'd had to grow the company gradually, by iterating through several versions they sold to real users, they'd have learned"
- Pipeline rule: Build spend past a small cap requires a version that real users bought. Synthetic users (LLM personas) cannot pass a validation gate: they are the Segway's focus groups.

**10.2 Using the product sends a social signal.**
- "The reason you look like a dork riding a Segway is that you look smug."
- Pipeline rule: The dossier answers "What does buying or using this signal to the buyer's peers or boss?" A negative status signal is a risk flag.

## 11. Apple's Mistake
https://paulgraham.com/apple.html

**11.1 Don't let an intermediary own the user.**
- "It doesn't work for an intermediary to own the user."
- Pipeline rule: Gatekeeper-dependency score: the share of distribution or revenue that passes through one platform able to review, delay, or ban you (app stores, Amazon, a single marketplace). Above 50% is high risk. Prefer direct web plus direct payment.
- Does not transfer fully: for some niches a marketplace is the only place buyers discover anything. Allow it, but require an owned customer contact (a receipt email) from the first sale.

**11.2 Launch fast and iterate; release delays break software.**
- "The standard way to develop applications now is to launch fast and iterate."
- Pipeline rule: The same as 3.3. Any release gate that adds days is a cost that must be justified.

**11.3 Startups build what their founders use.**
- "It's a rare startup that doesn't build something the founders use."
- Does not transfer: no agent uses a niche product. The replacement rule is an "insider proxy": each opportunity needs at least 5 interviewed practitioners or 1 paid niche expert from the user group, who review the offer and v1. One exception: niches where AI agents are themselves the users (agent tooling) can pass this rule natively.

**11.4 Winning by power erodes winning by work.**
- "An organization that wins by exercising power starts to lose the ability to win by doing better work."
- Pipeline rule: Ban lock-in dark patterns. Cancellation takes 2 steps or fewer, data export is self-serve, and there is no auto-renew without notice. Lint these on the billing flow.

## 12. Taste for Makers
https://paulgraham.com/taste.html

**12.1 Learn the domain before trusting your eye for what to fix.**
- "You have to understand a field well before you develop a good nose for what needs fixing."
- Pipeline rule: Before proposing an opportunity, discovery agents read at least N practitioner-written sources: forums, trade docs, job posts. Each opportunity is seeded by a concrete "what a hack" observation of an existing workflow, quoted from a practitioner.

**12.2 Mine the gaps between conventional wisdom and truth.**
- "instead of turning a blind eye to the places where conventional wisdom and truth don't quite meet, you should pay particular attention to them."
- Pipeline rule: Discovery logs contradictions between what a niche's market is said to be and what it is observed doing. Each contradiction is a candidate seed. Seeds drawn from anomalies spread out more across factories than seeds drawn from trend lists.

**12.3 Be right, not original.**
- "finally, he decides it's more important to be right than original."
- Pipeline rule: Novelty is not a score feature. A proven business model carried into a new niche is valid and preferred (see 15.3 on copying the right part).

**12.4 Make mistakes cheap to fix.**
- "Mistakes are natural. Instead of treating them as disasters, make them easy to acknowledge and easy to fix."
- Pipeline rule: Every customer-facing artefact is versioned with one-step rollback. Every agent decision logs its reversibility.

## 13. Design and Research
https://paulgraham.com/desres.html

**13.1 Design is only good relative to a named user.**
- "I don't think you can even talk about good or bad design except with reference to some intended user."
- Pipeline rule: Every artefact (offer, page, product) names one target user, tied to the dossier's beachhead. A reviewer rejects targets like "SMBs", "creators", or "everyone".

**13.2 Build what users need, not what they say they want.**
- "you have to design what the user needs, not simply what he says he wants."
- Pipeline rule: Interview synthesis keeps stated requests (symptoms) separate from the inferred underlying problem (diagnosis). Validation measures behaviour (payment, repeat use), never stated preference.

**13.3 Designing down to users corrupts the design.**
- "If you think you're designing something for idiots, the odds are that you're not designing something good, even for idiots."
- Does not transfer: an AI factory is never in the user group, so this risk is built in. The insider proxy (11.3) reviews copy and v1 and answers one question: "Would a practitioner find this condescending or naive?"

**13.4 Prototype in front of users at once; the Hail Mary fails.**
- "if you're building something new, you should get a prototype in front of users as soon as possible."
- Pipeline rule: Track time to the first real user touching a prototype or offer. A plan to build a complete product before any user contact is rejected.

**13.5 Design needs one decider.**
- "after the talking is done, the decision about what to do has to rest with one person."
- Pipeline rule: Each company has one decision-owner agent that signs product and offer decisions. Multi-agent debate can inform that agent, but there is no design by majority vote.

## 14. Subject: Airbnb
https://paulgraham.com/airbnb.html

**14.1 Founders hunting down their users is the leading signal.**
- "these guys were actually on the ground in NYC hunting down (and understanding) their users."
- Pipeline rule: The headline progress metric is the number of direct user conversations and observed facts per week, ranked above vanity traffic.

**14.2 Debate after evidence, not before.**
- "I'd recommend having the debate after meeting them instead of before."
- Pipeline rule: Skeptic or debate agents may not kill an opportunity on concept alone once field evidence exists. They must take the user evidence as input. Concept-level debate before evidence can only rank opportunities, never kill one.

**14.3 Ideas morph.**
- "Ideas can morph."
- Pipeline rule: Before a kill, check for a pivot. If user access and paying intent exist but the product is wrong, keep the segment and change the offer within a capped pivot budget.

**14.4 Expand along the continuum.**
- "there's a continuum between private sofas and hotel rooms, and they just moved one step further along it."
- Pipeline rule: The dossier lists the adjacent segments along the beachhead's continuum. During continue, customers arriving from outside the beachhead are tracked as the expansion signal.

## 15. Copy What You Like
https://paulgraham.com/copy.html

**15.1 Fads look easy and admired.**
- "these impressive things seem easy to me; I must be pretty sharp. Wrong. It was simply a fad."
- Pipeline rule: Penalise opportunities whose main evidence is hype volume (trending lists, "hot AI ideas", startup media). Hype sources also drive every factory to the same idea.
- Does not transfer: "copy only what you genuinely like" assumes taste. Agents have none, so use the owner's real interests and expertise as the taste signal, and seed discovery from them. That also counters convergence.

**15.2 The garage-sale test: strip the presentation.**
- "how much would I pay for this if I found it at a garage sale, dirty and frameless"
- Pipeline rule: Run at least one willingness-to-pay test as a plain, unbranded offer (a text description and a price). Demand that appears only with polished presentation is discounted.

**15.3 Copy what makes it good, not its flaws.**
- "Be careful to copy what makes them good, rather than their flaws."
- Pipeline rule: When a proven model is carried into a new niche, the dossier names the causal mechanism of the source's success and shows that it holds in the new niche. Surface features (UI, pricing page layout) do not count.

---

## Strongest rules from this batch

1. **Gates use only evidence that can be checked from outside.** That means payment charge IDs, real reply threads, and signed commitments. Agent self-reports and LLM-persona "users" never pass validation. (users 2.2, segway 10.1, desres 13.2)
2. **An idea is a vector.** A dossier without a concrete plan for the first 10 customers (where they are and how agents reach them by hand) is rejected. (ds 1.2)
3. **Concierge before code.** Earn the first dollar from a service agents deliver by hand. Build spend unlocks only after at least 1 customer has paid. Automate the steps repeated 3 or more times. (ds 1.3, webstartups 6.1)
4. **Real buyers within days, measured weekly.** Every experiment has a deadline of 7 days or less and a metric. No Big Launch, Hail Mary build, or plan that depends on a partner. (desres 13.4, users 2.5, ds 1.6)
5. **One buyer can say yes.** The price sits under the buyer's discretionary, card-payable threshold. Procurement, committee, or RFP paths take a heavy penalty. (artistsship 3.2)
6. **Evidence provenance.** Numbers and trends must trace to primary sources. Demand that is only promotional (PR, trend pieces, hype lists) is discounted. Organic workaround evidence ("climbing in through the window") carries the most weight. (submarine 9.1–9.2, web20 5.3, copy 15.1)
7. **Gatekeeper-dependency score.** Penalise more than 50% of distribution or revenue through one intermediary that can review, delay, or ban. Own a customer contact from the first sale. (apple 11.1, artistsship 3.3)
8. **Insider proxy.** Agents are never the user, so every opportunity needs real practitioners or a paid niche expert to review the offer and v1. (apple 11.3, desres 13.3, users 2.3)
9. **Unit economics at the top decile of usage.** Cost to serve (tokens, APIs, expert hours) must stay below price for the heaviest users. (vw 7.1)
10. **Non-convergence by construction.** Check similarity across factories before committing. Seed discovery from the owner's own interests and expertise and from anomalies (gaps between conventional wisdom and observed behaviour), never from trend lists. (webstartups 6.2, taste 12.2, copy 15.1)
