import { useSyncExternalStore } from "react";
import { ONBOARDING_CLOUD_HINT, WELCOME_VERSION } from "../../electron/onboarding-record.mjs";
import { freeFallback, rankAis, type AiTestState, type RankableAi } from "../../shared/ai-ranking";
import { CLOUD_FIRST_RUN_DONE, CLOUD_FROM_COMPUTER, CLOUD_WELCOME_DONE, COMPUTER_AI_HINT } from "../../shared/cloud-hints";

export interface OnboardingStatus {
  completedAt: string;
  version: number;
  reelSeen: boolean;
  hintsSeen: string[];
  firstTurnAt?: string;
}

export { ONBOARDING_CLOUD_HINT, WELCOME_VERSION };

export const EMPTY_ONBOARDING: OnboardingStatus = {
  completedAt: "",
  version: 0,
  reelSeen: false,
  hintsSeen: [],
};

export interface WelcomeViewer {
  canSave: boolean;
  cloudHome?: boolean;
}

export const LOCAL_VIEWER: WelcomeViewer = { canSave: true };

export function spotlightsQuiet(viewer: WelcomeViewer | null): boolean {
  return viewer === null;
}

export function welcomeViewer(session: unknown): WelcomeViewer {
  const record = session && typeof session === "object" ? (session as { scopes?: unknown; cloudHome?: unknown }) : {};
  return {
    canSave: Array.isArray(record.scopes) ? record.scopes.includes("admin") : true,
    ...(record.cloudHome === true ? { cloudHome: true } : {}),
  };
}

export function welcomeDue(
  config: { onboarding?: OnboardingStatus } | null | undefined,
  options: { remoteClient: boolean; legacyDone: boolean; canSave?: boolean; cloudHome?: boolean; fromApp?: boolean },
): boolean {
  if (options.remoteClient) return false;
  if (options.canSave === false) return false;
  if (!config) return false;
  if (options.cloudHome) return cloudFirstRunDue(config.onboarding, options.fromApp === true);
  const record = config.onboarding ?? EMPTY_ONBOARDING;
  if (record.completedAt && record.version >= WELCOME_VERSION) return false;
  if (!record.completedAt && options.legacyDone) return false;
  return true;
}

/** A cloud runs the first run only when the desktop app that set it up opened it (`fromApp`, before that app's record
 * arrives, or CLOUD_FROM_COMPUTER once it has), and only until it ends there. A cloud already in use, or one opened in a
 * browser, keeps its own welcome. */
export function cloudFirstRunDue(record: OnboardingStatus | undefined, fromApp: boolean): boolean {
  if (hintSeen(record, CLOUD_FIRST_RUN_DONE)) return false;
  if (hintSeen(record, CLOUD_FROM_COMPUTER)) return true;
  return fromApp && !hintSeen(record, CLOUD_WELCOME_DONE) && !hintSeen(record, "cloud-setup-hidden") && !record?.firstTurnAt;
}

/** The AIs signed in on the computer that set this cloud up, by instance id. */
export function computerAiIds(record: OnboardingStatus | undefined): string[] {
  return (record?.hintsSeen ?? []).filter((hint) => hint.startsWith(COMPUTER_AI_HINT)).map((hint) => hint.slice(COMPUTER_AI_HINT.length));
}

export function completionPatch(now: Date = new Date()): { onboarding: { completedAt: string; version: number } } {
  return { onboarding: { completedAt: now.toISOString(), version: WELCOME_VERSION } };
}

/** Kept by an install whose first run ended by meeting its Chief of Staff: its first conversation stays quiet (no
 * corner notices until a reply, no spotlights). */
export const MET_CHIEF_HINT = "met-chief-v1";

/** The first run's record: done, and marked as the one that met the Chief (MET_CHIEF_HINT). */
export function firstRunPatch(
  record: OnboardingStatus | undefined,
  now: Date = new Date(),
  { cloudHome = false }: { cloudHome?: boolean } = {},
): { onboarding: { completedAt: string; version: number; hintsSeen?: string[] } } {
  const have = record?.hintsSeen ?? [];
  const add = [MET_CHIEF_HINT, ...(cloudHome ? [CLOUD_FIRST_RUN_DONE] : [])].filter((hint) => !have.includes(hint));
  return { onboarding: { ...completionPatch(now).onboarding, ...(add.length ? { hintsSeen: [...have, ...add] } : {}) } };
}

export function hintSeen(record: OnboardingStatus | undefined, id: string): boolean {
  return (record?.hintsSeen ?? []).includes(id);
}

export function hintSeenPatch(
  record: OnboardingStatus | undefined,
  id: string,
): { onboarding: { hintsSeen: string[] } } | null {
  if (hintSeen(record, id)) return null;
  return { onboarding: { hintsSeen: [...(record?.hintsSeen ?? []), id] } };
}


/** Every screen the first run can show, in the order it shows them; the chat comes after the last. */
// where the bots live comes first on the desktop app; the account follows it only where this Mac is the place (dusk cloud
// signs in and pays in the browser, "checkout"); the Mac's permissions come last, right before the app
export const BEAT_ORDER = ["welcome", "account", "place", "checkout", "ai", "bring", "know", "profile", "stake", "approvals", "phone", "making", "permissions", "notify", "opening"] as const;
export type BeatId = (typeof BEAT_ORDER)[number];

/** Where a reloaded first run opens: the saved screen while it is offered, else the first. */
export function resumeBeat(beats: readonly BeatId[], saved: BeatId | undefined): BeatId {
  return saved && beats.includes(saved) ? saved : beats[0] ?? "welcome";
}

export function onboardingCloudOffered(record: OnboardingStatus | undefined): boolean {
  return hintSeen(record, ONBOARDING_CLOUD_HINT);
}

let welcomeShown = 0;
const welcomeListeners = new Set<() => void>();
const welcomeChanged = () => welcomeListeners.forEach((listener) => listener());
/** The welcome flow is on screen (WelcomeFlow, until it closes): a Cloud sheet over it never switches the window away. */
export function showWelcome(): () => void {
  welcomeShown++;
  welcomeChanged();
  let gone = false;
  return () => { if (!gone) { gone = true; welcomeShown--; welcomeChanged(); } };
}
export function welcomeOnScreen(): boolean {
  return welcomeShown > 0;
}
export function useWelcomeOnScreen(): boolean {
  return useSyncExternalStore((listener) => { welcomeListeners.add(listener); return () => welcomeListeners.delete(listener); }, welcomeOnScreen, () => false);
}

const WELCOME_FINISHED_KEY = "dusk.onboarding.welcomeFinished";
/** The first-run welcome ended in this app session (never a replay): the full-screen Cloud Pro popup waits for a later
 * launch rather than following it. Kept for the window's session, so a reload counts as the same launch. */
// Where browser storage is blocked, this page's memory stands in for it.
let welcomeFinishedRemembered = false;
export function markWelcomeFinished(): void {
  try {
    sessionStorage.setItem(WELCOME_FINISHED_KEY, "1");
  } catch {
    welcomeFinishedRemembered = true;
  }
}
export function welcomeFinishedThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(WELCOME_FINISHED_KEY) === "1";
  } catch {
    return welcomeFinishedRemembered;
  }
}

export const DEFAULT_ADMIN_ORIGIN = "https://dusk.bot";

export function organisationSignIn<Bridge>(
  duskDesktop: { organization?: Bridge; remoteClient?: { active?: boolean } } | undefined,
): Bridge | undefined {
  if (!duskDesktop || duskDesktop.remoteClient?.active === true) return undefined;
  return duskDesktop.organization;
}

export function companyModelCount(state: { providers?: Array<{ configured: boolean; models: string[] }> } | null): number {
  return (state?.providers ?? []).reduce((total, provider) => total + (provider.configured ? provider.models.length : 0), 0);
}

interface AiChoice {
  driverKind: string;
  access?: string;
  readOnly?: boolean;
  snapshot?: { freeFallback?: boolean };
}

/** The one way the welcome recommends to connect an AI, in the new-bot default's own order (shared/ai-ranking.ts: a Claude
 * account first, then a ChatGPT plan), and every other way. */
export function aiChoices<Instance extends AiChoice>(instances: readonly Instance[]): { recommended?: Instance; others: Instance[] } {
  const plan = (instance: Instance) => !instance.readOnly && instance.access !== "api" && instance.access !== "custom";
  const recommended = rankAis(instances.filter(plan))[0] ?? instances.find((instance) => !instance.readOnly);
  return { recommended, others: instances.filter((instance) => instance !== recommended) };
}

/** The AI the welcome's Connect an AI step stands on: the best ready AI (the same ranking) that isn't OpenCode's free
 * backup, passing over one whose test message got no answer. An AI not tested yet is `testing`; none ready is null. */
export function welcomeAi<Instance extends RankableAi>(
  instances: readonly Instance[],
  ready: (instance: Instance) => boolean,
  test: (instance: Instance) => AiTestState | undefined,
): { instance: Instance; state: AiTestState } | null {
  let silent: Instance | undefined;
  for (const instance of rankAis(instances.filter((candidate) => ready(candidate) && !freeFallback(candidate)))) {
    const state = test(instance) ?? "testing";
    if (state !== "failed") return { instance, state };
    silent ??= instance;
  }
  return silent ? { instance: silent, state: "failed" } : null;
}

/** It answered its test, or has no way to be tested and is trusted as before. */
export function aiWorks(found: { state: AiTestState } | null): boolean {
  return found?.state === "passed" || found?.state === "untestable";
}

interface SignInStep {
  snapshot: { state: string; authenticated?: boolean };
  authentication?: unknown;
  install?: { server?: unknown; managed?: unknown };
}

/** Whether the welcome's plain sign-in line fits this setup: a sign-in on the provider's own website, or a setup the app
 * does by itself before one. A step finished in Terminal keeps the setup's own instructions. */
export function plainSignIn(instance: SignInStep): boolean {
  return instance.snapshot.state === "available" && instance.snapshot.authenticated === false
    ? Boolean(instance.authentication)
    : Boolean(instance.install?.server || instance.install?.managed);
}

export function cloudSignInDue<Instance>(
  viewer: WelcomeViewer | null,
  state: { connected: boolean; instances: readonly Instance[] },
  ready: (instance: Instance) => boolean,
): boolean {
  return Boolean(viewer?.cloudHome && viewer.canSave) && state.connected && state.instances.length > 0 && !state.instances.some(ready);
}


export function reducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reducedMotion === "true") return true;
  return globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
