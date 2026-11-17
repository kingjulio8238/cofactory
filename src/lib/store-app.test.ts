// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { PANEL_TABS } from "@/components/bot-panel/page-registry";
import { panelTabs, screenViewAllowed, storeApp } from "./store-app";

afterEach(() => { delete document.documentElement.dataset.mobileApp; });

describe("store app", () => {
  it("is the native phone app only, never the desktop or the phone page in a browser", () => {
    expect(storeApp()).toBe(false);
    document.documentElement.dataset.mobileApp = "web";
    expect(storeApp()).toBe(false);
    for (const kind of ["ios", "android"]) {
      document.documentElement.dataset.mobileApp = kind;
      expect(storeApp()).toBe(true);
    }
  });

  it("drops the computer tab, and with it the screen view, on the iPhone only", () => {
    expect(panelTabs(), "no Factory tab for a bot without a seat").toEqual(["details", "computer", "advanced"]);
    expect(panelTabs({ factory: true })).toEqual(PANEL_TABS);
    document.documentElement.dataset.mobileApp = "android";
    expect(screenViewAllowed()).toBe(true);
    document.documentElement.dataset.mobileApp = "ios";
    expect(screenViewAllowed()).toBe(false);
    expect(panelTabs()).toEqual(["details", "advanced"]);
  });
});
