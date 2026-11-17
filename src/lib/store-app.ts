import { PANEL_TABS, type PanelTab } from "@/components/bot-panel/page-registry";

const kind = () => globalThis.document?.documentElement?.dataset?.mobileApp;

/** The phone app installed from the App Store or Google Play (mountMobile marks <html data-mobile-app> from the native
 * platform, never from a setting). App Store guideline 3.1.1 and Play's payments policy: it shows no plan, price,
 * upgrade or link to buy, anywhere. */
export function storeApp(): boolean {
  const value = kind();
  return value === "ios" || value === "android";
}

/** Inside the phone app's own shell (installed, or its web preview), not a narrow desktop window. */
export function phoneApp(): boolean {
  return Boolean(kind());
}

/** The iPhone app has no screen view or take-over of a bot's computer (guideline 4.2.7: a remote view of a computer). */
export function screenViewAllowed(): boolean {
  return kind() !== "ios";
}

/** The bot and room panel tabs this app shows; the Factory tab only for a bot holding a Cofactory seat. */
export function panelTabs(options: { factory?: boolean } = {}): readonly PanelTab[] {
  return PANEL_TABS.filter((tab) => (tab !== "computer" || screenViewAllowed()) && (tab !== "factory" || options.factory === true));
}
