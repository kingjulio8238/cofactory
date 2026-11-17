import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OPT_OUT_LINE } from "../../../shared/cofactory/validation.ts";
import { openTruth } from "../truth/store.ts";
import { stripeEventToInput, verifyStripeSignature } from "../validation/intake.ts";
import { createOutreach } from "../validation/outreach.ts";
import { openSprints } from "../validation/sprints.ts";
import type { Suite } from "./harness.ts";
import { fixtureFetcher } from "./suites.ts";

const DAY = 24 * 60 * 60_000;

/**
 * The outreach gate: every case a send must be refused in is refused, every allowed send carries the opt-out on first
 * contact, and payments only count when Stripe signed them. A contact that should have been refused is never allowed.
 */
export function outreachGateSuite(): Suite {
  return {
    name: "outreach-gate",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-outreach-"));
      let at = Date.UTC(2026, 10, 18, 9);
      const now = () => at;
      const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher, now });
      const sprints = openSprints(join(dir, "sprints.db"), { truth, now, policy: { touchesPerDay: 3, touchesPerSprint: 5 } });
      const sent: Array<{ to: string; text: string }> = [];
      const cursors = new Map<string, number>();
      const outreach = createOutreach({
        sprints, truth, mailboxFor: () => "hello@company.test", cursor: { get: (name) => cursors.get(name) ?? 0, set: (name, value) => cursors.set(name, value) },
        mail: { send: async (_box, input) => { sent.push(input); return { messageId: `<m${sent.length}@x>`, rejected: [] }; }, fetchNew: async () => [] },
      });
      const failures: string[] = [];
      let correct = 0, total = 0, falseAllowed = 0;
      const expect = (name: string, allowed: boolean, shouldAllow: boolean) => {
        total++;
        if (allowed === shouldAllow) correct++;
        else failures.push(`${name}: expected ${shouldAllow ? "allowed" : "refused"}`);
        if (allowed && !shouldAllow) falseAllowed++;
      };
      try {
        const started = sprints.start({ companyId: "c1" });
        if (!started.ok) throw new Error(started.reason);
        const id = started.sprint.id;
        const add = (n: number, address = `owner${n}@riverside.test`) => sprints.addTarget(id, { name: `R${n}`, address, channel: "email", sourceUrl: `https://buyers-site.test/contact-${n}` });
        const targets: Array<{ id: string }> = [];
        for (const n of [1, 2, 3, 4]) { const added = await add(n); expect(`list buyer ${n}`, added.ok, true); if (added.ok) targets.push(added.target); }
        expect("guessed address", (await add(5, "ceo@riverside.test")).ok, false);
        expect("unverifiable page", (await sprints.addTarget(id, { name: "Spa", address: "x@spa.test", channel: "email", sourceUrl: "https://fixtures.cofactory.test/spa" })).ok, false);
        sprints.suppress("owner4@riverside.test", "unsubscribe");
        const send = async (index: number) => (await outreach.send(id, targets[index]!.id, { subject: "Hello", text: "A short note about reconciliation." })).ok;
        expect("first contact", await send(0), true);
        expect("opt-out on first contact", sent.at(-1)!.text.endsWith(OPT_OUT_LINE), true);
        expect("second contact too soon", await send(0), false);
        expect("suppressed buyer", await send(3), false);
        expect("second buyer", await send(1), true);
        expect("third buyer", await send(2), true);
        expect("daily cap", (await outreach.send(id, targets[0]!.id, { subject: "x", text: "a follow up note here" })).ok, false);
        at += 3 * DAY + 1;
        expect("follow-up after the gap", await send(0), true);
        expect("no opt-out on follow-up", !sent.at(-1)!.text.includes(OPT_OUT_LINE), true);
        expect("sprint cap", (await send(1)) && (await send(2)), false);
        at += 8 * DAY;
        expect("after the time box", await send(1), false);
        const payload = JSON.stringify({ type: "checkout.session.completed", livemode: true, created: at / 1000, data: { object: { id: "cs", payment_intent: "pi", payment_status: "paid", amount_total: 100 } } });
        const t = Math.floor(at / 1000);
        expect("forged Stripe signature", verifyStripeSignature(payload, `t=${t},v1=${createHmac("sha256", "bad").update(`${t}.${payload}`).digest("hex")}`, "good", at).ok, false);
        expect("signed Stripe delivery", verifyStripeSignature(payload, `t=${t},v1=${createHmac("sha256", "good").update(`${t}.${payload}`).digest("hex")}`, "good", at).ok, true);
        expect("test-mode payment marked", stripeEventToInput({ ...JSON.parse(payload), livemode: false }, "c1")?.testMode === true, true);
        return { name: "outreach-gate", pass: correct === total && falseAllowed === 0, metrics: { accuracy: correct / total, false_allowed: falseAllowed, cases: total }, failures };
      } finally {
        sprints.close();
        truth.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export const VALIDATION_SUITES: readonly Suite[] = [outreachGateSuite()];
