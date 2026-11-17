// The company rail: the factory at the top, then one character per live company, each in its company's colour, with a
// dot when it needs the owner. Choosing one scopes the window to it: the sidebar lists only its crew and its CEO's chat opens.
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { cofactoryEnabled } from "@/lib/feature-flags";
import { inFactoryScope, rememberedScope, setFactoryScope, useFactoryScope } from "@/lib/factory-scope";
import { api, useStore } from "@/state/store";
import { BotAvatar } from "./Avatar";

/** GET /api/cofactory/rail, as the rail reads it. */
export interface RailView {
  onboarded: boolean;
  factory: { botIds: string[]; leadBotId: string | null; needs: number };
  companies: Array<{ id: string; name: string; stage: string; capCents: number; availableCents: number; live: boolean; needs: number; botIds: string[]; ceoBotId: string | null }>;
}

const REFRESH_MS = 10_000;
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export function useRail(enabled: boolean): RailView | null {
  const [view, setView] = useState<RailView | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = () => void api<RailView>("/api/cofactory/rail").then((next) => { if (alive) setView(next); }, () => {});
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [enabled]);
  return view;
}

function RailButton({ label, hint, active, needs, onClick, children }: { label: string; hint: string; active: boolean; needs: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <li className="relative flex w-full justify-center">
      {/* the active one's pill at the rail's edge, as a chat app marks the space it shows */}
      <span aria-hidden="true" className={cn("absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-ink transition-[height] duration-150", active ? "h-7" : "h-0")} />
      <button type="button" aria-label={`${label}${needs ? `, needs you (${needs})` : ""}`} aria-current={active ? "page" : undefined} title={`${label} · ${hint}`}
        data-company-rail-item="" onClick={onClick}
        className={cn("relative grid size-11 place-items-center rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          active ? "bg-ink/[0.07]" : "hover:bg-ink/[0.05]")}>
        {children}
        {needs > 0 && <span aria-hidden="true" data-rail-needs="" className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-danger ring-2 ring-app" />}
      </button>
    </li>
  );
}

export function CompanyRail() {
  const { state, dispatch } = useStore();
  const enabled = cofactoryEnabled();
  const rail = useRail(enabled);
  const scope = useFactoryScope();
  const companyBots = rail?.companies.flatMap((company) => company.botIds) ?? [];

  // the scope follows the rail's data: a company's crew can change, and a company that closed falls back to the factory
  useEffect(() => {
    if (!rail?.onboarded) return;
    const wanted = scope.kind === "company" ? scope.companyId : scope.kind === "factory" ? "factory" : rememberedScope() ?? "factory";
    const company = rail.companies.find((candidate) => candidate.id === wanted);
    if (company) setFactoryScope({ kind: "company", companyId: company.id, bots: company.botIds });
    else setFactoryScope({ kind: "factory", companyBots });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail]);

  if (!enabled || !rail?.onboarded) return null;
  const botOf = (id: string | null) => (id ? state.bots.find((bot) => bot.id === id) ?? null : null);
  const show = (target: "factory" | string) => {
    if (target === "factory") {
      setFactoryScope({ kind: "factory", companyBots });
      if (rail.factory.leadBotId) dispatch({ type: "select", id: rail.factory.leadBotId });
      return;
    }
    const company = rail.companies.find((candidate) => candidate.id === target);
    if (!company) return;
    setFactoryScope({ kind: "company", companyId: company.id, bots: company.botIds });
    const first = company.ceoBotId ?? company.botIds[0];
    if (first && !inFactoryScope({ kind: "company", companyId: company.id, bots: company.botIds }, state.selectedId ?? "")) dispatch({ type: "select", id: first });
  };
  const lead = botOf(rail.factory.leadBotId);

  return (
    <nav aria-label="Factory and companies" data-company-rail="" className="hidden w-14 shrink-0 flex-col items-center border-e border-hairline bg-app pt-10 md:flex">
      <ul className="flex w-full flex-col items-center gap-2 pb-3">
        <RailButton label="Factory" hint="Your lead, your scout and what they found" active={scope.kind === "factory"} needs={rail.factory.needs} onClick={() => show("factory")}>
          {lead ? <BotAvatar bot={lead} size={34} label="" /> : <span className="text-[18px]">⌂</span>}
        </RailButton>
        {rail.companies.length > 0 && <li role="separator" aria-hidden="true" className="my-1 h-px w-6 bg-hairline" />}
        {rail.companies.map((company) => {
          const ceo = botOf(company.ceoBotId);
          const hint = `${company.stage[0]!.toUpperCase()}${company.stage.slice(1)} · ${dollars(company.availableCents)} of ${dollars(company.capCents)} · ${company.live ? "live" : "not live yet"}`;
          return (
            <RailButton key={company.id} label={company.name} hint={hint} active={scope.kind === "company" && scope.companyId === company.id} needs={company.needs} onClick={() => show(company.id)}>
              {ceo ? <BotAvatar bot={ceo} size={34} label="" /> : <span className="text-[15px] font-semibold text-ink">{company.name.slice(0, 1)}</span>}
            </RailButton>
          );
        })}
      </ul>
    </nav>
  );
}
