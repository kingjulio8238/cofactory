// Which part of the factory the window shows: the factory itself (its lead and scout, and the owner's own bots) or one
// company (its crew alone). The company rail sets it; the sidebar lists only the bots in scope.
import { useSyncExternalStore } from "react";

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

/** The sidebar's filter for the current scope. */
export function useScopeFilter(): (botId: string) => boolean {
  const current = useFactoryScope();
  return (botId) => inFactoryScope(current, botId);
}
