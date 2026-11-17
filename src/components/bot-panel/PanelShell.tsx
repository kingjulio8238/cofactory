import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_OUT, PANEL_PUSH, SWAP } from "@/lib/motion-presets";
import { MotionDiv, MotionSpan } from "../ui/SheetMotion";
import { t } from "@/lib/i18n";
import type { Bot, BotSettingsSection } from "@/state/store";
import { Icon } from "../Icon";
import { useCaptionChrome } from "../DesktopCapabilities";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { ComputerTab } from "./ComputerTab";
import { FactoryTab, useSeat } from "./FactoryTab";
import { cofactoryEnabled } from "@/lib/feature-flags";
import { panelTabs, screenViewAllowed } from "@/lib/store-app";
import { PAGES, resolveTarget, TAB_LABEL, type PanelTab, type PanelTarget, type SimplePageId } from "./page-registry";
import { lazyScreen } from "../lazy-screen";
import { linkTarget, usePanelLink, type PanelLink } from "./panel-link";
import { PanelHero } from "./PanelHero";
import { PanelShareMenu } from "./PanelShareMenu";
import { roundButtonCls } from "./rows";
import { SegmentedTabs } from "../ui/SegmentedTabs";

export const PanelDetailsTab = lazyScreen("BotPanelDetails", async () => (await import("./DetailsTab")).DetailsTab);
export const PanelAdvancedTab = lazyScreen("BotPanelAdvanced", async () => (await import("./AdvancedTab")).AdvancedTab);
export const PanelAvatarEditor = lazyScreen("BotPanelAvatar", async () => (await import("./AvatarEditorCard")).AvatarEditorCard);
export const PanelPageBody = lazyScreen("BotPanelPages", async () => (await import("./pages")).PageBody);

function initialTarget(section: BotSettingsSection | null, link: PanelLink | null): PanelTarget {
  return section ? resolveTarget(linkTarget(section, link)) : { tab: "details" };
}

export function BotPanel({ bot, derived, linkedSection, computerRequest = 0, onClose }: {
  bot: Bot;
  derived: ReturnType<typeof useBotSettingsDerived>;
  linkedSection: BotSettingsSection | null;
  /** Each request to show the bot's computer lands on the Computer tab, even when the panel was already open. */
  computerRequest?: number;
  onClose: () => void;
}) {
  const { dragProps } = useCaptionChrome();
  const link = usePanelLink();
  const seat = useSeat(bot.id, cofactoryEnabled());
  const seated = Boolean(seat);
  const [tab, setTab] = useState<PanelTab>(() => { const first = initialTarget(linkedSection, link).tab; return panelTabs({ factory: true }).includes(first) ? first : "details"; });
  // a seated bot opens on its Factory tab once its seat is known, unless a tab was asked for or picked
  const tabChosen = useRef(Boolean(linkedSection && linkedSection !== "overview"));
  useEffect(() => {
    if (seat === undefined) return;
    if (seat && !tabChosen.current && tab === "details") setTab("factory");
    if (!seat && tab === "factory") setTab("details");
    tabChosen.current = true;
  }, [seat, tab]);
  const [stack, setStack] = useState<SimplePageId[]>(() => {
    const page = initialTarget(linkedSection, link).page;
    return page ? [page] : [];
  });
  const [anchor, setAnchor] = useState<string | null>(() => initialTarget(linkedSection, link).anchor ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(() => Boolean(initialTarget(linkedSection, link).editInstructions));
  const bodyRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const page = stack.at(-1) ?? null;

  const scrollTop = () => bodyRef.current?.scrollTo({ top: 0 });
  const go = (to: PanelTarget) => {
    const target = resolveTarget(to);
    if (!panelTabs({ factory: seated }).includes(target.tab)) return;
    setTab(target.tab);
    setStack(target.page ? [target.page] : []);
    setAnchor(target.anchor ?? null);
    setEditorOpen(false);
    setEditingInstructions(Boolean(target.editInstructions));
    scrollTop();
  };
  // only a tab picked from the tabs swaps in; coming back from a page, the list is simply there under the wipe
  const [tabSwapped, setTabSwapped] = useState(false);
  const openTab = (next: PanelTab) => {
    go({ tab: next });
    setTabSwapped(true);
  };
  const openPage = (next: SimplePageId) => {
    if (next === "settings") return go({ tab: "advanced" });
    setStack((current) => [...current, next]);
    setEditorOpen(false);
    setEditingInstructions(false);
    scrollTop();
  };
  const closeEditor = () => {
    setEditorOpen(false);
    // The card held focus: hand it back to the avatar that opened it, before the card goes, not to the page body.
    editorRef.current?.querySelector<HTMLElement>("[data-panel-avatar]")?.focus();
  };
  const back = () => {
    setTabSwapped(false);
    setStack((current) => current.slice(0, -1));
    scrollTop();
  };

  // A new link re-runs this even when it names the section already linked, so a repeated link lands there again.
  useEffect(() => {
    if (linkedSection) go(linkTarget(linkedSection, link));
  }, [linkedSection, link]);
  const shownRequest = useRef(computerRequest);
  useEffect(() => {
    if (shownRequest.current === computerRequest) return;
    shownRequest.current = computerRequest;
    go({ tab: "computer" });
  }, [computerRequest]);

  useEffect(() => {
    if (!anchor) return;
    bodyRef.current?.querySelector(`[data-panel-card="${anchor}"]`)?.scrollIntoView({ block: "start" });
    setAnchor(null);
  }, [anchor, page, tab]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target as Partial<Element> | null;
    const inDialog = typeof target?.closest === "function" ? target.closest('[role="dialog"], [role="alertdialog"]') : null;
    // A dialog of its own (one this panel opened, perhaps portaled) owns its Escape; the settings dialog this panel
    // sits in, and the avatar editor, do not.
    const ownDialog = inDialog && !inDialog.contains(event.currentTarget) && inDialog !== editorRef.current && !editorRef.current?.contains(inDialog);
    if (ownDialog) return;
    if (editorOpen) closeEditor();
    else if (stack.length > 0) back();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const backLabel = stack.length > 1 ? t(PAGES[stack[stack.length - 2]!].title, { name: bot.name }) : t(TAB_LABEL[tab]);

  // a deeper page pushes in from the right, a shallower one slides back: Grok's wipe navigation
  const depth = stack.length;
  const nav = useRef({ depth, direction: 1 });
  if (nav.current.depth !== depth) nav.current = { depth, direction: depth > nav.current.depth ? 1 : -1 };
  const direction = nav.current.direction;
  const prefersReduced = useReducedMotion();
  const reduced = prefersReduced || (typeof document !== "undefined" && document.documentElement.dataset.reducedMotion === "true");
  const viewKey = page === null ? "tabs" : `${depth}:${page}`;

  const tabsView = (
    <>
      <div data-panel-head className="contents">
        <div className="relative pb-3 pt-2" ref={editorRef}>
          <PanelHero
            bot={bot}
            activeState={derived.activeState}
            patch={derived.patch}
            editorOpen={editorOpen}
            onToggleEditor={() => setEditorOpen((open) => !open)}
          />
          {editorOpen && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden="true" data-panel-scrim onClick={closeEditor} />
              <PanelAvatarEditor bot={bot} activeState={derived.activeState} onPatch={derived.patch} onClose={closeEditor} />
            </>
          )}
        </div>
        <div
          data-panel-tabs
          className="sticky top-0 z-[1] -mx-4 flex justify-center bg-app px-4 pb-2.5 pt-1 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-app after:to-transparent"
        >
          <SegmentedTabs
            attr="data-panel-tab"
            label={t("botPanel.ui.botSettingsSimpleTabs")}
            value={tab}
            onChange={openTab}
            tabs={panelTabs({ factory: seated }).map((id) => ({ value: id, label: t(TAB_LABEL[id]) }))}
          />
        </div>
      </div>
      <MotionDiv
        key={tab}
        role="tabpanel" aria-label={t(TAB_LABEL[tab])} className="pt-2.5"
        initial={reduced || !tabSwapped ? false : SWAP.initial}
        animate={SWAP.animate}
      >
        {tab === "factory" && seat && <FactoryTab view={seat} />}
        {tab === "details" && <PanelDetailsTab bot={bot} derived={derived} onOpen={openPage} />}
        {tab === "computer" && screenViewAllowed() && <ComputerTab bot={bot} derived={derived} onOpen={openPage} />}
        {tab === "advanced" && <PanelAdvancedTab bot={bot} derived={derived} onOpen={openPage} />}
      </MotionDiv>
    </>
  );

  const pageView = page === null ? null : (
    <div data-panel-page-view={page} className="pt-1">
      {PAGES[page].intro && <p className="mx-3 mb-2.5 text-[13px] leading-[18px] tracking-[0.015em] text-ink-secondary">{t(PAGES[page].intro, { name: bot.name })}</p>}
      <div className="flex flex-col gap-3">
        <PanelPageBody
          page={page}
          bot={bot}
          derived={derived}
          onOpen={openPage}
          editingInstructions={editingInstructions}
          onEditInstructions={setEditingInstructions}
        />
      </div>
    </div>
  );

  const viewCls = "@container absolute inset-0 flex flex-col overflow-y-auto overscroll-contain bg-app px-4 pb-8 [scrollbar-gutter:stable] [scrollbar-width:thin]";
  const setBody = (element: HTMLDivElement | null) => { if (element) bodyRef.current = element; };
  const view = (content: ReactNode) => reduced ? (
    <div key={viewKey} ref={setBody} className={viewCls}>{content}</div>
  ) : (
    <motion.div
      key={viewKey}
      ref={setBody}
      custom={direction}
      variants={WIPE_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: PANEL_PUSH.duration, ease: PANEL_PUSH.ease }}
      className={viewCls}
    >
      {content}
    </motion.div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <span id="bot-settings-title" className="sr-only">{bot.name}</span>
      <span aria-hidden="true" data-panel-edge className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[0.5px] bg-edge max-md:hidden" />
      <div {...dragProps} className="relative flex h-[60px] shrink-0 items-center gap-2 p-3">
        {page === null && (
          <span className="ms-auto flex items-center gap-2">
            <PanelShareMenu bot={bot} />
          </span>
        )}
        {/* the back button fades in with a page and out without one; the title crossfades between pages */}
        <AnimatePresence initial={false}>
          {page !== null && (
            <MotionSpan key="back" className="flex shrink-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: HEAD_IN }} exit={{ opacity: 0, transition: HEAD_OUT }}>
              <button
                type="button"
                data-panel-back
                aria-label={t("botPanel.backTo", { place: backLabel })}
                title={backLabel}
                onClick={back}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink/[0.66] transition-[background-color,color] duration-[120ms] ease-[ease-out] hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Icon name="chevron-left" size={14} />
              </button>
            </MotionSpan>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {page !== null && (
            <MotionSpan key={page} data-panel-page-title className="pointer-events-none absolute left-1/2 top-1/2 max-w-[60%] -translate-x-1/2 -translate-y-1/2 truncate text-[13px] font-medium leading-[18px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1, transition: HEAD_IN }} exit={{ opacity: 0, transition: HEAD_OUT }}>
              {t(PAGES[page].title, { name: bot.name })}
            </MotionSpan>
          )}
        </AnimatePresence>
        {page !== null && <span className="ms-auto" />}
        <button type="button" onClick={onClose} aria-label={t("botPanel.close")} title={t("botPanel.close")} className={roundButtonCls}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {reduced ? view(page === null ? tabsView : pageView) : (
          <AnimatePresence initial={false} custom={direction}>
            {view(page === null ? tabsView : pageView)}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

const HEAD_IN = { duration: 0.15, ease: EASE_OUT } as const;
const HEAD_OUT = { duration: 0.12, ease: EASE_OUT } as const;

const WIPE_VARIANTS = {
  enter: (direction: number) => ({ x: direction > 0 ? PANEL_PUSH.pushFrom : PANEL_PUSH.under, opacity: 1, zIndex: direction > 0 ? 1 : 0 }),
  center: { x: "0%", opacity: 1 },
  exit: (direction: number) => (direction > 0 ? { x: PANEL_PUSH.under, opacity: 0, zIndex: 0 } : { x: PANEL_PUSH.pushFrom, opacity: 1, zIndex: 1 }),
};
