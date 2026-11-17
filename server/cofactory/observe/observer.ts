import type { DecisionKind, EvidenceLink } from "../../../shared/cofactory/observe.ts";
import type { Book } from "../book.ts";
import { costSnapshot } from "./cost.ts";
import type { ObserveStore } from "./store.ts";

export interface DecisionInput {
  companyId: string | null;
  session: { id: string; startedAt: number; role: string } | null;
  actor: string;
  kind: DecisionKind;
  verdict: "allowed" | "refused";
  reason: string;
  evidence: EvidenceLink[];
}

/** Records decisions with the cost they were made at, so every gate can be traced to its evidence and its price. */
export function createObserver(deps: { store: ObserveStore; book: Book }) {
  return {
    store: deps.store,

    decide(input: DecisionInput) {
      return deps.store.decide({
        companyId: input.companyId, sessionId: input.session?.id ?? null, actor: input.actor, kind: input.kind,
        verdict: input.verdict, reason: input.reason, evidence: input.evidence,
        cost: costSnapshot(deps.book, input.companyId, input.session),
      });
    },

    toolCall: deps.store.toolCall,
    touch: deps.store.touch,
  };
}

export type Observer = ReturnType<typeof createObserver>;
