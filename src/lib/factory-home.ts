// Whether the main area shows the factory's Home (the companies to pick from) in place of a chat.
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function openFactoryHome(): void {
  open = true;
  emit();
}

export function closeFactoryHome(): void {
  if (!open) return;
  open = false;
  emit();
}

export function factoryHomeOpen(): boolean {
  return open;
}

export function useFactoryHomeOpen(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => open, () => open);
}
