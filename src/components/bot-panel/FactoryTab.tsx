// The Factory tab: a Cofactory seat's work in the panel's own rows. What the bot is doing now, then for the factory's lead
// and scout the industries it searches, its latest finds and the first week, and for a company's seats the company's money,
// days and sprint. What waits for the owner comes first.
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { openExternalLink } from "@/lib/app-links";
import { friendlyError } from "@/lib/plain-error";
import { api } from "@/state/store";
import { Card, ItemRow, NoteRow, PanelEmpty, PanelSections } from "./rows";

type Checklist = "search" | "shortlist" | "launch" | "live" | "dollar";
type State = "done" | "running" | "todo";

/** GET /api/cofactory/seat/:botId, as the tab reads it. */
export interface SeatView {
  seat: { role: string; companyId: string | null } | null;
  work?: {
    live: { objective: string; startedAt: number; rounds: number } | null;
    last: { status: string; endedAt: number | null; summary: string | null } | null;
  };
  needsYou?: {
    approvals?: Array<{ id: string; kind: "launch" | "spend" | "close"; title: string; detail: string; at: number }>;
    inbox: Array<{ id: string; at: number; goal: string }>;
    alarms: Array<{ kind: string; detail: string }>;
  };
  factory?: {
    territories: Array<{ title: string; code: string | null; niches: number }>;
    finds: Array<{ quote: string; site: string; url: string; at: number }>;
    signals: number;
    batch: { niches: number; target: number; closed: boolean } | null;
    checklist: Array<{ id: Checklist; state: State }>;
  };
  company?: {
    name: string; stage: string; status: string; capCents: number; availableCents: number; earnedCents: number; daysLeft: number | null; armed: boolean; live?: boolean;
    sprint: { buyers: number; contacts: number; urgent: number; committed: number } | null;
    firstDollar: { paid: boolean; delivered: boolean; rehearsed: boolean; reached: boolean };
  };
}

const REFRESH_MS = 10_000;

/** The bot's Cofactory seat, read again every few seconds while shown; `undefined` until the first answer. `refresh` reads it now. */
export function useSeat(botId: string, enabled = true): SeatView | null | undefined {
  return useSeatState(botId, enabled).view;
}

export function useSeatState(botId: string, enabled = true): { view: SeatView | null | undefined; refresh: () => void } {
  const [view, setView] = useState<SeatView | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) { setView(null); return; }
    let alive = true;
    // a bot with no seat is asked once: only seats change while the panel is open
    const read = () => void api<SeatView>(`/api/cofactory/seat/${encodeURIComponent(botId)}`).then((next) => {
      if (!alive) return;
      setView(next.seat ? next : null);
      if (!next.seat) clearInterval(timer);
    }, () => { if (alive) setView((known) => known ?? null); });
    const timer = setInterval(read, REFRESH_MS);
    read();
    return () => { alive = false; clearInterval(timer); };
  }, [botId, enabled, tick]);
  return { view, refresh: () => setTick((count) => count + 1) };
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
function ago(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

const CHECKLIST: Record<Checklist, { title: string; hint: string }> = {
  search: { title: "Search your industries", hint: "Your scout looks for people already paying to get a job done" },
  shortlist: { title: "Cards to pick from", hint: "Every claim checked against its source" },
  launch: { title: "Start a company", hint: "You start it from its card" },
  live: { title: "Go live", hint: "Its page and first emails, after your OK" },
  dollar: { title: "First paying customer", hint: "Or the company is closed and what it learned is kept" },
};

function Mark({ state }: { state: State }) {
  return (
    <span aria-label={state === "done" ? "Done" : state === "running" ? "In progress" : "Not yet"} role="img"
      className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[11px]",
        state === "done" ? "bg-success/15 text-success" : state === "running" ? "bg-ink/10 text-ink" : "bg-ink/[0.05] text-ink-tertiary")}>
      {state === "done" ? "✓" : state === "running" ? "•" : ""}
    </span>
  );
}

/** One step held for the owner, with the two answers. */
function ApprovalRow({ approval, onDecided }: { approval: NonNullable<NonNullable<SeatView["needsYou"]>["approvals"]>[number]; onDecided: () => void }) {
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = async (decision: "approve" | "decline") => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/api/cofactory/approvals/${encodeURIComponent(approval.id)}`, { method: "POST", body: JSON.stringify({ decision }) });
      onDecided();
    } catch (cause) {
      setError(friendlyError(cause, "That didn't go through. Try again."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div data-approval={approval.kind} className="flex flex-col gap-2 px-3 py-2.5">
      <span className="text-[14px] font-medium leading-5 text-ink">{approval.title}</span>
      <span className="text-[13px] leading-[18px] text-ink-secondary">{approval.detail}</span>
      {error && <span role="alert" className="text-[12px] leading-4 text-danger">{error}</span>}
      <span className="flex gap-2">
        <button type="button" data-approval-approve="" disabled={busy !== null} onClick={() => void answer("approve")}
          className="ui-button ui-button-pill ui-button-primary min-h-8 px-4 text-[13px]">{busy === "approve" ? "Approving…" : "Approve"}</button>
        <button type="button" data-approval-decline="" disabled={busy !== null} onClick={() => void answer("decline")}
          className="ui-button ui-button-pill min-h-8 bg-ink/[0.06] px-4 text-[13px] hover:bg-ink/[0.1]">{busy === "decline" ? "Declining…" : "Decline"}</button>
      </span>
    </div>
  );
}

export function FactoryTab({ view, onChanged }: { view: SeatView; onChanged?: () => void }) {
  const { work, needsYou, factory, company } = view;
  const waiting = (needsYou?.approvals?.length ?? 0) + (needsYou?.inbox.length ?? 0) + (needsYou?.alarms.length ?? 0);
  return (
    <PanelSections data-panel-tabpanel="factory">
      {waiting > 0 && (
        <Card label="Needs you">
          {needsYou!.approvals?.map((approval) => <ApprovalRow key={approval.id} approval={approval} onDecided={() => onChanged?.()} />)}
          {needsYou!.inbox.map((message) => <ItemRow key={message.id} title={message.goal} hint={ago(message.at)} />)}
          {needsYou!.alarms.map((alarm) => <NoteRow key={alarm.kind} tone="warn">{alarm.detail.charAt(0).toUpperCase() + alarm.detail.slice(1)}</NoteRow>)}
        </Card>
      )}

      <Card label="Now">
        {work?.live
          ? <ItemRow title={work.live.objective} hint={`Working · started ${ago(work.live.startedAt).toLowerCase()}`} />
          : work?.last
            ? <ItemRow title={work.last.summary ?? "Finished its last session"} hint={work.last.endedAt ? `Resting · ${ago(work.last.endedAt).toLowerCase()}` : "Resting"} />
            : <PanelEmpty>Waiting for its first session.</PanelEmpty>}
      </Card>

      {factory && <>
        <Card label="This week">
          {factory.checklist.map((step) => (
            <div key={step.id} data-factory-step={step.id} data-factory-step-state={step.state} className="flex items-center gap-3 px-3 py-2.5">
              <Mark state={step.state} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14px] leading-5", step.state === "todo" ? "text-ink-secondary" : "text-ink")}>{CHECKLIST[step.id].title}</span>
                <span className="block truncate text-[12px] leading-4 text-ink-tertiary">{CHECKLIST[step.id].hint}</span>
              </span>
            </div>
          ))}
        </Card>
        <Card label={factory.batch && !factory.batch.closed ? `Searching · ${factory.batch.niches} of ${factory.batch.target} niches` : "Searching"}>
          {factory.territories.length
            ? factory.territories.map((territory) => (
              <ItemRow key={territory.title} title={territory.title} value={territory.niches ? `${territory.niches} ${territory.niches === 1 ? "niche" : "niches"}` : undefined} />
            ))
            : <PanelEmpty>No industries picked yet.</PanelEmpty>}
        </Card>
        <Card label={factory.signals ? `Latest finds · ${factory.signals} so far` : "Latest finds"}>
          {factory.finds.length
            ? factory.finds.map((find) => (
              <button key={`${find.url}-${find.at}`} type="button" data-factory-find="" onClick={() => void openExternalLink(find.url).catch(() => {})}
                className="flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-start hover:bg-ink/[0.04]">
                <span className="line-clamp-3 text-[14px] leading-5 text-ink">“{find.quote}”</span>
                <span className="text-[12px] leading-4 text-ink-tertiary">{find.site} · {ago(find.at).toLowerCase()}</span>
              </button>
            ))
            : <PanelEmpty>Real people describing a job they pay for will show up here, quoted with their source.</PanelEmpty>}
        </Card>
      </>}

      {company && <>
        <Card label={company.name}>
          <ItemRow title="Stage" value={company.stage[0]!.toUpperCase() + company.stage.slice(1)} />
          <ItemRow title="Money left" value={`${dollars(company.availableCents)} of ${dollars(company.capCents)}`} />
          <ItemRow title="Earned" value={dollars(company.earnedCents)} />
          {company.daysLeft !== null && (company.live
            ? <ItemRow title="Days to a paying customer" value={String(company.daysLeft)} hint="Counted from going live; closed after that, with what it learned kept" />
            : <ItemRow title="Days left to go live" value={String(company.daysLeft)} hint="Its five days to a paying customer start when you arm outreach" />)}
        </Card>
        <Card label="Validation">
          {company.sprint
            ? <>
              <ItemRow title="Buyers on the list" value={String(company.sprint.buyers)} />
              <ItemRow title="Contacted" value={company.armed ? String(company.sprint.contacts) : "Waiting for your OK"} />
              <ItemRow title="Ready-to-buy replies" value={String(company.sprint.urgent)} />
              <ItemRow title="Payments" value={String(company.sprint.committed)} />
            </>
            : <PanelEmpty>Its validation sprint hasn't started.</PanelEmpty>}
        </Card>
        <Card label="First dollar">
          {(["paid", "delivered", "rehearsed"] as const).map((leg) => (
            <div key={leg} className="flex items-center gap-3 px-3 py-2.5">
              <Mark state={company.firstDollar[leg] ? "done" : "todo"} />
              <span className="text-[14px] leading-5 text-ink">{leg === "paid" ? "A customer paid" : leg === "delivered" ? "The work was delivered" : "A stand-in did it again from the runbook"}</span>
            </div>
          ))}
        </Card>
      </>}
    </PanelSections>
  );
}
