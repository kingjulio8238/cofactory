import type { LocaleKey } from "@/locales";
import type { BotSettingsSection } from "@/state/store";
import { isModalPage, requestPanelModal, type SheetPage } from "./modals/panel-modal";

export const PANEL_TABS = ["factory", "details", "computer", "advanced"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export const TAB_LABEL: Record<PanelTab, LocaleKey> = {
  factory: "botPanel.tab.factory",
  details: "botPanel.tab.details",
  computer: "botPanel.tab.computer",
  advanced: "botPanel.tab.advanced",
};

export type PageId =
  | "settings" | "where"
  | "setup" | "model" | "instructions" | "approvals" | "always" | "routines" | "apps"
  | "memory" | "skills"
  | "browser" | "folder" | "android"
  | "voice" | "blurb" | "team" | "mcp" | "tools" | "webhooks" | "visibility" | "slack"
  | "overview" | "prompt" | "history"
  | "backups" | "threads" | "api" | "library";

/** The pages Simple mode draws; a link to any other page lands where its section does. Bot settings is an alias: it
 * lands on the Advanced tab, which holds its rows. Library is everything the bot made, opened from Advanced. */
export const SIMPLE_PAGES = ["settings", "apps", "routines", "memory", "skills", "folder", "browser", "where", "instructions", "backups", "threads", "api", "library"] as const satisfies readonly PageId[];
export type SimplePageId = (typeof SIMPLE_PAGES)[number];

export function isSimplePage(page: PageId): page is SimplePageId {
  return (SIMPLE_PAGES as readonly PageId[]).includes(page);
}

export interface PageMeta {
  title: LocaleKey;
  home: PanelTab;
  intro?: LocaleKey;
}

export const PAGES: Record<PageId, PageMeta> = {
  settings: { title: "botPanel.page.settings", home: "advanced" },
  where: { title: "botPanel.ui.computerSimpleWhereWorks", home: "computer" },
  setup: { title: "botPanel.page.setup", home: "details" },
  model: { title: "botPanel.page.model", home: "details" },
  instructions: { title: "botPanel.ui.botSettingsSimpleInstructions", home: "details" },
  approvals: { title: "botPanel.page.approvals", home: "details" },
  routines: { title: "botPanel.ui.botSettingsSimpleRoutines", home: "details" },
  apps: { title: "botPanel.appsRow", home: "details", intro: "botPanel.apps.intro" },
  memory: { title: "botPanel.memoryRow", home: "advanced", intro: "botPanel.memory.intro" },
  skills: { title: "botPanel.ui.botSettingsSimpleSkills", home: "advanced", intro: "botSettings.simple.skillsHint" },
  browser: { title: "botPanel.page.browser", home: "computer" },
  folder: { title: "botPanel.page.folder", home: "advanced", intro: "botPanel.folder.intro" },
  android: { title: "botPanel.page.android", home: "computer" },
  voice: { title: "botPanel.page.voice", home: "details" },
  blurb: { title: "botPanel.page.blurb", home: "details" },
  team: { title: "botPanel.page.team", home: "details" },
  mcp: { title: "connectors.tab.mcp", home: "details" },
  tools: { title: "botPanel.ui.botAccessToolsTitle", home: "details" },
  webhooks: { title: "botPanel.page.webhooks", home: "details" },
  always: { title: "botPanel.page.always", home: "details" },
  visibility: { title: "botPanel.ui.botSettingsVisibilityTitle", home: "details" },
  slack: { title: "botPanel.page.slack", home: "details" },
  overview: { title: "botPanel.page.overview", home: "details" },
  prompt: { title: "botPanel.page.prompt", home: "details" },
  history: { title: "botPanel.page.history", home: "details" },
  backups: { title: "botPanel.page.backups", home: "details" },
  threads: { title: "botPanel.conversations.title", home: "details" },
  api: { title: "botPanel.page.api", home: "details" },
  library: { title: "botPanel.tab.library", home: "advanced" },
};

export const PAGE_IDS = Object.keys(PAGES) as PageId[];

export interface PanelTarget {
  tab: PanelTab;
  page?: SimplePageId;
  anchor?: string;
  /** Opens the Instructions editor in place on the Bot settings page. */
  editInstructions?: boolean;
  /** A page of the bot's settings to open in Settings' Bots page. */
  sheet?: SheetPage;
}

const SECTION_TARGET: Record<BotSettingsSection, PanelTarget> = {
  overview: { tab: "details" },
  identity: { tab: "advanced", sheet: "identity" },
  slack: { tab: "advanced", sheet: "slack" },
  soul: { tab: "details", page: "instructions" },
  skills: { tab: "advanced", page: "skills" },
  memory: { tab: "advanced", page: "memory" },
  library: { tab: "advanced", anchor: "library" },
  routines: { tab: "details", page: "routines" },
  access: { tab: "computer", page: "where" },
  model: { tab: "details", anchor: "model" },
  permissions: { tab: "advanced", sheet: "permissions" },
  voice: { tab: "advanced", anchor: "call" },
  visibility: { tab: "details" },
  history: { tab: "details" },
  usage: { tab: "details", anchor: "model" },
  computer: { tab: "computer" },
  factory: { tab: "factory" },
};

export function sectionTarget(section: BotSettingsSection): PanelTarget {
  return SECTION_TARGET[section];
}

/** A target as the panel draws it: the Bot settings page is the Advanced tab now, and a page that opens as a dialog
 * lands on the Advanced tab, which holds its row, with the dialog asked for over it. */
export function resolveTarget(target: PanelTarget): PanelTarget {
  if (target.sheet) requestPanelModal(target.sheet);
  else if (isModalPage(target.page)) requestPanelModal(target.page);
  else if (target.page !== "settings") return target;
  return { tab: "advanced", ...(target.anchor ? { anchor: target.anchor } : {}) };
}
