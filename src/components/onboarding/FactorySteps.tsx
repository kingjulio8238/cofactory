// Cofactory's own first-run screens, in the walkthrough's frame: only what the factory cannot work out for itself (where
// the owner is based, the stake, what needs their OK, an optional hunch), then the factory opening with its first crew.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "../../icons";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/plain-error";
import { api } from "@/state/store";
import { MausAvatar } from "../Avatar";
import { Toggle } from "../ui/Toggle";
import { PRIMARY, QUIET, SECONDARY, StepArt, StepFrame, TILE } from "./FunnelSteps";

const MIN_STAKE_CENTS = 2_500;
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const ROW = "flex min-h-14 items-center gap-3.5 rounded-2xl bg-ink/[0.035] py-2.5 pe-3 ps-4 text-start";
const FIELD = "min-h-10 w-full rounded-xl bg-ink/[0.05] px-3 text-[14px] leading-5 text-ink placeholder:text-ink-tertiary outline-none focus-visible:outline-2 focus-visible:outline-focus";

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p role="alert" className="text-[13px] leading-[18px] text-danger">{text}</p> : null;
}

function ChipList({ items, onRemove }: { items: string[]; onRemove: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.06] py-1 pe-1 ps-3 text-[13px] leading-[18px] text-ink">
          <span className="truncate">{item}</span>
          <button type="button" aria-label={`Remove ${item}`} onClick={() => onRemove(index)} className="grid size-5 place-items-center rounded-full text-ink-tertiary hover:bg-ink/[0.08] hover:text-ink">
            <X size={12} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChipField({ title, hint, items, onChange, max }: { title: string; hint: string; items: string[]; onChange: (items: string[]) => void; max?: number }) {
  const id = useId();
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...items, ...parts].slice(0, max ?? 60));
    setText("");
  };
  const full = max !== undefined && items.length >= max;
  return (
    <div className="flex flex-col gap-2 text-start">
      <label htmlFor={id} className="text-[13px] font-medium leading-[18px] text-ink">{title}</label>
      <ChipList items={items} onRemove={(index) => onChange(items.filter((_, at) => at !== index))} />
      {!full && (
        <input id={id} value={text} placeholder={hint} onChange={(event) => setText(event.target.value)} onBlur={add}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} className={FIELD} />
      )}
    </div>
  );
}

const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["AU", "Australia"], ["NZ", "New Zealand"],
  ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["BE", "Belgium"], ["ES", "Spain"], ["IT", "Italy"], ["IN", "India"],
];

/** Where the owner is based: their companies are theirs, so this sets which rules for outreach, payments and tax apply. */
export function WhereStep({ country, region, onNext }: { country: string | null; region: string | null; onNext: () => void }) {
  const [where, setWhere] = useState(country ?? "");
  const [state, setState] = useState(region ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/cofactory/settings", { method: "POST", body: JSON.stringify({ country: where, region: state.trim() || null }) });
      onNext();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't save that. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <StepFrame art={<StepArt art="map" />} title="Where are you based?"
      sub="Your companies are yours, so they follow your country's rules for contacting people, taking payments and tax."
      footer={<>
        <ErrorLine text={error} />
        <button type="button" data-primary="" data-where-next="" disabled={!where || busy} onClick={() => void save()} className={PRIMARY}>Continue</button>
      </>}>
      <div className="flex w-full max-w-[440px] flex-col gap-3 text-start">
        <select data-where-country="" aria-label="Country" value={where} onChange={(event) => setWhere(event.target.value)} className={FIELD}>
          <option value="">Choose a country</option>
          {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        {(where === "US" || where === "CA" || where === "AU") && (
          <input aria-label={where === "CA" ? "Province" : "State"} value={state} onChange={(event) => setState(event.target.value)}
            placeholder={where === "CA" ? "Province" : "State"} className={FIELD} />
        )}
      </div>
    </StepFrame>
  );
}

/** Optional: somewhere the owner wants the scout to look first, and kinds of business they will never run. */
export function HunchStep({ hunches, never, onNext }: { hunches: string[]; never: string[]; onNext: () => void }) {
  const [first, setFirst] = useState(hunches);
  const [no, setNo] = useState(never);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/cofactory/settings", { method: "POST", body: JSON.stringify({ hunches: first, never: no }) });
      onNext();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't save that. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <StepFrame art={<StepArt art="binoculars" />} title="Anything in mind?"
      sub="Your scout finds niches on its own. If you want it to look somewhere first, or never go somewhere, say so. Most people skip this."
      footer={<>
        <ErrorLine text={error} />
        <button type="button" data-primary="" data-hunch-next="" disabled={busy} onClick={() => void save()} className={PRIMARY}>Continue</button>
        {!first.length && !no.length && <button type="button" data-hunch-skip="" onClick={onNext} className={QUIET}>Skip</button>}
      </>}>
      <div className="flex w-full max-w-[440px] flex-col gap-5">
        <ChipField title="Look here first (up to 3)" hint="Billing for one-store pharmacies" max={3} items={first} onChange={setFirst} />
        <ChipField title="Never run" hint="Anything with medical advice" items={no} onChange={setNo} />
      </div>
    </StepFrame>
  );
}

function AmountChoice({ label, options, value, onChange }: { label: string; options: number[]; value: number; onChange: (cents: number) => void }) {
  const id = useId();
  const custom = !options.includes(value);
  return (
    <div className="flex flex-col gap-2 text-start">
      <span id={id} className="text-[13px] font-medium leading-[18px] text-ink">{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((cents) => (
          <button key={cents} type="button" role="radio" aria-checked={value === cents} onClick={() => onChange(cents)}
            className={cn(TILE, "min-h-10 px-4 text-[14px]", value === cents && "bg-ink text-app hover:bg-ink")}>{dollars(cents)}</button>
        ))}
        <input aria-label={`${label}, another amount`} inputMode="numeric" placeholder="Other"
          value={custom && value ? String(Math.round(value / 100)) : ""}
          onChange={(event) => { const whole = Number(event.target.value.replace(/[^0-9]/g, "")); onChange(whole * 100); }}
          className={cn(FIELD, "w-24", custom && value ? "outline-2 outline-ink" : "")} />
      </div>
    </div>
  );
}

/** What the factory may spend in a month, and the most one company gets. */
export function StakeStep({ budgetCents, capCents, onNext }: { budgetCents: number; capCents: number; onNext: () => void }) {
  const [budget, setBudget] = useState(budgetCents || 10_000);
  const [cap, setCap] = useState(capCents || 4_000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = cap > 0 ? Math.floor(budget / cap) : 0;
  const problem = cap < MIN_STAKE_CENTS ? `A company needs at least ${dollars(MIN_STAKE_CENTS)}.` : cap > budget ? "One company can't get more than the monthly budget." : null;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/cofactory/settings", { method: "POST", body: JSON.stringify({ budgetCents: budget, companyCapCents: cap }) });
      onNext();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't save your stake. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <StepFrame art={<StepArt art="coins" />} title="Your stake"
      sub="What your factory may spend each month on real things like domains and ads. AI use runs on your own plan."
      footer={<>
        <ErrorLine text={error} />
        <button type="button" data-primary="" data-stake-next="" disabled={Boolean(problem) || busy} onClick={() => void save()} className={PRIMARY}>Continue</button>
      </>}>
      <div className="flex w-full max-w-[440px] flex-col gap-5">
        <AmountChoice label="Each month" options={[5_000, 10_000, 25_000, 50_000]} value={budget} onChange={setBudget} />
        <AmountChoice label="The most one company gets" options={[2_500, 4_000, 10_000]} value={cap} onChange={setCap} />
        <p data-stake-summary="" className="rounded-2xl bg-ink/[0.035] px-4 py-3 text-start text-[14px] leading-5 text-ink-secondary">
          {problem ?? <>Up to <span className="font-medium text-ink">{count} {count === 1 ? "company" : "companies"}</span> at a time, {dollars(cap)} each. A company that hasn't earned more is closed before it spends it all.</>}
        </p>
      </div>
    </StepFrame>
  );
}

/** One approval: a switch, or a lock for the one that can never be turned off. */
function ApprovalRow({ title, why, checked, locked, onToggle, children }: { title: string; why: string; checked: boolean; locked?: boolean; onToggle?: () => void; children?: ReactNode }) {
  const id = useId();
  return (
    <li className={ROW}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={id} className="text-[14px] font-medium leading-5 text-ink">{title}</span>
        <span className="text-[13px] leading-[18px] text-ink-secondary">{why}</span>
        {children}
      </span>
      {locked
        ? <span className="shrink-0 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[12px] leading-4 text-ink-secondary">Always</span>
        : <Toggle checked={checked} aria-labelledby={id} onClick={onToggle} className="shrink-0" />}
    </li>
  );
}

export interface Approvals { launch: "ask" | "auto"; spendOverCents: number; kill: "ask" | "tell" }

/** What the factory may do on its own and what waits for the owner, and the owner's own addresses. */
export function ApprovalsStep({ approvals, emails, onNext }: { approvals: Approvals; emails: string[]; onNext: () => void }) {
  const [launch, setLaunch] = useState(approvals.launch === "ask");
  const [spend, setSpend] = useState(approvals.spendOverCents);
  const [kill, setKill] = useState(approvals.kill === "ask");
  const [own, setOwn] = useState(emails);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/cofactory/settings", { method: "POST", body: JSON.stringify({ approvals: { launch: launch ? "ask" : "auto", spendOverCents: spend, kill: kill ? "ask" : "tell" } }) });
      const addresses = own.map((item) => item.trim().toLowerCase()).filter(Boolean);
      await api("/api/cofactory/related-parties", { method: "POST", body: JSON.stringify({
        emails: addresses.filter((item) => item.includes("@")), domains: addresses.filter((item) => !item.includes("@")),
      }) });
      onNext();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't save these. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <StepFrame art={<StepArt art="shield" />} title="What needs your OK"
      sub="Your factory works on its own, except where you say so. You can change these any time."
      footer={<>
        <ErrorLine text={error} />
        <button type="button" data-primary="" data-approvals-next="" disabled={busy} onClick={() => void save()} className={PRIMARY}>Continue</button>
      </>}>
      <div className="flex w-full max-w-[440px] flex-col gap-5">
        <ul className="flex flex-col gap-1.5">
          <ApprovalRow title="Contact real people" why="Nothing reaches a customer until you've seen the page and the first emails." checked locked />
          <ApprovalRow title="Start a company" why="Your lead brings you the case and the cap first." checked={launch} onToggle={() => setLaunch(!launch)} />
          <ApprovalRow title={`Spend more than ${dollars(spend)}`} why="Smaller spends inside a company's cap go ahead." checked={spend > 0} onToggle={() => setSpend(spend > 0 ? 0 : 2_500)} />
          <ApprovalRow title="Close a company" why={kill ? "Your lead asks before closing one." : "Your lead closes it and tells you why, with what it learned."} checked={kill} onToggle={() => setKill(!kill)} />
        </ul>
        <ChipField title="Your own email addresses and domains" hint="Your email or domain" items={own} onChange={setOwn} />
        <p className="-mt-3 text-start text-[12px] leading-4 text-ink-tertiary">Payments from these never count as customers.</p>
      </div>
    </StepFrame>
  );
}

type Opening = { kind: "staffing" } | { kind: "open"; scoutId: string | null; leadId: string | null; territories: string[] } | { kind: "failed"; why: string };

/** The factory opens: it picks where to start looking, its lead and scout arrive, and the scout's first search begins. */
export function OpeningStep({ onDone }: { onDone: (botId: string | null) => void }) {
  const reduced = useReducedMotion() === true;
  const [state, setState] = useState<Opening>({ kind: "staffing" });
  const [here, setHere] = useState(0);
  const started = useRef(false);
  const open = async () => {
    setState({ kind: "staffing" });
    try {
      const opened = await api<{ staffed: Array<{ role: string; botId: string }>; territories: string[] }>("/api/cofactory/factory/open", { method: "POST", body: "{}" });
      const of = (role: string) => opened.staffed.find((seat) => seat.role === role)?.botId ?? null;
      setState({ kind: "open", scoutId: of("scout"), leadId: of("lead"), territories: opened.territories.map((text) => text.replace(/\s*\(NAICS \d{6}\)$/, "")) });
    } catch (cause) {
      setState({ kind: "failed", why: friendlyError(cause, "Your factory couldn't open.") });
    }
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (state.kind !== "open" || here >= 2) return;
    const timer = setTimeout(() => setHere((count) => count + 1), reduced ? 0 : 450);
    return () => clearTimeout(timer);
  }, [state.kind, here, reduced]);
  const crew = [{ name: "Factory Lead", color: "blue" as const }, { name: "Factory Scout", color: "red" as const }];
  const done = state.kind === "open" && here >= 2;
  return (
    <StepFrame
      art={
        <div className="relative flex h-16 items-end gap-8">
          {crew.map((member, index) => (
            <motion.span key={member.name} initial={{ opacity: 0, y: 14 }} animate={index < here ? { opacity: 1, y: 0 } : { opacity: 0.12, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}>
              <MausAvatar color={member.color} size={56} state={index < here ? "happy" : "idle"} animated={!reduced} trackPointer={false} label={member.name} />
            </motion.span>
          ))}
          <span aria-hidden="true" className="absolute inset-x-[-24px] bottom-[-6px] h-1 rounded-full bg-ink/[0.07]" />
        </div>
      }
      title={state.kind === "failed" ? "Your factory didn't open" : done ? "Your factory is open" : "Opening your factory"}
      sub={state.kind === "failed" ? state.why : done ? "Your scout picked where to start and is already looking. You'll see what it finds as it finds it." : `${Math.min(here, 2)} of 2 here`}
      footer={state.kind === "failed"
        ? <button type="button" data-primary="" onClick={() => void open()} className={PRIMARY}>Try again</button>
        : <button type="button" data-primary="" data-opening-done="" disabled={!done} onClick={() => onDone(state.kind === "open" ? state.scoutId ?? state.leadId : null)} className={done ? PRIMARY : SECONDARY}>Meet your scout</button>}>
      {done && state.kind === "open" && state.territories.length > 0 && (
        <ul data-opening-territories="" className="flex w-full max-w-[440px] flex-col gap-1.5">
          {state.territories.slice(0, 3).map((territory) => (
            <li key={territory} className={cn(ROW, "min-h-11 text-[14px] leading-5 text-ink")}>{territory}</li>
          ))}
          {state.territories.length > 3 && <li className="text-[13px] leading-[18px] text-ink-tertiary">{`Plus ${state.territories.length - 3} more`}</li>}
        </ul>
      )}
    </StepFrame>
  );
}
