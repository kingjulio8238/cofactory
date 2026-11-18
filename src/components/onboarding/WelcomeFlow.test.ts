// @vitest-environment happy-dom
// The first run as a funnel: the welcome, a dusk bot account, where the bots live, an AI,
// bots from another app when there are some, the phone while its app is offered (with the help-improve line on the last
// screen), then Dusk's chat;
// on dusk cloud, the Cloud being made. What each step shows, where it goes, and what it saves.
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { introStaged, stageIntro } from "@/lib/default-bot";
import { factoryHomeOpen as factoryHomeShown } from "@/lib/factory-home";
import { setLocale } from "@/lib/i18n";
import { EMPTY_ONBOARDING, MET_CHIEF_HINT, WELCOME_VERSION } from "@/lib/onboarding";
import type { InstanceInfo } from "@/state/store";
import { notesWaiting, stopWaiting } from "@/lib/assistant-notes";

const f = vi.hoisted(() => ({ state: {} as Record<string, unknown>, dispatch: vi.fn(), api: vi.fn(), onDone: vi.fn(),
  improve: [] as unknown[] }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: f.state, dispatch: f.dispatch, refreshInstances: vi.fn(), refreshModels: vi.fn() }), api: f.api }));
vi.mock("@/state/api", () => ({ api: f.api }));
// the directory has its own tests; here only that More providers opens it
vi.mock("@/components/models/ModelDirectory", () => ({ ModelDirectory: () => null }));
vi.mock("@/lib/product-analytics", () => ({ setUsageAnalytics: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), setEmailGateDone: vi.fn() }));
vi.mock("@/components/Avatar", () => ({ BotAvatar: () => null, MausAvatar: () => null }));
vi.mock("@/components/mascot-clock", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("@/components/EngineSetup", async (original) => {
  const { createElement: h } = await import("react");
  return { ...(await original<typeof import("@/components/EngineSetup")>()),
    EngineSetup: ({ instance }: { instance: InstanceInfo }) => h("div", { "data-engine-setup": instance.instanceId }) };
});
vi.mock("@/lib/default-bot", async (original) => ({ ...(await original<typeof import("@/lib/default-bot")>()), useViewerEmail: () => null }));
const { WelcomeFlow } = await import("./WelcomeFlow");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const claude = (ready: boolean, aiTest?: InstanceInfo["aiTest"]): InstanceInfo => ({
  instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", access: "subscription", install: { docsUrl: "https://example.test" },
  snapshot: { state: ready ? "available" : "unavailable", authenticated: ready }, models: { default: "m", options: [] }, ...(aiTest ? { aiTest } : {}),
} as InstanceInfo);
const signedOut = (instanceId: string, driverKind: string, displayName: string, method = "paste-code"): InstanceInfo => ({
  instanceId, driverKind, displayName, access: "subscription", install: { docsUrl: "https://example.test" },
  snapshot: { state: "available", authenticated: false }, authentication: { method }, models: { default: "m", options: [] },
} as InstanceInfo);
const cursor = (ready: boolean): InstanceInfo => ({ ...claude(ready), instanceId: "cursor", driverKind: "cursorAgent", displayName: "Cursor", aiTest: "passed" } as InstanceInfo);
const freeOpenCode = {
  instanceId: "opencodeGo", driverKind: "opencodeGo", displayName: "OpenCode", install: { docsUrl: "https://example.test" },
  snapshot: { state: "available", authenticated: true, freeFallback: true }, models: { default: "opencode/big-pickle", options: [] }, aiTest: "passed",
} as InstanceInfo;
const nothingSignedIn = () => [signedOut("chatgpt", "codex", "ChatGPT plan", "browser-pkce"), signedOut("claude", "claudeAgent", "Claude"),
  signedOut("cursor", "cursorAgent", "Cursor", "device-code"), signedOut("githubCopilot", "copilotAgent", "GitHub Copilot", "device-code")];
const maus = { id: "maus", threadId: "t", name: "Dusk", title: "", description: "", notifications: true, color: "chrome", unread: false,
  modelSelection: { instanceId: "claude", model: "m" }, messages: [], defaultBot: {}, chiefOfStaff: true };

let host: HTMLDivElement, root: Root;
const text = () => document.body.textContent ?? "";
const step = () => document.body.querySelector<HTMLElement>("[data-welcome]")?.dataset.welcome;
const title = () => document.body.querySelector("#welcome-title")?.textContent;
const button = (label: string) => [...document.body.querySelectorAll("button")].find((node) => node.textContent === label || node.getAttribute("aria-label") === label);
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`no "${label}" button on ${step()}: ${text()}`);
  await act(async () => { target.click(); });
  await settle();
};
const choose = async (selector: string) => {
  await act(async () => { document.body.querySelector<HTMLElement>(selector)!.click(); });
  await settle();
};
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };
const key = async (name: string) => {
  await act(async () => { document.body.querySelector<HTMLElement>("[data-welcome]")!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); });
  await settle();
};
const show = async (extra: Record<string, unknown> = {}) => {
  await act(async () => { root.render(createElement(WelcomeFlow, { onDone: f.onDone, ...extra })); });
  await settle();
};
/** Past the hello (and an account step's Skip for now) to where bots live. */
const toPlace = async () => {
  if (step() === "welcome") await press("Get started");
  if (step() === "account") await press("Skip for now");
  expect(step()).toBe("place");
};
/** An AI already answering is used without asking: the AI step says so, then goes on by itself. */
const usesFoundAi = async (name = "Claude") => {
  expect(step()).toBe("ai");
  expect(text()).toContain(`Using your ${name} account`);
  expect(document.body.querySelector("[data-funnel-ai]"), "no cards to pick from").toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_400); });
  await settle();
};
const saved = () => f.api.mock.calls.filter(([path, init]) => path === "/api/config" && init?.method === "PUT").map(([, init]) => JSON.parse(init.body));
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, String(v)), removeItem: (k: string) => void values.delete(k), clear: () => values.clear() };
};
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  // dusk bot's own first run; the Cofactory one has its own tests below
  vi.stubEnv("VITE_COFACTORY", "0");
  vi.useFakeTimers();
  HTMLElement.prototype.animate = vi.fn(() => ({ onfinish: null, oncancel: null, cancel() {} }) as unknown as Animation);
  setLocale("en");
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  f.dispatch.mockReset();
  f.onDone.mockReset();
  f.api.mockReset();
  f.improve = [];
  stopWaiting();
  f.api.mockImplementation(async (path: string, init?: { body?: string; method?: string }) => {
    if (path.endsWith("/check")) return { ok: true };
    if (path === "/api/dashboard/usage-signals") { if (init?.body) f.improve.push(JSON.parse(init.body)); return init?.body ? JSON.parse(init.body) : { enabled: true }; }
    if (path === "/api/mobile/devices") return { devices: [] };
    if (path === "/api/setup-import/bots") return { apps: [] };
    if (path === "/api/setup-import/grok") return { files: [], bots: [] };
    return path === "/api/instances" ? { instances: f.state.instances } : JSON.parse(init?.body ?? "{}");
  });
  f.state = { hydrated: true, instances: [claude(true, "passed")], config: { onboarding: EMPTY_ONBOARDING, profile: { name: "" } }, bots: [maus], cloudAdd: null };
  stageIntro(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the welcome", () => {
  it("opens on the welcome with nothing else to decide, and asks nothing about sharing off the desktop app", async () => {
    await show();
    expect(step()).toBe("welcome");
    expect(title()).toBe("Meet dusk bot");
    await press("Get started");
    expect(step()).toBe("ai");
    expect(document.body.querySelector("[data-help-improve]"), "Settings has the switch; the run here has no place step").toBeNull();
    expect(f.onDone).not.toHaveBeenCalled();
    expect(document.body.querySelector("textarea"), "nothing asks for a job").toBeNull();
  });

  it("first run never shows the help improve switch; it lives in Settings", async () => {
    vi.stubGlobal("duskDesktop", { remoteClient: { active: false } });
    await show();
    expect(document.body.querySelector("[data-help-improve]")).toBeNull();
    await toPlace();
    expect(document.body.querySelector("[data-help-improve]")).toBeNull();
  });

  it("with Claude already answering, uses it without asking and goes on to Dusk's chat", async () => {
    await show();
    await press("Get started");
    await usesFoundAi();
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
    expect(introStaged("maus")).toBe(true);
    expect(f.dispatch).toHaveBeenCalledWith({ type: "updateBot", botId: "maus", patch: { welcomed: true } });
    await act(async () => {});
    expect(saved()).toEqual([{ onboarding: expect.objectContaining({ version: WELCOME_VERSION, hintsSeen: [MET_CHIEF_HINT] }) }]);
  });
});

describe("connecting an AI", () => {
  it("an AI found answering goes on at once with Continue, not only after its pause", async () => {
    await show();
    await press("Get started");
    expect(text()).toContain("Using your Claude account");
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(f.onDone, "the pause doesn't go on a second time").toHaveBeenCalledOnce();
  });

  it("while an AI is still being checked, Skip shows the cards; a check that runs out of time shows them with why", async () => {
    let fail: (error: unknown) => void = () => {};
    const base = f.api.getMockImplementation()!;
    f.api.mockImplementation((path: string, init?: { body?: string; method?: string; timeoutMs?: number }) => {
      if (path.endsWith("/check")) { expect(init?.timeoutMs).toBe(20_000); return new Promise((_, reject) => { fail = reject; }); }
      return base(path, init);
    });
    f.state = { ...f.state, instances: [claude(true, "testing")] };
    await show({ initialBeat: "ai" });
    expect(title()).toBe("Looking for an AI you already use");
    await press("Skip");
    expect(title()).toBe("Connect an AI");
    expect(document.body.querySelector("[data-funnel-ai=claude]")).not.toBeNull();

    await act(async () => root.unmount());
    root = createRoot(host);
    await show({ initialBeat: "ai" });
    expect(title()).toBe("Looking for an AI you already use");
    await act(async () => { fail(new DOMException("timed out", "TimeoutError")); });
    await settle();
    expect(title()).toBe("Connect an AI");
    expect(document.body.querySelector("[data-ai-silent]"), "says Claude didn't answer, with Check again").not.toBeNull();
  });

  it("shows every AI as a button with its name, and opens the picked one's own sign-in under the grid", async () => {
    f.state = { ...f.state, instances: nothingSignedIn() };
    await show();
    await press("Get started");
    expect(step()).toBe("ai");
    expect(title()).toBe("Connect an AI");
    expect([...document.body.querySelectorAll<HTMLElement>("[data-funnel-ai]")].map((tile) => tile.dataset.funnelAi)).toEqual(["chatgpt", "claude", "cursor", "copilot"]);
    expect(text()).toContain("ChatGPT");
    f.api.mockImplementation(async (path: string) => {
      if (path === "/api/instances?fresh=1") return { instances: f.state.instances };
      if (path === "/api/instances/claude/auth/start") return { auth: { phase: "waiting", flowId: "c1", authorizationUrl: "https://claude.ai/oauth/authorize?x=1" } };
      return {};
    });
    await press("Claude");
    expect(document.body.querySelector("[data-funnel-ai-connect=claude]")).not.toBeNull();
    expect(document.body.querySelector("[data-sign-in=paste]"), "the sign-in opened in the browser, the code goes here").not.toBeNull();
    expect(f.api).toHaveBeenCalledWith("/api/instances/claude/auth/start", expect.objectContaining({ method: "POST" }));
    await press("ChatGPT");
    expect(f.api, "picking another cancels the one under way").toHaveBeenCalledWith("/api/instances/claude/auth/cancel", expect.objectContaining({ method: "POST" }));
    expect(document.body.querySelector("[data-funnel-ai-connect=claude]")).toBeNull();
    await press("More providers or use an API key");
    expect(document.body.querySelector("[data-connect-ai]")).not.toBeNull();
    expect(document.body.querySelector("[data-connect-ai] h2")?.textContent, "it opens on every other provider").toBe("More providers or use an API key");
  });

  it("shows connected AIs as connected, not to be pressed again, with continue ready and more still to add", async () => {
    f.state = { ...f.state, instances: nothingSignedIn() };
    await show();
    await press("Get started");
    expect(button("Continue")?.disabled, "nothing connected yet: Continue waits, Set up later goes on").toBe(true);
    expect(button("Set up later")?.className).not.toContain("ui-button-primary");
    expect(document.body.querySelectorAll("[data-funnel-ai-continue], [data-funnel-later]")).toHaveLength(2);
    const focus = vi.fn(async () => true);
    vi.stubGlobal("duskDesktop", { focusWindow: focus });
    f.state = { ...f.state, instances: [cursor(true), { ...claude(true), instanceId: "chatgpt", driverKind: "codex", displayName: "ChatGPT plan" } as InstanceInfo, signedOut("claude", "claudeAgent", "Claude")] };
    await show();
    expect(title()).toBe("Connect an AI");
    const connected = [...document.body.querySelectorAll<HTMLElement>("[data-funnel-ai][data-connected]")].map((tile) => tile.dataset.funnelAi);
    expect(connected).toEqual(["chatgpt", "cursor"]);
    expect(document.body.querySelector("[data-funnel-ai=cursor]")?.tagName, "a connected AI is not a button").toBe("DIV");
    expect(document.body.querySelector("[data-funnel-ai=cursor]")?.textContent).toContain("Connected");
    expect(focus, "a sign-in that finished brings the app back").toHaveBeenCalled();
    expect(button("Set up later")).toBeUndefined();
    expect(button("Continue")?.className).toContain("ui-button-primary");
    expect(document.body.querySelector("button[data-funnel-ai=claude]"), "another can still be added").not.toBeNull();
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
  });

  it("set up later, or the free model, goes on; a found sign-in that didn't answer says why", async () => {
    f.state = { ...f.state, instances: [freeOpenCode, ...nothingSignedIn()] };
    await show();
    await press("Get started");
    expect(button("Start with the free model"), "Set up later starts on the free model instead").toBeUndefined();
    await press("Set up later");
    expect(f.onDone).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = createRoot(host);
    f.onDone.mockReset();
    f.state = { ...f.state, instances: [claude(true, "failed")] };
    await show({ initialBeat: "ai" });
    expect(document.body.querySelector("[role=alert]")?.textContent).toContain("Claude");
  });
});

describe("on the desktop app", () => {
  const desktop = (extra: Record<string, unknown> = {}) => vi.stubGlobal("duskDesktop", { remoteClient: { active: false }, requireUserPresence: async () => true, ...extra });

  it("opens a server from the app on its AI, without the hello the person already saw", async () => {
    desktop({ remoteClient: { active: true } });
    await show();
    expect(step()).toBe("ai");
    expect(document.body.querySelector("[data-funnel-progress]"), "one screen has no progress to show").toBeNull();
  });

  it("opens on the hello, then where bots live, the AI, what to bring and the chat, with back and progress", async () => {
    vi.stubEnv("VITE_DUSK_PHONE_APP", "0");
    desktop({ platform: "linux" });
    await show();
    expect(step(), "Meet dusk bot comes first").toBe("welcome");
    expect(title()).toBe("Meet dusk bot");
    await press("Get started");
    expect(step()).toBe("place");
    expect(title()).toBe("Where should your bots live?");
    expect(document.body.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("2/4");
    expect(text()).toContain("This computer");
    expect(text(), "never a Mac on Linux").not.toContain("Mac");
    expect(text()).toContain("dusk cloud");
    expect(text()).toContain("From $20 a month");
    await choose("[data-funnel-place=mac]");
    expect(document.querySelector("[data-panel-modal]"), "the free way never asks again").toBeNull();
    expect(document.body.querySelector("[data-help-improve]"), "only on the place step").toBeNull();
    await usesFoundAi();
    expect(step()).toBe("bring");
    expect(document.body.querySelector("[data-help-improve]"), "never on a later screen").toBeNull();
    await press("Back");
    expect(step()).toBe("ai");
    expect(document.body.querySelector("[data-funnel-ai=claude]")?.hasAttribute("data-connected"), "back on the step: the cards, Claude connected").toBe(true);
    await press("Continue");
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
    expect(document.body.querySelector(".phone-frame"), "the phone app is hidden").toBeNull();
  });

  it("with the phone app offered, as every release build now is, ends on the phone: a code to scan, then the chat", async () => {
    vi.stubEnv("VITE_DUSK_PHONE_APP", "");
    desktop({ platform: "linux" });
    await show({ initialBeat: "place" });
    expect(document.body.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("2/5");
    await choose("[data-funnel-place=mac]");
    expect(document.body.querySelector("[data-help-improve]"), "only on the place step").toBeNull();
    await usesFoundAi();
    expect(step()).toBe("bring");
    await press("Continue");
    expect(step()).toBe("phone");
    expect(document.body.querySelector(".phone-frame img"), "the phone app's own screen").not.toBeNull();
    expect(document.body.querySelector("[data-help-improve]"), "never on a later screen").toBeNull();
    expect(button("Skip")?.className, "skip is a real button").toContain("ui-button-lg");
    await press("Back");
    expect(step()).toBe("bring");
    await press("Continue");
    await press("Show the code");
    expect(document.body.querySelector("[data-phone-offer]")).not.toBeNull();
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith("maus");
  });

  it("this computer just goes on to the AI, with no dusk cloud sheet in between", async () => {
    desktop({ platform: "darwin", cloudAccount: { state: async () => ({ status: "signed-out" }), onState: () => () => {}, offer: vi.fn(async () => ({ plans: [{ tier: "starter", amount: 1500 }] })) } });
    await show({ initialBeat: "place" });
    await choose("[data-funnel-place=mac]");
    expect(document.querySelector("[data-panel-modal]")).toBeNull();
    expect(step()).toBe("ai");
  });

  it("a double click that opened the place step does not also choose there", async () => {
    desktop();
    await show();
    await toPlace();
    const second = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 });
    await act(async () => { document.body.querySelector<HTMLElement>("[data-funnel-place=mac]")!.dispatchEvent(second); });
    await settle();
    expect(step()).toBe("place");
    await choose("[data-funnel-place=mac]");
    expect(step()).toBe("ai");
  });

  const cloudBridge = (start: Record<string, unknown>) => {
    let listener: ((next: unknown) => void) | null = null;
    const bridge = {
      now: start as unknown,
      state: vi.fn(async () => bridge.now), refresh: vi.fn(async () => bridge.now), cancel: vi.fn(async () => bridge.now),
      onState: (cb: (next: unknown) => void) => { listener = cb; return () => {}; },
      continueInBrowser: vi.fn(async () => ({ outcome: "opened", state: bridge.now })),
      offer: vi.fn(async () => ({ plans: [{ tier: "starter", amount: 1500, trialDays: 7 }, { tier: "pro", amount: 2900, trialDays: 7 }], recommended: "pro" })),
      holdSignIns: vi.fn(async () => ({ outcome: "held" })), connectHome: vi.fn(async () => ({ status: "connected" })),
      tell: async (next: unknown) => { bridge.now = next; await act(async () => { listener?.(next); }); await settle(); },
    };
    return bridge;
  };

  it("dusk cloud's tile says only the free days while there is a trial", async () => {
    desktop({ cloudAccount: cloudBridge({ status: "connected", clouds: [] }) });
    await show();
    await toPlace();
    const tile = document.body.querySelector("[data-funnel-place=cloud]")!;
    expect(tile.textContent).toContain("7 days free");
    expect(tile.querySelector("[data-funnel-place-note]")).toBeNull();
  });

  it("dusk cloud goes straight to the browser with its intent and waits calmly; back and this Mac are one press away", async () => {
    const bridge = cloudBridge({ status: "signed-out" });
    bridge.continueInBrowser.mockImplementation(async () => { bridge.now = { status: "connecting" }; return { outcome: "browser", state: bridge.now }; });
    desktop({ cloudAccount: bridge });
    await show();
    await toPlace();
    await choose("[data-funnel-place=cloud]");
    expect(step()).toBe("checkout");
    expect(bridge.continueInBrowser).toHaveBeenCalledExactlyOnceWith({ kind: "upgrade", source: "app_onboarding", move: "computer" });
    expect(title()).toBe("Continue in your browser");
    expect(text()).toContain("Create your account, pick a plan and check out");
    expect(text()).toContain("Waiting for your sign-in");
    expect(document.body.querySelector("[data-funnel-checkout-price]"), "no price line while the browser asks for money").toBeNull();
    expect(text()).not.toContain("/month");
    expect(document.body.querySelector("[data-funnel-checkout-mac]")?.className, "this Mac is a light, small text link").toContain("text-ink-tertiary");
    expect(document.body.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress"), "welcome, place, checkout, ai, making").toBe("3/5");
    expect(text(), "no dash anywhere").not.toMatch(/\u2014/);
    await bridge.tell({ status: "connected", account: { email: "sam@qa.dusk.test" }, clouds: [] });
    expect(text(), "Signed in: the plan and checkout are what is left").toContain("Waiting for your checkout");
    expect(document.body.querySelector("[data-funnel-checkout-email]")?.textContent).toBe("Signed in as sam@qa.dusk.test.");
    await press("Open the page again");
    expect(bridge.continueInBrowser).toHaveBeenCalledTimes(2);
    await press("Back");
    expect(step()).toBe("place");
    await choose("[data-funnel-place=cloud]");
    await press("Use this computer instead");
    expect(step(), "this Mac's own steps, with no dead end").toBe("ai");
  });

  it("in strict mode (mounted twice) still hears the browser and the payment", async () => {
    const bridge = cloudBridge({ status: "connected", clouds: [] });
    desktop({ cloudAccount: bridge });
    await act(async () => { root.render(createElement(StrictMode, null, createElement(WelcomeFlow, { onDone: f.onDone }))); });
    await settle();
    await toPlace();
    await choose("[data-funnel-place=cloud]");
    expect(text()).toContain("Waiting for your checkout");
    await bridge.tell({ status: "connected", clouds: [{ id: "c1", primary: true, runsOn: "cloud", status: "setting_up" }] });
    expect(step()).toBe("ai");
  });

  it("a sign-in still waiting in the browser is let go when the person picks this Mac instead", async () => {
    const bridge = cloudBridge({ status: "signed-out" });
    bridge.continueInBrowser.mockImplementation(async () => { bridge.now = { status: "connecting" }; return { outcome: "browser", state: bridge.now }; });
    desktop({ cloudAccount: bridge });
    await show();
    await toPlace();
    await choose("[data-funnel-place=cloud]");
    await press("Use this computer instead");
    expect(bridge.cancel).toHaveBeenCalledOnce();
  });

  it("says so when the browser can't open, and offers the page again", async () => {
    const bridge = cloudBridge({ status: "signed-out" });
    bridge.continueInBrowser.mockImplementation(async () => { throw new Error("no browser"); });
    desktop({ cloudAccount: bridge });
    await show();
    await toPlace();
    await choose("[data-funnel-place=cloud]");
    expect(document.body.querySelector("[role=alert]")?.textContent).toContain("Your browser didn't open.");
    expect(button("Open the page again")).toBeDefined();
  });

  it("on dusk cloud: paid in the browser, the AI while the Cloud is made, its sign-ins held, and its chat once ready", async () => {
    const own = (status: string, extra: Record<string, unknown> = {}) => ({ status: "connected", clouds: [{ id: "c1", primary: true, runsOn: "cloud", status, origin: status === "ready" ? "https://c1.dusk.test" : null, ...extra }] });
    const bridge = cloudBridge({ status: "connected", clouds: [] });
    f.state = { ...f.state, instances: [freeOpenCode, ...nothingSignedIn()] };
    desktop({ cloudAccount: bridge });
    await show();
    await toPlace();
    await choose("[data-funnel-place=cloud]");
    expect(step()).toBe("checkout");
    expect(text(), "already signed in: the plan and checkout are what is left").toContain("Waiting for your checkout");
    await bridge.tell(own("setting_up", { setup: { step: "storage", progress: 0.4 } }));
    expect(step(), "paid: the app notices by itself and the AI comes next").toBe("ai");
    expect(text()).toContain("Your cloud is getting ready.");
    expect(document.body.querySelector("[data-funnel-back]"), "no way back to a purchase that is done").toBeNull();
    expect(document.body.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("4/5");
    await press("Set up later");
    expect(step()).toBe("making");
    expect(title()).toBe("Making your cloud");
    expect(document.body.querySelector("[data-funnel-making]")?.getAttribute("data-funnel-making")).toBe("setting-up");
    expect(document.body.querySelector("[aria-current=step]")?.textContent).toBe("Preparing storage");
    expect(bridge.holdSignIns).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem("dusk.onboarding.welcomeDraft")!), "a closed app comes back here").toMatchObject({ beat: "making", cloud: true });
    let up = false;
    vi.stubGlobal("fetch", vi.fn(async () => { if (!up) throw new TypeError("Failed to fetch"); return new Response(null); }));
    await bridge.tell(own("ready"));
    await settle();
    expect(title(), "ready at the Admin, but its page doesn't answer yet: still the last check, never a second setup screen").toBe("Making your cloud");
    expect(document.body.querySelector("[aria-current=step]")?.textContent).toBe("Checking it's ready");
    expect(bridge.connectHome).not.toHaveBeenCalled();
    up = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await settle();
    expect(bridge.connectHome).toHaveBeenCalledOnce();
    expect(f.onDone).toHaveBeenCalledOnce();
  });

  it("asks every first run for an account right after the hello, with a quiet Skip for now", async () => {
    desktop({ accountGate: { state: async () => ({ required: false, blocked: false, status: "signed-out" }), options: async () => ({ providers: ["google"], recovery: true }), onChange: () => () => {} } });
    await show();
    await press("Get started");
    expect(step(), "the account comes before where bots live").toBe("account");
    expect(title()).toBe("Create your dusk bot account");
    await press("Skip for now");
    expect(step()).toBe("place");
    await press("Back");
    expect(step()).toBe("account");
  });

  it("keeps Skip for now in the step's footer at full strength, out of the window's top corner", async () => {
    desktop({ accountGate: { state: async () => ({ required: false, blocked: false, status: "signed-out" }), options: async () => ({ providers: ["google"], recovery: true }), onChange: () => () => {} } });
    await show({ initialBeat: "account" });
    const skip = button("Skip for now")!;
    expect(skip.closest("[data-step-footer]"), "in the footer, where Windows' caption buttons can't cover it").not.toBeNull();
    expect(skip.className).not.toMatch(/opacity-|absolute/);
  });

  it("lets a browser sign-in that never comes back go on without an account, and still moves on when it does come back", async () => {
    const gate = {
      status: "signed-out", listeners: [] as Array<() => void>,
      state: vi.fn(async () => ({ required: false, blocked: false, status: gate.status, ...(gate.status === "connecting" ? { browser: "google" } : {}) })),
      options: vi.fn(async () => ({ providers: ["google"], recovery: true })),
      browser: vi.fn(async () => { gate.status = "connecting"; }), cancel: vi.fn(async () => ({})),
      onChange: (listener: () => void) => { gate.listeners.push(listener); return () => {}; },
    };
    desktop({ accountGate: gate });
    await show({ initialBeat: "account" });
    await press("Continue with Google");
    expect(text()).toContain("Waiting for your browser");
    expect(button("Continue without an account"), "a way on beside the waiting line").toBeDefined();
    await press("Continue without an account");
    expect(step()).toBe("place");
    expect(gate.cancel, "the sign-in is left to finish in the browser").not.toHaveBeenCalled();

    // the other way: they come back signed in, and the change event was missed; the window coming to the front reads it
    await press("Back");
    await press("Continue with Google");
    gate.status = "connected";
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(step()).toBe("place");
  });

  it("goes back to the sign-ins when the browser didn't open, instead of waiting for it", async () => {
    desktop({ accountGate: { state: async () => ({ required: false, blocked: false, status: "signed-out" }), options: async () => ({ providers: ["google"], recovery: true }),
      browser: async () => { throw new Error("no browser"); }, onChange: () => () => {} } });
    await show({ initialBeat: "account" });
    await press("Continue with Google");
    expect(text()).not.toContain("Waiting for your browser");
    expect(button("Continue with Google")).toBeDefined();
  });

  it("shows Google and Apple with the email from the first frame, never X, and only takes away what the service doesn't offer", async () => {
    let answer: (value: { providers: string[]; recovery: boolean }) => void = () => {};
    desktop({ accountGate: { state: async () => ({ required: false, blocked: false, status: "signed-out" }), options: () => new Promise((done) => { answer = done; }), onChange: () => () => {} } });
    await show({ initialBeat: "account" });
    expect(step()).toBe("account");
    const shown = () => [...document.body.querySelectorAll("[data-funnel-provider]")].map((one) => one.getAttribute("data-funnel-provider"));
    expect(shown(), "before the service has answered").toEqual(["google", "apple"]);
    expect(document.body.querySelector("input[type=email]")).not.toBeNull();
    await act(async () => { answer({ providers: ["google", "apple", "x"], recovery: true }); });
    await settle();
    expect(shown(), "nothing moves when the service agrees, and an X it still lists is not shown").toEqual(["google", "apple"]);
  });

  it("where the install requires an account, asks for it by Google or an emailed code, and goes on once signed in", async () => {
    const gate = {
      required: true, signedIn: false,
      state: vi.fn(async () => ({ required: gate.required, blocked: !gate.signedIn, status: gate.signedIn ? "connected" : "signed-out" })),
      options: vi.fn(async () => ({ providers: ["google"], recovery: true })),
      signInStart: vi.fn(async (email: string) => ({ outcome: "sent", email, expiresAt: Date.now() + 600_000, resendAt: Date.now() + 30_000, signupOpen: true })),
      signInVerify: vi.fn(async () => { gate.signedIn = true; return { outcome: "signed-in" }; }),
      signInCancel: vi.fn(async () => {}), browser: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})), reopen: vi.fn(), onChange: () => () => {},
    };
    vi.stubEnv("VITE_DUSK_PHONE_APP", "0");
    desktop({ accountGate: gate });
    await show();
    expect(step(), "the hello comes first").toBe("welcome");
    await press("Get started");
    expect(step()).toBe("account");
    expect(title()).toBe("Create your dusk bot account");
    expect(text(), "no phone in the pitch while its app is hidden").toContain("Already have one? Sign in the same way.");
    expect(text(), "no price claim in the pitch").not.toContain("Free.");
    expect(button("Continue with Google")).toBeDefined();
    expect(button("Skip for now"), "required here").toBeUndefined();
    await type(document.body.querySelector<HTMLInputElement>("input[type=email]")!, "person@example.com");
    await press("Email me a code");
    expect(gate.signInStart).toHaveBeenCalledWith("person@example.com");
    const digits = [...document.body.querySelectorAll<HTMLInputElement>("input")];
    for (const [index, digit] of digits.entries()) await type(digit, String(index + 1));
    await press("Sign in");
    expect(gate.signInVerify).toHaveBeenCalledWith("12345678");
    expect(step()).toBe("place");
  });

  it("never offers to go on without an account where the app needs one", async () => {
    desktop({ accountGate: { state: async () => ({ required: true, blocked: true, status: "signed-out" }), options: async () => ({ providers: [], recovery: false }), onChange: () => () => {} } });
    await show();
    await press("Get started");
    expect(step()).toBe("account");
    expect(button("Skip for now")).toBeUndefined();
    await key("Escape");
    expect(step()).toBe("account");
  });

});

describe("Dusk as the Chief", () => {
  it("makes Dusk the Chief only where there is none", async () => {
    f.state = { ...f.state, bots: [{ ...maus, chiefOfStaff: false }] };
    await show();
    await press("Get started");
    await usesFoundAi();
    expect(f.dispatch).toHaveBeenCalledWith({ type: "updateBot", botId: "maus", patch: { welcomed: true, chiefOfStaff: true } });
  });

  it("lands on no bot where another bot is already the Chief", async () => {
    f.state = { ...f.state, bots: [{ ...maus, chiefOfStaff: false }, { ...maus, id: "research", threadId: "r", name: "Research", defaultBot: undefined, chiefOfStaff: true }] };
    await show();
    await press("Get started");
    await usesFoundAi();
    expect(f.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "updateBot" }));
    expect(f.onDone).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe("other first runs", () => {
  it("a replay from Settings records nothing about a first chat", async () => {
    f.state = { ...f.state, config: { onboarding: { ...EMPTY_ONBOARDING, completedAt: "2026-09-01T00:00:00.000Z", version: WELCOME_VERSION } } };
    await show({ replay: true });
    await press("Get started");
    await usesFoundAi();
    await act(async () => {});
    expect(f.onDone).toHaveBeenCalledOnce();
    expect(saved()[0].onboarding).not.toHaveProperty("hintsSeen");
    expect(introStaged("maus"), "a replay lands in a chat that may be long under way").toBe(false);
  });
});

describe("the bring step: one prompt to copy", () => {
  const molty = { source: "openclaw", app: "OpenClaw", where: "~/.openclaw", channels: ["telegram"], unreadable: [], bots: [{
    name: "Molty", title: "", description: "", instructions: "Be helpful.", memories: ["Sam's sister is Ana."], userFacts: [], skills: [], routines: [], apps: [],
  }] };
  const desktop = () => {
    vi.stubGlobal("duskDesktop", { remoteClient: { active: false } });
    const base = f.api.getMockImplementation()!;
    f.api.mockImplementation(async (path: string, init?: { body?: string; method?: string }) => {
      if (path === "/api/setup-import/bots") return { apps: [molty] };
      if (path === "/api/setup-import") return { skills: [{ name: "pdf", source: "claudeCode" }], tools: [],
        memory: [{ source: "claudeCode", files: 6, notes: 18, topics: { preferences: true, aboutYou: true, workStyle: true, projects: 3 } }], usage: { claudeCode: 22 } };
      return base(path, init);
    });
  };

  it("is the prompt and its three steps, whatever this computer holds: no app rows, no AI to pick, no answer box", async () => {
    vi.stubEnv("VITE_DUSK_PHONE_APP", "0");
    desktop();
    await show({ initialBeat: "bring" });
    expect(step()).toBe("bring");
    expect(title()).toBe("Bring what you already use");
    expect(text()).toContain("Grok bot, ChatGPT, Claude and Gemini already know a lot about you. Bring it here in three steps.");
    expect([...document.body.querySelectorAll("[data-bring-prompt] ol li")].map((li) => li.textContent)).toEqual([
      "1Copy the prompt.", "2Paste it into Grok bot, ChatGPT, Claude, Gemini or any other AI.", "3It makes one file. Paste or drop it into any bot here and everything gets set up.",
    ]);
    expect(document.body.querySelector("[data-bring-find], [data-bring-hero], [data-bring-looking]"), "what this computer holds waits in Settings").toBeNull();
    expect(document.body.querySelector("[data-bring-ai], [data-bring-paste], textarea"), "no AI to pick, no answer box").toBeNull();
    expect(f.api.mock.calls.filter(([path]) => path === "/api/setup-import"), "nothing here is looked through for the step").toEqual([]);
    const see = document.body.querySelector<HTMLButtonElement>("[data-bring-see]")!;
    expect(see.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.querySelector("[data-bring-prompt] pre")?.textContent, "the prompt asks for the notes file").toContain("dusk-bot-notes");
    expect(document.body.querySelectorAll("[data-primary]"), "Continue is the one primary action").toHaveLength(1);
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledOnce();
  });

  it("copies the prompt, says so, and the first bot's chat starts waiting for the answer", async () => {
    vi.stubEnv("VITE_DUSK_PHONE_APP", "0");
    desktop();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await show({ initialBeat: "bring" });
    expect(notesWaiting()).toBeNull();
    await press("Copy the prompt");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("dusk-bot-notes.md"));
    expect(document.body.querySelector("[data-bring-copied]")?.textContent).toBe("Copied. Paste it into that AI, then paste or drop its file into any bot here.");
    expect(button("Copied"), "the button says it too").toBeTruthy();
    expect(notesWaiting(), "the waiting line above the first bot's message box").not.toBeNull();
    await press("Continue");
    expect(f.onDone).toHaveBeenCalledOnce();
  });

  it("says so when the prompt couldn't be copied", async () => {
    desktop();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    await show({ initialBeat: "bring" });
    await press("Copy the prompt");
    expect(document.body.querySelector("[data-bring-copied]")?.textContent).toBe("Couldn't copy the prompt. Try again.");
    expect(notesWaiting()).toBeNull();
  });
});

describe("the funnel's back button", () => {
  it("starts clear of macOS's traffic lights, and in the corner elsewhere", async () => {
    const { FunnelBar } = await import("./FunnelSteps");
    const { DesktopCapabilitiesProvider } = await import("../DesktopCapabilities");
    const { cacheDesktopCapabilities, initialDesktopCapabilities } = await import("@/lib/desktop");
    const backAt = async (platform: string | null) => {
      vi.stubGlobal("duskDesktop", platform ? { platform, getCapabilities: async () => initialDesktopCapabilities() } : undefined);
      cacheDesktopCapabilities(initialDesktopCapabilities());
      await act(async () => { root.render(createElement(DesktopCapabilitiesProvider, null, createElement(FunnelBar, { at: 1, count: 3, onBack: () => {} }))); });
      await settle();
      return document.body.querySelector<HTMLElement>("[data-funnel-back]")!.getAttribute("data-funnel-back");
    };
    expect(await backAt("darwin")).toBe("clear-of-traffic-lights");
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(await backAt("win32"), "Windows keeps its caption buttons on the right").toBe("");
  });
});

describe("the Cofactory first run", () => {
  const posted = (path: string) => f.api.mock.calls.filter(([at, init]) => at === path && init?.method === "POST").map(([, init]) => JSON.parse(init.body));

  beforeEach(() => {
    vi.stubEnv("VITE_COFACTORY", "");
    vi.stubEnv("VITE_DUSK_PHONE_APP", "0");
    vi.stubGlobal("duskDesktop", { remoteClient: { active: false }, requireUserPresence: async () => true, platform: "linux" });
    const base = f.api.getMockImplementation()!;
    f.api.mockImplementation(async (path: string, init?: { body?: string; method?: string }) => {
      if (path === "/api/cofactory/settings" && !init?.method) return { settings: { country: null, region: null, budgetCents: 0, companyCapCents: 0, allocation: "dynamic", closeAfterDays: 5, approvals: { launch: "ask", spendOverCents: 2_500, kill: "tell" }, hunches: [], never: [] }, relatedParties: { emails: [], domains: [] } };
      if (path === "/api/cofactory/factory/open") return { ok: true, staffed: [{ role: "lead", botId: "lead-1", created: true }, { role: "scout", botId: "scout-1", created: true }], territories: ["Roofing Contractors (NAICS 238160)", "Funeral Homes and Funeral Services (NAICS 812210)", "Dental Laboratories (NAICS 339116)", "Marinas (NAICS 713930)"] };
      if (path.startsWith("/api/cofactory/")) return { ok: true };
      return base(path, init);
    });
  });

  it("asks only what the factory can't work out itself, saves each answer, and opens on the territories it picked", async () => {
    await show();
    expect(title()).toBe("Meet Cofactory");
    await press("Get started");
    expect(step(), "no dusk account, dusk cloud or dusk phone app: those would show dusk's name").toBe("ai");
    await usesFoundAi();
    expect(step(), "nothing about what the owner knows: the factory finds its own niches").toBe("where");
    expect(document.body.querySelector("[data-funnel-progress]")?.getAttribute("data-funnel-progress")).toBe("3/7");
    expect(button("Continue")?.disabled, "not until a country is chosen").toBe(true);
    const country = document.body.querySelector<HTMLSelectElement>("[data-where-country]")!;
    await act(async () => { country.value = "US"; country.dispatchEvent(new Event("change", { bubbles: true })); });
    await press("Continue");
    expect(posted("/api/cofactory/settings")).toContainEqual({ country: "US", region: null });

    expect(step()).toBe("stake");
    expect(title()).toBe("Fund your factory");
    expect(document.body.querySelector("[data-stake-summary]")?.textContent, "the factory decides by default").toContain("Each new company starts with up to $50, so about 10 can run at once");
    expect(document.body.querySelector("[data-stake-summary]")?.textContent).toContain("No paying customer in 5 days and it's closed");
    await choose("[data-stake-split=fixed]");
    expect(document.body.querySelector("[data-stake-summary]")?.textContent).toContain("Up to 10 companies at a time, $50 each");
    await choose("[data-stake-split=dynamic]");
    await choose("[data-stake-days='7']");
    await press("Continue");
    expect(posted("/api/cofactory/settings")).toContainEqual({ budgetCents: 50_000, allocation: "dynamic", closeAfterDays: 7 });

    expect(step(), "an optional hunch, skipped by most").toBe("hunch");
    await press("Skip");
    expect(posted("/api/cofactory/settings").some((body) => "hunches" in body), "a skip saves nothing").toBe(false);

    expect(step()).toBe("approvals");
    expect(text(), "contacting real people can never be switched off").toContain("Always");
    await press("Continue");
    expect(posted("/api/cofactory/settings")).toContainEqual({ approvals: { launch: "ask", spendOverCents: 2_500, kill: "tell" } });

    expect(step()).toBe("opening");
    expect(document.body.querySelector("[data-permission=accessibility]"), "company seats never drive the owner's computer").toBeNull();
    expect(title(), "the crew arrives one by one").toBe("Opening your factory");
    for (let tick = 0; tick < 4; tick++) await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await settle();
    expect(title()).toBe("Your factory is open");
    expect(document.body.querySelector("[data-opening-territories]")?.textContent).toBe("Roofing ContractorsFuneral Homes and Funeral ServicesDental LaboratoriesPlus 1 more");
    expect(posted("/api/cofactory/factory/open")).toHaveLength(1);
    await press("See your first companies");
    expect(f.onDone, "the first run ends on the companies to pick, not a chat").toHaveBeenCalledExactlyOnceWith(null);
    expect(factoryHomeShown()).toBe(true);
  });

  it("keeps a hunch and a hard no when the owner gives them", async () => {
    await show({ initialBeat: "hunch" });
    const [first, never] = [...document.body.querySelectorAll<HTMLInputElement>("input")];
    await type(first!, "DIR fee recovery for one-store pharmacies");
    await act(async () => { first!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await type(never!, "Anything with medical advice");
    await act(async () => { never!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await settle();
    expect(button("Skip"), "nothing to skip once something is written").toBeUndefined();
    await press("Continue");
    expect(posted("/api/cofactory/settings")).toContainEqual({ hunches: ["DIR fee recovery for one-store pharmacies"], never: ["Anything with medical advice"] });
  });
});

describe("the notifications step in React's StrictMode", () => {
  it("reads the Mac's permissions and lets Allow be pressed, though StrictMode mounts the step twice", async () => {
    vi.stubEnv("VITE_COFACTORY", "");
    let notifications: "missing" | "granted" = "missing";
    const status = async () => ({ supported: true as const, accessibility: "granted" as const, screen: "granted" as const, notifications });
    const request = vi.fn(async () => { notifications = "granted"; return status(); });
    vi.stubGlobal("duskDesktop", { remoteClient: { active: false }, requireUserPresence: async () => true, platform: "darwin", macPermissions: { status, request } });
    await act(async () => { root.render(createElement(StrictMode, null, createElement(WelcomeFlow, { onDone: f.onDone, initialBeat: "notify" }))); });
    await settle();
    const allow = document.body.querySelector<HTMLButtonElement>("[data-permission-ask=notifications]");
    expect(allow?.disabled, "the read status reaches the step").toBe(false);
    await act(async () => { allow!.click(); });
    await settle();
    expect(request).toHaveBeenCalledWith("notifications", expect.objectContaining({ title: expect.any(String) }));
    expect(document.body.querySelector("[data-permission=notifications]")?.getAttribute("data-permission-state")).toBe("granted");
  });
});
