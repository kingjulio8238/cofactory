import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import { BOT_SETTINGS_SECTION_IDS } from "@/lib/last-bot-section";
import { MODAL_PAGES, pendingPanelModal, takePanelModalRequest } from "./modals/panel-modal";
import { isSimplePage, PAGE_IDS, PAGES, PANEL_TABS, resolveTarget, sectionTarget, SIMPLE_PAGES, TAB_LABEL } from "./page-registry";

describe("the bot panel's page registry", () => {
  it("has three tabs, Details, Computer and Advanced, and a Factory tab first for a Cofactory seat", () => {
    expect(PANEL_TABS).toEqual(["factory", "details", "computer", "advanced"]);
  });

  it("lands every settings section on a tab, and on a Simple page that lives on that tab", () => {
    for (const id of BOT_SETTINGS_SECTION_IDS) {
      const target = sectionTarget(id);
      expect(PANEL_TABS).toContain(target.tab);
      if (target.page) {
        expect(isSimplePage(target.page), id).toBe(true);
        expect(PAGES[target.page].home, id).toBe(target.tab);
      }
    }
  });

  it.each([
    ["overview", { tab: "details" }], ["identity", { tab: "advanced", sheet: "identity" }],
    ["soul", { tab: "details", page: "instructions" }],
    ["skills", { tab: "advanced", page: "skills" }], ["memory", { tab: "advanced", page: "memory" }], ["routines", { tab: "details", page: "routines" }],
    ["access", { tab: "computer", page: "where" }], ["model", { tab: "details", anchor: "model" }], ["permissions", { tab: "advanced", sheet: "permissions" }],
    ["voice", { tab: "advanced", anchor: "call" }], ["visibility", { tab: "details" }], ["history", { tab: "details" }], ["usage", { tab: "details", anchor: "model" }], ["slack", { tab: "advanced", sheet: "slack" }],
    ["library", { tab: "advanced", anchor: "library" }],
  ] as const)("sends a %s link to %o", (section, target) => {
    expect(sectionTarget(section)).toEqual(target);
  });

  it("draws the Simple pages on their tabs: settings, what it keeps and its Library on Advanced, where it works on Computer", () => {
    expect(SIMPLE_PAGES).toEqual(["settings", "apps", "routines", "memory", "skills", "folder", "browser", "where", "instructions", "backups", "threads", "api", "library"]);
    const home = Object.fromEntries(SIMPLE_PAGES.map((page) => [page, PAGES[page].home]));
    expect(home).toEqual({
      settings: "advanced", apps: "details", routines: "details",
      memory: "advanced", skills: "advanced", folder: "advanced", library: "advanced",
      browser: "computer", where: "computer",
      instructions: "details", backups: "details", threads: "details", api: "details",
    });
    expect(isSimplePage("mcp")).toBe(false);
  });

  it("names every page, its intro and every tab in English copy", () => {
    const keys = en as Record<string, string>;
    for (const id of PAGE_IDS) {
      expect(keys[PAGES[id].title], id).toBeTruthy();
      if (PAGES[id].intro) expect(keys[PAGES[id].intro], id).toBeTruthy();
    }
    for (const tab of PANEL_TABS) expect(keys[TAB_LABEL[tab]]).toBeTruthy();
    expect(PANEL_TABS.map((tab) => keys[TAB_LABEL[tab]])).toEqual(["Factory", "Details", "Computer", "Advanced"]);
    expect(keys[PAGES.settings.title]).toBe("Bot settings");
  });

  it("lands the Bot settings page, now an alias, on the Advanced tab", () => {
    expect(resolveTarget({ tab: "details", page: "settings" })).toEqual({ tab: "advanced" });
    expect(resolveTarget({ tab: "details", page: "settings", anchor: "model" })).toEqual({ tab: "advanced", anchor: "model" });
    expect(resolveTarget({ tab: "details", page: "routines" })).toEqual({ tab: "details", page: "routines" });
  });

  it("lands a page that is a dialog on the Advanced tab and asks for its dialog", () => {
    for (const page of MODAL_PAGES) {
      expect(resolveTarget({ tab: PAGES[page].home, page }), page).toEqual({ tab: "advanced" });
      const request = pendingPanelModal();
      expect(request?.page).toBe(page);
      takePanelModalRequest(request!);
    }
    expect(resolveTarget({ tab: "computer", page: "where", anchor: "conversations" })).toEqual({ tab: "advanced", anchor: "conversations" });
    takePanelModalRequest(pendingPanelModal()!);
  });
});
