import { describe, expect, it } from "vitest";

import { CHARACTER_BASES, characterDrawing, characterSvg } from "./character";
import { characterBase, characterState, SHELL_FOR_COLOR } from "./character-identity";

describe("Cofactory's characters", () => {
  it("draws every base, framed to its body, with a heavier outline and bigger face when small", () => {
    for (const base of CHARACTER_BASES) {
      const big = characterDrawing({ base, shell: "#F4EFE6", size: 200 });
      const small = characterDrawing({ base, shell: "#F4EFE6", size: 24 });
      expect(big.viewBox.split(" ")).toHaveLength(4);
      expect(small.outline.width).toBeGreaterThan(big.outline.width);
      expect(small.visor.width).toBeGreaterThan(big.visor.width);
    }
    const puck = characterDrawing({ base: "puck", shell: "#F4EFE6" }).viewBox.split(" ").map(Number);
    expect(puck[1], "a short body is framed lower, so it fills its slot").toBeGreaterThan(40);
  });

  it("shows each state in its eyes and motion, and stays still when asked", () => {
    expect(characterDrawing({ base: "dome", shell: "#F4EFE6", state: "done" }).eyes.kind).toBe("happy");
    expect(characterDrawing({ base: "dome", shell: "#F4EFE6", state: "needs" }).motion).toBe("cf-hop");
    expect(characterDrawing({ base: "dome", shell: "#F4EFE6", state: "blocked" }).lean).toContain("rotate(-5");
    expect(characterDrawing({ base: "dome", shell: "#F4EFE6", still: true }).motion).toBe("");
    expect(characterSvg({ base: "sprout", shell: "#E8835A" })).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("gives every dusk colour a shell, keeps a chosen body, and varies bots that never chose one", () => {
    expect(Object.keys(SHELL_FOR_COLOR)).toHaveLength(13);
    expect(characterBase("sprout")).toBe("sprout");
    expect(characterBase("drip")).toBe("tower");
    const seeded = new Set(["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"].map((id) => characterBase(undefined, id)));
    expect(seeded.size, "a crew of bots without a chosen body is not all one shape").toBeGreaterThan(3);
    expect(characterBase(undefined)).toBe("dome");
    expect(characterState("searching")).toBe("thinking");
    expect(characterState("alerting")).toBe("needs");
    expect(characterState("celebrate")).toBe("done");
    expect(characterState("sleeping")).toBe("idle");
  });
});
