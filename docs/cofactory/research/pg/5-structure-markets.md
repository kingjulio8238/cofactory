# PG batch 5: company structure, markets, why companies win/fail, portfolio

Source text: all 15 essays downloaded in full from paulgraham.com on 2026-11-17 (no fetch failures). Quotes are verbatim, at most 25 words each. Thresholds written as `default N` are starting values to tune, not findings.

Cofactory terms used below: **company** = one niche business the factory runs; **factory** = one user's portfolio of companies; **owner** = the human who clears identity and legal gates; **expert** = a paid human niche expert; **gate** = a stage transition (discover → dossier → validate → launch → first dollar → kill/continue).

---

## The Pooled-Risk Company Management Company — https://paulgraham.com/prcmc.html

This essay describes Cofactory's model almost exactly. PG says the ideal for a founder who wants to live off revenue is (1) someone else runs the company, (2) no dependence on one manager, (3) risk pooled across many companies, (4) the right to switch managers. He then concludes this already exists as "an acquisition by a public company". For agent-run niche companies it does not exist yet: no public acquirer buys a $2k/month agent-run niche business. Cofactory would be the first real one, so it should adopt his four properties as design requirements.

1. **A revenue business decays without continuous attention.**
   (a) "You can't just start a business and check out once things are going well, or they stop going well surprisingly fast."
   (b) Pipeline rule: every company in `continue` keeps an operator agent with service levels the system checks: customer messages answered within 24h (default), failed payments retried, churn and refund events triaged. Track an **attention-decay metric**: revenue in the 30 days after operator activity drops below a set level, compared with the baseline. Any company whose operator has been silent for more than 72h (default) is flagged.
   (c) Does not transfer: PG treats attention as the owner's scarce time. Here attention is compute, so cap it: monthly operating cost (agent compute + expert fees + tools) / monthly revenue must stay ≤ 0.5 (default) or the company is flagged for kill or for running a slimmer operator.

2. **No dependence on any one manager.**
   (a) "What you really want is a management company to run your company for you. Then you don't depend on any one person."
   (b) Pipeline rule: a **bus-factor test** at the launch gate. Delete the operator agent's memory, start a fresh operator from the company dossier and runbook only, and require it to answer a real queued customer ticket and run one billing operation correctly. The same applies to experts: no expert may be the only holder of a credential, customer relationship or process step. Every such item must be recorded in the dossier.

3. **Pool risk across many companies, at a valuation fixed in advance.**
   (a) "we'll combine the revenues from all your companies, and pay you your proportionate share."
   (b) Portfolio policy: report and decide at the factory level. Kill/continue thresholds come from portfolio expected value, not from each company's sunk cost. If cross-factory pooling is ever offered (owners swap company stakes for pool units), the entry valuation must be a published formula (e.g. trailing-3-month revenue × fixed multiple), never negotiated case by case.
   (c) Does not transfer: (i) pooling only reduces risk when the companies are uncorrelated. Factories that converge on the same niches or the same channel (e.g. all selling to Shopify merchants via one ad network) are one correlated bet. Measure pairwise portfolio correlation (shared customer segment, channel, platform dependency) and cap it. (ii) Pooling stakes across unrelated users is very likely a securities and money-transmission issue. It is an owner and Cofactory legal gate, not something agents may set up.

4. **Clients must be able to switch managers.**
   (a) "change your mind later as often as you wanted."
   (b) Pipeline rule: no lock-in. Every company must be exportable: domain, payment account, code repo, customer list and dossier transfer to the owner's own control. Run the export procedure end-to-end as a dry run at the launch gate. Cofactory's revenue share must survive export by contract, not by holding the assets hostage.

5. **Profitability is what lets you wait out a fickle acquisition market.**
   (a) "Being profitable ensures you'll get at least the average of the acquisition market"
   (b) Pipeline rule: a sale is never the plan. `continue` requires the company to be default-alive (revenue ≥ full operating cost) within a fixed window (default 90 days after first dollar). Consider a sale only on an inbound offer above a floor multiple.
   (c) Does not transfer: the exit market for micro niche businesses is small marketplaces at low multiples. An agent-run company with no team has no acqui-hire value, so assume revenue is the only return.

6. **When to start charging depends on whether charging teaches you about users.**
   (a) "The test is probably whether it helps you to understand your users."
   (c) Does not transfer: PG allows Google-style "ignore revenue at first" because investors carry the company. A bootstrapped company under a hard budget cap has no investors to carry it. Rule: charge during validation (pre-sale, deposit or paid pilot) in every case.

## The Brand Age — https://paulgraham.com/brandage.html

1. **Brand is what's left when substance converges.**
   (a) "Brand is what's left when the substantive differences between products disappear."
   (b) Score feature `substantive_diff`: name the concrete functional difference from the best existing option (price, speed, coverage, a capability). If the only difference the dossier can name is positioning or design, kill at the dossier gate.

2. **Optimal search converges, which matters for "don't build the same business for everyone".**
   (a) "good design, like math or science, seeks the right answer, and right answers tend to converge."
   (b) Pipeline rule: factories running the same model on the same public data will converge, and making them differ cosmetically is the bad, brand-style way to diverge. Diverge through **inputs**: each factory's discovery is seeded with private, owner-specific inputs (the owner's and experts' firsthand domain, geography, language, data access, relationships). Add a cross-factory **niche claim registry**: a niche (segment × job-to-be-done × geography) already being validated or live in another factory is blocked or heavily penalised.

3. **Distinctiveness and quality coexist only in unexplored territory.**
   (a) "If you're the first to arrive in some new territory, you can both find the right answer and claim it as uniquely yours."
   (b) Score feature `explored_density`: the number of existing products, plus registry claims, serving the exact segment × job. Lower is better. Treat a count of zero as suspicious until the dossier shows people already pay for workarounds.

4. **Comb-over effect: small steps accumulate into something freakishly wrong.**
   (a) "a series of individually small changes takes you from something that's a little bit off to something that's freakishly wrong."
   (b) Pipeline rule: autonomous operators drift through many locally reasonable edits. Every 30 days (default), run a **from-scratch drift audit**: a fresh agent reads only the original dossier and the current live state (pricing, offer, customer, channel) and flags any change that it would not have recommended from a clean start.

5. **Avoid brand problems; pick fields on the way up.**
   (a) "pushing people's brand buttons is just not a good problem to work on" / "you're much more likely to do good work in a field that's on the way up."
   (b) Discovery filter: exclude niches whose purchase driver is status or artificial scarcity. Score feature `field_trajectory`: is search, job-post or spend volume for the niche growing year over year?

## Making Startups Powerful — https://paulgraham.com/powerful.html

1. **Own the customer relationship and the money flow.**
   (a) "is there a way to make the money flow through it? It's always good when money flows through you."
   (b) Score feature `owns_customer`: we bill the customer directly and hold their contact details (+), versus being a component inside someone else's platform that can delist us (−). Platform-dependent companies need a written path to direct relationships before `continue`.
   (c) Does not transfer fully: extremely niche businesses often must start inside a platform (marketplace app, plugin) to be found at all. Allow it at launch, but count platform concentration as a portfolio correlation risk.

2. **Help users make money.**
   (a) "When you help users make money, they're (a) quick to adopt your product and (b) will pay a lot for it."
   (b) Score feature `customer_roi_usd`: the dossier must state the dollar gain or saving per customer per month, with a cited source. Rank niches with ROI ≥ 5× price (default) highest. This is the strongest single predictor of a fast first dollar.

3. **Prefer customers who decide fast; avoid procurement mud.**
   (a) "having customers who decide fast makes you powerful." / "selling to customers like hospitals and school districts is like walking through mud."
   (b) Score feature `decision_cycle_days`: estimated days from first contact to payment, and whether one person can buy with a card. Hard filter: if the estimated cycle exceeds the time-to-first-dollar budget, kill, or find a faster-deciding subset (e.g. solo practitioners instead of hospital systems).

4. **Mafia markets are not level playing fields.**
   (a) "They're weakest in markets dominated by companies you'd describe as mafia."
   (b) Flag `gatekept_market`: a few incumbents control access (licensing bodies, PBM-style intermediaries, distribution cartels, heavy legal presence). Exclude, unless the dossier names a route that goes around the gatekeeper instead of through it.

5. **Discounts too deep destroy the signal.**
   (a) "if you give away too much, you lose the signal that customers send by paying you."
   (b) Validation rule: only payments at ≥ 50% of the intended list price (default) count as validation evidence. Free pilots, and payments subsidised by the factory, count as zero.

6. **Watch for misuse: the tail may be the dog.**
   (a) "So whenever founders build something peripheral to the main product I always ask: could this be the real product?"
   (b) Operator rule: log customer requests and uses that fall outside the intended job, and review them weekly as pivot candidates. A side offer that earns more than the main one triggers a re-dossier.
   (c) Cofactory level: PG's "let users opt in to training on their interactions" is a network effect for Cofactory itself (cross-factory learning). Share **operational** learnings (what converts, what churns). Do not share **niche** choices, because that would cause the convergence above.

## How to Earn a Billion Dollars — https://paulgraham.com/earn.html

1. **Two numbers: growth rate and how long it lasts.**
   (a) "there are only two numbers in the calculation, the growth rate and how long it continues."
   (b) After first dollar, the continue metric is month-over-month revenue growth (default bar 15%) plus `niche_ceiling` = reachable buyers × price.
   (c) Does not transfer: extreme niches cap the second number by design. Do not demand a "huge market". Require only that the ceiling exceeds the owner's target income for the company (e.g. ≥ $3k/month).

2. **The need must be unknown to others, and AI has no needs of its own.**
   (a) "your intuitions about other people's needs are usually a crap signal, and your own needs are an especially valuable one"
   (b) Pipeline rule: an LLM's guess about what a niche needs counts as the "crap signal". Every candidate must trace to a firsthand need: the owner's or an expert's lived problem, or customers' own words found in public. Score feature `need_provenance` ∈ {firsthand, quoted-in-the-wild, inferred}. Ideas with provenance `inferred` cannot pass the dossier gate.
   (c) Does not transfer: "make something you and your friends want" has no AI equivalent. The substitute is the owner's and experts' needs, which is also the main source of variety between factories.

3. **Looking for ideas on purpose prunes the outliers.**
   (a) "If you're consciously looking for startup ideas, it will make you too conservative. You'll lop off the outliers."
   (b) Discovery rule: do not score "sounds like a good business" at the first filter. Mine for organic signals instead (complaints, spreadsheets used as workarounds, people paying for manual services) and keep a quota (default 20%) of low-plausibility candidates that go through to cheap validation.

4. **Word of mouth is the proof.**
   (a) "Only by understanding users very deeply can you make something they love so much that they tell their friends about it"
   (b) Continue metric: the share of new customers who arrive by referral or unprompted. Zero organic share after 10 customers (default) is a warning.

## Hiring is Obsolete — https://paulgraham.com/hiring.html

1. **Solve a problem people already know they have.**
   (a) "Most successful startups not only do something very specific, but solve a problem people already know they have."
   (b) Dossier gate: at least 5 independent instances (default) of target customers describing the problem in their own words before we contacted them (forum posts, reviews, support threads, job posts). Problems that exist only after we explain them fail.

2. **Selling teaches more than surveys do.**
   (a) "you learn much more from trying to sell people something than reading what they said in focus groups."
   (b) Evidence weights: payment > signed commitment or deposit > reply to a priced offer > interview > survey > desk research. Gates read the weighted total, so a pile of desk research cannot add up to a pass.

3. **Many parallel variants beat one big bet.**
   (a) "If ten different startups design ten different Web browsers and you take the best, you'll probably get something better."
   (b) Portfolio policy: in validation, run 2–3 cheap offer variants per niche (price, packaging, channel) and continue only the winner. Across the factory, prefer many small independent companies to one large one.

4. **Pay for outcomes.**
   (a) "People at a startup expect to get rich if the product succeeds, and get nothing if it fails."
   (b) Expert compensation is a small fixed fee plus a first-dollar bonus or a revenue share. Agent budgets are released in tranches only when outcomes are hit.

5. **No a-priori theories.**
   (a) "Don't sit here making up a priori theories about what users need. Go find some users and see what they need."
   (b) Every claim in the dossier carries a citation to user-sourced evidence. Uncited claims are labelled `hypothesis` and cannot count toward a gate.

## You Weren't Meant to Have a Boss — https://paulgraham.com/boss.html

1. **Small groups; trees slow you down.**
   (a) "groups of 8 work well; by 20 they're getting hard to manage; and a group of 50 is really unwieldy."
   (b) Agent org rule: at most 8 agents per company (default), at most 2 levels of delegation.
   (c) Does not transfer as stated: agents have no morale. But hierarchies of agents lose information at every summary hop, so the conclusion holds for a different reason. Measure it: compare decisions made from first-hand context with decisions made from summaries.

2. **Independent units coordinated like a market.**
   (a) "to have each group actually be independent, and to work together the way components of a market economy do."
   (b) Factory structure: each company is an independent cell with its own budget, profit and loss, and kill switch. Shared services (design, legal templates, outreach infrastructure) are charged to companies at internal prices, so no central planner allocates by fiat and a failing company cannot hide its costs.

3. **Stay as small as possible at every stage.**
   (a) "it really pays to keep a company as small as it can be at every stage."
   (b) Add an agent role or an expert only to fix a measured bottleneck that is named in the decision log. Track spend per dollar of revenue.

4. **Mediocre hires cost twice.**
   (a) "Mediocre hires hurt you twice: they get less done, but they also make you big"
   (b) Hire fewer, better experts: vet them with a paid trial task and keep only those who score in the top band. Never hire two average experts in place of one good one.

## Change Your Name — https://paulgraham.com/name.html

1. **Owning the .com signals strength.**
   (a) "a marginal domain suggests you're a marginal company."
   (b) Launch gate: the company's name equals a .com we own (or the ccTLD of a local-first niche).
   (c) Does not transfer fully: for niches sold through cold outreach or search, a descriptive name can beat a brandable one. The rule still holds: own the exact domain of whatever name you use.

2. **Naming is a search over available domains, not a creative act.**
   (a) "almost any word or word pair that is not an obviously bad name is a sufficiently good one"
   (b) Naming procedure: generate 200 or more candidate word pairs, filter them to .coms that are unregistered or cost ≤ $50 (default), have them judged for "not obviously bad", then pick. Domain spend is capped per company.

3. **Never plan around a domain you don't own.**
   (a) "Don't believe a domain is for sale unless the owner has already told you an asking price."
   (b) Agents may not commit a name, logo or copy to a domain that has not been purchased.

## What Happened to Yahoo — https://paulgraham.com/yahoo.html

1. **Easy money hides the truth; circular money is a Ponzi scheme.**
   (a) "they had the most opaque obstacle in the world between them and the truth: money." / "By 1998, Yahoo was the beneficiary of a de facto Ponzi scheme."
   (b) **Arm's-length revenue rule**: first-dollar and continue metrics count only revenue from customers unrelated to the owner, the owner's contacts, experts, Cofactory, or any other Cofactory company. Within Cofactory, factories buying from each other count as zero; otherwise a growing platform manufactures its own traction. Also flag revenue concentration: a single customer providing more than 40% (default) of revenue makes the business "fragile".

2. **Low share is not the same as low value.**
   (a) "Search was only 6% of our traffic, and we were growing at 10% a month.   It wasn't worth doing better."
   (b) Operator rule: report revenue and margin per customer segment, not volume alone. Any segment with 2× (default) the average revenue per customer gets its own review, even when it is small.

3. **Don't turn builders into spec translators.**
   (a) "Theirs was not to reason why; theirs was to build what product managers spec'd."
   (b) The agent that builds the product reads the raw customer evidence (quotes, tickets, call notes), not only a spec written by a planner agent.

## Why There Aren't More Googles — https://paulgraham.com/googles.html

1. **Consensus loses the outliers.**
   (a) "The more people who have to like a new idea, the more outliers you lose."
   (b) **Champion rule**: a candidate advances to cheap validation if one judge argues strongly for it with cited evidence. Never require a majority, and never average LLM-judge scores. Averaging both pulls factories toward the same answers and prunes the best ideas. Spend is the gate, not agreement.

2. **Good ideas look bad.**
   (a) "Any really good new idea will seem bad to most people; otherwise someone would already be doing it."
   (b) Score feature: a penalty for "obviously good" (many existing players, high search volume for the solution, not just the problem). No penalty for low judge-rated plausibility.

3. **The evidence bar scales with the size of the bet.**
   (a) "If you're investing at a tenth the valuation, you only have to be a tenth as sure."
   (b) Portfolio policy: the amount of diligence matches the size of the tranche. A test costing $20 needs one cited signal; a launch tranche of $500 needs the full dossier gate. Spending more on diligence than on the test itself is a bug.

## The Equity Equation — https://paulgraham.com/equity.html

1. **Trade a share only for proportionally more value.**
   (a) "the deal is a good one if it makes the company worth more than 1/(1 - n)."
   (b) Cofactory's own revenue share n is justified only if Cofactory multiplies the owner's expected outcome by more than 1/(1−n). For a 20% share that is 1.25×. Measure it and publish it: compare owner net revenue under Cofactory with a baseline of the owner running the same tooling alone. Experts' revenue share follows n ≤ (i−1)/i minus their cash cost, where i is their estimated uplift.
   (c) Does not transfer: the conversion of salary into stock at 1.5× assumes valuation grows 3× a year, which a bootstrapped niche company will not. Pay experts cash or a revenue share, never equity.

2. **Always feel richer after the trade.**
   (a) "You should always feel richer after trading equity."
   (b) Every grant of revenue share must be recorded with its assumed i (uplift). Review it at 90 days and claw back or renegotiate if the measured uplift falls short.

## Before the Startup — https://paulgraham.com/before.html

1. **Playing house: copying the outward forms.**
   (a) "while imitating all the outward forms of a startup they have neglected the one thing that's actually essential: making something people want."
   (b) This is the main failure mode of an AI factory, because agents produce outward forms cheaply (logos, LLCs, polished sites, pitch documents). Spend rule: no incorporation, brand work or site polish before a validation signal (a priced offer accepted). Metric `forms_ratio` = spend on artifacts with no customer in the loop / total spend. Cap it at 20% (default) before first dollar.

2. **Gaming stops working; only users count.**
   (a) "There is no boss to trick, only users, and all users care about is whether your product does what they want."
   (b) Agents will game whatever grader they face. So gates must read **external behaviour** only (payments, replies, usage, refunds) and never an agent's self-report or an LLM's grade of prose.

3. **Be an expert on users, not on startups.**
   (a) "not to be an expert on startups, but to be an expert on your users and the problem you're solving for them."
   (b) Spend the agents' context budget on niche-specific material (customer language, workflows, regulations), not on generic startup playbooks.

4. **Domain expertise is the part that matters.**
   (a) "The component of entrepreneurship that really matters is domain expertise."
   (b) Every factory must name its expertise source (the owner or a hired expert) for each niche before validation spend. A niche with no expertise source cannot pass the dossier gate.

5. **Trust misgivings about people.**
   (a) "If someone seems slippery, or bogus, or a jerk, don't ignore it."
   (b) Expert and partner vetting: any red flag (claims that don't check out, pressure tactics, reluctance about a trial task) is an automatic reject. An impressive résumé cannot override it.

6. **Nobody can tell in advance which will be the stars.**
   (a) "I learned to keep a completely open mind about which of the startups in each batch would turn out to be the stars."
   (b) Portfolio policy: allocate money after launch on post-launch evidence, not on pre-launch scores. Pre-launch scores only decide which cheap tests to run. Measure the correlation between dossier score and revenue at 90 days; if it is near zero, stop spending on more pre-launch diligence.

## A Student's Guide to Startups — https://paulgraham.com/mit.html

1. **Startups die of running out of money; a low burn buys time to recover.**
   (a) "Nearly every startup that fails, fails by running out of money."
   (b) Size each company's budget for 3 or more full iterations of its cheapest test (default), not for one launch. A budget that only affords one shot cannot pass the plan check.

2. **No rigid plan with big spend.**
   (a) "have a rigid, pre-ordained plan and then start spending a lot of money to implement it."
   (b) Budget is released in tranches, one per gate, each unlocked by evidence. No tranche is released on a plan alone.

3. **Make it at a tenth of the cost.**
   (a) "someone comes along and makes something for a tenth or a hundredth of what it used to cost, and the existing players can't follow"
   (b) Score feature `labor_arbitrage`: what share of the incumbents' price is human labour that agents can do? Favour niches where we can price at ≤ 1/3 (default) of today's option and still keep a 70% gross margin. This is Cofactory's structural edge, and it transfers better than almost anything in PG.

4. **Boring fields have less competition.**
   (a) "just start a startup in some unsexy field where you'll have less competition, like software for human resources departments."
   (b) Do not reward novelty or "coolness" in discovery scores. Keep a quota of mundane B2B back-office niches.

5. **Measure the gap left, not the effort spent.**
   (a) "customers will judge you from the other direction: the distance remaining between where you are now and the features they need."
   (b) The progress metric is the number of open items on the customer's must-have list, not features shipped or tasks completed.

6. **Disproving the idea counts as progress.**
   (a) "Often the only value of most of the stuff you build in the first six months is that it proves your initial idea was mistaken."
   (b) Log falsified hypotheses as first-class output. A kill backed by a clean falsification counts as a successful run in the factory's metrics, so agents are not pushed to keep zombie companies alive.

## Why to Not Not Start a Startup — https://paulgraham.com/notnot.html

1. **Narrow and genuine beats broad and hypothetical.**
   (a) "A need that's narrow but genuine is a better starting point than one that's broad but hypothetical."
   (b) This validates the extreme-niche thesis. Rank on genuineness of the need, with breadth only as a tie-breaker above the ceiling floor (earn #1).

2. **Willingness to endure schleps is an edge, and agents have it cheaply.**
   (a) "What makes a good startup founder so dangerous is his willingness to endure infinite schleps."
   (b) Score feature `schlep_premium`: favour niches that humans avoid because they are tedious (data cleanup, compliance paperwork, manual reconciliation). Before a kill for "no demand", require a minimum outreach count (default 50 targeted contacts).

3. **Most of the idea changes.**
   (a) "I'd guess 70% of the idea is new at the end of the first three months."
   (b) Within a niche, budget for pivots (e.g. 30% of a company's budget reserved for them). A pivot that leaves the segment requires a new dossier and a new registry claim.

4. **Services first is safer, though capped.**
   (a) "start a consulting business you can then gradually turn into a product business."
   (c) PG treats this as low-ceiling. For Cofactory it is often the fastest honest route to first dollar: a done-for-you service run by agents and the expert, turned into a product later. Allow `service-first` as a launch mode and track the share of delivery that is automated.

5. **There is room for many startups.**
   (a) "Why should there be any limit on the number who can work for equity at 5-person companies?"
   (b) Supports a many-factories design: the supply of niches is not the constraint. Duplicate claims are, which is why the registry is needed (brandage #2).

## Persuade xor Discover — https://paulgraham.com/discover.html

(The essay is about writing, but it applies directly to how dossiers are written.)

1. **Spin contaminates your own thinking.**
   (a) "The ideas start to get mixed together with the spin you've added to get them past the readers' misconceptions."
   (b) Dossier format: claims with evidence and a "case against" section; no adjectives, no pitch framing. A lint step removes persuasive language before a gate reviewer or the owner sees the dossier.

2. **Writing to persuade steers you away from surprising ideas.**
   (a) "I worry that if I wrote to persuade, I'd start to shy away unconsciously from ideas I knew would be hard to sell."
   (b) Never reward discovery agents on owner approval rate. Reward them on validated outcomes. Otherwise they learn to propose what owners already like, which brings back convergence.

## Billionaires Build — https://paulgraham.com/ace.html

1. **The initial market must exist now.**
   (a) "There have to be some people who want what you're building right now, and want it so urgently that they're willing to use it"
   (b) Validation gate: a list of named, reachable people with an urgent need. Default ≥ 3 who paid or committed before the product exists.

2. **Random-access questioning of the dossier.**
   (a) "We couldn't ask them a question they didn't know the answer to."
   (b) Gate test: an adversarial agent asks 10 questions about users, picked at random (who buys, what they use now, what it costs them, why now, how they'd find us). Each answer must cite evidence or say "unknown". More than 3 "unknown" answers (default) fails the dossier gate. This replaces reading the dossier as a pitch.

3. **"Nothing could go wrong" disqualifies.**
   (a) "If you're asked, for example, what could go wrong, the worst possible answer is \"nothing.\""
   (b) The dossier must include a detailed failure-modes section with at least 5 specific risks (default) and the kill signal for each. If the section is missing or generic, the gate fails.

4. **Competitors seldom kill; execution does.**
   (a) "Competitors are rarely what kills startups. Poor execution does."
   (b) Never kill only because competitors exist. Do fail any dossier that leaves out or downplays known competitors, which is checked automatically by search.

5. **The best early adopters are the hardest to fool.**
   (a) "the sort of early adopters a successful startup wants as its initial users are the hardest to fool."
   (b) Hard guardrails: no fake reviews, fake scarcity, invented testimonials or misleading claims. These are both a legal gate and a business rule, and violations kill the company.

---

## Strongest rules from this batch

1. **Only arm's-length payment validates.** Gates count only payments from customers unrelated to the owner, experts, Cofactory or other factories, at ≥ 50% of list price. Factories buying from each other, free pilots and subsidised sales count zero. (yahoo, powerful, hiring)
2. **Gates read external behaviour, never agent prose.** Use payments, replies, usage and refunds, not self-reports or LLM grades of dossiers. Agents game graders the way students game exams. (before, discover)
3. **Dossiers are written to discover, not to persuade.** Run a random-access Q&A test (≤ 3 "unknown"), require a detailed failure-modes section and candour about competitors, cite every claim to user-sourced evidence, and require a firsthand need (`need_provenance` ≠ inferred). (ace, discover, hiring, earn)
4. **No playing house.** No incorporation, brand or polish spend before a priced offer is accepted. Keep `forms_ratio` ≤ 20%. Release budget in tranches per gate, with diligence matched to tranche size and enough budget for ≥ 3 iterations. (before, mit, googles)
5. **Champion, not consensus.** One judge with cited evidence can advance a candidate to a cheap test. Never average judge scores. Keep a quota of low-plausibility candidates in the pipeline. (googles, earn, notnot)
6. **Pick power-shaped niches.** Favour customers who make or save money (ROI ≥ 5× price), decide fast with a card, and are reachable outside gatekept ("mafia") markets. Own the billing relationship. (powerful)
7. **Exploit labour arbitrage and schleps.** Target boring niches where the incumbents' price is mostly human labour, so agents can price at ≤ 1/3 and still keep a 70% margin. Allow a service-first launch. (mit, notnot)
8. **Default-alive or kill.** `continue` requires revenue ≥ full operating cost (compute + experts) within 90 days of first dollar. Never plan on a sale. Count a clean falsification as success. (prcmc, mit)
9. **Cofactory is the management company.** Every company must pass a bus-factor test (a fresh operator restarted from the dossier alone) and an export dry run (the owner can leave with the domain, payments, code and customers). Decide at the portfolio level, and justify the revenue share by measured uplift > 1/(1−n). (prcmc, equity)
10. **Diverge through inputs; pool only uncorrelated bets.** Optimal search converges, so seed each factory with the owner's and experts' private domain inputs, block duplicates through a cross-factory niche claim registry, share operational learnings but not niche choices, and cap portfolio correlation (segment, channel, platform) before any risk pooling. (brandage, earn, prcmc, powerful)
