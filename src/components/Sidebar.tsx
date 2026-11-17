import { OrganizationIdentity } from "./OrganizationIdentity";
import { StartFreshHost } from "./bot-panel/StartFresh";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { motion, type MotionStyle } from "motion/react";
import { createPortal } from "react-dom";
import { Bot as BotIcon, Check, ClipboardCopy, Crown, FolderPlus, Library, Loader2, MoreHorizontal, Pencil, Phone, Pin, Plus, TextQuote, Trash2, Users, X } from "../icons";
import { api, useStore, formatTime, visibleMessages, botOpensTo, openBot, openThread, type Action, type AppState, type Bot, type Group, type InstanceInfo, type Message } from "@/state/store";
import { SidebarWorkingStep, useWorkingLabel } from "./SidebarWorkingStep";
import { openBotRow } from "@/state/thread-navigation";
import { liveCallEnabled, llmThreadTitlesEnabled } from "@/lib/feature-flags";

import { BotAvatar } from "./Avatar";
import { hoverGaze } from "./mascot-engine";
import { usePhoneDrawer } from "./SidebarDrawer";
import { botTooltip } from "./BotModelBadge"; import { SidebarBotRole } from "./BotRole";
import { useBotMarkState } from "./mascot-presence";
import { cn } from "@/lib/cn";
import { useHeldMenuMotion, useMenuMotion } from "./MenuMotion";
import { lastNonReceipt } from "@/lib/receipts";
import { botPreview, groupPreview, lastLine, sidebarPreviewMessages, waitingLine } from "./sidebar-preview";
import { activeLocale, t } from "@/lib/i18n";
import { copyText } from "@/lib/copy-text";
import type { LocaleKey } from "@/locales";
import { ConfirmDialog } from "./ConfirmDialog";
import { GroupAvatar, useGroupYou } from "./GroupAvatar";
import { nextRename } from "@/lib/rename";
import { useDesktopCapabilities, windowFramed } from "./DesktopCapabilities";
import { MIN_QUERY, SearchResults } from "./SearchResults";
import { TeamLibraryPanel } from "./lazy-screens";
import { warmTeamCatalog } from "@/lib/team-catalog-cache";
import { openCommandPalette } from "./CommandPalette";
import { NEW_GROUP_EVENT } from "@/lib/new-group-request";
import { RenameTitle } from "./RenameTitle";
import { navigateThreadMenu } from "./BotProjects";
import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { setSidebarDensity, useSidebarDensity, usePinnedCircles, useUniversalPins, type SidebarDensity } from "@/lib/sidebar-preferences";
import { BOT_CHATS_SECTION_ID, BOTS_SECTION_ID, CHANNELS_SECTION_ID, PINNED_SECTION_ID, activeBotsFirst, partitionSidebarBots, partitionSidebarGroups, pinnedCircleThreadListVisible, sidebarSectionLabel, userSectionId, userSectionName } from "@/lib/sidebar-layout";
import { stepKey } from "@/lib/sidebar-bot-drop";
import { botRowDropClass, useSidebarBotDrag, type BotRowDrag } from "./SidebarBotDrag";
import { useSidebarSections } from "./SidebarSections";
import { departmentNames } from "./bot-sections"; import { useScopeFilter } from "@/lib/factory-scope";
import { sidebarSectionAttention } from "@/lib/sidebar-attention";
import { botListItemPointerIntent } from "@/lib/sidebar-selection";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarPhoneBar } from "./SidebarPhoneBar";
import { PhoneHero } from "./SidebarPhoneHero";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { PHONE_LAYOUT, useMediaQuery } from "@/lib/use-media-query";
import { GlassBar, GlassScrollFrame, GlassScroller } from "./GlassScrollFrame";
import { SidebarPlaceButton } from "./SidebarPlaceButton";
import { useCloudOwner } from "./CloudOwner";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SectionRows } from "./SidebarSectionRows";
import { Icon } from "./Icon";
import { NeedsYouButton } from "./TeamOwner"; import { SidebarPeople } from "./SidebarPeople";
import { MENU_ITEM, MENU_ITEM_SEPARATOR, MENU_SHEET } from "./menu-recipe";
import { SidebarResizeHandle, useSidebarWidth } from "./SidebarResizeHandle";
import { SidebarMoreUnreads } from "./SidebarMoreUnreads";
import { onOpenTemplates } from "./SidebarTemplates";
import { PHONE_TOP_BUTTON, SIMPLE_CORNER_BUTTON, SIMPLE_ROW_FOCUS, SIMPLE_TOP_BUTTON, SidebarSearchPill, SidebarSearchToggle } from "./SidebarSimpleTop";
import { isSidebarToggle } from "@/lib/keyboard-shortcuts";
import { SidebarRailSeparator, SimpleRailFooter } from "./SidebarSimpleRail";
import { useBotUnread } from "./unread-notice";
import { runningRoutineRun, SidebarBotActivity, sidebarBotActivityTasks, sidebarBotStatus } from "./SidebarBotActivity";
import { SidebarNoBots, SidebarTileGrid } from "./SidebarTiles";
import { BotContextMenu, GROK_LABEL, GROK_MENU_ITEM, GROK_ROW_FILL, GrokMenuIcon } from "./SidebarBotMenu";
import { GROK_DANGER } from "./menu-recipe";
export { BotContextMenu };
import { AvatarActivityDot, RowDot, RowStatusText, rowSurface } from "./SidebarRowMarkers";


import { useLiveMedia } from "@/lib/live-call-media";
import { LiveCallPill, liveBadgeFor } from "./LiveCallPill";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { myDefaultBot, useViewerEmail, useWelcomingBot } from "@/lib/default-bot";
import { PinnedBotRoster, PinnedCircleThreadSection } from "./PinnedCircleThreads";
import { archiveBotWithNotice, onArchiveNotice } from "./bot-archive";
import { ArchivedBotsPanel, botConfirmProps, type BotConfirmKind } from "./ArchivedBotsPanel"; import { MovedBotRows } from "./MoveToTeam";
import { NewRoomPanel } from "./SidebarNewRoomPanel";
import { SectionPicker } from "./SidebarSectionPicker";

export { PinnedBotCircle, PinnedCircleThreadSection } from "./PinnedCircleThreads";
export { ArchivedBotRow, ArchivedBotsPanel, archivedDeleteAllCopy, botConfirmCopy, type BotConfirmKind } from "./ArchivedBotsPanel";
import { roomDeleteCopy } from "./room-delete-copy"; export { roomDeleteCopy };
import { friendlyError } from "@/lib/plain-error";
import { useActivityReorder, useNamesReturn } from "./sidebar-motion";

/** The centre of macOS's traffic lights (14px tall) with the window's frame off, where the window puts them at 16,16. */
export const MAC_TRAFFIC_LIGHT_CENTER_Y = 23;

const SECTION_LABEL_KEYS: Record<string, LocaleKey> = {
  [PINNED_SECTION_ID]: "sidebar.section.pinned",
  [CHANNELS_SECTION_ID]: "sidebar.section.channels",
  [BOT_CHATS_SECTION_ID]: "sidebar.section.botChatsChat",
  [BOTS_SECTION_ID]: "sidebar.section.bots",
};

function sectionLabel(id: string, simple = false): string {
  if (simple && id === BOTS_SECTION_ID) return t("sidebar.grok.unassigned");
  const key = SECTION_LABEL_KEYS[id];
  return key ? t(key) : sidebarSectionLabel(id);
}

export interface MenuState {
  botId: string;
  x: number;
  y: number;
}

export function openBotContextMenu(onMenu: (menu: MenuState) => void, botId: string, event: React.MouseEvent) {
  event.preventDefault();
  // grok's context menus open 4px below the pointer
  onMenu({ botId, x: event.clientX, y: event.clientY + 4 });
}

export function GroupListItem({
  group,
  density,
  onMenu,
}: {
  group: Group;
  density: SidebarDensity;
  query?: string;
  onMenu: (menu: { groupId: string; x: number; y: number }) => void;
}) {
  const { state, dispatch } = useStore();
  const selected = state.activeView === "chat" && state.selectedId === group.id;
  const simpleRow = density === "comfortable";
  const railTile = density === "icons";
  const members = group.memberIds
    .map((id) => state.bots.find((b) => b.id === id))
    .filter((b): b is Bot => Boolean(b));
  const you = useGroupYou();
  return (
    <div className={cn("group relative", railTile && "mx-auto w-[54px]")}>
    <button
      data-sidebar-group-row={group.id}
      aria-current={selected ? "page" : undefined}
      onClick={() => dispatch({ type: "select", id: group.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ groupId: group.id, x: e.clientX, y: e.clientY });
      }}
      // The ContextMenu key's native event carries no useful coordinates.
      onKeyDown={(e) => {
        if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        onMenu({ groupId: group.id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      className={cn(
        "relative flex w-full items-center rounded-md text-left", SIMPLE_ROW_FOCUS,
        railTile ? "h-[54px] justify-center" : simpleRow
          ? cn("gap-2.5 rounded-[12px] p-2 md:h-[54px] md:py-0", ROW_PRESS) : "gap-2 py-1.5 pl-2.5 pr-3",
        simpleRow ? rowSurface(selected) : selected ? "bg-raised" : "hover:bg-raised/50",
      )}
      title={density === "icons" ? group.name : undefined}
      aria-label={density === "icons" ? group.name : undefined}
    >
      <GroupAvatar members={members} you={you} size={36} />
      <div data-row-words className={cn("min-w-0 flex-1", density === "icons" && "hidden")}>
        <div className={cn("flex items-baseline justify-between gap-2", simpleRow && "pr-7")}>
          <span className={cn("truncate text-[14px] text-ink", simpleRow ? "font-medium leading-5" : "font-semibold")}>{group.name}</span>
          {simpleRow && group.unread && <RowDot />}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-ink-secondary", simpleRow ? "text-[13px] leading-[18px]" : "text-[11px]")}>{group.description || groupPreview(group, state.bots, state.instances)}</span>
          {!simpleRow && group.unread && <span className="size-2 shrink-0 rounded-full bg-accent" />}
        </div>
        {simpleRow && <RowStatusText unread={group.unread} />}
      </div>
      {density === "icons" && group.unread && (
        <span className="absolute right-1 top-1 size-2 rounded-full border border-panel bg-accent" />
      )}
    </button>
    </div>
  );
}

function RoomContextMenu({
  menu,
  onClose,
  onMoveToSection,
  onDelete,
}: {
  menu: { groupId: string; x: number; y: number } | null;
  onClose: () => void;
  onMoveToSection: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}) {
  const motion = useHeldMenuMotion(menu);
  const shown = motion.value;
  const { state, dispatch } = useStore();
  const remoteClient = window.duskDesktop?.remoteClient?.active === true;
  const group = shown ? state.groups.find((g) => g.id === shown.groupId) : undefined;
  const [renaming, setRenaming] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [draft, setDraft] = useState(group?.name ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState(group?.description ?? "");

  useEffect(() => {
    if (!menu) return;
    setDraft(state.groups.find((g) => g.id === menu.groupId)?.name ?? "");
    setDescriptionDraft(state.groups.find((g) => g.id === menu.groupId)?.description ?? "");
    setRenaming(false);
    setDescribing(false);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-room-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [menu, onClose]);

  if (!motion.shown || !group || !shown) return null;
  const isBotChat = Boolean(group.dm);
  const saveRename = () => {
    const name = nextRename(group.name, draft);
    if (name) dispatch({ type: "patchGroup", groupId: group.id, patch: { name } });
    onClose();
  };
  const saveDescription = () => {
    const trimmed = descriptionDraft.trim();
    if (trimmed !== (group.description ?? "")) {
      dispatch({ type: "patchGroup", groupId: group.id, patch: { description: trimmed } });
    }
    onClose();
  };
  const top = Math.min(shown.y, window.innerHeight - 204);
  const left = Math.min(shown.x, window.innerWidth - 240);
  return createPortal(
    <div
      data-room-menu
      data-sidebar
      role="menu"
      aria-label={t("sidebar.bot.actions", { name: group.name })}
      onKeyDown={navigateThreadMenu}
      style={{ top, left }}
      className={cn("fixed z-40 w-[228px] overflow-hidden", MENU_SHEET, motion.className)} {...motion.exitProps}
    >
      {!remoteClient && describing ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            autoFocus
            value={descriptionDraft}
            maxLength={120}
            placeholder={t("sidebar.room.descriptionPlaceholder")}
            aria-label={t("sidebar.room.descriptionAria", { name: group.name })}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDescriptionDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                saveDescription();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            className="min-w-0 flex-1 rounded-lg bg-raised px-2 py-1.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-focus"
          />
          <button
            type="button"
            onClick={saveDescription}
            aria-label={t("sidebar.room.saveDescription")}
            title={t("common.save")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.cancel")}
            title={t("common.cancel")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      ) : !remoteClient && (renaming ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            autoFocus
            value={draft}
            maxLength={100}
            aria-label={t("sidebar.room.renameAria", { name: group.name })}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                saveRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            className="min-w-0 flex-1 rounded-lg bg-raised px-2 py-1.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-focus"
          />
          <button
            type="button"
            onClick={saveRename}
            aria-label={isBotChat ? t("sidebar.room.saveBotChatName") : t("sidebar.room.saveChannelName")}
            title={t("common.save")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={isBotChat ? t("sidebar.room.cancelBotChatRename") : t("sidebar.room.cancelChannelRename")}
            title={t("common.cancel")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          role="menuitem"
          onClick={() => {
            setDraft(group.name);
            setRenaming(true);
          }}
          className={cn(MENU_ITEM, "text-ink hover:bg-menu-hover")}
        >
          <Pencil size={16} className="text-ink-secondary" />
          {isBotChat ? t("sidebar.room.renameBotChat") : t("sidebar.room.renameChannel")}
        </button>
      ))}
      {!remoteClient && !renaming && !isBotChat && (
        <button
          role="menuitem"
          onClick={() => {
            setDescriptionDraft(group.description ?? "");
            setDescribing(true);
          }}
          className={cn(MENU_ITEM, "text-ink hover:bg-menu-hover")}
        >
          <TextQuote size={16} className="text-ink-secondary" />
          {t("sidebar.room.setDescription")}
        </button>
      )}
      {!remoteClient && !isBotChat && (
        <button
          role="menuitem"
          onClick={() => {
            onClose();
            onMoveToSection(group.id);
          }}
          className={cn(MENU_ITEM, "text-ink hover:bg-menu-hover")}
        >
          <FolderPlus size={16} className="text-ink-secondary" />
          {t("sidebar.grok.moveTo")}
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          void copyText(group.threadId);
          onClose();
        }}
        className={cn(MENU_ITEM, "text-ink hover:bg-menu-hover")}
      >
        <ClipboardCopy size={16} className="text-ink-secondary" />
        {t("sidebar.copyConversationId")}
      </button>
      {!remoteClient && <button
        role="menuitem"
        onClick={() => {
          onClose();
          onDelete(group.id);
        }}
        className={cn(MENU_ITEM, "text-danger hover:bg-menu-hover")}
      >
        <Trash2 size={16} />
        {isBotChat ? t("sidebar.room.deleteBotChat") : t("sidebar.room.deleteChannel")}
      </button>}
    </div>,
    document.body,
  );
}

/** A confirmation may span live fleet updates; never authorize from its snapshot. */
export function currentArchivableBot(bots: readonly Bot[], id: string): Bot | undefined {
  const active = bots.filter((candidate) => !candidate.hidden);
  if (active.length <= 1) return undefined;
  return active.find((candidate) => candidate.id === id && !candidate.chiefOfStaff && !candidate.defaultBot);
}

export interface BotRowProps {
  bot: Bot;
  selected: boolean;
  deleting: boolean;
  mascotMotion: AppState["mascotMotion"];
  reveal: AppState["revealThread"];
  pendingQueued: AppState["pendingQueued"];
  instances: InstanceInfo[];
  liveCall: AppState["liveCall"];
  locale: string;
  generatedTitles: boolean;
  density: SidebarDensity;
  query: string;
  dispatch: Dispatch<Action>;
  onMenu: (menu: MenuState) => void;
  renameRequest?: number;
  botDrag?: BotRowDrag;
  botDragging?: boolean;
  /** grok's Main Bot: a star on the avatar's corner */
  main?: boolean;
  /** grok's list is one tab stop: false makes this row reachable by the arrow keys only */
  tabStop?: boolean;
}

export function botRowProps(
  state: AppState,
  dispatch: Dispatch<Action>,
  bot: Bot,
  layout: Pick<BotRowProps, "density" | "query" | "onMenu" | "renameRequest" | "botDrag" | "botDragging" | "main" | "tabStop">,
): BotRowProps {
  const selected = state.activeView === "chat" && state.selectedId === bot.id;
  const reveal = state.revealThread;
  return {
    ...layout,
    bot,
    selected,
    deleting: state.deletingBots[bot.id] === true,
    mascotMotion: selected && state.mascotMotion?.botId === bot.id ? state.mascotMotion : null,
    reveal: reveal && (bot.threadId === reveal.threadId || bot.tasks?.some((task) => task.threadId === reveal.threadId)) ? reveal : null,
    pendingQueued: state.pendingQueued,
    instances: state.instances,
    liveCall: state.liveCall,
    locale: activeLocale(),
    generatedTitles: llmThreadTitlesEnabled(state.config),
    dispatch,
  };
}

export function useVisibleMessages(bot: Bot): Message[] {
  const { messages, activeLeafId, previewMessages, transcriptLoaded, transcriptStale } = bot;
  return useMemo(() => transcriptLoaded === false ? sidebarPreviewMessages(bot)
    : transcriptStale ? sidebarPreviewMessages({ messages: visibleMessages({ messages, activeLeafId }), previewMessages, transcriptStale })
    : visibleMessages({ messages, activeLeafId }), [messages, activeLeafId, previewMessages, transcriptLoaded, transcriptStale]);
}

/** grok's waiting row names what it waits on: "Waiting for you: send the reply?" */
function grokWaiting(preview: string): string {
  const text = preview.trim();
  return text ? t("sidebar.grok.waiting", { text }) : t("sidebar.preview.waiting");
}

/** Grok's row glance: while the pointer is over the row, the mascot's eyes turn toward it. */
function RowGazeAvatar(props: Omit<React.ComponentProps<typeof BotAvatar>, "gaze" | "trackPointer">) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const row = anchor.current?.closest<HTMLElement>("[data-sidebar-bot-row]");
    if (!row) return;
    let frame = 0;
    const look = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = anchor.current?.getBoundingClientRect();
        if (!box) return;
        const look = hoverGaze(box, event.clientX, event.clientY);
        const next = { x: Math.round(look.x * 100) / 100, y: Math.round(look.y * 100) / 100 };
        setGaze((current) => (current && current.x === next.x && current.y === next.y ? current : next));
      });
    };
    const rest = () => { cancelAnimationFrame(frame); setGaze(null); };
    row.addEventListener("pointermove", look, { passive: true });
    row.addEventListener("pointerleave", rest);
    return () => { cancelAnimationFrame(frame); row.removeEventListener("pointermove", look); row.removeEventListener("pointerleave", rest); };
  }, []);
  return (
    <span ref={anchor} className="flex">
      <BotAvatar {...props} gaze={gaze ?? undefined} trackPointer={false} animated={props.animated || gaze !== null} />
    </span>
  );
}

/** grok's row geometry moves on its 200ms curve; bencho's feel on top: the fill eases in over 150ms and a press sinks the
 * row to .985, the barely-there press a list hit all day can take. Reduced motion keeps the fill, drops the sink. */
// grok's rows stay still while pressed: no squeeze, the row just opens on release
export const ROW_PRESS = "[--row-ease:cubic-bezier(.22,1,.36,1)] [transition:transform_200ms_var(--row-ease),width_200ms_var(--row-ease),padding_200ms_var(--row-ease)]";

export const BotListItem = memo(function BotListItem(props: BotRowProps) {
  const { bot, selected, deleting, mascotMotion, pendingQueued, instances, liveCall, density, dispatch, onMenu, renameRequest, botDrag: drag, botDragging: dragging, main = false, tabStop } = props;
  const liveMedia = useLiveMedia();
  const remoteClient = typeof window !== "undefined" && window.duskDesktop?.remoteClient?.active === true;
  const [renaming, setRenaming] = useState(false);
  // grok's row name is plain text: the field mounts only for a rename, from the menu or a double-click
  const [nameField, setNameField] = useState(false);
  const [nameEdit, setNameEdit] = useState(0);
  const [seenRename] = useState(() => ({ current: props.renameRequest ?? 0 }));
  useEffect(() => {
    if (!renameRequest || renameRequest === seenRename.current) return;
    seenRename.current = renameRequest;
    setNameField(true);
  }, [renameRequest]);
  useEffect(() => { if (nameField) setNameEdit((count) => count + 1); }, [nameField]);
  const iconOnly = density === "icons";
  useEffect(() => { if (iconOnly) setRenaming(false); }, [iconOnly]);
  const simpleRow = !iconOnly;
  const avatarSize = 36;
  const visible = useVisibleMessages(bot);
  const last = lastNonReceipt(visible);
  const title = bot.title.trim();
  const rowClass = cn(
    "flex w-full items-center rounded-xl text-left", SIMPLE_ROW_FOCUS,
    iconOnly ? "h-[54px] justify-center" : cn("gap-2.5 rounded-[12px] p-2 leading-[normal] tracking-[0.24px] md:h-[54px]", ROW_PRESS),
    !iconOnly && "max-md:rounded-2xl max-md:py-2.5",
    simpleRow ? rowSurface(selected) : selected ? "bg-raised" : "hover:bg-raised/50",
  );
  const { waiting, working, teammateWait, queued } = sidebarBotStatus(bot, pendingQueued);
  // grok's expanded row shows no corner dot while working: the mascot works and the preview says what it does
  const rowActivity = working ? (simpleRow ? null : "working") : teammateWait ? "teammate" : queued && !waiting ? "queued" : null;
  const { unread } = useBotUnread(bot);
  const markState = useBotMarkState(bot);
  const workingLabel = useWorkingLabel(bot, simpleRow && working);
  // grok: hold ⌘ (⌃ elsewhere) and each row shows the number that opens it, where its dot sits
  const preview = waiting ? simpleRow ? grokWaiting(waitingLine(bot, visible, instances)) : t("sidebar.preview.waiting") : teammateWait ? t("sidebar.preview.waitingOnTeammate") : queued ? t("task.queued") : simpleRow && working ? workingLabel ?? lastLine(bot, visible, instances) : botPreview(bot, visible, instances);
  // grok names a row with what it is doing: "Manager, Main Bot, Needs attention", "Koder, Working", "Content, Unread activity"
  const grokName = [bot.name, main ? t("sidebar.grok.mainBot") : "", waiting ? t("sidebar.grok.needsAttention") : working ? t("sidebar.grok.working") : unread ? t("sidebar.grok.unreadActivity") : ""].filter(Boolean).join(", ");
  const onLiveCall = liveBadgeFor(bot.id, liveMedia, liveCall);
  const body = (
    <>
      <span className="relative flex shrink-0">
        {simpleRow ? <RowGazeAvatar
          bot={bot}
          state={markState}
          size={avatarSize}
          motion={mascotMotion?.kind ?? "none"}
          motionKey={mascotMotion?.nonce ?? 0}
          animated
        /> : <BotAvatar
          bot={bot}
          state={markState}
          size={avatarSize}
          motion={mascotMotion?.kind ?? "none"}
          motionKey={mascotMotion?.nonce ?? 0}
          animated
        />}
        {/* Bottom-left, clear of the status dots on the right and of the row's hover actions. */}
        {simpleRow && <AvatarActivityDot activity={rowActivity} />}
        {!simpleRow && working && (
          <span
            data-testid="working-dot"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-success",
              iconOnly ? "size-3" : "size-2.5",
            )}
          />
        )}
        {!simpleRow && waiting && <span data-testid="waiting-dot" role="status" aria-label={t("sidebar.preview.waiting")} title={t("sidebar.preview.waiting")}
          className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center overflow-hidden rounded-full border-2 border-panel bg-warning font-black text-panel", iconOnly ? "size-5 text-[14px]" : "size-4 text-[12px]")}><span aria-hidden="true">!</span></span>}
        {!simpleRow && teammateWait && <span data-testid="teammate-wait-dot" role="status" aria-label={t("sidebar.preview.waitingOnTeammate")} title={t("sidebar.preview.waitingOnTeammate")}
          className={cn("absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-accent", iconOnly ? "size-3" : "size-2.5")} />}
        {!simpleRow && !teammateWait && !waiting && !working && queued && <span data-testid="queued-dot" role="status" aria-label={t("task.queued")} title={t("task.queued")}
          className={cn("absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-panel bg-ink-secondary", iconOnly ? "size-3" : "size-2.5")} />}
        {main && simpleRow && !rowActivity && (
          <span data-testid="main-bot-star" className="absolute bottom-0 right-0 flex size-[9.6px] items-center justify-center rounded-full bg-[#f59312] text-white shadow-none ring-[1.6px] ring-[var(--row)]">
            <Icon name="star" variant="filled" size={4.8} aria-label={t("sidebar.grok.mainBot")} />
          </span>
        )}
        {bot.chiefOfStaff && iconOnly && (
          <span className="absolute -left-1 -top-1 flex rounded-full bg-raised p-[3px]">
            <Crown size={11} strokeWidth={2.25} className="shrink-0 text-accent" role="img" aria-label={t("sidebar.bot.chiefOfStaff")} data-testid="chief-crown">
              <title>{t("sidebar.bot.chiefOfStaff")}</title>
            </Crown>
          </span>
        )}
        {onLiveCall && iconOnly && (
          <span className="absolute -right-1 -top-1 flex rounded-full bg-panel p-0.5">
            <Phone className="size-3 shrink-0 text-success" role="img" aria-label={t("call.live.badge")} data-testid="live-call-badge">
              <title>{t("call.live.badge")}</title>
            </Phone>
          </span>
        )}
      </span>
      <div data-row-words className={cn("min-w-0 flex-1", iconOnly && "hidden", simpleRow && "flex flex-col gap-px")}>
        <div className={cn("flex items-baseline justify-between gap-2", simpleRow && (unread || waiting ? "pr-7" : "group-has-[:focus-visible]:pr-7 touch:pr-7"))}>
          <span className={cn("flex min-w-0 grow items-center gap-1.5 truncate text-ink", simpleRow ? "text-[14px] font-medium leading-5 tracking-[0.01em]" : "text-[15px] font-semibold leading-5")}>
            {!simpleRow && bot.pinned && <Pin size={12} className="shrink-0 text-ink-secondary" />}
            {simpleRow && !nameField ? <span className="truncate">{bot.name}</span> : <RenameTitle
              key={iconOnly ? "icons" : "expanded"}
              value={bot.name}
              editRequest={simpleRow ? nameEdit : renameRequest}
              onCommit={(name) => {
                if (remoteClient) {
                  void api(`/api/bots/${bot.id}/profile`, { method: "PATCH", body: JSON.stringify({ name }) })
                    .then(({ bot: updated }) => dispatch({ type: "botPatched", bot: updated }))
                    .catch((cause) => dispatch({ type: "error", message: friendlyError(cause) }));
                } else {
                  dispatch({ type: "updateBot", botId: bot.id, patch: { name } });
                }
              }}
              onEditingChange={(editing) => { setRenaming(editing); if (!editing && simpleRow) setNameField(false); }}
              className="truncate"
              inputClassName={simpleRow ? "h-5 w-full bg-transparent p-0 text-[14px] font-medium leading-5 tracking-[0.01em] text-ink outline-none" : "w-full rounded bg-inset px-1 py-0.5 text-[15px] font-semibold"}
            />}
            {!simpleRow && bot.chiefOfStaff && !renaming && (
              <Crown size={13} strokeWidth={2.25} className="shrink-0 text-accent" role="img" aria-label={t("sidebar.bot.chiefOfStaff")} data-testid="chief-crown">
                <title>{t("sidebar.bot.chiefOfStaff")}</title>
              </Crown>
            )}
            {onLiveCall && !iconOnly && !renaming && (
              <Phone className="size-3 shrink-0 text-success" role="img" aria-label={t("call.live.badge")} data-testid="live-call-badge">
                <title>{t("call.live.badge")}</title>
              </Phone>
            )}
            {!simpleRow && title && !renaming && <SidebarBotRole role={title} />}
          </span>
          {last && !renaming && (
            <span className={cn(
              "shrink-0 text-[12px] tabular-nums text-ink-secondary transition-opacity",
              // Phones show the time on every row; elsewhere only the selected row, until its actions appear.
              selected && !simpleRow ? "group-hover:opacity-0 group-focus-within:opacity-0 touch:opacity-0 max-md:touch:opacity-100" : "hidden max-md:inline",
            )}>
              {formatTime(last.at)}
            </span>
          )}
          {simpleRow && (unread || waiting) && <RowDot waiting={waiting} />}
        </div>
        <div className="flex items-center justify-between gap-2">
          {deleting ? (
            <span role="status" className="flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-[18px] text-ink-secondary">
              <Loader2 size={12} className="shrink-0 animate-spin" />
              {t("sidebar.bot.deletingRow")}
            </span>
          ) : (
            <span className={cn("flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-[18px]", simpleRow && "tracking-[0.015em]", waiting ? simpleRow ? "text-[#aa6300]" : "font-semibold text-warning" : "text-ink-secondary")}>
              {working && !simpleRow ? (
                <SidebarWorkingStep bot={bot} last={last} />
              ) : (
                <span dir="auto" className="truncate">{preview}</span>
              )}
            </span>
          )}

          {!simpleRow && unread && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t("sidebar.unread")} />}
        </div>
        {simpleRow && <RowStatusText working={working} unread={unread} />}
        {simpleRow && main && <span className="sr-only">{t("sidebar.grok.mainBot")}</span>}
      </div>
    </>
  );
  const onContextMenu = (event: React.MouseEvent) => {
    openBotContextMenu(onMenu, bot.id, event);
  };
  const onSelect = (event: React.MouseEvent) => {
    if (renaming) return;
    const insideRenameInput = event.target instanceof HTMLInputElement;
    if (botListItemPointerIntent(event.type, insideRenameInput) === "select") {
      openBotRow(dispatch, bot, selected);
    }
  };

  return (
    <>
    <div className={cn("group relative", iconOnly && "mx-auto w-[54px]", drag && !renaming && "select-none", botRowDropClass(dragging))} data-bot-reorder-row={drag ? bot.id : undefined} data-bot-lifted={dragging || undefined}
      {...(drag && !renaming ? drag.row(bot.id) : {})} title={iconOnly ? botTooltip(bot, instances) : undefined}>
      {/* Keep this wrapper mounted: replacing it remounts RenameTitle and leaves the row stuck in rename mode. */}
      <div
        role={renaming ? undefined : "button"}
        tabIndex={renaming ? undefined : simpleRow && tabStop === false ? -1 : 0}
        aria-description={simpleRow && !renaming && !deleting ? preview : undefined}
        aria-label={
          simpleRow && !renaming && !deleting ? grokName : !renaming && iconOnly
            ? deleting
              ? t("sidebar.bot.deletingAria", { name: bot.name })
              : `${bot.name}${bot.title?.trim() ? ` · ${bot.title.trim()}` : ""}${bot.chiefOfStaff ? ` · ${t("sidebar.bot.chiefOfStaff")}` : ""}${onLiveCall ? ` · ${t("call.live.badge")}` : ""}${waiting ? ` · ${t("sidebar.preview.waiting")}` : working ? ` · ${t("chat.activity.working")}` : teammateWait ? ` · ${t("sidebar.preview.waitingOnTeammate")}` : queued ? ` · ${t("task.queued")}` : ""}${unread ? ` · ${t("task.unread")}` : ""}`
            : undefined
        }
        aria-busy={deleting || undefined} aria-keyshortcuts={drag ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
        aria-current={selected && !renaming ? "page" : undefined}
        data-sidebar-bot-row={bot.id}
        data-row-unread={unread || undefined}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (renaming) return;
          if (drag && stepKey(event)) { event.preventDefault(); drag.step(bot.id, stepKey(event)!); return; }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openBotRow(dispatch, bot, selected);
          }
        }}
        onContextMenu={onContextMenu}
        onDoubleClick={simpleRow && !renaming && !deleting && !remoteClient ? () => setNameField(true) : undefined}
        className={rowClass}
      >
        {body}
      </div>
      {!renaming && iconOnly && unread && (
        <span className="pointer-events-none absolute right-1 top-1 size-2 rounded-full border border-panel bg-accent" />
      )}
      {!renaming && !deleting && !iconOnly && <>
        <button type="button" data-bot-actions={bot.id} aria-label={t("sidebar.bot.actions", { name: bot.name })} title={t("sidebar.bot.actions", { name: bot.name })} aria-haspopup="menu" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu({ botId: bot.id, x: rect.left, y: rect.bottom }); }}
          className={cn("absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-ink-secondary transition-[opacity,background-color,color] duration-[180ms] ease-out hover:bg-raised hover:text-ink max-md:size-10 max-md:rounded-full", simpleRow && "right-2 top-1 translate-y-0 rounded-lg max-md:right-1 max-md:top-0",
            simpleRow ? "pointer-events-none opacity-0 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100 max-md:pointer-events-auto max-md:opacity-70 touch:pointer-events-auto touch:opacity-70"
              : selected ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 max-md:pointer-events-auto max-md:opacity-70 touch:pointer-events-auto touch:opacity-70")}><MoreHorizontal size={15} /></button>
      </>}
      {deleting && iconOnly && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-card p-1 text-ink-secondary">
          <Loader2 size={12} className="animate-spin" />
        </span>
      )}
    </div>
    {!iconOnly && bot.tasks?.some(runningRoutineRun) && <SidebarBotActivity bot={bot} rowThreadId={selected ? bot.threadId : botOpensTo(bot)} density={density} dispatch={dispatch} />}
    </>
  );
});

export function Sidebar({ open, onClose, collapseToIcons = false }: {
  open: boolean;
  onClose: () => void;
  collapseToIcons?: boolean;
}) {
  const { state, dispatch } = useStore();
  const cloudOwner = useCloudOwner(state.config?.cloudHome === true);
  const remoteClient = window.duskDesktop?.remoteClient?.active === true;
  const { capabilities } = useDesktopCapabilities();
  const phone = useMediaQuery(PHONE_LAYOUT, false);
  const importReturnRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawer = usePhoneDrawer({ phone, open, onClose, ref: sidebarRef });
  // a plain aside on a wide screen; only the phone's drawer is a motion element, which follows a drag
  // SAFETY: off a phone no motion prop is passed (drawer.props is null), so the plain aside sees only DOM props
  const Aside = (phone ? motion.aside : "aside") as typeof motion.aside;
  const [confirm, setConfirm] = useState<{ kind: BotConfirmKind; bot: Bot } | null>(null);
  const cancelConfirm = useCallback(() => setConfirm(null), []);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renameRequest, setRenameRequest] = useState<{ botId: string; nonce: number } | null>(null);
  const teamSettingsAllowed = useOwnerOrAdmin();
  const teamMenuReturn = useRef<HTMLElement | null>(null);
  const [sectionMenu, setSectionMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const sectionMotion = useHeldMenuMotion(sectionMenu);
  const closeSectionMenu = () => {
    (teamMenuReturn.current?.isConnected ? teamMenuReturn.current : sidebarRef.current)?.focus();
    setSectionMenu(null);
  };
  const openSectionMenu = (id: string, x: number, y: number, returnTo: HTMLElement) => {
    teamMenuReturn.current = returnTo;
    setSectionMenu({ id, x: Math.max(8, Math.min(x, window.innerWidth - 188)), y: Math.max(8, Math.min(y, window.innerHeight - 170)) });
  };
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null);
  const [teamDeletePending, setTeamDeletePending] = useState(false);
  const teamDeleteRunning = useRef(false);
  const [roomMenu, setRoomMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const [roomSectionPicker, setRoomSectionPicker] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const deletingRoom = deletingRoomId ? state.groups.find((g) => g.id === deletingRoomId) : undefined;
  const [plusOpen, setPlusOpen] = useState(false);
  const plusMotion = useMenuMotion(plusOpen);
  const [newRoom, setNewRoom] = useState(false);
  useEffect(() => {
    const open = () => setNewRoom(true);
    window.addEventListener(NEW_GROUP_EVENT, open);
    return () => window.removeEventListener(NEW_GROUP_EVENT, open);
  }, []);
  const [teamLibraryOpen, setTeamLibraryOpen] = useState(false);
  const [teamInstallUrl, setTeamInstallUrl] = useState<string | null>(null);
  const [archivedBotsOpen, setArchivedBotsOpen] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{
    error: boolean;
    text: string;
    restoreBot?: { id: string; name: string };
  } | null>(null);
  const [query, setQuery] = useState("");
  const [rowStop, setRowStop] = useState<string | null>(null);
  const storedDensity = useSidebarDensity();
  const density = collapseToIcons ? "icons" : storedDensity;
  const simple = density !== "icons";
  const simpleDesk = simple && !phone;
  const rail = density === "icons";
  const sizing = useSidebarWidth({ sidePanelOpen: false, sidebarRef });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchShown = searchOpen || query !== "";
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const closeSearch = () => { setSearchOpen(false); setQuery(""); searchToggleRef.current?.focus(); };
  const pinnedCircles = usePinnedCircles();
  const universalPins = useUniversalPins();
  const [pinnedCircleThreadsCollapsed, setPinnedCircleThreadsCollapsed] = useState(true);

  useEffect(() => {
    if (density === "icons") setQuery("");
  }, [density]);

  const toggleCollapsed = () => {
    setSidebarDensity(density === "icons" ? "comfortable" : "icons");
  };
  useEffect(() => {
    if (collapseToIcons || phone) return;
    const onKey = (event: KeyboardEvent) => { if (isSidebarToggle(event)) { event.preventDefault(); toggleCollapsed(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapseToIcons, phone, density]);

  useEffect(() => {
    if (!open || confirm || deletingRoom) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose, confirm, deletingRoom]);

  const plusMenuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(plusOpen, plusMenuRef, () => setPlusOpen(false));

  useEffect(() => {
    if (remoteClient) return;
    return window.duskDesktop?.onPackageInstall?.((url) => {
      setTeamInstallUrl(url);
      setTeamLibraryOpen(true);
    });
  }, [remoteClient]);

  useEffect(() => (remoteClient ? undefined : onOpenTemplates(() => setTeamLibraryOpen(true))), [remoteClient]);
  // Templates is fetched ahead, once launch is over (or at once when the menu that offers it opens), so its first open
  // draws in one frame instead of after the fetch
  useEffect(() => {
    if (remoteClient) return;
    const fetchTemplates = () => {
      void TeamLibraryPanel.preload().catch(() => {});
      warmTeamCatalog();
    };
    if (plusOpen) return fetchTemplates();
    const timer = setTimeout(fetchTemplates, 4_000);
    return () => clearTimeout(timer);
  }, [plusOpen, remoteClient]);

  useEffect(() => {
    if (!teamFeedback) return;
    const timer = window.setTimeout(() => setTeamFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [teamFeedback]);


  const requestArchive = (bot: Bot) => {
    const current = currentArchivableBot(state.bots, bot.id);
    if (current) setConfirm({ kind: "archive", bot: current });
  };

  const archiveBot = async ({ id }: Pick<Bot, "id">) => {
    const bot = currentArchivableBot(state.bots, id);
    if (bot) await archiveBotWithNotice(bot, { bots: state.bots, selectedId: state.selectedId, dispatch, notify: setTeamFeedback });
  };
  // Archives from the bot panel report here too, with the same Undo.
  useEffect(() => onArchiveNotice(setTeamFeedback), []);

  const undoBotArchive = async (bot: { id: string; name: string }) => {
    setTeamFeedback(null);
    try {
      const response = await api(`/api/bots/${bot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: false }),
      });
      dispatch({ type: "botPatched", bot: response.bot });
      openBot(dispatch, response.bot);
      setTeamFeedback({ error: false, text: t("sidebar.archived.restored", { name: bot.name }) });
    } catch (cause) {
      setTeamFeedback({ error: true, text: friendlyError(cause) });
    }
  };

  // A framed window (WindowFrameBar) holds the traffic lights in its top bar, so the top row keeps
  // no room for them; in Simple it is only the corner holding Search and New, with the bot tiles beside it. With the
  // frame off on macOS, the traffic lights sit in the top row's corner.
  const framed = windowFramed(capabilities), corner = framed && simpleDesk;
  const lights = capabilities.windowChrome === "mac-inset" && !framed;
  const draggableChrome = capabilities.windowChrome !== "native";
  // SAFETY: Electron's -webkit-app-region is not in React's CSSProperties type; the renderer accepts it as an inline
  // style.
  const windowDragStyle = draggableChrome
    ? ({ WebkitAppRegion: "drag" } as React.CSSProperties)
    : undefined;
  // SAFETY: interactive buttons must opt out of the draggable title-bar region.
  const windowNoDragStyle = draggableChrome
    ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
    : undefined;

  const q = query.trim().toLowerCase();
  useActivityReorder(sidebarRef, !q);
  useNamesReturn(sidebarRef, rail);
  const sections = useSidebarSections({ simple, rail, density, query: q, label: sectionLabel, sidebarRef }), inScope = useScopeFilter();
  const botDrag = useSidebarBotDrag({ dispatch, announce: sections.announce, onNamed: sections.focusHeader, onRenamed: sections.renamed,
    onError: (text) => setTeamFeedback({ error: true, text }), onCancelled: () => sidebarRef.current?.focus() });

  const matchingBots = state.bots
    .filter((b) => !b.hidden && inScope(b.id))
    .filter(
      (b) =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        (b.title ?? "").toLowerCase().includes(q) ||
        botPreview(b, visibleMessages(b), state.instances).toLowerCase().includes(q) ||
        b.tasks?.some((task) => !task.routineRunId && task.title.toLowerCase().includes(q)) ||
        b.projects?.some((folder) => folder.name.toLowerCase().includes(q)),
    );
  const visibleGroups = state.groups.filter((g) => !q || g.name.toLowerCase().includes(q) || g.tasks?.some((task) => task.title.toLowerCase().includes(q)));
  const viewerEmail = useViewerEmail();
  const parts = partitionSidebarBots(botDrag.preview(matchingBots), { universalPins, viewerEmail, welcoming: useWelcomingBot() });
  const mainBotId = myDefaultBot(state.bots, viewerEmail)?.id ?? parts.unsectionedChief?.id ?? parts.sectionChiefs[0]?.id;
  // grok keeps its main bot a row like any other, in its own section, marked with a star
  const saved = simpleDesk
    ? { ...parts, primary: null, unsectionedChief: null, unsectionedBots: parts.unsectionedChief ? [parts.unsectionedChief, ...parts.unsectionedBots] : parts.unsectionedBots }
    : { ...parts, primary: null };
  // The lists a bot is dragged in show the saved order, as Discord's channels do: a bot stays where it was put, busy or
  // not. Pins, which are not dragged, still put working bots first.
  const { pinnedBots } = activeBotsFirst(saved, (bot) => {
    const { waiting, working } = sidebarBotStatus(bot, state.pendingQueued);
    return waiting || working;
  });
  const { primary, unsectionedChief, sectionChiefs, sectionedBots, unsectionedBots } = saved;
  const { botChats, sectionedRooms, unsectionedRooms } = partitionSidebarGroups(visibleGroups);

  const sectionNames: string[] = [...(state.sections ?? []).filter((name) => (!q || name.toLowerCase().includes(q.toLowerCase())) && inScope.section(name, matchingBots)), ...botDrag.pending];
  for (const bot of sectionedBots) {
    if (!sectionNames.includes(bot.section!)) sectionNames.push(bot.section!);
  }
  for (const bot of sectionChiefs) {
    if (!sectionNames.includes(bot.section!)) sectionNames.push(bot.section!);
  }
  for (const group of sectionedRooms) {
    if (!sectionNames.includes(group.section!)) sectionNames.push(group.section!);
  }
  const drops = botDrag.arrange({ enabled: sections.interactive && !phone, main: saved.unsectionedBots, sectioned: saved.sectionedBots, departments: sectionNames, bots: state.bots, taken: departmentNames(state) });
  const naturalSectionIds = [
    ...(pinnedBots.length > 0 && !universalPins && !simpleDesk ? [PINNED_SECTION_ID] : []),
    ...(unsectionedRooms.length > 0 ? [CHANNELS_SECTION_ID] : []),
    ...(botChats.length > 0 ? [BOT_CHATS_SECTION_ID] : []),
    ...(unsectionedBots.length > 0 ? [BOTS_SECTION_ID] : []),
    ...sectionNames.map(userSectionId),
  ];
  const layout = sections.arrange(naturalSectionIds);
  // the main bot alone outside every department leads the list with no "Unassigned" header over it
  const loneMain = simple && unsectionedBots.length === 1 && unsectionedBots[0]!.id === mainBotId;
  const sectionIds = loneMain ? [BOTS_SECTION_ID, ...layout.sectionIds.filter((id) => id !== BOTS_SECTION_ID)] : layout.sectionIds;
  const showPinnedCircleThreads = !simpleDesk && pinnedCircleThreadListVisible(pinnedCircles, density, pinnedBots.length);
  const tiles = simpleDesk && pinnedBots.length > 0;
  const primaryHeadless = primary !== null && simple && sectionIds[0] === BOTS_SECTION_ID;
  const { interactive: layoutInteractive, collapsed: sectionCollapsed, toggle: toggleSection } = sections;
  // grok's header menu: Rename, Move up, Move down and Delete for a section; Unassigned only moves
  const sectionMenuFor = (id: string): boolean => layoutInteractive && !remoteClient && (userSectionName(id) !== null || (id === BOTS_SECTION_ID && sectionIds.length > 1));
  const archivedBots = state.bots.filter((bot) => bot.hidden && !bot.movedTo);
  const archivedEntry = remoteClient ? undefined : { count: archivedBots.length, open: () => setArchivedBotsOpen(true) };
  const pendingBotUndo = teamFeedback?.restoreBot;
  const tabStopId = [rowStop, state.activeView === "chat" ? state.selectedId : null].find((id) => id && matchingBots.some((bot) => bot.id === id)) ?? null;
  const botRow = (bot: Bot) => botRowProps(state, dispatch, bot, { density, query: q, onMenu: setMenu, renameRequest: renameRequest?.botId === bot.id ? renameRequest.nonce : 0, main: simpleDesk && bot.id === mainBotId,
    tabStop: simpleDesk && tabStopId ? bot.id === tabStopId : undefined, ...drops.row(bot.id) });
  // grok's rows: one tab stop, then the arrow keys, Home and End walk the list
  const walkRows = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!simpleDesk || event.altKey || event.metaKey || event.ctrlKey || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const from = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-sidebar-bot-row]") : null;
    if (!from || from !== event.target) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-sidebar-bot-row][role=button]")];
    const at = rows.indexOf(from);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    rows[next]?.focus();
  };
  const railSearch = () => {
    if (collapseToIcons) return openCommandPalette();
    setSearchOpen(true);
    toggleCollapsed();
  };
  const plusItem = cn(MENU_ITEM, "text-ink hover:bg-menu-hover");
  // grok's + is New Bot itself, no menu
  const grokPlus = simpleDesk && !corner && teamSettingsAllowed !== false;
  const plusControl = (
    <div ref={plusMenuRef} className="contents">
    {grokPlus ? <button
      ref={importReturnRef}
      type="button"
      onClick={() => dispatch({ type: "newBot" })}
      aria-label={t("sidebar.grok.newBot")}
      title={t("sidebar.grok.newBot")}
      className={SIMPLE_TOP_BUTTON}
    >
      <Icon name="plus" size={16} />
    </button> : <button
      ref={importReturnRef}
      onClick={() => setPlusOpen((o) => !o)}
      aria-label={remoteClient ? t("sidebar.new") : t("sidebar.newOrShare")}
      className={phone ? PHONE_TOP_BUTTON : corner ? SIMPLE_CORNER_BUTTON : SIMPLE_TOP_BUTTON}
      title={remoteClient ? t("sidebar.new") : t("sidebar.newOrShare")}
    >
      {!phone && !corner ? <Icon name="plus" size={16} /> : <Plus size={corner ? 18 : 20} strokeWidth={phone ? 2 : 1.5} />}
    </button>}
    {plusMotion.shown && (
      <>
        <div role="menu" aria-label={remoteClient ? t("sidebar.new") : t("sidebar.newOrShare")} onKeyDown={navigateThreadMenu} className={cn(
          "absolute z-40 w-max min-w-[200px] overflow-hidden", MENU_SHEET,
          rail ? "left-full top-0 ml-4" : "right-0 top-full mt-1.5",
          plusMotion.className,
        )} {...plusMotion.exitProps}>
          {teamSettingsAllowed !== false && <button
            onClick={() => { setPlusOpen(false); dispatch({ type: "newBot" }); }}
            role="menuitem"
            className={plusItem}
          >
            <BotIcon size={16} className="text-ink-secondary" />
            <span className="flex-1">{t("sidebar.newBotSimple")}</span>
          </button>}
          <button
            onClick={() => {
              setPlusOpen(false);
              setNewRoom(true);
            }}
            role="menuitem"
            className={plusItem}
          >
            <Users size={16} className="text-ink-secondary" />
            {t("sidebar.newChannel.title")}
          </button>
          {!remoteClient && <>
          {teamSettingsAllowed !== false && <button
            onClick={() => { setPlusOpen(false); setTeamLibraryOpen(true); }}
            role="menuitem"
            className={plusItem}
          >
            <Library size={16} className="text-ink-secondary" />
            {t("sidebar.teamLibrary")}
          </button>}
          </>}
        </div>
      </>
    )}
    </div>
  );

  return (
    <Aside
      {...drawer.props}
      onClickCapture={drawer.guardClick}
      ref={sidebarRef} data-sidebar-root={!phone || open ? "" : undefined}
      tabIndex={-1}
      aria-label={t("sidebar.aria")}
      data-native-view-overlay
      data-sidebar
      onClick={(event) => {
        // The phone's list covers the whole screen: choosing the bot that is already open has to dismiss it too.
        if (phone && open && event.target instanceof Element && !(event.target instanceof HTMLInputElement) && event.target.closest("[data-sidebar-bot-row], [data-sidebar-hero]")) onClose();
      }}
      style={{ ...drawer.props?.style, ["--sidebar-width" as string]: `${sizing.width}px` } as MotionStyle}
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r-[0.5px] border-transparent bg-panel max-md:[--scroll-fade-surface:var(--color-app)]",
        sizing.resizing && !sizing.snapping ? "transition-none" : "transition-[width] duration-500 ease-(--dusk-spring-soft) motion-reduce:transition-none",
        rail ? "w-[92px]" : "w-[280px] md:w-[var(--sidebar-width)]",
        "md:max-w-[calc(100vw-320px)]",
        // max-md: rather than an md: cancel: Tailwind v4 emits the native `translate`, and any value but `none` makes
        // this a containing block for its `fixed` descendants.
        "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-full max-md:border-r-0 max-md:bg-app",
        // the phone's drawer is placed by usePhoneDrawer; until the layout is known a closed list stays off screen
        !phone && !open && "max-md:-translate-x-full",
      )}
    >
      <GlassScrollFrame className={cn("flex-1", simpleDesk && "[&_[data-scroll-fade-edge=bottom]]:h-12")} fade>
      <GlassBar edge="top">
      <div
        data-sidebar-top-row={corner ? "corner" : true}
        className={cn(
          "flex items-center",
          // The corner is no drag region and takes no clicks but its buttons': the tiles rise into the rest of it.
          density === "icons" ? "flex-col gap-1 px-2 pt-3.5 pb-1" : corner ? "pointer-events-none relative h-[34px] items-start justify-end px-1.5 pt-1.5" : simpleDesk ? "relative h-[60px] items-start pl-4 pr-4 pt-3" : "relative pl-4 pr-2",
          density !== "icons" && !simpleDesk && !lights && "h-12 max-md:h-16",
        )}
        style={corner ? undefined : density !== "icons" && lights && !simpleDesk ? { ...windowDragStyle, height: MAC_TRAFFIC_LIGHT_CENTER_Y * 2 } : windowDragStyle}
      >
        {phone ? (
          <div className="shrink-0" style={windowNoDragStyle}><SidebarProfileMenu iconOnly circle /></div>
        ) : lights ? (
          // The traffic lights span 16-76px of the window; nothing clickable starts before 88px, with the window's rail
          // beside the page or not.
          <div aria-hidden="true" data-traffic-light-space className={density === "icons" ? "h-5 w-full" : "w-[72px] shrink-0 md:w-[calc(72px_-_var(--rail-beside,0px))]"} />
        ) : null}
        {rail && <div data-sidebar-rail-top className="flex flex-col items-center gap-2 pt-1" style={windowNoDragStyle}>
          <button type="button" onClick={railSearch} aria-label={t("sidebar.searchAria")} title={t("sidebar.searchAria")} className={SIMPLE_TOP_BUTTON}>
            <Icon name="search" size={16} />
          </button>
          <div className="relative flex">{plusControl}</div>
        </div>}
        {density !== "icons" && (simpleDesk ? <div data-sidebar-top-slot className="min-w-0 flex-1" /> : (
          <div data-sidebar-top-slot className="min-w-0 flex-1" />
        ))}
        {!rail && <div
          data-sidebar-top-buttons
          className={cn("relative flex shrink-0 items-center", corner ? "pointer-events-auto" : simpleDesk ? "gap-2" : "gap-1 pl-0.5")}
          style={windowNoDragStyle}
        >
          {!corner && !phone && <SidebarPlaceButton />}
          {simpleDesk && <SidebarSearchToggle ref={searchToggleRef} corner={corner} open={searchShown} onToggle={() => (corner ? searchShown ? closeSearch() : setSearchOpen(true) : openCommandPalette())} />}
          {plusControl}
        </div>}
      </div>

      <OrganizationIdentity compact={density === "icons"} />
      {!phone && simple && searchShown && <SidebarSearchPill query={query} onQuery={setQuery} onClose={closeSearch} />}
      {universalPins && pinnedBots.length > 0 && !simpleDesk && (
        <div
          data-sidebar-universal-pins=""
          // vh, not %: a percentage has no height to resolve against inside the glass head.
          className="max-h-[min(40vh,280px)] shrink-0 overflow-y-auto border-b border-transparent px-2 pb-2"
        >
          {density !== "icons" && !pinnedCircles && (
            <div className="px-2 pb-1 pt-1 text-[12px] font-medium leading-4 text-ink-secondary">
              {t("sidebar.section.pinned")}
            </div>
          )}
          <PinnedBotRoster
            bots={pinnedBots}
            density={density}
            circles={pinnedCircles}
            row={botRow}
            listItem={BotListItem}
          />
        </div>
      )}

      {tiles && <SidebarTileGrid primary={null} pinned={pinnedBots} row={botRow} corner={corner} />}
      {simpleDesk && !tiles && <SidebarNoBots />}
      </GlassBar>

      {!collapseToIcons && !phone && <SidebarResizeHandle sizing={sizing} sidebarRef={sidebarRef} avatars={density === "icons"} avatarsWidth={rail ? 92 : 80}
        onAvatars={(avatars) => setSidebarDensity(avatars ? "icons" : "comfortable")} style={windowNoDragStyle} />}

      <GlassScroller className={rail ? "[scrollbar-gutter:stable_both-edges]" : simpleDesk ? "px-3" : "px-2"}>
        <div className={cn("flex flex-col", simpleDesk ? "gap-2.5 pb-6 pt-1" : "gap-1 pb-2 pt-2")} onKeyDown={walkRows}
          onFocus={simpleDesk ? (event) => { const id = event.target instanceof HTMLElement ? event.target.dataset.sidebarBotRow : undefined; if (id) setRowStop(id); } : undefined}>
          {matchingBots.length === 0 && visibleGroups.length === 0 && q && q.length < MIN_QUERY && (
            <div className="px-3 py-6 text-center text-[13px] text-ink-secondary">{t("sidebar.noMatch", { query })}</div>
          )}
          {simpleDesk && <SidebarMoreUnreads edge="top" />}
          {!q && <NeedsYouButton compact={rail} />}{!q && <SidebarPeople compact={rail} />}
          {primary && !primaryHeadless && <BotListItem {...botRow(primary)} />}
          {unsectionedChief && (phone ? (
            <PhoneHero bot={unsectionedChief} selected={botRow(unsectionedChief).selected} onOpen={() => openBotRow(dispatch, unsectionedChief, botRow(unsectionedChief).selected)} onMenu={setMenu} />
          ) : (
            <div className="mb-1.5">
              <BotListItem {...botRow(unsectionedChief)} />
            </div>
          ))}
          {sectionIds.map((id, index) => {
            const sectionName = userSectionName(id);
            const sectionChiefItems = sectionName
              ? sectionChiefs.filter((bot) => bot.section === sectionName)
              : [];
            const sectionGroupItems =
              id === CHANNELS_SECTION_ID
                ? unsectionedRooms
                : id === BOT_CHATS_SECTION_ID
                  ? botChats
                  : sectionName
                    ? sectionedRooms.filter((group) => group.section === sectionName)
                    : [];
            const sectionBotItems =
              id === PINNED_SECTION_ID
                ? pinnedBots
                : id === BOTS_SECTION_ID
                  ? unsectionedBots
                  : sectionName
                    ? sectionedBots.filter((bot) => bot.section === sectionName)
                    : [];
            const headless = simple && id === BOTS_SECTION_ID && index === 0;
            const collapsed = !headless && sectionCollapsed(id);
            const queued = collapsed ? [...sectionChiefItems, ...sectionBotItems].flatMap((bot) =>
              sidebarBotActivityTasks(bot, state.pendingQueued).filter((task) => task.queued).map((task) => `${bot.name}: ${task.title}`)) : [];
            const attention = collapsed
              ? sidebarSectionAttention(
                  [...sectionChiefItems, ...sectionBotItems],
                  sectionGroupItems,
                )
              : undefined;
            return (
              <div
                key={id}
                data-sidebar-section-id={id}
                {...layout.zone(id)} data-bot-drop-list={drops.list(id)}
                className={cn(
                  "flex flex-col",
                  "gap-1",
                )}
              >
                {rail && index > 0 && <SidebarRailSeparator />}
                {layout.dropLine(id, "before")}
                {density !== "icons" && !headless && (
                  <SidebarSectionHeader
                    name={sectionLabel(id, true)}
                    line
                    count={sectionChiefItems.length + sectionBotItems.length + sectionGroupItems.length}
                    onMenu={sectionMenuFor(id) && ((button) => {
                      const rect = button.getBoundingClientRect();
                      openSectionMenu(id, rect.left, rect.bottom + 4, button);
                    }) || undefined}
                    menuOpen={sectionMenu?.id === id}
                    onContextMenu={sectionMenuFor(id) ? (event) => {
                      event.preventDefault();
                      openSectionMenu(id, event.clientX, event.clientY + 4, event.currentTarget.querySelector<HTMLElement>("button") ?? event.currentTarget);
                    } : undefined}
                    collapsed={collapsed}
                    attention={attention}
                    onToggle={layoutInteractive ? () => toggleSection(id) : undefined}
                    {...layout.header(id)} naming={drops.naming(sectionName)} dropInto={drops.into(sectionName)}
                  />
                )}
                {collapsed && queued.length > 0 && <button type="button" onClick={() => toggleSection(id)}
                  title={`${t("task.queued")} · ${queued.join(", ")}`} aria-label={`${t("sidebar.section.expand", { name: sectionLabel(id) })} · ${t("task.queued")} · ${queued.join(", ")}`}
                  className="mx-3 mb-1 inline-flex h-7 items-center self-start rounded-full bg-raised/50 px-3 text-[13px] font-medium leading-4 text-ink-secondary hover:text-ink">{t("task.queued")} · {queued.length}</button>}
                <SectionRows open={!collapsed} animate={simpleDesk}>{!collapsed && <>
                    {headless && primaryHeadless && <BotListItem {...botRow(primary)} />}
                    {sectionChiefItems.map((bot) => <BotListItem key={bot.id} {...botRow(bot)} />)}
                    {sectionGroupItems.map((group) => (
                      <GroupListItem
                        key={group.id}
                        group={group}
                        density={density}
                        query={q}
                        onMenu={setRoomMenu}
                      />
                    ))}
                    {id === PINNED_SECTION_ID ? (
                      <PinnedBotRoster
                        bots={sectionBotItems}
                        density={density}
                        circles={pinnedCircles}
                        row={botRow}
                        listItem={BotListItem}
                      />
                    ) : sectionBotItems.map((bot) => <BotListItem key={bot.id} {...botRow(bot)} />)}
                </>}</SectionRows>
                {layout.dropLine(id, "after")}
              </div>
            );
          })}
          <MovedBotRows bots={state.bots} /><SearchResults query={query} onLanded={() => { setQuery(""); setSearchOpen(false); }} />
          {showPinnedCircleThreads && (
            <PinnedCircleThreadSection
              bots={pinnedBots}
              collapsed={pinnedCircleThreadsCollapsed}
              onToggle={() => setPinnedCircleThreadsCollapsed((collapsed) => !collapsed)}
              row={botRow}
            />
          )}
          {simpleDesk && <SidebarMoreUnreads edge="bottom" />}
        </div>
      </GlassScroller>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {sections.announcement}
      </p>

      <GlassBar edge="bottom">
      {liveCallEnabled() && <LiveCallPill
        currentBotId={state.activeView === "chat" ? state.selectedId : null}
        onOpen={(botId, threadId) => openThread(dispatch, { botId, threadId }, state)}
        iconOnly={density === "icons"}
      />}

      {rail ? <SimpleRailFooter
        owner={cloudOwner}
        archived={archivedEntry}
      /> : phone ? <SidebarPhoneBar query={query} onQuery={setQuery} /> : <SidebarFooter owner={cloudOwner} archived={archivedEntry} />}
      </GlassBar>
      </GlassScrollFrame>

      <BotContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onArchive={requestArchive}
          onDelete={(bot) => setConfirm({ kind: "delete", bot })}
          onRename={(botId) => setRenameRequest((current) => ({ botId, nonce: (current?.nonce ?? 0) + 1 }))}
          onNewSection={density === "icons" ? undefined : (botId) => botDrag.startNew([botId])}
        />
      <ConfirmDialog {...botConfirmProps(confirm, state.bots, { archive: (bot) => { setConfirm(null); void archiveBot(bot); }, remove: (bot) => { setConfirm(null); dispatch({ type: "deleteBot", botId: bot.id }); },
        archiveInstead: (chief) => { setConfirm(null); void archiveBotWithNotice(chief, { bots: state.bots, selectedId: state.selectedId, dispatch, notify: setTeamFeedback }); } })}
        onCancel={cancelConfirm} returnFocusRef={sidebarRef} />
      {sectionMotion.shown && sectionMotion.value && createPortal(<div className={cn("fixed inset-0 z-40", sectionMotion.closing && "pointer-events-none")} onMouseDown={closeSectionMenu} onContextMenu={(event) => { event.preventDefault(); closeSectionMenu(); }}>
        {(() => {
          const { id, x, y } = sectionMotion.value!;
          const name = userSectionName(id);
          const at = sectionIds.indexOf(id);
          const move = layout.header(id).onMove;
          const row = (icon: Parameters<typeof GrokMenuIcon>[0]["name"], label: string, onClick: () => void, opts?: { disabled?: boolean; danger?: boolean; autoFocus?: boolean }) => (
            <button type="button" role="menuitem" autoFocus={opts?.autoFocus} disabled={opts?.disabled} aria-disabled={opts?.disabled || undefined}
              onClick={() => { closeSectionMenu(); onClick(); }}
              className={cn(GROK_MENU_ITEM, GROK_ROW_FILL, "text-ink", opts?.disabled && "cursor-default opacity-40 hover:before:bg-transparent")}>
              <GrokMenuIcon name={icon} danger={opts?.danger} /><span className={cn(GROK_LABEL, opts?.danger && GROK_DANGER)}>{label}</span>
            </button>
          );
          return (
            <div role="menu" aria-label={name ?? sectionLabel(id)} style={{ left: x, top: y }}
              className={cn("absolute w-[180px] text-ink", MENU_SHEET, sectionMotion.className)} {...sectionMotion.exitProps}
              onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closeSectionMenu(); return; }
                navigateThreadMenu(event);
              }}>
              {name !== null && row("pencil", t("sidebar.grok.rename"), () => botDrag.startRename(name), { autoFocus: true })}
              {row("arrow-up", t("sidebar.grok.moveUp"), () => move(-1), { disabled: at <= 0, autoFocus: name === null && at > 0 })}
              {row("arrow-down", t("sidebar.grok.moveDown"), () => move(1), { disabled: at < 0 || at >= sectionIds.length - 1, autoFocus: name === null && at <= 0 })}
              {name !== null && <>
                <div role="separator" className={MENU_ITEM_SEPARATOR} />
                {row("trash", t("sidebar.grok.delete"), () => setDeletingTeam(name), { danger: true })}
              </>}
            </div>
          );
        })()}
      </div>, document.body)}
      <ConfirmDialog open={deletingTeam !== null} title={t("sidebar.grok.deleteSectionTitle", { name: deletingTeam ?? "" })}
        body={t("sidebar.grok.deleteSectionBody")} confirmLabel={t("sidebar.grok.delete")} returnFocusRef={sidebarRef}
        pending={teamDeletePending}
        onCancel={() => { if (!teamDeleteRunning.current) setDeletingTeam(null); }} onConfirm={() => {
          const name = deletingTeam;
          if (!name || teamDeleteRunning.current) return;
          teamDeleteRunning.current = true;
          setTeamDeletePending(true);
          void api(`/api/sidebar-sections?section=${encodeURIComponent(name)}`, { method: "DELETE" })
            .then(({ sections }) => { dispatch({ type: "sectionDeleted", section: name, sections }); setDeletingTeam(null); })
            .catch(cause => setTeamFeedback({ error: true, text: friendlyError(cause) }))
            .finally(() => { teamDeleteRunning.current = false; setTeamDeletePending(false); });
        }} />
      <RoomContextMenu
          menu={roomMenu}
          onClose={() => setRoomMenu(null)}
          onMoveToSection={(groupId) => {
            if (!roomMenu) return;
            setRoomSectionPicker({ groupId, x: roomMenu.x, y: roomMenu.y });
          }}
          onDelete={(groupId) => {
            sidebarRef.current?.focus();
            setDeletingRoomId(groupId);
          }}
        />
      <ConfirmDialog
        open={deletingRoom !== undefined}
        {...roomDeleteCopy(deletingRoom ?? { name: "" })}
        returnFocusRef={sidebarRef}
        onCancel={() => setDeletingRoomId(null)}
        onConfirm={() => {
          // Read the room from live state: it may have been removed while the dialog was open.
          const groupId = deletingRoom?.id;
          setDeletingRoomId(null);
          if (groupId) dispatch({ type: "deleteGroup", groupId });
        }}
      />
      <SectionPicker
          current={roomSectionPicker ? state.groups.find((g) => g.id === roomSectionPicker.groupId)?.section : undefined}
          anchor={roomSectionPicker}
          onClose={() => setRoomSectionPicker(null)}
          onAssign={(section) => {
            if (!roomSectionPicker) return;
            dispatch({ type: "patchGroup", groupId: roomSectionPicker.groupId, patch: { section } });
          }}
        />
      {newRoom && <NewRoomPanel onClose={() => setNewRoom(false)} />}
      {!remoteClient && archivedBotsOpen && (
        <ArchivedBotsPanel
          bots={archivedBots}
          onClose={() => setArchivedBotsOpen(false)}
          onRestored={(message) => setTeamFeedback({ error: false, text: message })}
        />
      )}
      {!remoteClient && teamLibraryOpen && (
        <TeamLibraryPanel
          returnFocusRef={importReturnRef}
          initialUrl={teamInstallUrl ?? undefined}
          onClose={() => {
            setTeamLibraryOpen(false);
            setTeamInstallUrl(null);
          }}
          onImported={(result) => {
            setTeamLibraryOpen(false);
            setTeamInstallUrl(null);
            setTeamFeedback({
              error: false,
              text:
                (result.members === 0 && result.presets
                  ? t("sidebar.presetsImported", { count: result.presets })
                  : result.members === 1
                  ? t("sidebar.teamImportedOne")
                  : t("sidebar.teamImportedMany", { count: result.members })) +
                (result.connections ? ` · ${t("sidebar.connectionsToFinish", { count: result.connections })}` : ""),
            });
          }}
        />
      )}
      {teamFeedback &&
        createPortal(
          <div
            role="status"
            className={cn(
              "fixed bottom-4 left-[calc(var(--rail-beside,0px)_+_1rem)] z-[60] max-w-[300px] rounded-xl border px-3.5 py-2.5 text-[13px] shadow-xl",
              teamFeedback.error
                ? "border-transparent bg-card text-danger"
                : "border-transparent bg-card text-ink",
            )}
          >
            <div className="flex items-center gap-3">
              <span>{teamFeedback.text}</span>
              {pendingBotUndo && (
                <button
                  onClick={() => void undoBotArchive(pendingBotUndo)}
                  className="rounded-md px-1.5 py-0.5 font-medium text-accent hover:bg-raised"
                >
                  {t("common.undo")}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
      {drawer.scrim && createPortal(drawer.scrim, document.body)}
      <StartFreshHost />
    </Aside>
  );
}
