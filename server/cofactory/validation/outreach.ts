import type { Truth } from "../truth/store.ts";
import type { Sprints } from "./sprints.ts";

/** The mailbox operations outreach needs; in dusk this is the email client of a connected mailbox. */
export interface MailPort {
  send(mailbox: string, input: { to: string; subject: string; text: string; headers: Record<string, string>; inReplyTo?: string }): Promise<{ messageId: string; rejected: string[] }>;
  /** Messages received after `afterUid`, oldest first. */
  fetchNew(mailbox: string, afterUid: number): Promise<Array<{ uid: number; messageId: string | null; inReplyTo: string | null; from: string; subject: string; text: string; date: number }>>;
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
export function createOutreach(deps: { sprints: Sprints; truth: Truth; mail: MailPort; mailboxFor(companyId: string): string | null; cursor: { get(name: string): number; set(name: string, value: number): void } }) {
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
      const gate = sprints.authorizeTouch(sprintId, targetId, `email: ${input.subject}`);
      if (!gate.ok) return gate;
      const text = gate.optOutLine ? `${input.text.trimEnd()}\n\n${gate.optOutLine}` : input.text;
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
