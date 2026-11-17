import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { setEmailGateDone, track } from "@/lib/analytics";
import { openExternalLink } from "@/lib/app-links";
import { cofactoryEnabled, phoneAppEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/cn";
import { chiefFor, chiefStepFits, createChiefPatch, myDefaultBot, stageIntro, useViewerEmail } from "@/lib/default-bot";
import { completionPatch, computerAiIds, DEFAULT_ADMIN_ORIGIN, firstRunPatch, markWelcomeFinished, resumeBeat, showWelcome, type BeatId } from "@/lib/onboarding";
import { clearWelcomeDraft, readWelcomeDraft, saveWelcomeDraft } from "@/lib/welcome-draft";
import { looksLikeNotes } from "@/lib/assistant-notes";
import { greetingName } from "../../../shared/greeting-name";
import { macPermissionsBridge, permissionsMissing, type MacPermissionStatus } from "@/lib/mac-permissions";
import { openPlaceSetup, usePlaceSetupOpen } from "@/lib/place-setup";
import { localSetupImport } from "@/lib/setup-import";
import { api, useStore } from "@/state/store";
import { useBotMove } from "../BringBots";
import { useNotesIntake } from "../NotesWaiting";
import { WindowDragStrip } from "../DesktopCapabilities";
import { AccountStep } from "./AccountStep";
import { AiStep } from "./AiStep";
import { BringStatus, BringStep } from "./BringStep";
import { CheckoutStep, useCloudTile } from "./CheckoutStep";
import { CloudBringStep, useCloudBringOffered } from "./CloudBringStep";
import { funnelSteps, nextStep, previousStep, type FunnelPath, type FunnelStep } from "./funnel";
import { funnelAccount, type FunnelAccountState } from "./funnel-account";
import { FunnelBar, PhoneStep, PlaceStep, WelcomeStep } from "./FunnelSteps";
import { ApprovalsStep, HunchStep, OpeningStep, StakeStep, WhereStep, type Approvals } from "./FactorySteps";
import { MakingStep } from "./MakingStep";
import { PermissionsStep } from "./PermissionsStep";
import { useWelcomeAi } from "./welcome-ai";
import { localDesktopPage } from "./WelcomeGate";
import "../../styles/onboarding.css";
import "../../styles/place-setup.css";

type Config = ReturnType<typeof useStore>["state"]["config"];

/** What the factory already has, read once so a resumed or replayed first run starts from it. */
interface FactoryKnown {
  settings: { country: string | null; region: string | null; budgetCents: number; companyCapCents: number; approvals: Approvals; hunches: string[]; never: string[] };
  relatedParties: { emails: string[]; domains: string[] };
}

const FACTORY_COPY = {
  welcome: { title: "Meet Cofactory", sub: "Your own company factory. It finds businesses so niche only you would start them, and runs them to their first dollar." },
  place: { title: "Where should your factory run?", sub: "Companies answer customers while you sleep. You can move it any time." },
  phone: { title: "Approve from your phone", sub: "Scan a code with the phone app to get your factory's questions and approvals wherever you are." },
  notify: { title: "Hear when it needs you", sub: "A notification when your factory needs an OK or finds something worth a look." },
};

/** A genuine first run on this computer's own page names the person after its account, where their profile has none
 * (never on a Cloud, a Team Cloud or a remote page). The name stays theirs to change in Settings. */
async function nameFromComputer(config: Config, done: (config: NonNullable<Config>) => void): Promise<void> {
  const bridge = window.duskDesktop;
  if (!config || config.onboarding?.completedAt || config.profile?.name?.trim() || config.cloudHome || config.team) return;
  if (!localDesktopPage() || bridge?.remoteClient?.active) return;
  const name = await bridge?.desktopProfile?.systemName().catch(() => null);
  if (!name) return;
  try {
    done(await api<NonNullable<Config>>("/api/config", { method: "PUT", body: JSON.stringify({ profile: { name } }), signal: AbortSignal.timeout(10_000) }));
  } catch {
  }
}

export { cloudBought } from "./funnel";

/** How long the first run looks for Grok bot's bots here before it settles on what it has: the steps before the bring
 * step take longer than this, so it is never waited on. */
export const FIRST_RUN_LOOK_MS = 30_000;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside `root`, the way a modal dialog keeps them. */
export function trapTab(event: ReactKeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (event.key !== "Tab" || !root) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** The first run, one calm screen at a time: the welcome, a dusk bot account, where the bots live, an AI, bots from
 * another app (only when there are some), the phone (while the phone app is offered). It ends in Dusk's chat (Dusk made the Chief of Staff where no other
 * bot is one), where Dusk greets and asks for whatever is still missing. On dusk cloud it is the browser (account, plan and
 * checkout there, this screen waiting beside it), the AI while the Cloud is made, then the Cloud, ending in that Cloud's chat. */
export function WelcomeFlow({
  onDone,
  replay = false,
  initialBeat,
  embedded = false,
  cloudHome: onCloud = false,
}: {
  onDone: (botId: string | null) => void;
  replay?: boolean;
  initialBeat?: BeatId;
  embedded?: boolean;
  /** the person's own cloud, which runs this first run when the desktop app that set it up opened it */
  cloudHome?: boolean;
}) {
  const { state, dispatch } = useStore();
  const viewerEmail = useViewerEmail();
  const maus = myDefaultBot(state.bots, viewerEmail);
  const keepsDraft = !replay && !embedded;
  const root = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);
  const record = useRef(state.config?.onboarding);
  record.current = state.config?.onboarding;

  // the account: asked once where this window can sign in; a step only for someone not signed in yet
  const account = useMemo(() => (embedded ? null : funnelAccount()), [embedded]);
  const [known, setKnown] = useState<FunnelAccountState | null>(null);
  const firstKnown = useRef<FunnelAccountState | null>(null);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const read = () => void account.state().then((next) => {
      if (!alive) return;
      firstKnown.current ??= next;
      setKnown(next);
    }, () => {});
    read();
    const stop = account.onChange(read);
    window.addEventListener("focus", read);
    return () => { alive = false; stop(); window.removeEventListener("focus", read); };
  }, [account]);
  const desktop = !embedded && localDesktopPage() && window.duskDesktop?.remoteClient?.active !== true;
  const draft = useMemo(() => (keepsDraft ? readWelcomeDraft() : null), [keepsDraft]);
  // where the bots live, once picked; a resumed dusk cloud run past its checkout is paid for (the AI or the Cloud being made)
  const [path, setPath] = useState<FunnelPath | null>(draft?.cloud === true ? "cloud" : null);
  const [paid, setPaid] = useState(draft?.cloud === true && (draft.beat === "ai" || draft.beat === "making"));
  const [checkoutStart, setCheckoutStart] = useState(false);
  const cloud = path === "cloud";

  // the bring step is the prompt for AIs online; Grok bot's bots on this computer are looked for from the welcome on, in
  // the background, so the step can name them. What else this computer holds waits in Settings' import page.
  const cloudHome = !embedded && onCloud;
  const cloudBring = useCloudBringOffered(cloudHome && !replay);
  const offersMove = !replay && desktop && localSetupImport(state.config?.cloudHome === true);
  const move = useBotMove({ look: offersMove, downloads: false, ms: FIRST_RUN_LOOK_MS });
  // the Mac's permissions: read once, so the step stays put while the person grants them; offered until that read says
  // nothing is missing, which lets a run reopened on this step (Screen Recording needs that) land back on it
  const macAccess = useMemo(() => (desktop ? macPermissionsBridge() : null), [desktop]);
  const [firstAccess, setFirstAccess] = useState<MacPermissionStatus | null | undefined>(macAccess ? undefined : null);
  useEffect(() => {
    if (!macAccess) return;
    void macAccess.status().then((found) => setFirstAccess((known) => (known === undefined ? found : known)),
      () => setFirstAccess((known) => (known === undefined ? null : known)));
  }, [macAccess]);
  const permissions = Boolean(macAccess) && (firstAccess === undefined || permissionsMissing(firstAccess));
  const factory = cofactoryEnabled() && !embedded && !cloudHome;
  const notify = Boolean(macAccess) && (firstAccess === undefined || (firstAccess?.supported === true && firstAccess.notifications !== "granted"));
  const [factoryKnown, setFactoryKnown] = useState<FactoryKnown | null>(null);
  useEffect(() => {
    if (!factory) return;
    void api<FactoryKnown>("/api/cofactory/settings").then(setFactoryKnown, () => {});
  }, [factory]);
  const [notesLine, setNotesLine] = useState<string | null>(null);

  const saved = initialBeat ?? draft?.beat;
  // every first run asks for an account (sign up or sign in); skipping stays possible but quiet, except where the install
  // requires one
  const accountStep = Boolean(account) && !firstKnown.current?.signedIn;
  const stepsFor = (picked: FunnelPath | null) => funnelSteps({ account: accountStep, desktop, bring: offersMove,
    path: picked, hello: window.duskDesktop?.remoteClient?.active !== true, phone: phoneAppEnabled(), permissions, cloudBring, factory, notify });
  const steps = stepsFor(path);

  const [at, setAt] = useState<FunnelStep>(() => resumeBeat(steps, saved));
  // the second click of a double click lands on the step it opened: it must not choose there
  const stepShownAt = useRef(0);
  useEffect(() => { stepShownAt.current = Date.now(); }, [at]);
  const swallowDoubleClick = (event: { detail: number; preventDefault(): void; stopPropagation(): void }) => {
    if (event.detail < 2 || Date.now() - stepShownAt.current > 600) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const [from, setFrom] = useState<"next" | "back">("next");
  const tested = useWelcomeAi(state.instances);
  const cloudTile = useCloudTile(desktop);

  // each screen shown, with the path and how long the screen before it took: drop-off per step on the admin page
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    track("onboarding_step", { step: at, replay, ...(path ? { path } : {}), ...(shownAt.current !== null ? { ms: now - shownAt.current } : {}) });
    shownAt.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, replay]);
  useEffect(() => {
    if (keepsDraft && !finishing.current) saveWelcomeDraft({ beat: at, ...(cloud ? { cloud: true as const } : {}) });
  }, [at, keepsDraft, cloud]);

  // A Cloud sheet opened over the welcome never switches the window away from it (CloudAddDialog).
  useEffect(() => (embedded ? undefined : showWelcome()), [embedded]);
  useEffect(() => {
    if (!replay && !embedded) void nameFromComputer(state.config, (config) => dispatch({ type: "configStatus", config }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // each step's title takes focus, so a screen reader hears where it is
  useEffect(() => {
    const title = root.current?.querySelector<HTMLElement>("#welcome-title");
    if (title && !root.current?.querySelector("[autofocus]")) title.focus({ preventScroll: true });
    else if (!title) root.current?.focus({ preventScroll: true });
  }, [at]);

  const finish = useCallback(
    async (reason: "completed" | "skipped", botId: string | null) => {
      if (finishing.current) return;
      finishing.current = true;
      track("onboarding_completed", { reason, at, replay, ...(path ? { path } : {}) });
      setEmailGateDone("submitted");
      if (!replay && !embedded) markWelcomeFinished();
      if (keepsDraft) clearWelcomeDraft();
      onDone(botId);
      try {
        const patch = replay ? completionPatch() : firstRunPatch(record.current, new Date(), { cloudHome });
        const config = await api("/api/config", { method: "PUT", body: JSON.stringify(patch), signal: AbortSignal.timeout(10_000) });
        dispatch({ type: "configStatus", config });
      } catch {
      }
    },
    [at, path, dispatch, onDone, replay, embedded, keepsDraft, cloudHome],
  );

  // where it fits, Dusk becomes the Chief of Staff and greets in its chat, with no screen to ask
  const toChat = useCallback(() => {
    if (finishing.current) return;
    const chief = Boolean(maus && chiefStepFits(state.bots, maus));
    if (chief && maus) dispatch({ type: "updateBot", botId: maus.id, patch: createChiefPatch(maus, chiefFor(state.bots, maus)) });
    const botId = chief ? maus!.id : null;
    if (botId && !replay) stageIntro(botId);
    void finish(botId ? "completed" : "skipped", botId);
  }, [maus, state.bots, dispatch, finish, replay]);

  const go = useCallback((step: FunnelStep | null, direction: "next" | "back") => {
    if (!step) { if (direction === "next") toChat(); return; }
    setFrom(direction);
    setAt(step);
  }, [toChat]);
  const next = useCallback(() => go(nextStep(steps, at), "next"), [go, steps, at]);
  const back = previousStep(steps, at, { paid });

  // signing in in the browser comes back here by itself
  const signedOutSeen = useRef(false);
  useEffect(() => {
    if (at !== "account" || !known) return;
    if (!known.signedIn) signedOutSeen.current = true;
    else if (signedOutSeen.current) { signedOutSeen.current = false; next(); }
  }, [at, known, next]);

  // dusk cloud: straight to the browser for the account, the plan and the checkout, with this screen waiting beside it.
  // Paid, the AI comes next while the Cloud is made. A window that can't buy here opens the plans page and goes on.
  const placeSheet = usePlaceSetupOpen();
  const chooseCloud = () => {
    track("onboarding_place", { choice: "cloud" });
    if (window.duskDesktop?.cloudAccount && window.duskDesktop.remoteClient?.active !== true) {
      setPath("cloud");
      setCheckoutStart(true);
      setFrom("next");
      setAt("checkout");
      return;
    }
    void openExternalLink(`${DEFAULT_ADMIN_ORIGIN}/pricing`).catch(() => {});
    next();
  };
  const cloudPaid = useCallback(() => {
    track("onboarding_cloud", { action: "bought" });
    setPaid(true);
    setFrom("next");
    setAt("ai");
  }, []);
  // this Mac, from the place step or from the browser's waiting screen: on to the step after the place
  const toMac = () => {
    setPath("mac");
    setCheckoutStart(false);
    setFrom("next");
    const step = nextStep(stepsFor("mac"), "place");
    if (step) setAt(step); else toChat();
  };
  const chooseMac = () => { track("onboarding_place", { choice: "mac" }); toMac(); };

  // notes from another AI pasted on any step come in from here too (the bring step takes them itself, and says so there)
  const takeNotes = useNotesIntake();
  const onPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!looksLikeNotes(pasted)) return;
    event.preventDefault();
    takeNotes(pasted, setNotesLine);
  };

  const overlayOpen = Boolean(placeSheet);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (event.defaultPrevented || overlayOpen) return;
      event.preventDefault();
      // Escape is "not now": past an optional step, never past an account the app needs
      if (at === "account" && known?.required) return;
      if (at === "welcome" || at === "account" || at === "place" || at === "checkout" || at === "making") return;
      if (at === "where" || at === "stake" || at === "approvals" || at === "opening") return;
      next();
      return;
    }
    trapTab(event, root.current);
  };

  let body: ReactNode;
  switch (at) {
    case "welcome":
      body = <WelcomeStep onStart={next} copy={factory ? FACTORY_COPY.welcome : undefined} cloud={cloudHome ? { name: greetingName(state.config?.profile?.name), picture: state.config?.profile?.avatarUrl || undefined } : undefined} />;
      break;
    case "account":
      body = account ? <AccountStep account={account} known={known}
        onDone={() => { track("onboarding_account", { action: "signed_in" }); next(); }}
        onSkip={known?.required ? null : () => { track("onboarding_account", { action: "skipped" }); next(); }} /> : null;
      break;
    case "place":
      body = <PlaceStep onMac={chooseMac} onCloud={chooseCloud} cloudTag={cloudTile.tag} cloudNote={cloudTile.note} copy={factory ? FACTORY_COPY.place : undefined}
        onServer={() => { track("onboarding_place", { choice: "server" }); openPlaceSetup("way:cloudflare"); }} />;
      break;
    case "checkout":
      body = <CheckoutStep start={checkoutStart} onPaid={cloudPaid} onMac={toMac} />;
      break;
    case "ai":
      body = <AiStep tested={tested} cloud={cloud} auto={from === "next"} computerAis={cloudHome ? computerAiIds(state.config?.onboarding) : []} onNext={(how) => { track("onboarding_ai", { action: how }); next(); }} />;
      break;
    case "bring":
      body = cloudHome ? <CloudBringStep onNext={next} /> : <BringStep grokWaiting={move.plan?.grokWaiting ?? []} onNext={next} />;
      break;
    case "phone":
      body = <PhoneStep onNext={next} copy={factory ? FACTORY_COPY.phone : undefined} />;
      break;
    case "where":
      body = <WhereStep country={factoryKnown?.settings.country ?? null} region={factoryKnown?.settings.region ?? null} onNext={next} />;
      break;
    case "hunch":
      body = <HunchStep hunches={factoryKnown?.settings.hunches ?? []} never={factoryKnown?.settings.never ?? []} onNext={next} />;
      break;
    case "stake":
      body = <StakeStep budgetCents={factoryKnown?.settings.budgetCents ?? 0} capCents={factoryKnown?.settings.companyCapCents ?? 0} onNext={next} />;
      break;
    case "approvals": {
      const known = factoryKnown?.relatedParties;
      const emails = known && (known.emails.length || known.domains.length) ? [...known.emails, ...known.domains] : [viewerEmail].filter((item): item is string => Boolean(item));
      body = <ApprovalsStep approvals={factoryKnown?.settings.approvals ?? { launch: "ask", spendOverCents: 2_500, kill: "tell" }} emails={emails} onNext={next} />;
      break;
    }
    case "notify":
      body = macAccess ? <PermissionsStep bridge={macAccess} kinds={["notifications"]} copy={FACTORY_COPY.notify}
        onNext={(how, granted) => { track("onboarding_permissions", { action: how, granted }); next(); }} /> : null;
      break;
    case "opening":
      body = <OpeningStep onDone={(botId) => void finish("completed", botId)} />;
      break;
    case "making":
      body = <MakingStep onOpened={() => void finish("completed", null)} />;
      break;
    case "permissions": {
      const relaunch = window.duskDesktop?.relaunch;
      body = macAccess ? <PermissionsStep bridge={macAccess} relaunch={relaunch ? () => void relaunch().catch(() => {}) : null}
        onNext={(how, granted) => { track("onboarding_permissions", { action: how, granted }); next(); }} /> : null;
      break;
    }
  }

  const index = steps.indexOf(at);
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal
      aria-labelledby="welcome-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClickCapture={swallowDoubleClick}
      onPaste={onPaste}
      data-welcome={at}
      className={cn("welcome-screen flex overflow-y-auto bg-app outline-none", embedded ? "relative h-full w-full" : "fixed inset-y-0 left-[var(--rail-beside,0px)] right-0 z-50")}
    >
      {/* first, so the back button and every control after it stay clickable (styles.css) */}
      {!embedded && <WindowDragStrip />}
      {at !== "welcome" && steps.length > 1 && <FunnelBar at={index} count={steps.length} onBack={back ? () => go(back, "back") : null} />}
      <div key={at} data-from={from} className="place-step relative flex min-h-full w-full flex-col">
        {body}
      </div>
      {/* notes pasted on a step say how they went at its foot (the bring step says so itself) */}
      <BringStatus line={notesLine} />
    </div>
  );
}
