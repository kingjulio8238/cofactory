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

The first draft asked what the owner knows, which defeats the point: the factory's bots do the work. Now the first run
asks only what a person must supply. Uniqueness comes from the factory itself. On opening, it draws 6 territories,
industries from the 2022 NAICS list (`server/cofactory/discovery/territories.ts`), seeded per factory and spread across
sectors. They become the profile the scout searches from.

The `territories` eval:
- 200 factories: 3.5% of pairs share one industry;
- every draw spans at least 6 sectors;
- a seed reproduces its draw;
- avoided territories never return.

| # | Screen | dusk beat it reuses | What it asks | Why only a person can answer | What it writes |
|---|---|---|---|---|---|
| 1 | **Meet Cofactory** | `welcome` | Nothing | Sets the promise | None |
| 4 | **Your AI** | `ConnectAi` / `AiStep` | Engine sign-in | The crew runs on your plan | dusk instances |
| 5 | **Where are you based?** | (new) | Country, plus state or province where it matters | The companies are yours, so your rules for contacting people, payments and tax apply | `settings.country`, `region` |
| 6 | **Your stake** | (new) | A monthly budget and a cap per company | Your money | Settings; the budget is deposited |
| 7 | **Anything in mind?** | (new, skippable) | Look here first (up to 3) and never run | Optional: your earlier answer that the owner *may* point the factory somewhere | `settings.hunches`, `never`, which become seed niches and constraints |
| 8 | **What needs your OK** | (new) | Defaults set, so usually one Continue | Your control over outward steps | Approvals and related parties |
| 10 | **Hear when it needs you** | the Notifications row of `permissions` | Allow notifications | Only you can grant it | macOS |
| 11 | **Your factory is open** | `making` / "Almost there" | Nothing | The factory draws its territories, the Lead and Scout arrive, the first search starts, and the first 3 territories are shown | `POST /api/cofactory/factory/open` |

The toggles on screen 8, with defaults:
- contact real people: always asks, and cannot be turned off;
- start a company: ask;
- spend over $25: ask;
- close a company: tell me afterwards, with the post-mortem.

**Out until Cofactory has its own:** dusk's account step, its cloud and its phone step. Each runs on dusk's services,
which show dusk's name: Google's sign-in reads "to continue to dusk.bot", the cloud checks out on dusk.bot, and the phone
pairs with the dusk bot app. The factory runs on this computer meanwhile.

**Dropped:**
- What the owner knows (fields, skills, people, assets, languages, interests) and the prompt that imported it from
  another AI.
- "Let your bots use this Mac" (Accessibility, Screen Recording): company seats are fenced off from the owner's Mac and
  phone.

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

- Approvals beyond the per-company cap and arming outreach: the launch, spend and close switches are saved but not yet
  enforced.
- Per-country outreach rules: the country is recorded, and the US rules (CAN-SPAM) are the only ones implemented.
- New territories for later batches: the factory keeps its first draw.
- The cloud path: dusk cloud keeps dusk's own flow.
- The factory home and its checklist.
