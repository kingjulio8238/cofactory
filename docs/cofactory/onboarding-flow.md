# Onboarding flow

Cofactory's first run keeps dusk's walkthrough mechanics:
- one ask per screen;
- a pixel illustration, a short headline and one line under it;
- a black Continue button;
- progress dashes, Back, and Skip or Later where skipping is safe;
- the arrival screen where the crew shows up.

Every screen is rebuilt around what a company factory needs. dusk's beats are `welcome`, `place`, `account`,
`checkout`, `bring`, `phone`, `making` and `permissions` (`src/components/onboarding/funnel.ts`).

The rule, borrowed from Stripe: **onboarding asks only what the factory needs to start looking; everything that costs
money or belongs to one company is asked later, in an activation checklist, when it is needed.** Nobody buys a domain
for a business that does not exist yet.

## Screens

| # | Screen | dusk beat it reuses | What it asks | Why the factory needs it | What it writes |
|---|---|---|---|---|---|
| 1 | **Meet Cofactory.** "Your own company factory. It finds businesses so niche only you would start them, and runs them to their first dollar." | `welcome` | Nothing | Sets the promise | None |
| 2 | **Account** | `account` | Sign in, or skip | Sync with the phone and the cloud. Your email seeds your own addresses (screen 8). | dusk account |
| 3 | **Where your factory runs** | `place` and `checkout` | This Mac / dusk cloud / your own server | Companies answer customers while you sleep, and the cloud gives the public intake address with no tunnel. Cloud is recommended here, unlike dusk. | dusk place |
| 4 | **Which AI runs your crew** | `ConnectAi` / `AiStep` | Engine sign-in (Claude Code, ChatGPT and others) | Nothing runs without it. Model use is billed to your subscription and tracked as shadow cost. | dusk instances |
| 5 | **Bring what you know** | `bring` | Copy a prompt into the AI that knows you best. It returns your factory profile: fields and trades you know, skills, places, languages, interests, hard no's. Paste it back. | The profile is what keeps your niches from being everyone's niches (the divergence eval: 0.04 overlap with a profile vs 0.72 without), and your AI already knows it | Draft profile |
| 6 | **Your profile** | (new; same cards) | Review and edit the profile as chips; country (and state in the US); up to 3 hunches as optional seed niches | Country sets the outreach rules and which niches are legal to run. Hunches are optional. | `POST /api/cofactory/profile` |
| 7 | **Your stake** | (new) | A monthly budget and a cap per company, shown as "up to N companies at $X each" | The books gate every launch and every spend | Deposit and policy |
| 8 | **What needs your OK** | (new) | Toggles, see the list below; also your own emails and domains, prefilled from the account | You stay in control of every outward step | Approvals and related parties |
| 9 | **Stay in the loop** | `phone` and the Notifications row of `permissions` | Pair the phone, allow notifications | Approvals and escalations reach you wherever you are; an inbox nobody opens is how the lead's escalation got lost | dusk phone, notifications |
| 10 | **Your factory is opening** | `making` / "Almost there" | Nothing | The Lead and the Scout arrive, then the first discovery batch starts in your fields | Staff the factory, start a batch |

The toggles on screen 8, with defaults:
- launch a company: ask;
- contact real people: ask, always;
- spend over $X: ask;
- kill a company: tell me afterwards, with the post-mortem.

**Dropped:** "Let your bots use this Mac" (Accessibility, Screen Recording). Company seats must never drive your Mac or
phone; they are fenced off from them. Only the Notifications row survives, in screen 9.

## After onboarding: the activation checklist

The factory home opens with a Stripe-style checklist. Each line goes green on evidence, not on a click:

1. ✓ Profile set
2. ✓ Budget set
3. ⟳ First niches found: the batch runs and the scout's signals appear as they arrive
4. ○ First dossier shortlisted
5. ○ First company launched (your OK)
6. ○ **Go live**: this company's mailbox, Stripe and postal address, with a preview of the page and the first drafts,
   then the arm switch (your OK)
7. ○ First dollar: paid, delivered, and served again by a stand-in

Line 6 is the only point where money and identity are asked for, and only for a company that has earned it.

## Not built yet

- Approval settings: only arming outreach exists today.
- The country field and per-country outreach rules.
- The profile import prompt.
- The factory home and its checklist.
