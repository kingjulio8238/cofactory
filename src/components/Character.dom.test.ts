// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllEnvs(); vi.resetModules(); });

async function render(element: () => Promise<unknown>, props: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.append(host);
  const type = await element();
  flushSync(() => createRoot(host).render(createElement(type as Parameters<typeof createElement>[0], props)));
  return host;
}

describe("bot avatars in Cofactory", () => {
  it("draws a bot as its character: its colour as the shell, its body as the shape, its state in the face", async () => {
    vi.stubEnv("VITE_COFACTORY", "");
    const host = await render(async () => (await import("./Avatar")).BotAvatar, { bot: { id: "b1", name: "Factory scout", color: "red", mascotBody: "sprout" }, size: 32, state: "searching" });
    const character = host.querySelector("[data-character]");
    expect(character?.getAttribute("data-character")).toBe("sprout");
    expect(character?.getAttribute("data-character-state")).toBe("thinking");
    expect(character?.getAttribute("aria-label")).toBe("Factory scout");
    expect(host.innerHTML).toContain("#E8835A");
  });

  it("keeps dusk bot's own marks when Cofactory is off", async () => {
    vi.stubEnv("VITE_COFACTORY", "0");
    const host = await render(async () => (await import("./Avatar")).MausAvatar, { color: "red", size: 32 });
    expect(host.querySelector("[data-character]")).toBeNull();
  });
});
