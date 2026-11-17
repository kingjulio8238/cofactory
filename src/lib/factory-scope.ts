// Which part of the factory the window shows: the factory itself (its lead and scout, and the owner's own bots) or one
// company (its crew alone). The company rail sets it; the sidebar lists only the bots in scope.
import { useSyncExternalStore } from "react";
import { isCofactorySection } from "../../shared/cofactory/sections";

export type FactoryScope = { kind: "all" } | { kind: "factory"; companyBots: readonly string[] } | { kind: "company"; companyId: string; bots: readonly string[] };

let scope: FactoryScope = { kind: "all" };
const listeners = new Set<() => void>();
const KEY = "cofactory.scope";

export function setFactoryScope(next: FactoryScope): void {
  scope = next;
  try { localStorage.setItem(KEY, next.kind === "company" ? next.companyId : next.kind); } catch {}
  for (const listener of listeners) listener();
}

export function factoryScope(): FactoryScope {
  return scope;
}

/** The company (or "factory") the window showed last time, so a reload opens where it was. */
export function rememberedScope(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function useFactoryScope(): FactoryScope {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => scope, () => scope);
}

/** Whether a bot belongs in the current scope. */
export function inFactoryScope(current: FactoryScope, botId: string): boolean {
  if (current.kind === "all") return true;
  if (current.kind === "company") return current.bots.includes(botId);
  return !current.companyBots.includes(botId);
}

/** The sidebar's filter for the current scope: which bots it lists, and which of its sections. */
export interface ScopeFilter {
  (botId: string): boolean;
  section: (name: string, shown: ReadonlyArray<{ section?: string | null }>) => boolean;
}

/** Whether a sidebar section shows: a Cofactory section with none of its crew in scope is hidden, the owner's own stay. */
export function sectionInScope(current: FactoryScope, name: string, shown: ReadonlyArray<{ section?: string | null }>): boolean {
  return current.kind === "all" || !isCofactorySection(name) || shown.some((bot) => bot.section === name);
}

export function useScopeFilter(): ScopeFilter {
  const current = useFactoryScope();
  return Object.assign((botId: string) => inFactoryScope(current, botId), { section: (name: string, shown: ReadonlyArray<{ section?: string | null }>) => sectionInScope(current, name, shown) });
}
