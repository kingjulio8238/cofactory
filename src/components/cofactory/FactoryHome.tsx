// The factory's Home: the companies the scout found, as cards the owner starts or passes on, filling in while it searches.
import { useEffect, useRef, useState } from "react";
import { openExternalLink } from "@/lib/app-links";
import { cn } from "@/lib/cn";
import { closeFactoryHome } from "@/lib/factory-home";
import { setFactoryScope } from "@/lib/factory-scope";
import { friendlyError } from "@/lib/plain-error";
import { api, useStore } from "@/state/store";
import { MausAvatar } from "../Avatar";
import { WindowDragStrip } from "../DesktopCapabilities";
import { useRail } from "../CompanyRail";

type Per = "month" | "year" | "job" | "hour";

/** GET /api/cofactory/cards, as Home reads it. */
export interface PickView {
  search: { state: "searching" | "writing" | "idle"; niches: number; target: number; signals: number; sites: number };
  finds: Array<{ quote: string; site: string; url: string; at: number }>;
  writing: Array<{ nicheId: string; buyer: string; job: string }>;
  cards: Array<{
    card: {
      id: string; status: "ready" | "started" | "launched" | "unconfirmed"; companyId: string | null; note: string | null;
      body: {
        name: string; headline: string;
        priceToday: { url: string; quote: string; amountCents: number; per: Per };
        offer: { priceCents: number; per: Per };
        rival: { name: string; url: string; whatTheyMiss: string; priceCents: number | null };
        exampleBuyer: { name: string; url: string };
      };
    };
    niche: { buyer: string; job: string; channel: string };
    quotes: Array<{ url: string; site: string; quote: string }>;
  }>;
  startCents: number;
  startProblem: string | null;
}

const REFRESH_MS = 3_000;
const PER: Record<Per, string> = { month: "/mo", year: "/yr", job: " a job", hour: "/h" };
const money = (cents: number, per?: Per) => `$${Math.round(cents / 100).toLocaleString("en-US")}${per ? PER[per] : ""}`;
const BUTTON = "ui-button ui-button-pill min-h-8 px-4 text-[13px]";
const QUIET = cn(BUTTON, "bg-ink/[0.06] hover:bg-ink/[0.1]");

function usePick(): { view: PickView | null; refresh: () => void } {
  const [view, setView] = useState<PickView | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = () => void api<PickView>("/api/cofactory/cards").then((next) => { if (alive) setView(next); }, () => {});
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [tick]);
  return { view, refresh: () => setTick((count) => count + 1) };
}

function SearchLine({ view }: { view: PickView }) {
  const { search } = view;
  const text = search.state === "searching"
    ? `Your scout is searching: ${search.niches} of ${search.target} ideas so far, from ${search.signals} quotes on ${search.sites} sites.`
    : search.state === "writing" ? "Your scout is checking the best ideas against their sources." : null;
  if (!text) return null;
  return (
    <p data-pick-search="" className="flex items-center gap-2 text-[13px] leading-[18px] text-ink/[0.64]">
      <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none" />{text}
    </p>
  );
}

function Link({ url, children }: { url: string; children: React.ReactNode }) {
  return <button type="button" onClick={() => void openExternalLink(url).catch(() => {})} className="text-start underline decoration-ink/20 underline-offset-2 hover:decoration-ink/60">{children}</button>;
}

function PickCard({ entry, startCents, startProblem, onChanged }: { entry: PickView["cards"][number]; startCents: number; startProblem: string | null; onChanged: () => void }) {
  const { dispatch } = useStore();
  const rail = useRail(entry.card.status === "launched");
  const { card, quotes } = entry;
  const { body } = card;
  const [busy, setBusy] = useState<"start" | "pass" | "dismiss" | null>(null);
  const [passing, setPassing] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: "start" | "pass" | "dismiss") => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/api/cofactory/cards/${card.id}`, { method: "POST", body: JSON.stringify({ decision, ...(decision === "pass" && reason.trim() ? { reason: reason.trim() } : {}) }) });
      onChanged();
    } catch (cause) {
      setError(friendlyError(cause, "That didn't go through. Try again."));
    } finally {
      setBusy(null);
    }
  };
  const company = card.companyId ? rail?.companies.find((candidate) => candidate.id === card.companyId) ?? null : null;
  const openCompany = (shown: NonNullable<typeof company>) => {
    setFactoryScope({ kind: "company", companyId: shown.id, bots: shown.botIds });
    if (shown.ceoBotId) dispatch({ type: "select", id: shown.ceoBotId });
    closeFactoryHome();
  };
  return (
    <li data-pick-card={card.status} className="flex flex-col gap-3 rounded-2xl bg-ink/[0.035] p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-medium leading-6 text-ink">{body.name}</h2>
        <p className="text-[14px] leading-5 text-ink/[0.8]">{body.headline}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] leading-[18px]">
        <dt className="text-ink/[0.56]">Buyers pay</dt><dd className="text-ink">{money(body.priceToday.amountCents, body.priceToday.per)} today · <Link url={body.priceToday.url}>See the source</Link></dd>
        <dt className="text-ink/[0.56]">We charge</dt><dd className="text-ink">{money(body.offer.priceCents, body.offer.per)}</dd>
        <dt className="text-ink/[0.56]">Rival</dt><dd className="text-ink">{body.rival.name}{body.rival.priceCents ? ` (from ${money(body.rival.priceCents)})` : ""}: {body.rival.whatTheyMiss}</dd>
      </dl>
      {quotes[0] && <blockquote className="border-s-2 border-ink/[0.12] ps-3 text-[13px] italic leading-[18px] text-ink/[0.72]">“{quotes[0].quote}” <span className="not-italic text-ink/[0.48]">· {quotes[0].site}</span></blockquote>}
      {evidence && (
        <ul data-pick-evidence="" className="flex flex-col gap-1.5 text-[13px] leading-[18px] text-ink/[0.72]">
          {quotes.slice(1).map((quote) => <li key={quote.url}>“{quote.quote}” · <Link url={quote.url}>{quote.site}</Link></li>)}
          <li>A buyer who fits: <Link url={body.exampleBuyer.url}>{body.exampleBuyer.name}</Link></li>
          <li>The rival: <Link url={body.rival.url}>{body.rival.name}</Link></li>
          <li>Who it's for: {entry.niche.buyer}, reached through {entry.niche.channel}</li>
        </ul>
      )}
      {card.status === "ready" && !passing && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-pick-start="" disabled={busy !== null || startProblem !== null} onClick={() => void decide("start")}
            className={cn(BUTTON, "ui-button-primary")}>{busy === "start" ? "Starting…" : `Start with ${money(startCents)}`}</button>
          <button type="button" data-pick-pass="" disabled={busy !== null} onClick={() => setPassing(true)} className={QUIET}>Pass</button>
          <button type="button" aria-expanded={evidence} onClick={() => setEvidence((shown) => !shown)} className="px-2 text-[13px] text-ink/[0.64] hover:text-ink">{evidence ? "Hide the evidence" : "See the evidence"}</button>
        </div>
      )}
      {card.status === "ready" && passing && (
        <div className="flex flex-wrap items-center gap-2">
          <input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Why not? Your scout learns from it (optional)"
            aria-label="Why you're passing" className="min-h-8 min-w-0 flex-1 rounded-full bg-ink/[0.06] px-3 text-[13px] text-ink placeholder:text-ink/[0.48] focus-visible:outline-2 focus-visible:outline-focus" />
          <button type="button" data-pick-pass-confirm="" disabled={busy !== null} onClick={() => void decide("pass")} className={QUIET}>{busy === "pass" ? "Passing…" : "Pass"}</button>
          <button type="button" onClick={() => setPassing(false)} className="px-2 text-[13px] text-ink/[0.64] hover:text-ink">Cancel</button>
        </div>
      )}
      {card.status === "started" && (
        <p data-pick-status="" className="text-[13px] leading-[18px] text-ink/[0.72]">
          Confirming the details. It opens by itself once the full research holds up.{card.note ? ` Waiting on: ${card.note}.` : ""}
        </p>
      )}
      {card.status === "launched" && (
        <div className="flex items-center gap-3">
          <p className="text-[13px] leading-[18px] text-ink">{body.name} is open.</p>
          {company && <button type="button" onClick={() => openCompany(company)} className={cn(BUTTON, "ui-button-primary")}>Open {body.name}</button>}
        </div>
      )}
      {card.status === "unconfirmed" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] leading-[18px] text-ink/[0.8]">Couldn't confirm it: {card.note ?? "the full research didn't hold up"}. No money moved.</p>
          <button type="button" disabled={busy !== null} onClick={() => void decide("dismiss")} className={QUIET}>Dismiss</button>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] leading-[18px] text-danger">{error}</p>}
      {card.status === "ready" && startProblem && <p className="text-[12px] leading-4 text-ink/[0.56]">You can't start one yet: {startProblem}.</p>}
    </li>
  );
}

export function FactoryHome() {
  const { state } = useStore();
  const { view, refresh } = usePick();
  // the page gives way to a chat the moment the owner picks a bot
  const shownFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (shownFor.current === undefined) { shownFor.current = state.selectedId; return; }
    if (state.selectedId !== shownFor.current) closeFactoryHome();
  }, [state.selectedId]);
  const launched = view?.cards.some((entry) => entry.card.status === "launched") ?? false;
  return (
    <main data-factory-home="" className="relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-app">
      <WindowDragStrip />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pb-16 pt-14">
        <header className="flex flex-col gap-2">
          <MausAvatar color="red" bodyId="sprout" size={40} state={view?.search.state === "idle" ? "idle" : "loading"} label="Your scout" />
          <h1 className="text-[22px] font-medium leading-7 text-ink">{launched ? "Pick your next company" : "Pick your first companies"}</h1>
          <p className="text-[14px] leading-5 text-ink/[0.64]">Each card is a company your scout found and checked against its sources. Start the ones you like; pass on the rest and say why.</p>
          {view && <SearchLine view={view} />}
        </header>
        {!view ? (
          <p className="text-[13px] text-ink/[0.56]">Loading…</p>
        ) : (
          <>
            {view.cards.length > 0 && (
              <ul className="flex flex-col gap-3">
                {view.cards.map((entry) => <PickCard key={entry.card.id} entry={entry} startCents={view.startCents} startProblem={view.startProblem} onChanged={refresh} />)}
              </ul>
            )}
            {view.writing.length > 0 && (
              <ul className="flex flex-col gap-2">
                {view.writing.map((item) => (
                  <li key={item.nicheId} data-pick-writing="" className="rounded-2xl border border-dashed border-ink/[0.12] px-4 py-3 text-[13px] leading-[18px] text-ink/[0.64]">
                    Checking the evidence: {item.job}, for {item.buyer}
                  </li>
                ))}
              </ul>
            )}
            {view.cards.length === 0 && view.finds.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-medium text-ink/[0.56]">Latest finds</h2>
                <ul className="flex flex-col gap-1.5">
                  {view.finds.map((find) => (
                    <li key={`${find.url}-${find.at}`} className="text-[13px] leading-[18px] text-ink/[0.72]">“{find.quote}” · <Link url={find.url}>{find.site}</Link></li>
                  ))}
                </ul>
              </section>
            )}
            {view.cards.length === 0 && view.writing.length === 0 && view.search.state === "idle" && (
              <p className="text-[13px] leading-[18px] text-ink/[0.56]">Nothing to pick right now. Your scout starts its next search when there's money for another company.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
