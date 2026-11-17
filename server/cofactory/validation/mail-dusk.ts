import { listMessages, readMessage, sendMessage, type EmailGuard } from "../../email/client.ts";
import type { EmailAccount } from "../../email/store.ts";
import type { MailPort } from "./outreach.ts";

/** Outreach mail through a mailbox connected in dusk (IMAP and SMTP), read and sent by the server, never by a bot turn. */
export function duskMailPort(service: { store: { get(address: string): EmailAccount | null }; guard: EmailGuard }): MailPort {
  const account = (mailbox: string) => {
    const found = service.store.get(mailbox);
    if (!found) throw new Error(`the mailbox ${mailbox} is not connected in dusk`);
    return found;
  };
  return {
    async send(mailbox, input) {
      const sent = await sendMessage(account(mailbox), service.guard, {
        to: [input.to], subject: input.subject, text: input.text, headers: input.headers, ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
      });
      return { messageId: sent.messageId, rejected: sent.rejected };
    },
    async fetchNew(mailbox, afterUid) {
      const box = account(mailbox);
      const { messages } = await listMessages(box, service.guard, { mailbox: "INBOX", limit: 30 });
      const fresh = messages.filter((message) => message.uid > afterUid).sort((a, b) => a.uid - b.uid);
      const out: Awaited<ReturnType<MailPort["fetchNew"]>> = [];
      for (const summary of fresh) {
        const message = await readMessage(box, service.guard, { mailbox: "INBOX", uid: summary.uid });
        out.push({
          uid: message.uid, messageId: message.messageId ?? null, inReplyTo: message.inReplyTo ?? null, from: message.from, subject: message.subject,
          text: message.text, date: message.date ? Date.parse(message.date) : Date.now(),
        });
      }
      return out;
    },
  };
}
