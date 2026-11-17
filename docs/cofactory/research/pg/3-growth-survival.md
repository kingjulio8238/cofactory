# Paul Graham, batch 3: growth, money, survival, kill vs persist

Source: all 16 essays below were fetched in full from paulgraham.com on 2026-11-17 and read end to end, footnotes included. Every quote is verbatim.

Terms used in the rules:

- **venture**: one niche business run by the factory.
- **budget cap**: the venture's hard spend limit (LLM tokens, tools, hosting, ads, paid human experts).
- **op-cost**: the venture's full running cost over a window. It includes token spend and expert fees.
- **arm's-length payer**: a customer who has no link to the owner, the factory, or another venture.

---

## 1. Startup = Growth
https://paulgraham.com/growth.html

**1.1 Growth rate is a ratio, measured weekly, and revenue is the best thing to measure.**
(a) "What matters is not the absolute number of new customers, but the ratio of new customers to existing ones."
(b) Pipeline rule: every launched venture computes `wow_growth = (rev_7d - rev_prev_7d) / rev_prev_7d` from landed revenue every day, and stores it. Use active paying customers until revenue exists. If the venture adds a flat number of customers each week, flag it as `decaying_growth`, because the rate is falling even though the count is constant.
(c) Does not transfer: YC's "5-7% a week" assumes a market that can absorb a 12-34x year. A niche with 300 possible buyers runs out of buyers before that. Set the target from the dossier's addressable-pool size. Once the venture has more than about 20% penetration, switch the north star from growth rate to retention and margin.

**1.2 Pick a target growth rate and treat hitting it as the only thing that matters.**
(a) "anything that gets you the growth you need is ipso facto right."
(b) Pipeline rule: each venture declares its weekly target at launch. Every budget request or task an agent creates must name the metric it moves and the size of the expected effect. Two consecutive weekly misses trigger a review. Three trigger rescue mode (see 5.3).

**1.3 Gaming the metric breaks the compass.**
(a) "you're throwing off your own compass."
(b) Pipeline rule: enforce metric integrity in code:
- revenue counts only from arm's-length payers;
- paid acquisition counts only when CAC is below the expected LTV;
- "active" means a real usage or payment event, never a signup.

Agents optimise whatever number they are given, so these checks must sit outside the agent.

**1.4 The niche protects and defines the company.**
(a) "Your niche both protects and defines you."
(b) Pipeline rule: write each idea as a constraint tuple: `(customer segment, geography/vertical/language, job-to-be-done)`. PG's note [2] endorses software that is "constrained in (a)" (in market size) as a sound small business. Give credit for tight tuples. Two factories that start from different tuples cannot easily converge on the same business.

**1.5 Growth pressure evolves the idea. Follow it rather than the original vision.**
(a) "anything that grows consistently at 10% a week is almost certainly a better idea than you started with."
(b) Pipeline rule: a venture that drifts from its dossier is not penalised if it keeps hitting its growth target. Log the drift so the factory learns which starting dossiers evolved into winners.

**1.6 Too few customers, or high churn, gives false growth.**
(a) "the power that individual customers have over you could turn you into a de facto consulting firm."
(b) Pipeline rules:
- Concentration: flag a venture when its largest customer is more than 40% of trailing-30-day revenue once it has 5 or more customers.
- Churn: compute growth from net retained revenue, not gross adds. Note [7] warns that high-churn growth "suddenly stops" when the pool runs out.

## 2. Default Alive or Default Dead?
https://paulgraham.com/aord.html

**2.1 Know whether the venture lives on its current trajectory.**
(a) "do they make it to profitability on the money they have left?"
(b) Pipeline rule: run a deterministic `default_alive(budget_remaining, op_cost_30d, revenue_30d, trailing_growth)` daily for every venture from day 1. It projects revenue at the current growth rate and op-cost held flat, and returns true if revenue crosses op-cost before the remaining budget hits zero. Start too early: PG says asking late is the dangerous error.

**2.2 Separate facts from hopes, and write plan B down.**
(a) "you should know (as in write down) precisely what you'll need to do to survive if you can't raise more money"
(b) Pipeline rule: each venture's state record holds a written plan B with a trigger date. Plan B is the cut-to-survive plan if no more budget arrives.
(c) Does not transfer: there are no investors. The only "raise" is the owner topping up the cap, and the factory should treat that as probability 0 (see 5.1).

**2.3 Over-hiring and premature scaling kill companies.**
(a) "Hiring too fast is by far the biggest killer of startups that raise money."
(b) Pipeline rule: for an AI venture, "hiring" means spawning more agents, contracting paid human experts, or raising ad spend. Allow a burn increase only if both hold:
- contribution margin per customer is above 0;
- `default_alive` is still true after the increase.

Note [4] (Buchheit) adds that scaling something with "bad unit economics" makes it harder to fix.

**2.4 Spend does not buy growth; appeal does.**
(a) "there is surprisingly little connection between how much a startup spends and how fast it grows."
(b) Pipeline rule: when growth misses, the remedy an agent proposes must be a product, offer, or segment change, or hands-on customer work. "More budget" is never an accepted fix for stalled growth.

## 3. Ramen Profitable
https://paulgraham.com/ramenprofitable.html

**3.1 Covering your own running costs buys time and ends dependence on funders.**
(a) "the main importance of ramen profitability is that it buys you time."
(b) Pipeline rule: define a **self-funding** milestone as trailing-30-day landed revenue at or above trailing-30-day full op-cost, including tokens, tools, expert fees and owner-gate costs. Crossing it is the main continue gate after first dollar. The venture leaves its fixed budget cap and runs on its own revenue, with a longer review interval.

**3.2 Being paid proves three things.**
(a) "(a) you can get at least someone to pay you"
(b) Pipeline rule: first dollar counts only if it is from an arm's-length payer and has settled, net of refunds and chargebacks. A payment from the owner, a friend or another venture never counts.

**3.3 Interim revenue models are fine.**
(a) "a ramen profitable company doesn't have to be making money the way it ultimately will. It just has to be making money."
(b) Pipeline rule: allow interim revenue such as concierge or manual service, a done-for-you version, or licensing. Tag it `interim_model` so the dossier's target model is still tracked separately.

**3.4 The danger is sliding into consulting.**
(a) "Probably the biggest danger is that it might turn you into a consulting firm."
(b) Pipeline rule: track the share of revenue that needed bespoke work, and the human-expert hours per sale.
(c) Does not transfer: PG objects because consulting does not scale to venture size. For a niche bootstrapped business, service-shaped revenue can be the destination. Agent-delivered service has near-zero marginal labour, so the real test is human hours per unit. Flag a venture only if human expert hours grow linearly with revenue.

## 4. How Not to Die
https://paulgraham.com/die.html

**4.1 Silence predicts death.**
(a) "When we haven't heard from, or about, a startup for a couple months, that's a bad sign."
(b) Pipeline rule: run a heartbeat. Each active venture must produce a dated, externally visible event every N days: a release, a customer contact, a sale, or a published asset. If there is no external event for 2N days, mark it `stalled`. The agent analogue of PG's "demoralized" is a loop that produces only internal artifacts.

**4.2 Find the few who love it, then expand that core.**
(a) "Are there zero users who really love you, or is there at least some little group that does?"
(b) Pipeline rule: after launch, count **lovers**: users with a repeat payment, an unsolicited referral, an unprompted feature request, or a complaint when the service is down.
- 0 lovers after N qualified exposures: change the offer or segment, and keep the budget clock running.
- k or more lovers: stop broadening. Find more people like them.

**4.3 "But" means it is already dead.**
(a) "A startup is so hard that working on it can't be preceded by "but.""
(b) Pipeline rule: no zombie ventures. Each venture is in exactly one state: `discovering`, `validating`, `launched`, `rescue`, `self-funding` or `killed`. A venture that stays idle (no allocated work) for X days is auto-killed with a post-mortem. Most startups "crawl off somewhere and die" from neglect, which must never be how a venture ends.
(c) Does not transfer: PG's main lever, fear of public humiliation, does not motivate agents. The real analogue of "a critical founder bailing" is the human owner going unresponsive on identity or legal gates. Track owner gate latency, and count a venture blocked on the owner for more than X days as at risk.

## 5. The Fatal Pinch
https://paulgraham.com/pinch.html

**5.1 Expecting more money is the fatal assumption.**
(a) "There may be nothing founders are so prone to delude themselves about as how interested investors will be in giving them additional funding."
(b) Pipeline rule: each venture's budget is final, as in YC's advice to "act as if it's the last they'll ever get". `default_alive` never assumes a top-up. Agents may not request more budget for a venture that is default-dead.

**5.2 If it will fail anyway, shut it down and return the money.**
(a) "You should shut down the company if you're certain it will fail no matter what you do."
(b) Pipeline rule: a kill immediately frees the venture's unspent budget back to the owner's pool, with no "riding it down". The kill trigger is default-dead, plus rescue mode failing to change the trajectory within its window.

**5.3 Rescue mode: everyone sells, and sells differently.**
(a) "what do you need that you'd pay a lot for?"
(b) Pipeline rule: in rescue mode, all of the venture's agents switch to revenue work, ranked by "the most revenue the soonest". The sales script changes from pitching the product to discovering needs. Custom offers are priced high, paid up front, and the venture keeps the IP; it never bills by the hour.

**5.4 Custom work can reveal the real product.**
(a) "keep your eyes open for narrow openings that have wide vistas beyond."
(b) Pipeline rule: log every custom request in a structured form. Three or more independent requests for the same derivative become a spin-out candidate for discovery. This also produces niche ideas specific to the user, which helps keep factories from converging.

**5.5 Measure progress instead of revenue only when that was agreed in advance.**
(a) "You're not one of these companies unless your initial investors agreed in advance that you were."
(b) Pipeline rule: a venture is `long_build` only if the dossier said so at approval, with dated progress milestones. Otherwise revenue is the measure.

## 6. The 18 Mistakes That Kill Startups
https://paulgraham.com/startupmistakes.html

**6.1 A marginal niche that only avoids competition.**
(a) "You can only avoid competition by avoiding good ideas."
(b) Pipeline rule: the dossier must explain why the gap is unserved. Accepted reasons:
- too small for incumbents;
- needs rare domain knowledge;
- recently opened by a change.

If the only explanation is "nobody has looked", demand evidence must be twice the normal threshold.
(c) Does not transfer: PG is warning venture-scale founders off small markets. Cofactory chooses niches on purpose. What carries over is narrower: the niche must hold a real, unsolved problem, not just an absence of rivals.

**6.2 Derivative ideas: start from problems, not companies.**
(a) "look for problems and imagine the company that might solve them."
(b) Pipeline rule: the idea generator's input must be a sourced problem, such as a complaint quote, a forum thread, an interview note or an expert observation, with a URL or ID. Lint out ideas pitched as "X for Y" or as a copy of a named company. Different users have different problem sources, which pushes factories apart.

**6.3 Obstinacy versus thrashing: pivots must converge.**
(a) "Whereas if you keep restarting from scratch, that's a bad sign."
(b) Pipeline rule: compute an asset-reuse ratio for each pivot, covering customer list, audience, code, evidence and channels.
- 50% reuse or more: a pivot within the same venture. Require a minimum dwell time between pivots, since PG warns "Switching to a new idea every week will be equally fatal".
- Under 50%: a new venture, which re-enters discovery and draws a new budget.

Prefer pivots that users are excited about (#5).

**6.4 Launch slowness kills far more ventures than launching early.**
(a) "Launching too slowly has probably killed a hundred times more startups than launching too fast"
(b) Pipeline rule: cap pre-launch build spend at a fixed share of the venture's budget, for example 25%. The launch scope is a core that is "useful on its own" and can be expanded.
(c) Does not transfer, in part: in a niche with a few hundred buyers, burning early adopters (#9) costs much more. Launch to a sample of at most 10% of the addressable list first.

**6.5 No specific user means flying on instruments.**
(a) "you have to be able to talk some specific ones into using what you're making. If you can't, you're on the wrong track."
(b) Pipeline rule: an AI is never the user, so every venture is flying on instruments. Validation needs N or more named, reachable prospects who committed by paying, pre-ordering or booking time. A specificity lint rejects segments like "businesses", "teenagers" or "local events" (PG's "perennial tarpit").

**6.6 Business model later? Not here.**
(a) "you should leave business models for later"
(c) Does not transfer: PG's venture-funded companies can defer revenue. Cofactory's success event is first revenue, and there is no runway funder. Ask for money early, because payment is the validation signal.

**6.7 Someone has to go and get users.**
(a) "you'll probably have to get up from your computer and go find some."
(b) Pipeline rule: agents drift toward building. Enforce a distribution quota of at least X% of agent spend on outreach and customer contact from the validation stage on.

## 7. The Hardest Lessons for Startups to Learn
https://paulgraham.com/startuplessons.html

**7.1 Release early, then keep shipping.**
(a) "You should make your system better at least in some small way every day or two."
(b) Pipeline rule: while a venture is active, require at least one user-visible improvement every 48h. This feeds the heartbeat (4.1).

**7.2 Describe it in one or two sentences.**
(a) "You probably shouldn't even start a company to do something that can't be described compellingly in one or two sentences."
(b) Pipeline rule: dossier gate. The pitch is at most 40 words. Show it to K target users, or to a simulated-buyer panel, and pass only if at least 80% can restate what it does.

**7.3 Fear the right things.**
(a) "Way more startups hose themselves than get crushed by competitors."
(b) Pipeline rule: a competitor appearing is never a sufficient kill reason on its own. Kill reasons come from an enumerated list: default-dead, 0 lovers, owner-blocked, or legal.

**7.4 Assume deals will not happen.**
(a) "If your startup is doing a deal, just assume it's not going to happen."
(b) Pipeline rule: pending deals, LOIs and "we'd pay for that" count as 0 in `default_alive` and in validation until money lands. Prospecting continues while any deal is pending. LLMs read verbal interest optimistically, so this check must be in code.

## 8. Startups in 13 Sentences
https://paulgraham.com/13sentences.html

**8.1 Go narrow and deep. Counts cannot lie.**
(a) "It's easier to expand userwise than satisfactionwise. And perhaps more importantly, it's harder to lie to yourself."
(b) Pipeline rule: an agent may not report progress as a self-estimated percent complete. Progress is reported only as counts of external events: users, payments, lovers, replies. Scope v1 to all the needs of a narrow subset of users.

**8.2 You make what you measure.**
(a) "Merely measuring something has an uncanny tendency to improve it."
(b) Pipeline rule: one north-star metric per venture, plotted daily and visible to all its agents. Signups, pageviews, followers and generated content are banned as north stars, per PG's own corollary to "be careful what you measure".

**8.3 Cheap is fast.**
(a) "being cheap is (almost) interchangeable with iterating rapidly."
(b) Pipeline rule: score agents and ventures on experiments completed per dollar. Prefer many cheap probes to one expensive build.

**8.4 Distractions that pay money.**
(a) "The worst type are those that pay money"
(b) Pipeline rule: revenue counts toward a venture's gates only if it comes from the venture's target segment and offer. Off-thesis revenue gets its own tag and does not satisfy the venture's milestones.

**8.5 Surprisingly good customer service.**
(a) "it pays to offer customer service on a level that wouldn't scale, because it's a way of learning about your users."
(b) Pipeline rule: in the early stages, reply to every customer message within X hours and log it into the venture's user-insight store. This transfers well, even better than for humans, because agents make unscalable service cheap.

## 9. What Startups Are Really Like
https://paulgraham.com/really.html

**9.1 Everything takes longer, especially when it touches slow organisations.**
(a) "It's when they're on the critical path that they kill you"
(b) Pipeline rule: multiply agent-estimated durations by 3 for any step that depends on an outside organisation (founders report "2-3x longer"). In the dossier score, penalise ideas whose first dollar needs:
- enterprise procurement;
- a government buyer;
- app-store or platform approval;
- a partnership.

**9.2 Never bet on one feature or deal.**
(a) "I learnt never to bet on any one feature or deal or anything to bring you success."
(b) Pipeline rule: each launched venture runs at least 3 acquisition experiments or channels at once, each with its own CAC.

**9.3 Minimal first version; over-engineering is poison.**
(a) "If your first version is so impressive that trolls don't make fun of it, you waited too long to launch."
(b) Pipeline rule: same launch cap as 6.4. A build agent's plan is rejected if it adds features no committed prospect asked for.

**9.4 v1 is a trick to start the conversation.**
(a) "a trick for getting users to start talking to you."
(b) Pipeline rule: every launch artifact includes a channel that captures free text from users, and "conversations started" is tracked. Users "will often reveal amazing details about... what they're willing to pay for."

**9.5 Search problem space, not just solution space.**
(a) "you can make enormous gains playing around in problem-space."
(b) Pipeline rule: when growth stalls, the agent must generate at least 2 problem-space reframes (a different segment or a different job) before it may propose more solution work.

**9.6 Luck is a factor, so take many shots.**
(a) "No matter how much skill and determination you have, if you roll a zero for luck, the outcome is zero."
(b) Pipeline rule: allocate budget across several small ventures rather than one large one. Base kill decisions on threshold metrics, not narratives. Do not over-fit factory-wide playbooks to a single outcome.

## 10. How to Lose Time and Money
https://paulgraham.com/selfindulgence.html

**10.1 Fake work is the dangerous way to lose time.**
(a) "The most dangerous way to lose time is not to spend it having fun, but to spend it doing fake work."
(b) Pipeline rule: agents are especially good at fake work: plans, reports, refactors, dossier polish. Tag each agent cycle `external` (it touched a customer, prospect, market or live product) or `internal`. Alarm when a venture spends more than $X, or more than Y hours, without a new external event.

**10.2 Bad "investments" bypass spending alarms.**
(a) "the way most fortunes are lost is not through excessive expenditure, but through bad investments."
(b) Pipeline rule: spend labelled as investment (tools, infrastructure, paid acquisition, expert retainers) needs a stated payback metric and a review date. Budget alarms fire on investment spend separately from total burn.

## 11. How to Make Wealth
https://paulgraham.com/wealth.html

**11.1 Value depends on the buyer, not on you.**
(a) "what people will give you money for depends on them, not you."
(b) Pipeline rule: ideas that come from the owner's or the agent's own interests get no score bonus without third-party demand evidence. PG's example: someone who likes the outdoors shouldn't start an "outdoor portal".

**11.2 Measurement and leverage.**
(a) "To get rich you need to get yourself in a situation with two things, measurement and leverage."
(b) Pipeline rules:
- Measurement: every token, tool and expert dollar is tagged to exactly one venture, so each venture has a clean P&L.
- Leverage: score it as revenue per unit of marginal cost. A sale that needs human hours has low leverage.

**11.3 Run upstairs: hardness is the moat.**
(a) "something that was hard for us would be impossible for our competitors."
(b) Pipeline rule: defensibility is scored against other AI factories, not against incumbents. Anything an agent can build quickly, every other factory's agent can build too. Give credit for:
- proprietary niche knowledge (hired experts);
- relationships and distribution in the niche;
- owned data;
- identity, licence or legal gates;
- operational grind agents avoid.
(c) Does not transfer: PG's "hard technical problem" is cheap for AI, so hardness has to be measured relative to what agents find hard.

**11.4 Users are the proof.**
(a) "Users are the only real proof that you've created wealth."
(b) Pipeline rule: the paying-user count is the core measurement. It overrides any agent or judge opinion of quality.

**11.5 Mean versus median.**
(a) "If the mean is 30x, the median is probably zero."
(c) Does not transfer: PG's all-or-nothing payoff comes from venture scale. Cofactory ventures should be built for a lower-variance median outcome, with a capped loss per shot.

## 12. How People Get Rich Now
https://paulgraham.com/richnow.html

This is mostly macro history (Forbes 400, consolidation), with one usable point.

**12.1 Building and acquiring customers keeps getting cheaper, so expect many entrants.**
(a) "Technology has driven down the cost of both building products and acquiring customers."
(b) Pipeline rule: assume software replication cost is about 0 for other factories. Pair this with 11.3, so that defensibility and novelty are dossier gates, not afterthoughts.

## 13. Superlinear Returns
https://paulgraham.com/superlinear.html

**13.1 Seek work that compounds.**
(a) "The most obvious one is to seek work that compounds."
(b) Pipeline rule: add a score feature for compounding assets: audience, search content, a customer list reusable across offers, niche reputation, and owned data. At factory level, the owner's experts, audiences and customer lists carry over to the next venture.

**13.2 Mediocre but popular means replace it, after checking for a hidden reason.**
(a) "if you come across something that's mediocre yet still popular, it could be a good idea to replace it."
(b) Pipeline rule: use this as a discovery signal: a niche incumbent with poor reviews but sustained paid usage. The dossier must rule out the note [5] hidden reasons: monopoly, regulation, buyers' bad taste or "broken procedures for deciding what to buy".

**13.3 Novelty is required.**
(a) "your ideas have to be not just correct, but novel as well."
(b) Pipeline rule: compute embedding similarity against a registry of ideas across all factories. Apply a score penalty above a threshold, and hard-block near-duplicates in the same geography or segment. This is the main mechanism against convergence.

**13.4 Take multiple shots.**
(a) "The solution is to take multiple shots."
(b) Pipeline rule: same as 9.6. Use a small fixed budget per shot, and run them in sequence or in parallel.
(c) Does not transfer: superlinear and winner-take-all returns assume uncapped markets. A niche has a ceiling, so thresholds (for example being the default tool in a 500-firm vertical) matter more than exponential growth.

## 14. Black Swan Farming
https://paulgraham.com/swan.html

**14.1 The best ideas look bad, but most bad-looking ideas are bad.**
(a) "the best startup ideas seem at first like bad ideas."
(b) Pipeline rule: no gate is an LLM "does this sound like a good idea?" judge. Such a judge rewards ideas that look good by consensus, which are already taken and are the same for every user. Gate on evidence (payments, commitments, sourced pain) instead.

**14.2 The easy metric can mislead.**
(a) "fundraising is not merely a useless metric, but positively misleading."
(b) Pipeline rule: at factory level, do not optimise the first-dollar rate alone. If close to 100% of ventures reach first dollar, the factory is "being too conservative": raise the novelty and risk of the ideas it picks. Track a target kill rate.
(c) Does not transfer: YC's portfolio math (one 10,000x winner pays for 1,000 zeros) needs uncapped upside. Each Cofactory owner pays for every venture, and niche upside is capped. Each venture must therefore have a positive expected value on its own, with a hard loss cap.

## 15. How to Start a Startup
https://paulgraham.com/start.html

**15.1 Three things.**
(a) "to start with good people, to make something customers actually want, and to spend as little money as possible."
(b) Pipeline rule: venture health has three gauges:
- team quality (agent and expert fit);
- want (lovers and paying users);
- frugality (op-cost against `default_alive`).

The closing line works as a combined test: "Build something users love, and spend less than you make."

**15.2 Ideas come from doing an existing task without the suck.**
(a) "look at something people are trying to do, and figure out how to do it in a way that doesn't suck."
(b) Pipeline rule: the dossier must document the current workaround and its specific, sourced failures. Discovery can mean paying a niche expert to describe or shadow a non-tech business's workflow, as PG suggests: "spend a couple weeks just watching what they do with computers."

**15.3 Niches have the best odds. Sell to small customers.**
(a) "The best odds are in niche markets."
(b) Pipeline rule: score the first buyer higher when it is a small organisation or an individual with a single decision-maker. Penalise enterprise and government first buyers; PG: "you can't outsell an Oracle salesman".

**15.4 Get big slow, and don't hire.**
(a) "The slower you burn through your funding, the more time you have to learn."
(b) Pipeline rule: same as 2.3. Also: "The only reason to hire someone is to do something you'd like to do but can't." Contract human experts only for work agents cannot do.

**15.5 Brand advertising is a sign of breakage.**
(a) "spending a lot on brand advertising is a sign of breakage."
(b) Pipeline rule: no brand or awareness ad spend. Only measurable direct-response spend is allowed, under a CAC cap.

**15.6 IP hygiene.**
(a) "Before you consummate a startup, ask everyone about their previous IP history."
(b) Pipeline rule: every hired human expert signs an IP assignment, and discloses prior agreements, before starting work. Add this to the owner's legal gate checklist.

## 16. Why to Start a Startup in a Bad Economy
https://paulgraham.com/badeconomy.html

**16.1 Macro conditions are rounding error.**
(a) "as a predictor of success it's rounding error compared to the founders."
(b) Pipeline rule: never delay or kill a venture because of macro news.
(c) Does not transfer: the "founder" here is the agent system, which is about the same for every user. Founder quality stops being a differentiator; niche-specific assets (experts, owner relationships, data) take its place.

**16.2 Be a cockroach.**
(a) "the cheaper your company is to operate, the harder it is to kill."
(b) Pipeline rule: minimise fixed recurring costs and prefer usage-priced infrastructure. An idle venture's cost should tend toward 0, so a self-funding venture survives long quiet periods. PG notes that markets don't "reduce headcount", which supports the concentration rule in 1.6.

---

## Strongest rules from this batch

1. **Default alive, computed daily, with a final budget.** Every venture runs `default_alive(budget_left, op_cost_30d, revenue_30d, growth)` from day 1, and assumes the chance of more budget is 0. Default-dead leads to rescue mode: everyone sells, ranked by "most revenue soonest". If that fails within its window, kill the venture and return the unspent budget immediately. (aord, pinch)
2. **Only landed money counts.** Revenue must be settled, from arm's-length payers, and in the target segment. Pending deals, LOIs and "would pay" count as 0. Code enforces metric integrity: no related-party revenue, no CAC above LTV, no signups counted as active. (startuplessons, 13sentences, growth n.8, ramenprofitable)
3. **One north star, measured as a rate.** Use weekly growth of landed revenue against a target set at launch: 2 misses trigger a review, 3 trigger rescue. Niche adjustment: once penetration of the addressable pool exceeds about 20%, switch to retention and margin. (growth, 13sentences)
4. **The self-funding gate is the main "continue".** It passes when trailing-30-day revenue is at or above trailing-30-day op-cost, including tokens and expert fees. Passing removes the fixed cap and lengthens the review interval. (ramenprofitable)
5. **Count lovers and stay narrow.** Track repeat payers, referrals and unprompted requests. With 0 lovers after N exposures, change the offer or segment. With k or more, expand that core. Report progress only as counts of external events, never as self-estimated percent complete. (die, 13sentences)
6. **No scaling before unit economics.** More agents, more experts or more ad spend are allowed only when contribution margin is above 0 and the venture is still default-alive after the increase. Stalled growth is fixed by changing the product or problem, never by adding budget. (aord, start, startupmistakes)
7. **Fake-work alarm and heartbeat.** Tag each agent cycle internal or external. Alarm on $X spent with no new external event, and mark `stalled` after 2N days with no external event. Require a user-visible improvement about every 48h, a distribution quota of at least X% of spend, and a cap of about 25% of budget on pre-launch build. (selfindulgence, die, startuplessons, startupmistakes)
8. **Problem-sourced, specific, fast-closing ideas.** The input is a sourced complaint or observed workflow, not "X for Y". Validation needs N or more named prospects who committed. The dossier explains why the gap exists and rules out hidden reasons (monopoly, regulation, broken procurement). Penalise first dollars that sit behind enterprise, government or platform approval, and multiply the time estimate for those by 3x. (startupmistakes, start, really, superlinear)
9. **Anti-convergence moat, with no "sounds good" judge.** Use a cross-factory novelty registry with a similarity penalty or block. Measure defensibility against other AI factories: expert knowledge, relationships, data, identity gates and grind. Never gate on an LLM's opinion of whether an idea is good, because the best ideas look bad and ideas that look good by consensus are taken. (swan, superlinear, wealth, richnow)
10. **Explicit kill and pivot discipline.**
    - Use a single-state machine with no zombie ventures; auto-kill after X idle days, with a post-mortem.
    - A pivot that reuses 50% or more of assets stays in the same venture, with a minimum dwell time between pivots. Under 50%, it is a new venture that re-enters discovery.
    - A competitor appearing is never a kill reason on its own.
    - At factory level, a first-dollar rate near 100% means ideas are too conservative.

    (die, startupmistakes, startuplessons, swan)
