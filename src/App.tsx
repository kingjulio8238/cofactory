import { useProductScreen } from "@/lib/product-analytics-app";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Menu } from "./icons";
import { AnimatePresence } from "motion/react";
import { CLOUD_LINK_SETTINGS, openBot, StoreProvider, useStore } from "@/state/store";
import { SignInSheetHost } from "./components/SignInSheet";
import { openSignIn } from "@/lib/sign-in-sheet";

import { nextShortcutBot, shortcutBots, shownBotIds } from "@/lib/sidebar-shortcut-order";
import { useWelcomeViewer, WelcomeGate } from "@/components/onboarding/WelcomeGate";
import { IslandIntroHost } from "@/components/onboarding/IslandIntroHost";
import { CloudTimeZoneSync } from "@/components/CloudTimeZone";
import { useWarmChatImages } from "@/components/use-warm-chat-images";
import { cloudSignInDue, type WelcomeViewer } from "@/lib/onboarding";
import { LiveCallHost } from "@/components/LiveCallHost";
import { liveCallEnabled } from "@/lib/feature-flags";
import { AmbientPublisher } from "@/ambient/AmbientPublisher";
import { useAmbientAway } from "@/ambient/away";
import { BotsElsewhere } from "@/components/BotsElsewhere";
import { MacEmptyMain, useMacEmptyPrompt } from "@/components/MacEmptyMain";
import { PlaceSetupHost } from "@/components/PlaceSetupHost";
import { useMacEmpty } from "@/lib/bots-elsewhere";
import { openPlaceSetup } from "@/lib/place-setup";
import { ThreadRefsProvider } from "@/components/ThreadRefs";
import { parseComputerHelp } from "@/lib/computer-control";
import { Sidebar } from "@/components/Sidebar";
import { CompanyRail } from "@/components/CompanyRail";
import { ChatView } from "@/components/ChatView";
import { GroupView } from "@/components/GroupView";
import { PHONE_LAYOUT, useMediaQuery } from "@/lib/use-media-query";
import { useEdgeSwipeOpen } from "@/components/SidebarDrawer";
import { usePhoneViewport } from "@/lib/phone-viewport";
import { preloadConnectedApps } from "@/lib/connected-apps";
import { ConnectAppsHost, connectAppsPageFor, openConnectApps } from "@/components/connect-apps";
import {
  BotSettingsDialog, CloudAddDialog, KeyboardShortcutsModal,
  preloadScreens, RemoteAgentSettingsPanel, RoomPanel, SettingsModal,
} from "@/components/lazy-screens";
import { useRoomPanelShown } from "@/lib/room-panel";
import { WorkspaceBackupRecovery } from "@/components/WorkspaceBackupSettings";
import { AppNotices } from "@/components/AppNotices";
import { RoutineCloudUpsell } from "@/components/RoutineCloudUpsell";
import { EgressFallbackNotice } from "@/components/EgressFallbackNotice";
import { BotLimitPopup } from "@/components/BotLimitPopup";
import { CloudAsleepStrip } from "@/components/CloudAsleepStrip";
import { useCloudLastSeen, useHeldSend } from "@/lib/cloud-last-seen";
import { LiveConnectionStrip } from "@/components/LiveConnectionStrip";
import { CloudSendStrip } from "@/components/CloudSendStrip";
import { CloudMoveOffer } from "@/components/CloudMoveOffer";
import { HomeLine } from "@/components/HomeLine";
import { useTeamChats } from "@/state/team-chats";
import { needsYouVersion, useTeamPeopleLoader } from "@/state/team-people";
import { inboxVersion, useInboxLoader, useInboxPanel, useInboxReady } from "@/state/inbox";
import { InboxPanel } from "@/components/inbox/InboxPanel";
import { PlacesRail } from "@/components/PlacesRail";
import { CloudHowTo } from "@/components/CloudHowTo";
import { DesktopCapabilitiesProvider, useCaptionChrome, useDesktopCapabilities, windowFramed } from "@/components/DesktopCapabilities";
import { WindowCaptionButtons } from "@/components/WindowCaptionButtons";
import { WindowFrameBar } from "@/components/WindowFrameBar";
import { cn } from "@/lib/cn";
import { NoEngines } from "@/components/NoEngines";
import { CloudEngineSignIn } from "@/components/CloudEngineSignIn";
import { CloudIntent } from "@/components/CloudIntent";
import { cloudIntentDue, cloudIntentShown, useCloudIntent } from "@/lib/cloud-intent";
import { CloudSetup } from "@/components/CloudSetup";
import { AddVpsHost } from "@/components/vps-link/AddVpsHost";
import { CloudMoveHost } from "@/components/bot-panel/CloudMoveHost";
import { CloudWelcome } from "@/components/cloud-welcome/CloudWelcome";
import { WelcomeKeeper } from "@/components/cloud-welcome/WelcomeKeeper";
import { cloudFirstRun, cloudWelcomeVisible, useCloudWelcome } from "@/lib/cloud-welcome";
import { engineReady } from "@/components/EngineLibrary";
import { CommandPalette } from "@/components/CommandPalette";
import { CreateBotDialog, openCreateBot } from "@/components/CreateBotDialog";
import { PANEL_DOCKS_AT, PanelSlot } from "@/components/PanelSlot";
import { PanelPlaceholder } from "@/components/bot-panel/PanelPlaceholder";
import { TitleTooltips } from "@/components/TitleTooltips";
import { botCycleStep, shouldOpenKeyboardShortcuts } from "@/lib/keyboard-shortcuts";
import { effectiveLanguage, useLanguageChoice, usePageLanguage } from "@/lib/language-preference";
import { botUnreadCount, showBrowserUnread } from "@/lib/bot-unread";
import { phonePairingSettingsAction, takePhonePairingRequest } from "@/lib/phone-pairing"; import { phoneAppEnabled } from "@/lib/feature-flags"; import { takeConnectRequest } from "@/lib/connect-link";
import { useDesktopNotificationOpens, useExternalChatLinks } from "@/hooks/use-external-chat-links"; import { useNotesFromDownloads, useNotesReminder } from "@/components/NotesWaiting"; import { useSlackOAuthLinks } from "@/lib/slack-oauth-link";
import { useReadShownChatOnFocus } from "@/hooks/use-read-shown-chat";
import { usePresence } from "@/hooks/use-presence";
import { useComputerPanelActivity } from "@/hooks/use-computer-panel-activity";
import { AppEmptyMain } from "@/components/AppEmptyMain";
import { BootCover } from "@/components/BootCover";
import { t } from "@/lib/i18n";
import { loadingLine } from "@/lib/app-loading";
import { useAiSwitchKeeper } from "@/lib/ai-switch";
import { SESSION_ENDED_REASON, useSessionEnded } from "@/lib/session-ended";
import { PairPage } from "./pair/PairPage";
import { FeedbackHost } from "./components/FeedbackDialog";

function Shell({ viewer }: { viewer: WelcomeViewer | null }) {
  const { state, dispatch } = useStore();
  useCloudLastSeen(state);
  useHeldSend(state, dispatch);
  useTeamChats(state.config);
  const needsYou = needsYouVersion(state.bots, state.groups, state.notifications);
  useTeamPeopleLoader(state.config, needsYou);
  useInboxLoader(`${inboxVersion(state.bots) ?? ""}|${needsYou}`);
  const inboxReady = useInboxReady();
  const inboxShown = useInboxPanel().open && inboxReady;
  // A Switch AI pick lands once its stopped turn's chat is idle, wherever the person is by then.
  useAiSwitchKeeper({ bots: state.bots, dispatch });
  useWarmChatImages(state.bots);
  const { capabilities } = useDesktopCapabilities();
  const captionChrome = useCaptionChrome();
  const unreadCount =
    state.bots.filter((bot) => !bot.hidden).reduce((sum, bot) => sum + botUnreadCount(bot), 0) +
    state.groups.filter((group) => group.unread).length;
  const remoteClient = window.duskDesktop?.remoteClient?.active === true;
  // the bot's panel docks beside the sidebar only while the chat keeps its minimum width beside it
  const botPanelDocks = useMediaQuery(`(min-width: ${PANEL_DOCKS_AT}px)`, true);
  useEffect(() => {
    if (!window.duskDesktop?.environments) return;
    const open = () => dispatch({ type: "toggleAppSettings", open: true, section: "desktopWorkspaces" });
    // connect a server (the switcher, the rail's ＋): the guided setup at its ways to connect, never Settings; sharing this computer
    // with one still lands on its Settings page
    const connect = (computerId?: string | null) => (computerId ? open() : openPlaceSetup("server"));
    const url = new URL(window.location.href);
    const requestedSettings = url.searchParams.get("desktop-settings");
    const cloud = ["cloud", "cloud-settings", "cloud-add", "cloud-add-howto"].includes(requestedSettings ?? "");
    if (requestedSettings === "workspaces" || (requestedSettings === "organization" && window.duskDesktop.organization && !remoteClient) ||
      (cloud && window.duskDesktop.cloudAccount && !remoteClient)) {
      url.searchParams.delete("desktop-settings");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      if (requestedSettings === "organization") dispatch({ type: "toggleAppSettings", open: true, section: "organization" });
      else if (requestedSettings === "cloud") dispatch(CLOUD_LINK_SETTINGS);
      else if (requestedSettings === "cloud-settings") dispatch({ type: "toggleAppSettings", open: true, section: "cloudAccount" });
      else if (requestedSettings === "cloud-add" || requestedSettings === "cloud-add-howto") dispatch({ type: "openCloudAdd", source: requestedSettings === "cloud-add" ? "app_menu" : "app_howto" });
      else if (url.searchParams.has("share-computer")) open();
      else openPlaceSetup();
    }
    return window.duskDesktop.environments.onOpenSettings?.(connect);
  }, [dispatch]);
  useEffect(() => {
    const rest = takePhonePairingRequest(window.location.href);
    if (rest === null) return;
    window.history.replaceState(null, "", rest);
    if (phoneAppEnabled()) dispatch(phonePairingSettingsAction());
  }, [dispatch]);
  useEffect(() => { // A bot's link to a connection that needs the person on My Cloud opens the page that connects it.
    const request = takeConnectRequest(window.location.href);
    if (!request) return;
    window.history.replaceState(null, "", request.rest);
    dispatch("section" in request ? { type: "toggleAppSettings", open: true, section: request.section } : { type: "togglePlugins", open: true, surface: request.surface });
  }, [dispatch]);
  useEffect(() => { // every way into the old Plugins screen opens Connect Apps
    if (!state.pluginsOpen) return;
    openConnectApps(connectAppsPageFor(state.pluginsSurface));
    dispatch({ type: "togglePlugins", open: false });
  }, [state.pluginsOpen, state.pluginsSurface, dispatch]);
  useExternalChatLinks(state, dispatch); useDesktopNotificationOpens(state, dispatch); useSlackOAuthLinks();
  useNotesReminder();
  useNotesFromDownloads();
  usePresence(state, dispatch);
  const [drawerOpen, setDrawerOpen] = useState(false);
  usePageLanguage(effectiveLanguage(useLanguageChoice(), state.config?.language));
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Stays mounted once opened: a Cloud bought in it can arrive after the sheet is closed.
  const cloudAddOpened = useRef(false);
  cloudAddOpened.current ||= Boolean(state.cloudAdd);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const loading = loadingLine({ connected: state.connected, hydrated: state.hydrated === true, developer: import.meta.env.DEV });
  const group = state.groups.find((g) => g.id === state.selectedId);
  const bot = group ? undefined : (state.bots.find((b) => b.id === state.selectedId) ?? state.bots[0]);
  const macFrom = useMacEmpty();
  const [macPrompt, dismissMacPrompt] = useMacEmptyPrompt(macFrom);
  useProductScreen(state.appSettingsOpen ? "/settings" : state.pluginsOpen ? "/apps" : group ? "/rooms/:id" : bot ? (state.activeView === "files" ? "/bots/:id/files" : "/bots/:id") : "/", group?.id ?? bot?.id);
  useComputerPanelActivity({ bot, active: state.activeView === "chat", settingsOpen: state.settingsOpen, targetKey: `${bot?.vpsAlias}:${bot?.section}:${state.config?.vps?.sshAlias}:${state.config?.vps?.mode}:${state.config?.vps?.independentScreens}`, dispatch });
  const roomPanelOpen = useRoomPanelShown({ group, state, simple: !remoteClient });
  // The sidebar only folds when the person folds it: a side panel opening beside it never collapses it, as in Grok Bot.
  const phoneLayout = useMediaQuery(PHONE_LAYOUT, false);
  useEdgeSwipeOpen(phoneLayout && !drawerOpen, () => setDrawerOpen(true));
  usePhoneViewport(phoneLayout);

  const noEngines =
    state.connected &&
    state.instances.length > 0 &&
    !state.instances.some((i) => i.snapshot.state === "available");
  const cloudSignIn = cloudSignInDue(viewer, state, engineReady);
  const cloudIntent = useCloudIntent();
  const cloudAsk = cloudIntentShown(cloudIntentDue({
    viewer, connected: state.connected, enginesKnown: state.instances.length > 0,
    onboarding: state.config?.onboarding, reopened: false,
  }), cloudIntent);
  const cloudJobWaiting = Boolean(viewer?.cloudHome && viewer.canSave && cloudIntent.pending);
  const welcome = useCloudWelcome();
  const welcomeOnScreen = cloudWelcomeVisible({ viewer, connected: state.connected, enginesKnown: state.instances.length > 0, onboarding: state.config?.onboarding }, welcome)
    && state.activeView === "chat";
  const firstRun = cloudFirstRun({ welcome: welcomeOnScreen, intent: cloudAsk, signIn: cloudSignIn || cloudJobWaiting });
  useAmbientAway("cloud-first-run", Boolean(firstRun));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || state.shortcutsOpen) return;
      if (shouldOpenKeyboardShortcuts(e)) {
        e.preventDefault();
        dispatch({ type: "toggleShortcuts", open: true });
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const bots = shortcutBots(state.bots.filter((b) => !b.hidden), shownBotIds(document.querySelector("[data-sidebar-root]")));
      const step = e.shiftKey ? botCycleStep(e) : null;
      if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        openCreateBot();
      } else if (/^[1-9]$/.test(e.key)) {
        const target = bots[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          openBot(dispatch, target);
        }
      } else if (step !== null) {
        const next = nextShortcutBot(bots, state.selectedId, step);
        if (next) {
          e.preventDefault();
          openBot(dispatch, next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.bots, state.selectedId, state.shortcutsOpen, dispatch]);

  useReadShownChatOnFocus();
  // Grok Bot widens its window for the panel rather than squeezing the chat; a browser tab can't, so there it overlays.
  const settingsOpened = useRef(state.settingsOpen);
  useEffect(() => {
    const opened = state.settingsOpen && !settingsOpened.current;
    settingsOpened.current = state.settingsOpen;
    const grow = PANEL_DOCKS_AT - window.innerWidth;
    if (opened && grow > 0) void window.duskDesktop?.windowControls?.resizeWidthBy?.(grow).catch(() => {});
  }, [state.settingsOpen]);
  useEffect(() => {
    if (window.duskDesktop?.setUnreadCount) window.duskDesktop.setUnreadCount(unreadCount);
    else showBrowserUnread(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (!state.connected) return;
    void preloadConnectedApps(false, true).catch(() => {}); // a background read: a reconnect is nobody using a Cloud home
  }, [state.connected]);

  useEffect(() => preloadScreens(), []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [state.selectedId, bot?.threadId, group?.threadId, state.activeView, state.pluginsOpen, state.settingsOpen]);

  useEffect(() => {
    return window.duskDesktop?.onOpenAppSettings?.(section => {
      // signed out, any "sign in to dusk cloud" from main is the sign-in sheet right here, then what was asked for
      const cloud = window.duskDesktop?.cloudAccount;
      if ((section === "cloud" || section === "cloud-settings") && cloud?.continueInBrowser && !remoteClient) {
        void cloud.state().then((state) => {
          if (state.account && state.status === "connected") dispatch(section === "cloud" ? CLOUD_LINK_SETTINGS : { type: "toggleAppSettings", open: true, section: "cloudAccount" });
          else openSignIn({ after: () => { if (section === "cloud") dispatch(CLOUD_LINK_SETTINGS); } });
        }, () => openSignIn());
        return;
      }
      dispatch((section === "cloud-add" || section === "cloud-add-howto") && window.duskDesktop?.cloudAccount && !remoteClient
      ? { type: "openCloudAdd", source: section === "cloud-add" ? "app_menu" : "app_howto" }
      : section === "cloud" && window.duskDesktop?.cloudAccount && !remoteClient
        ? CLOUD_LINK_SETTINGS
        : section === "cloud-settings" && (window.duskDesktop?.cloudAccount || window.duskDesktop?.cloudPlan) && !remoteClient
          ? { type: "toggleAppSettings", open: true, section: "cloudAccount" }
          : { type: "toggleAppSettings", open: true, ...(section === "organization" && window.duskDesktop?.organization && !remoteClient ? { section } : {}) });
    });
  }, [dispatch]);

  useEffect(() => {
    return window.duskDesktop?.desktopViewer?.onState((viewer) => {
      if (viewer.open || !viewer.contextId) return;
      const botId = viewer.contextId;
      void fetch(`/api/bots/${botId}/computer/control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release" }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((snap) => {
          if (snap) dispatch({ type: "computerControl", botId, held: snap.held === true, helpReason: snap.helpReason ?? null, help: parseComputerHelp(snap.help) });
        })
        .catch(() => {});
      void fetch(`/api/bots/${botId}/computer/viewer-close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => {});
    });
  }, [dispatch]);

  const settingsOverlay = !botPanelDocks;
  // a reload with the panel open keeps its column from the first frame, not only once the bots arrive
  const panelLoading = state.settingsOpen && !bot && !group && state.hydrated !== true && !remoteClient && !settingsOverlay;
  const framed = windowFramed(capabilities);
  const strips = <>
    <CloudAsleepStrip />
    <LiveConnectionStrip connected={state.connected} hydrated={state.hydrated === true} />
    <CloudSendStrip cloudHome={state.config?.cloudHome === true} />
    <HomeLine />
    <CloudMoveOffer cloudHome={state.config?.cloudHome === true} />
    <AppNotices quiet={paletteOpen || drawerOpen} viewer={viewer} />
    <RoutineCloudUpsell quiet={paletteOpen || drawerOpen || Boolean(firstRun)} />
    <EgressFallbackNotice />
  </>;
  return (
    <div className={cn("flex h-full flex-col", framed && "bg-frame")}>
      <WindowFrameBar />
      <BotLimitPopup />
      {!framed && strips}
      <div className="relative flex min-h-0 flex-1">
      <button
        type="button"
        ref={menuButtonRef}
        aria-label="Open bot list"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="absolute left-3 top-3 z-30 rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink max-md:top-2.5 max-md:flex max-md:size-10 max-md:items-center max-md:justify-center max-md:rounded-full max-md:border max-md:border-transparent max-md:bg-card max-md:p-0 max-md:text-ink md:hidden"
      >
        <Menu size={18} className="max-md:hidden" />
        <ChevronLeft size={20} aria-hidden="true" className="hidden max-md:block" />
      </button>
      <PlacesRail />
      <CompanyRail />
      {/* A framed window shows the app, its sidebar and the chat or page, as one square pane under the top bar and beside
          the window's rail, running to the window's right and bottom edges. */}
      <div data-window-card={framed ? "" : undefined}
        className={framed ? "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-app" : "contents"}>
      {framed && strips}
      <div className={framed ? "relative flex min-h-0 flex-1" : "contents"}>
      <Sidebar
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          menuButtonRef.current?.focus();
        }}
      />
      {firstRun === "welcome" ? (
        <CloudWelcome />
      ) : firstRun === "intent" ? (
        <CloudIntent />
      ) : firstRun === "sign-in" ? (
        <CloudEngineSignIn />
      ) : noEngines ? (
        <NoEngines />
      ) : group ? (
        <GroupView key={group.id} group={group} />
      ) : bot ? (
        <ChatView bot={bot} />
      ) : (
        <AppEmptyMain loading={loading} notice={state.notice} />
      )}
      {macPrompt && macFrom && !firstRun && !noEngines && <MacEmptyMain from={macFrom} onClose={dismissMacPrompt} />}
      {/* Sibling panels need distinct keys: two keyed `bot.id` collide in React's keyed reconciliation. */}
      {state.settingsOpen && bot && remoteClient && <RemoteAgentSettingsPanel bot={bot} />}
      {state.settingsOpen && bot && !remoteClient && settingsOverlay && <BotSettingsDialog key={`settings:${bot.id}`} bot={bot} overlay />}
      {/* bot and room panels share one slot, so moving between a bot and a room swaps the content without the column closing */}
      <PanelSlot open={Boolean(state.settingsOpen && bot && !remoteClient && !settingsOverlay) || Boolean(roomPanelOpen && group) || panelLoading}>
        {bot ? <BotSettingsDialog key={`settings:${bot.id}`} bot={bot} /> : group ? <RoomPanel key={`room:${group.id}`} group={group} />
          : panelLoading ? <PanelPlaceholder onClose={() => dispatch({ type: "toggleSettings", open: false })} /> : null}
      </PanelSlot>
      {inboxShown && <InboxPanel />}
      </div>
      </div>
      <AnimatePresence>{state.appSettingsOpen && <SettingsModal key="settings" />}</AnimatePresence>
      {cloudAddOpened.current && <CloudAddDialog />}
      <BootCover busy={loading.busy && !bot && !group && !firstRun && !noEngines} text={t(loading.text)} />
      <CloudHowTo />
      <CloudSetup viewer={viewer} welcomeShown={welcomeOnScreen} />
      <WelcomeKeeper viewer={viewer} />
      <ConnectAppsHost />
      <AddVpsHost />
      <PlaceSetupHost />
      <SignInSheetHost />
      <FeedbackHost />
      <CloudMoveHost />
      {state.shortcutsOpen && (
        <KeyboardShortcutsModal
          open={state.shortcutsOpen}
          onClose={() => dispatch({ type: "toggleShortcuts", open: false })}
        />
      )}
      {/* After the modals: same z-50 tier, so DOM order keeps the palette on top. */}
      <CreateBotDialog />
      <CommandPalette onOpenChange={setPaletteOpen} />
      <TitleTooltips />
      {/* Blink resolves -webkit-app-region in DOM order, so this no-drag twin after the headers cuts the drawer button back out. */}
      <span
        aria-hidden
        data-drawer-button-no-drag
        style={captionChrome.noDragStyle}
        className="pointer-events-none absolute left-3 top-3 size-[30px] md:hidden"
      />
      </div>
      {/* Last child on purpose: Blink resolves -webkit-app-region in DOM order, so no-drag buttons must follow every drag region. */}
      <WindowCaptionButtons
        visible={capabilities.windowChrome === "win-caption" && Boolean(window.duskDesktop?.windowControls)}
      />
    </div>
  );
}

/** `children` sit inside the store beside the shell: a verification page's own probes (scripts/testing). */
function Application({ children }: { children?: ReactNode }) {
  const viewer = useWelcomeViewer();
  return (
    <DesktopCapabilitiesProvider>
      <StoreProvider>
        <ThreadRefsProvider>
          <Shell viewer={viewer} />
        </ThreadRefsProvider>
        <WelcomeGate viewer={viewer} />
        <BotsElsewhere />
        <IslandIntroHost />
        <CloudTimeZoneSync viewer={viewer} />
        {liveCallEnabled() && <LiveCallHost />}
        <AmbientPublisher />
        {children}
      </StoreProvider>
    </DesktopCapabilitiesProvider>
  );
}

export default function App({ children }: { children?: ReactNode } = {}) {
  const ended = useSessionEnded();
  if (ended) return <PairPage initialCode={null} reason={SESSION_ENDED_REASON} />;
  return <WorkspaceBackupRecovery><Application>{children}</Application></WorkspaceBackupRecovery>;
}
