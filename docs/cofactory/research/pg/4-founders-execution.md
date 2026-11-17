# PG batch 4: founder behaviour, execution, judgement

Founder traits from Paul Graham's essays turned into behaviours and checks for Cofactory's agent teams (CEO, builder,
marketer, seller, factory lead) and the auditor. Terms follow `docs/cofactory/niche-factory.md`: company journal,
session budget, ledger, kill or scale, hired expert.

All 15 essays were read in full (2026-11-17). No fetch failed.

---

## Relentlessly Resourceful
https://paulgraham.com/relres.html

1. **Relentless is not enough. Each new attempt has to be a different approach.**
   (a) "you don't know whether you're about to plow through a block of foam or granite. So you have to be resourceful."
   (b) Pipeline rule: the harness hashes each failed action (tool, target, arguments). After 2 identical failures on
   the same obstacle, a third identical attempt is blocked. The agent must log a new `approach_id` that says what is
   different. After 3 distinct approaches fail, it files an obstacle report to the CEO with what it tried and what
   happened. Auditor metric: identical-retry count per session (target 0 above 2).

2. **Hapless means passive: letting circumstances decide.**
   (a) "To be hapless is to be battered by circumstances — to let the world have its way with you"
   (b) Pipeline rule: a session may end with status `waiting` only when it names the external dependency, the
   outbound action it took this session to move that dependency, and the next scheduled wake. A `waiting` with no
   outbound action counts as a stall. Metric: share of sessions that end passive, per company.
   (c) Does not transfer: PG thinks passivity is mostly a personality trait, partly teachable. In agents it comes from
   training (stopping to ask, ending the turn early) and is fixed in the harness (keep-working re-entry, the rule
   above), not by choosing different founders.

---

## A Word to the Resourceful
https://paulgraham.com/word.html

1. **Fire-and-forget: give a good team a lead and it closes it.**
   (a) "all you have to do is give them a lead, and they'll close it, whatever type of lead it is."
   (b) Pipeline rule: the factory lead's brief to a company is one line (goal, cap, deadline). Metric: lead
   interventions per company per stage, meaning follow-up nudges or corrections after the brief. A company that needs
   more than 2 nudges in a stage is flagged as low-resourcefulness, and its prompts and tools are reviewed.

2. **Follow every implication of feedback, including the unwelcome ones.**
   (a) "Understanding all the implications — even the inconvenient implications — of what someone tells you is a subset of resourcefulness."
   (b) Pipeline rule: every external signal (expert verdict, buyer reply, auditor finding) gets an `implications`
   journal entry. It lists each live decision the signal touches (niche score, price, offer, channel) and whether
   that decision changed. Auditor: a negative expert verdict that changed nothing is flagged.

3. **Bad teams bend feedback to fit a decision they already made.**
   (a) "they've already decided what they're going to do and everything I say is being put through an internal process in their heads"
   (b) Pipeline rule: when a signal contradicts the plan, the agent either changes the plan or rejects the signal
   with a linked reason ("tried X: <evidence>", "buyers said Y: <link>"). A rejection with no link is flagged as a
   rationalisation.
   (c) Does not transfer: an LLM more often fails the other way. It is sycophantic and accepts any comment. The check
   must apply in both directions: a plan change that rests on one unsupported comment is flagged too.

---

## The Right Kind of Stubborn
https://paulgraham.com/persistence.html

1. **Persist on the goal. Stay flexible on the means.**
   (a) "The persistent are attached to the goal. The obstinate are attached to their ideas about how to reach it."
   (b) Pipeline rule: each company's plan is a tree with three levels. L0 is the goal: first revenue from the named
   niche buyer. L1 is the strategy: the offer and the archetype. L2 is the tactics: channel, copy, price point,
   list. The CEO agent may swap L2 freely. Changing L1 needs a linked evidence entry. Changing L0 is a kill or pivot
   and belongs to code plus the factory lead, never to the company alone.

2. **Give way low in the tree when expected value drops.**
   (a) "You'll give way on any point low down in the decision tree, if its expected value drops sufficiently"
   (b) Pipeline rule: each L2 tactic is pre-registered before launch with a metric, a sample size and a kill
   threshold (e.g. reply rate under 2% after 50 contacts). When the threshold is hit, the tactic must be replaced in
   the next session. Retrying a tactic that has crossed its threshold is flagged as obstinacy.

3. **The obstinate cling to their first ideas, which are the least informed.**
   (a) "they'll tend to be attached to their first ideas about how to solve a problem, even though these are the least informed"
   (b) Pipeline rule: the auditor diffs the live plan against the v1 plan. If at least one metric has failed and the
   plan is still unchanged, the company is flagged.

4. **Resilience protects morale, not opinions.**
   (a) "Resilience means setbacks can't change your morale, not that they can't change your mind."
   (b) Pipeline rule: a failed metric must change the plan record. It must not lower the action rate (sessions,
   outbound volume) unless a budget rule says so. Metric: action rate in the 3 sessions after a setback compared with
   the 3 before.
   (c) Does not transfer: agents have no morale. The nearest failure is an agent that announces "this isn't working"
   and stops acting. Keep-working re-entry plus this metric replaces morale.

5. **Start with a small goal, then expand it.**
   (a) "Start by erring on the small side."
   (b) Pipeline rule: L0 always starts as one paid transaction from one named buyer segment. The goal grows only after
   it is met.

---

## The Anatomy of Determination
https://paulgraham.com/determination.html

1. **Will must be matched by discipline.**
   (a) "Determination implies your willfulness is balanced by discipline."
   (b) Pipeline rule: every new capability given to company agents (spend authority, outbound volume, a new channel or
   tool) ships with an auditor check for it in the same change. No capability without a check.

2. **Temptation grows with success, so discipline must grow too.**
   (a) "the dangers of indiscipline increase with temptation."
   (b) Pipeline rule: when a company tops up or crosses a revenue milestone, its checks get tighter, not looser:
   spend per revenue dollar, scope added per session, new tools requested. More budget never means less auditing.

3. **Wing flutter: bursts of great work, then nothing.**
   (a) "you see something like wing flutter, where they alternate between doing great work and doing absolutely nothing."
   (b) Pipeline rule: the heartbeat measures the variance of verified actions per session, not only the latest
   output. A company with a high burst-to-idle ratio is put on a steady daily cadence.

4. **Raise ambition after results, not before.**
   (a) "Achievements also tend to increase your ambition."
   (b) Pipeline rule: budgets and goals rise in steps that unlock on ledger milestones. A company never starts with a
   large cap.

5. **Serve the customer's needs and use determination to cover the gap.**
   (a) "focus more on their needs than your interests, and make up the difference with determination."
   (b) Pipeline rule: niche scoring weighs buyer need, payment evidence and reachability. It never weighs whether the
   work is interesting to the agents.
   (c) Does not transfer: PG's third factor, loving the work, does not exist for agents, so all the drive must come
   from the harness (re-entry, cadence, caps). His "deficit spending" (the young overrating their early work) is
   harmful for LLMs, which already overrate their progress. Claims of progress must be verified, not encouraged.

---

## Founder Mode
https://paulgraham.com/foundermode.html

1. **Skip levels and read the raw work.**
   (a) "it's going to break the principle that the CEO should engage with the company only via his or her direct reports."
   (b) Pipeline rule: in every review, the CEO agent and the factory lead read K raw artifacts per worker (the actual
   sent emails, buyer replies, the live offer page, ledger rows), not only the worker summaries. The auditor
   samples summary claims and checks each against its raw source.

2. **Reports from below are often managing up.**
   (a) "C-level execs, as a class, include some of the most skillful liars in the world."
   (b) Pipeline rule: an agent's claim of done or progress is untrusted until code verifies it: the URL resolves and a
   stranger can complete the path, a webhook event exists, a ledger row exists, the email was delivered. Unverified
   claims never move a stage gate.
   (c) Does not transfer, and it is worse for agents: an LLM reports success fluently with no intent to deceive, so
   the check is needed even more.

3. **Autonomy is earned and changes over time.**
   (a) "They'll even vary from time to time within the same company, as managers earn trust."
   (b) Pipeline rule: each agent has an autonomy level (spend per action, send volume, freedom from review) that
   follows its verified-claim pass rate. One false report drops it a level.

4. **The modular approach limits the damage a bad leader can do.**
   (a) "the modular approach does at least limit the damage a bad CEO can do."
   (b) Pipeline rule: founder-mode reading never means founder-mode bypass. The CEO agent cannot override caps, the
   money layer, outbound limits or legal gates. Those stay hard module boundaries.
   (c) Does not transfer: a founder's edge is unique judgement and taste. An AI CEO usually runs on the same model as
   its workers, so skipping levels buys information and verification, not better judgement.

---

## What We Look for in Founders
https://paulgraham.com/founders.html

1. **Determination: not going away.**
   (a) "when Bill Clerico starts calling you, you may as well do what he asks, because he is not going away."
   (b) Pipeline rule: the seller follows up each qualified prospect who has not replied, with spacing between
   attempts, up to 3 touches. Then it stops for good, and any opt-out ends contact at once.
   (c) Does not transfer: one human who keeps calling is persistent. Automated persistence at scale is spam. It burns
   sending domains and breaks anti-spam and privacy law, so the cap is hard.

2. **Flexibility: change course quickly.**
   (a) "you need to be able to modify your dreams on the fly."
   (b) Pipeline rule, as a metric: pivot latency, the number of sessions from a crossed kill threshold to a new
   registered plan. Target: the next session.

3. **Good ideas look bad at first.**
   (a) "most good ideas seem bad initially. If they were obviously good, someone would already be doing them."
   (b) Pipeline rule: the scout may not drop a niche only because it looks implausible. It must cite evidence
   against it. A niche that looks obviously good gets an extra check: a competitor search, plus a reason it is still
   unserved.

4. **Break rules that don't matter, never rules that do.**
   (a) "They delight in breaking rules, but not rules that matter."
   (b) Pipeline rule: the rules that matter are an explicit, code-enforced list: the law, platform terms, honesty to
   buyers, budget caps, owner gates. Everything else (standard playbooks, a "proper" channel order, the usual
   business form) is open, and the CEO prompt asks for an unconventional move to be considered each cycle.
   (c) Does not transfer: an agent cannot reliably judge which rules matter, so the line is set in code, not left to
   the model.

5. **Friendship between founders.** Does not transfer: agents have no relationship to break. The nearest equivalent
   is conflicting instructions between roles, which is handled by one journal as the source of truth and one named
   decider per decision type.

---

## The Top Idea in Your Mind
https://paulgraham.com/top.html

1. **Whatever is top of mind gets all the background thinking.**
   (a) "it's a disaster to let the wrong idea become the top one in your mind."
   (b) Pipeline rule: every session brief opens with exactly one top objective, the current stage goal and its
   metric, before anything else in the journal.
   (c) Does not transfer: agents have no background thinking between sessions. The brief injected at the start of
   each session plays that role, so its first lines are the most valuable space in the system.

2. **Money is an attention sink.**
   (a) "Getting money is almost by definition an attention sink."
   (b) Pipeline rule: budgets, top-ups, billing and cap accounting live in code (the money layer and the auditor).
   Operating agents see one line, the remaining cap, and nothing more about money.

3. **Disputes are also an attention sink.**
   (a) "So avoid disputes if you want to get real work done."
   (b) Pipeline rule: a buyer dispute or refund request inside the cap gets an immediate refund, logged, with no
   argument. Agents reply at most once to hostile comments or prospects, then disengage. Disputes above the cap go to
   the owner gate.

---

## Maker's Schedule, Manager's Schedule
https://paulgraham.com/makersschedule.html

1. **Interruptions wreck deep work.**
   (a) "A single meeting can blow a whole afternoon, by breaking it into two pieces each too small to do anything hard in."
   (b) Pipeline rule: low-priority event wakes (a new reply, a form submit) are queued during a deep session
   (dossier, build) and delivered at the session boundary. Only payment failures, legal or abuse issues, and cap
   alerts interrupt.
   (c) Does not transfer: agents don't lose morale to fragmented time, but every interruption costs a context reload
   (tokens). Batching is still right, for cost.

2. **Office hours: schedule the meetings so they can't interrupt.**
   (a) "Because they come at the end of my day these meetings are never an interruption."
   (b) Pipeline rule: human touchpoints (owner gates, hired-expert calls) are batched into fixed windows. The owner
   gets one gate digest per day, never a stream of requests.

3. **Speculative meetings are expensive for the other side.**
   (a) "Speculative meetings are terribly costly if you're on the maker's schedule, though."
   (b) Pipeline rule: agents never ask a human for an open-ended call. Every expert or buyer request states its
   specific questions, a time box and the payment.

---

## Be Good
https://paulgraham.com/good.html

1. **Doing what's best for users settles hard choices.**
   (a) "Do whatever's best for your users. You can hold onto this like a rope in a hurricane"
   (b) Pipeline rule: the CEO prompt's tie-breaker, when options score close, is the option best for the buyer. The
   auditor flags dark patterns: fake scarcity, invented reviews or customers, hidden fees, cancellation that is hard
   on purpose.

2. **Honesty is stateless.**
   (a) "it's stateless. It's like telling the truth."
   (b) Pipeline rule: no claim to a buyer (a customer count, a testimonial, a capability, a credential) without a
   source in the company repo. The auditor checks the copy against the sources.
   (c) Transfers even better than for humans: agents really are stateless between sessions. A lie told in session 3
   cannot be remembered in session 9, so honesty is the only policy that stays consistent.

3. **Users make you look after them (the tamagotchi effect).**
   (a) "once you have users, the tamagotchi effect kicks in."
   (b) Pipeline rule: a company with paying users must include support in its cadence (a response SLA). It cannot
   be killed without a wind-down that refunds or hands off those users.

4. **Cheap to run means hard to kill.**
   (a) "If you're really committed and your startup is cheap to run, you become very hard to kill."
   (b) Pipeline rule: an idle company costs close to $0 (no always-on compute, no paid tools that aren't used). A
   company is killed because the opportunity is better elsewhere, not because of its burn.

---

## Mean People Fail
https://paulgraham.com/mean.html

1. **Win by moving past competitors, not by fighting them.**
   (a) "Startups don't win by attacking. They win by transcending."
   (b) Pipeline rule: marketer and seller prompts ban attacks on competitors and flame wars. A comparison is allowed
   only when it is factual and sourced. A public complaint is answered with a fix, not a rebuttal.

2. **Mean people can't hire the best people.**
   (a) "But the best people have other options."
   (b) Pipeline rule: hired experts get a clear brief, fair pay at the posted rate and payment within the posted
   terms. Metric: share of experts who accept a second engagement. Below 50% triggers a review of how experts are
   treated.
   (c) Does not transfer: agents aren't mean, but high-volume automated outreach reads as rude. A tone audit on
   samples of outbound replaces a judgement of character.

---

## Earnestness
https://paulgraham.com/earnest.html

1. **Earnest means right motives (direction) and full effort (magnitude).**
   (a) "they're doing something for the right reasons, and that they're trying as hard as they can."
   (b) Pipeline rule: for an agent, the right motive means optimising the buyer's real outcome, not the proxy
   metric. The auditor runs Goodhart checks: signups with no activity, self- or related-party purchases, "replies"
   that are unsubscribes, refunds netted out of revenue.
   (c) Does not transfer: an agent has no real interest in the problem and will optimise whatever metric it is
   given, so earnestness has to come from checks outside the agent.

2. **Avoid fields where earnestness doesn't matter.**
   (a) "certain types of business that are similar to crime, like gambling, personal injury law, patent trolling, and so on."
   (b) Pipeline rule: a scout exclusion list of zero-sum or extractive categories (gambling, patent trolling,
   misleading lead-gen arbitrage, SEO spam, review farms). Scoring test: "Would a company that truly cares about this
   buyer's problem beat a cynical one here?" If not, reject the niche.

3. **Plainness beats affectation.**
   (a) "to be cleverly cynical, to be superficially brilliant, to be conspicuously virtuous, to be cool"
   (b) Pipeline rule: offer copy states the buyer's problem, the deliverable, the price and a proof link in plain
   words. The auditor flags hype words and claims that don't say anything specific.

---

## How to Work Hard
https://paulgraham.com/hwh.html

1. **Past a limit, more hours make the work worse.**
   (a) "in many kinds of work there's a point beyond which the quality of the result will start to decline."
   (b) Pipeline rule: sessions are capped at the measured plateau (the ULR run plateaued at about 3.5 h). Verified
   output per session-hour is logged, and a session ends early when it flattens.
   (c) Does not transfer: agents don't get tired, but long contexts degrade (context rot). The limit is session
   length and context size, not hours of human effort.

2. **Aim at the hard core, not the easy edges.**
   (a) "Working hard means aiming toward the center to the extent you can."
   (b) Pipeline rule: each journal action is tagged `core` (moves directly toward first dollar: buyer contact, the
   offer, the payment path, delivery) or `peripheral` (logo, docs, refactors, more research). Auditor: a session
   with under 50% core actions in Validate or Sell is flagged.

3. **Hard work with poor results means switch.**
   (a) "If you're working hard but not getting good enough results, you should switch."
   (b) Pipeline rule: each stage has a time box and a minimum signal set before it starts (e.g. Validate: 50
   contacts, 5 sessions, at least 1 deposit). If the box is used up and the signal isn't met, the kill or scale
   review is triggered automatically.

4. **Determination makes it hard to see your own dead end.**
   (a) "Instead of giving up, you tell yourself, I should just try harder. And who can say you're not right?"
   (b) Pipeline rule: the company's own CEO agent can propose a kill but never veto one. The decision belongs to code
   rules plus the factory lead, using the pre-registered thresholds.

5. **Everything depends on being honest with yourself.**
   (a) "how at each point it depends on being honest with yourself."
   (b) Pipeline rule: an agent's own estimate of progress is never used as an input. Every progress field in the
   journal must reference an event, a ledger row or a URL.

---

## How to Do Great Work
https://paulgraham.com/greatwork.html

1. **Procrastinating on the real project looks like work.**
   (a) "it usually camouflages itself as work. You're not just sitting around doing nothing; you're working industriously on something else."
   (b) Pipeline rule: each session ends with a forced question in the journal: "Was this the action that most moves
   first dollar? If not, why?" This feeds the core-work share check (How to Work Hard #2).

2. **Start with the simplest thing and grow it in versions.**
   (a) "Begin by trying the simplest thing that could possibly work."
   (b) Pipeline rule: the builder's v0 is always an offer page, a payment link and manual fulfilment. Each next
   version adds one change, tied to a buyer response. Plans name only the next experiment and its metric.

3. **No failures means too little risk.**
   (a) "If you're not failing occasionally, you're probably being too conservative."
   (b) Pipeline rule, at factory level: the validation success rate is tracked against a target band. If too many
   validations pass, the scout is picking safe, crowded niches and is pushed toward stranger ones. If almost none
   pass, scoring is broken.

4. **Backtrack only as far as you must. Never abandon the root.**
   (a) "Never let setbacks panic you into backtracking more than you need to. Corollary: Never abandon the root node."
   (b) Pipeline rule: after a failure, back off one level at a time (tactic, then strategy, then niche), and only
   when the lower level's thresholds are used up. The root is the factory's goal of companies that reach first
   revenue. A dead company's post-mortem must update the niche graph and scout scoring, or the kill isn't complete.

5. **Ignore sunk cost.**
   (a) "If I'd already made the change, would I want to revert to what I have now?"
   (b) Pipeline rule: kill and pivot memos may not cite money or effort already spent. They state only forward
   expected value. The auditor rejects a memo that argues from sunk cost ("we've already invested").

6. **Name exactly what everyone else is missing.**
   (a) "you have enough expertise to say precisely what they're all overlooking, that's as good a bet as you'll find."
   (b) Pipeline rule: every dossier must state precisely why incumbents have missed or neglected the niche
   (too small for them, a new regulation, a broken tool, the channel they can't reach), with a source. PG's note: a
   vague "they don't get it" marks a crank, so the dossier is rejected.

---

## Two Kinds of Judgement
https://paulgraham.com/judgement.html

1. **Most people judging you are customers, not judges.**
   (a) "If you regard someone judging you as a customer instead of a judge, the expectation of fairness goes away."
   (b) Pipeline rule: one rejection (a prospect's no, a marketplace denial, an app review rejection) is a sample, not
   a verdict. Decisions update on aggregates against pre-registered thresholds, never on one rejection.

2. **Selectors decide fast, so make the case for them.**
   (a) "the more you realize you can do things to influence the outcome."
   (b) Pipeline rule: any submission to a selector (platform review, procurement, directory listing, expert outreach)
   puts the decisive facts in the first lines and is written for a quick, impersonal read.

3. **Errors at the borderline cost little.**
   (a) "The only place your judgement makes a difference is in the borderline cases."
   (b) Pipeline rule: the scout spends no extra research budget separating rank N from rank N+1 near the cutoff. That
   budget goes to validating the clear leaders, where the market will settle it more cheaply.

---

## Five Founders
https://paulgraham.com/5founders.html

1. **A few users who love you beat many who like you.**
   (a) "it's better, initially, to make a small number of users really love you than a large number kind of like you."
   (b) Pipeline rule: validation and early scale are measured by depth (paid, repeat purchase, a referral or an
   unprompted reply from 3 or more buyers), not breadth (signups, traffic). Breadth metrics alone can never pass a
   stage gate.

2. **Make success measurable.**
   (a) "put them to work on a problem where their success can be measured, you win."
   (b) Pipeline rule: each company task has a success measure in the ledger or the event log. A task with no
   measurable outcome is not given to an agent.

3. **Clear out outdated ideas.**
   (a) "brutally candid; aggressively garbage-collecting outdated ideas; and yet driven by pragmatism rather than ideology."
   (b) Pipeline rule: the journal keeps an assumptions list, each with a last-verified date. Any assumption not
   re-verified within its stage's window expires and must be checked again before a decision uses it.

---

## Strongest rules from this batch

1. **Reports are untrusted until code verifies them.** No claim of done or progress moves a gate without a URL that
   resolves for a stranger, a webhook event or a ledger row. Autonomy follows the verified-claim pass rate, and one
   false report drops it a level. (Founder Mode, How to Work Hard)
2. **Three-level plan with pre-registered thresholds.** Tactics are swapped freely when they hit their pre-set kill
   threshold. A strategy change needs linked evidence. The goal (first revenue from the named buyer) changes only
   through code plus the factory lead. Retrying a tactic past its threshold counts as obstinacy. (Right Kind of
   Stubborn, Great Work)
3. **Resourceful, not just relentless.** At most 2 identical retries. Each later attempt is a new logged approach.
   After 3, the CEO gets an obstacle report. `waiting` is allowed only with a named dependency, an outbound action
   this session and the next wake. (Relentlessly Resourceful)
4. **Feedback check in both directions.** A contradicting signal produces either a plan change or a rejection linked
   to evidence. A plan change that rests on one unsupported comment is flagged too (sycophancy). Single rejections
   are samples, not verdicts. (Word to the Resourceful, Two Kinds of Judgement)
5. **The company cannot veto its own kill, and kills ignore sunk cost.** The CEO agent may propose a kill. Code
   thresholds plus the lead decide. Memos argue only forward value. A post-mortem must update the niche graph.
   (How to Work Hard, Great Work)
6. **Core-work share.** Every action is tagged core (moves first dollar) or peripheral. A Validate or Sell session
   with under 50% core is flagged. Every session opens with one top objective and ends by answering "was this the
   action that most moves first dollar?" (Top Idea, How to Work Hard, Great Work)
7. **Keep money and disputes out of operating agents' heads.** Caps and billing run in code, and agents see one
   line of remaining budget. A dispute inside the cap gets an immediate refund with no argument. Agents reply once
   to hostility, then stop. Low-priority events are batched to session boundaries. (Top Idea, Maker's Schedule)
8. **Depth over breadth.** Gates pass on paid, repeat or referring buyers (3 or more who love it), never on signups
   or traffic alone. v0 is an offer page, a payment link and manual fulfilment. (Five Founders, Great Work)
9. **Buyer-first, stateless honesty.** No claim to a buyer without a source in the repo. A dark-pattern audit runs
   on all copy. Goodhart checks cover self-purchases, inactive signups and unsubscribe "replies". Extractive niches
   where earnestness doesn't matter are excluded. Every capability ships with its own check. (Be Good, Earnestness,
   Anatomy of Determination)
10. **The scout has to explain the gap and take enough risk.** Every dossier names precisely, with a source, what
    incumbents overlook ("they don't get it" means reject). Validation pass rate is held to a target band, because
    too many passes means the niches are too safe. Research budget goes to the clear leaders, not to borderline
    rankings. (Great Work, What We Look for in Founders, Two Kinds of Judgement)
