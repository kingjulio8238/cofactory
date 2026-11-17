import type { Company, CompanyRole } from "../../../shared/cofactory/types.ts";
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
