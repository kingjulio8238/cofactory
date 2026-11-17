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
import { PRIMARY, QUIET, SECONDARY, StepFrame, TILE } from "./FunnelSteps";
import { CrewArt } from "./CrewArt";

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
    <StepFrame art={<CrewArt crew={[{ role: "scout", state: "thinking" }]} />} title="Where are you based?"
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
    <StepFrame art={<CrewArt crew={[{ role: "scout", state: "thinking" }, { role: "lead" }]} />} title="Anything in mind?"
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

/** The money: what goes in this month, how it is split between companies, and how long a company gets to make money. */
export function StakeStep({ budgetCents, capCents, allocation, closeAfterDays, onNext }: {
  budgetCents: number; capCents: number; allocation: "fixed" | "dynamic"; closeAfterDays: number; onNext: () => void;
}) {
  const [budget, setBudget] = useState(budgetCents || 50_000);
  const [split, setSplit] = useState(allocation);
  const [cap, setCap] = useState(capCents || 5_000);
  const [days, setDays] = useState(closeAfterDays || 5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = Math.max(MIN_STAKE_CENTS, Math.floor(budget / 10));
  const problem = budget < MIN_STAKE_CENTS ? `Put in at least ${dollars(MIN_STAKE_CENTS)}.`
    : split === "fixed" && cap < MIN_STAKE_CENTS ? `A company needs at least ${dollars(MIN_STAKE_CENTS)}.`
    : split === "fixed" && cap > budget ? "One company can't get more than the month's money." : null;
  const count = split === "fixed" ? Math.floor(budget / cap) : Math.floor(budget / start);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/cofactory/settings", { method: "POST", body: JSON.stringify({ budgetCents: budget, allocation: split, closeAfterDays: days, ...(split === "fixed" ? { companyCapCents: cap } : {}) }) });
      onNext();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't save that. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const choice = (value: "dynamic" | "fixed", title: string, why: string, tag?: string) => (
    <button type="button" role="radio" aria-checked={split === value} data-stake-split={value} onClick={() => setSplit(value)}
      className={cn(TILE, "flex min-w-0 flex-1 flex-col items-start gap-1.5 p-4 text-start", split === value && "bg-ink/[0.08] outline outline-2 outline-ink")}>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[15px] font-semibold leading-5 text-ink">{title}</span>
        {tag && <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[12px] leading-4 text-ink-secondary">{tag}</span>}
      </span>
      <span className="text-[13px] leading-[18px] text-ink-secondary">{why}</span>
    </button>
  );
  return (
    <StepFrame art={<CrewArt crew={[{ role: "ceo", state: "done" }, { role: "builder" }, { role: "marketer" }]} size={56} />} title="Fund your factory" wide
      sub="What it can spend this month on real things like domains, ads and payment fees. AI use runs on your own plan."
      footer={<>
        <ErrorLine text={error} />
        <button type="button" data-primary="" data-stake-next="" disabled={Boolean(problem) || busy} onClick={() => void save()} className={PRIMARY}>Continue</button>
      </>}>
      <div className="flex w-full flex-col gap-6">
        <AmountChoice label="This month" options={[10_000, 25_000, 50_000, 100_000]} value={budget} onChange={setBudget} />
        <div className="flex flex-col gap-2 text-start">
          <span className="text-[13px] font-medium leading-[18px] text-ink">How it's split</span>
          <div role="radiogroup" aria-label="How it's split" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {choice("dynamic", "Let the factory decide", "New companies start small. Your lead puts more into whatever is making money.", "Recommended")}
            {choice("fixed", "Same cap for each", "Every company gets at most the amount you pick.")}
          </div>
        </div>
        {split === "fixed" && <AmountChoice label="The most one company gets" options={[2_500, 5_000, 10_000]} value={cap} onChange={setCap} />}
        <div className="flex flex-col gap-2 text-start">
          <span id="stake-days" className="text-[13px] font-medium leading-[18px] text-ink">Close a company with no paying customer after</span>
          <div role="radiogroup" aria-labelledby="stake-days" className="flex gap-2">
            {[5, 7].map((value) => (
              <button key={value} type="button" role="radio" aria-checked={days === value} data-stake-days={value} onClick={() => setDays(value)}
                className={cn(TILE, "min-h-10 px-4 text-[14px]", days === value && "bg-ink text-app hover:bg-ink")}>{value} days</button>
            ))}
          </div>
        </div>
        <p data-stake-summary="" className="rounded-2xl bg-ink/[0.035] px-4 py-3 text-start text-[14px] leading-5 text-ink-secondary">
          {problem ?? (split === "dynamic"
            ? <>Each new company starts with up to <span className="font-medium text-ink">{dollars(start)}</span>, so about {count} can run at once. More goes only to companies with paying customers. No paying customer in {days} days and it's closed, with what it learned kept for the next one.</>
            : <>Up to <span className="font-medium text-ink">{count} {count === 1 ? "company" : "companies"}</span> at a time, {dollars(cap)} each. No paying customer in {days} days and it's closed, with what it learned kept for the next one.</>)}
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
    <StepFrame art={<CrewArt crew={[{ role: "lead", state: "needs" }]} />} title="What needs your OK"
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
  const crew = [{ name: "Factory Lead", color: "blue" as const, body: "drip" as const }, { name: "Factory Scout", color: "red" as const, body: "sprout" as const }];
  const done = state.kind === "open" && here >= 2;
  return (
    <StepFrame
      art={
        <div className="relative flex h-16 items-end gap-8">
          {crew.map((member, index) => (
            <motion.span key={member.name} initial={{ opacity: 0, y: 14 }} animate={index < here ? { opacity: 1, y: 0 } : { opacity: 0.12, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}>
              <MausAvatar color={member.color} bodyId={member.body} size={64} state={index < here ? "happy" : "idle"} animated={!reduced} label={member.name} />
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
