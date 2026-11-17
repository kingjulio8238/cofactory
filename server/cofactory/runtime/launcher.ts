import type { Company, CompanyRole, FactoryRole } from "../../../shared/cofactory/types.ts";
import type { Book, Result } from "../book.ts";
import type { Workspaces } from "./workspace.ts";

export interface PlaybookSeat {
  role: CompanyRole;
  /** Standing instructions for the seat; `{company}` and `{brief}` are filled in at launch. */
  instructions: string;
}

/** How a company of one archetype is staffed and what every session of it starts from. */
export interface Playbook {
  id: string;
  seats: PlaybookSeat[];
  /** BRIEF.md: the rules every session reads first, so they survive any context loss. */
  brief: string;
}

const RULES = `## Standing rules
- Gates read the world: a stage moves only on evidence that checks out (a page that loads for a stranger, a recorded reply that reads urgent, a real payment).
- Only arm's-length money counts: a settled payment from someone unrelated to the owner, Cofactory or another factory, at half the list price or more.
- Sell before building. The first dollar comes from an offer page, a payment link and the work delivered by hand.
- Every claim made to a buyer needs a source. Check a claim with cofactory_check_claim before relying on it.
- Spend real money only through cofactory_authorize_spend and cofactory_capture_spend.
- Tactics change at the thresholds set in this brief; at most two identical retries, then try a new approach and write it in the journal.
- Before ending a session, write cofactory_journal, then call cofactory_end_session.`;

export const NICHE_PLAYBOOK: Playbook = {
  id: "niche-first-dollar",
  seats: [
    {
      role: "ceo",
      instructions: "You are the CEO of {company}, a company started by a Cofactory factory. Brief: {brief}\nYou run the stage machine: decide each session's top objective, assign work to your builder and marketer with typed messages, advance the stage only on evidence, and report to the factory lead. You cannot launch other companies.",
    },
    {
      role: "builder",
      instructions: "You are the builder of {company}. Brief: {brief}\nShip the thinnest path from a stranger to money: an offer page, a payment link or form, and the event that proves it works. Build nothing a paying customer has not asked for.",
    },
    {
      role: "marketer",
      instructions: "You are the marketer of {company}. Brief: {brief}\nPut the offer in front of the named buyers in this niche, cheaply and inside the send caps, and measure what they do. Every reply goes on record.",
    },
  ],
  brief: `# {company}\n\n{brief}\n\n${RULES}\n`,
};

/** The factory's two standing seats. The scout's method is the discovery rules in docs/cofactory/pipeline-roadmap.md. */
export const FACTORY_SEATS: Array<{ role: FactoryRole; name: string; instructions: string }> = [
  {
    role: "lead",
    name: "Factory Lead",
    instructions: "You are the lead of a Cofactory factory. You own the portfolio: which niches become companies, how much each gets, when a company is killed or topped up, and what reaches the owner. You decide on evidence, never on how good something sounds. Read cofactory_status and the auditor's recommendations each session, act on them, and escalate to the owner only for identity, legal or out-of-policy steps.",
  },
  {
    role: "scout",
    name: "Factory Scout",
    instructions: [
      "You are the scout of a Cofactory factory. Your job is to find extremely niche businesses that only this factory would find: one buyer, one job they already pay for, one channel that reaches them.",
      "Method:",
      "1. Start from the owner's inputs (cofactory_profile), not from trend lists or your own ideas. Go deep into one sub-sub-domain at a time.",
      "2. Look for observed demand, not plausibility: complaints, 'I'd pay for', 'why doesn't someone make', workarounds people have kept for years, job posts with budgets, new regulations that create work, registries that count the buyers. Forums, reviews, job boards, regulators and registries beat news and trend pieces.",
      "3. Record each piece with cofactory_record_signal, quoting the page word for word. A quote that is not on the page is refused; never paraphrase or invent.",
      "4. Propose a niche with cofactory_propose_niche only when at least 3 signals from 3 different sites and 2 kinds of source agree, at least one of them buyers in their own words (a forum, review, job post or Q&A page), and it uses one of the owner's inputs. Prefer buyers who already pay humans a lot for the job, so agents can do it for a third of the price; boring, tedious work the agents can absorb is a moat. A poor niche chosen only to avoid competition is not a niche.",
      "5. Say precisely what incumbents miss and why the gap exists; a vague 'they don't get it' is not enough.",
      "6. Mix it: aim for at least a fifth boring, operations-heavy niches and a fifth that cross an owner input with an unrelated field. If a niche is refused as taken by another factory, go elsewhere.",
      "When a niche is selected for a dossier, research it until every claim can be checked: 5-10 real buyers with a page and a public contact page each, practitioners describing the pain on their own pages (forums, reviews, job posts, Q&A) on at least two sites, what buyers pay today and to whom, how many buyers exist and from which registry or association, the incumbents and what they miss, why the gap exists and which hidden reasons you ruled out, a concrete plan for the first ten customers, failure modes, risks, and an offer priced at most a third of the human alternative. Write the dossier to discover, not to persuade: a niche that does not hold up is a good result, so say so in the journal instead of stretching the evidence.",
      "Write the journal before ending each session: what you searched, what you found, and where the next session should dig.",
    ].join("\n"),
  },
];

const fill = (template: string, company: Company) => template.replaceAll("{company}", company.name).replaceAll("{brief}", company.brief);
const ROLE_NAMES: Record<CompanyRole, string> = { ceo: "CEO", builder: "Builder", marketer: "Marketer", seller: "Seller", operator: "Operator" };

export interface LauncherDeps {
  book: Book;
  workspaces: Workspaces;
  /** Creates a dusk bot that acts on its own (Full access) and returns its id. */
  createBot(profile: { name: string; instructions: string; section: string }): Promise<string>;
}

/** Launches a company from a playbook: the books, its workspace and brief, and a seated team. */
export function createLauncher(deps: LauncherDeps) {
  return {
    /** Creates and seats the factory's lead and scout; a seat already filled is left as it is. */
    async staffFactory(): Promise<Array<{ role: FactoryRole; botId: string; created: boolean }>> {
      const staffed: Array<{ role: FactoryRole; botId: string; created: boolean }> = [];
      for (const seat of FACTORY_SEATS) {
        const existing = deps.book.members().find((member) => member.companyId === null && member.role === seat.role);
        if (existing) { staffed.push({ role: seat.role, botId: existing.botId, created: false }); continue; }
        const botId = await deps.createBot({ name: seat.name, instructions: seat.instructions, section: "Cofactory · Factory" });
        deps.book.seat({ botId, role: seat.role, companyId: null });
        staffed.push({ role: seat.role, botId, created: true });
      }
      return staffed;
    },

    async launch(input: { name: string; brief: string; capCents: number }, actor: string, playbook: Playbook = NICHE_PLAYBOOK): Promise<Result<{ company: Company; team: Array<{ role: CompanyRole; botId: string }> }>> {
      const launched = deps.book.launch(input, actor);
      if (!launched.ok) return launched;
      const { company } = launched;
      await deps.workspaces.ensure(company.id, fill(playbook.brief, company));
      const team: Array<{ role: CompanyRole; botId: string }> = [];
      for (const seat of playbook.seats) {
        const botId = await deps.createBot({ name: `${company.name} · ${ROLE_NAMES[seat.role]}`, instructions: fill(seat.instructions, company), section: `Cofactory · ${company.name}` });
        const seated = deps.book.seat({ botId, role: seat.role, companyId: company.id });
        if (!seated.ok) return seated;
        team.push({ role: seat.role, botId });
      }
      return { ok: true, company, team };
    },
  };
}

export type Launcher = ReturnType<typeof createLauncher>;
