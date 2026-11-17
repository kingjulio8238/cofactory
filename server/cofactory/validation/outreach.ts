import type { Truth } from "../truth/store.ts";
import type { Sprints } from "./sprints.ts";

/** The mailbox operations outreach needs; in dusk this is the email client of a connected mailbox. */
export interface MailPort {
  send(mailbox: string, input: { to: string; subject: string; text: string; headers: Record<string, string>; inReplyTo?: string }): Promise<{ messageId: string; rejected: string[] }>;
  /** Messages received after `afterUid`, oldest first. */
  fetchNew(mailbox: string, afterUid: number): Promise<Array<{ uid: number; messageId: string | null; inReplyTo: string | null; from: string; subject: string; text: string; date: number }>>;
}

const GIVEAWAY = /\b(free (trial|month|first|pilot|for (the|your) first)|first (month|order|report|job)s? (is |are )?(free|on us|at no cost)|no charge for the first|at no cost for the first)\b/i;

/** Why an offer or a message gives the first orders away, or null: a free first order produces no committed evidence. */
export function giveawayProblem(text: string): string | null {
  const found = GIVEAWAY.exec(text);
  return found ? `"${found[0]}" gives the first order away, so no payment can come of it; offer a money-back guarantee on a paid first order instead` : null;
}

const STOP = /\b(stop|unsubscribe|remove me|do not contact|don'?t contact|opt[ -]?out)\b/i;
const BOUNCE_FROM = /mailer-daemon|postmaster/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|returned mail|failure notice|delivery failure/i;

const addressOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

/**
 * Outreach through a company's own mailbox. Every message passes the sprint's gate first (named, public, unsuppressed
 * buyer; daily, sprint and per-buyer caps), carries the opt-out line and a List-Unsubscribe header on first contact,
 * and is logged with its Message-ID so the reply can be matched. Polling turns replies into evidence and honours every
 * "stop" and bounce at once, for good.
 */
export function createOutreach(deps: { sprints: Sprints; truth: Truth; mail: MailPort; mailboxFor(companyId: string): string | null; postalAddressFor(companyId: string): string | null; offerProblem(companyId: string): Promise<string | null>; armed(companyId: string): boolean; cursor: { get(name: string): number; set(name: string, value: number): void } }) {
  const { sprints, truth, mail } = deps;

  return {
    async send(sprintId: string, targetId: string, input: { subject: string; text: string }): Promise<{ ok: true; messageId: string; touchId: string } | { ok: false; reason: string }> {
      const sprint = sprints.sprint(sprintId);
      if (!sprint) return { ok: false, reason: "no such sprint" };
      const mailbox = deps.mailboxFor(sprint.companyId);
      if (!mailbox) return { ok: false, reason: "the company has no connected mailbox to send from; the owner connects one" };
      const target = sprints.targets(sprintId).find((candidate) => candidate.id === targetId);
      if (!target) return { ok: false, reason: "that buyer is not on this sprint's list" };
      if (target.channel !== "email") return { ok: false, reason: `${target.name} is reached by ${target.channel}, not email` };
      if (!deps.armed(sprint.companyId)) return { ok: false, reason: "the owner has not yet given the go-ahead to contact real people for this company; prepare the list and drafts, and wait" };
      const giveaway = giveawayProblem(`${input.subject}\n${input.text}`);
      if (giveaway) return { ok: false, reason: giveaway };
      const postal = deps.postalAddressFor(sprint.companyId);
      if (!postal) return { ok: false, reason: "the company has no postal address on record, which every outreach email must carry; the owner sets it" };
      if (sprints.touches(sprintId).length === 0) {
        const problem = await deps.offerProblem(sprint.companyId);
        if (problem) return { ok: false, reason: `the offer must load for a stranger before the first contact: ${problem}` };
      }
      const gate = sprints.authorizeTouch(sprintId, targetId, `email: ${input.subject}`);
      if (!gate.ok) return gate;
      const text = [input.text.trimEnd(), gate.optOutLine ?? "", `--\n${postal}`].filter(Boolean).join("\n\n");
      const headers = { "List-Unsubscribe": `<mailto:${mailbox}?subject=unsubscribe>` };
      try {
        const sent = await mail.send(mailbox, { to: target.address, subject: input.subject, text, headers });
        if (sent.rejected.length) sprints.suppress(target.address, "bounce");
        sprints.markSent(gate.touch.id, sent.messageId);
        return { ok: true, messageId: sent.messageId, touchId: gate.touch.id };
      } catch (error) {
        return { ok: false, reason: `the mailbox refused to send: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    /**
     * Mail to an existing customer about their order: no sprint caps, since they asked for the work, but never to a
     * suppressed address and never to someone without an order.
     */
    async sendCustomer(companyId: string, input: { to: string; subject: string; text: string; isCustomer(address: string): boolean }): Promise<{ ok: true; messageId: string } | { ok: false; reason: string }> {
      const mailbox = deps.mailboxFor(companyId);
      if (!mailbox) return { ok: false, reason: "the company has no connected mailbox to send from; the owner connects one" };
      const to = input.to.trim().toLowerCase();
      if (!input.isCustomer(to)) return { ok: false, reason: "that address has no order with this company; prospects are reached through a sprint" };
      if (sprints.suppressed(to)) return { ok: false, reason: "that address asked not to be contacted" };
      try {
        const sent = await mail.send(mailbox, { to, subject: input.subject, text: input.text, headers: {} });
        return { ok: true, messageId: sent.messageId };
      } catch (error) {
        return { ok: false, reason: `the mailbox refused to send: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    /** Reads new mail for a company: replies become evidence, stops and bounces become permanent suppressions. */
    async poll(companyId: string): Promise<{ recorded: number; suppressed: number }> {
      const mailbox = deps.mailboxFor(companyId);
      if (!mailbox) return { recorded: 0, suppressed: 0 };
      const name = `mail:${companyId}:${mailbox}`;
      const messages = await mail.fetchNew(mailbox, deps.cursor.get(name));
      const sprint = sprints.running(companyId);
      const sentRefs = new Map((sprint ? sprints.touches(sprint.id) : []).filter((touch) => touch.messageRef).map((touch) => [touch.messageRef!, touch]));
      let recorded = 0, suppressed = 0;
      for (const message of messages) {
        deps.cursor.set(name, Math.max(deps.cursor.get(name), message.uid));
        const from = addressOf(message.from);
        if (from === mailbox.toLowerCase()) continue;
        if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(message.subject)) {
          const touch = message.inReplyTo ? sentRefs.get(message.inReplyTo) : undefined;
          const target = touch && sprint ? sprints.targets(sprint.id).find((candidate) => candidate.id === touch.targetId) : undefined;
          if (target) { sprints.suppress(target.address, "bounce"); suppressed++; }
          continue;
        }
        if (STOP.test(`${message.subject} ${message.text.slice(0, 500)}`)) { sprints.suppress(from, "unsubscribe"); suppressed++; }
        const result = truth.recordEvent({
          source: "mailbox", externalId: message.messageId ?? `${mailbox}:${message.uid}`, companyId, kind: "reply", occurredAt: message.date,
          payerEmail: from, text: `${message.subject}\n${message.text}`.slice(0, 20_000),
        });
        if (!result.duplicate) recorded++;
      }
      return { recorded, suppressed };
    },
  };
}

export type Outreach = ReturnType<typeof createOutreach>;
