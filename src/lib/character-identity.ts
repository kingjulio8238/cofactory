// Which character a bot is: its dusk colour picks the shell, its dusk body picks the shape, its mascot state picks the
// face and motion. So every bot keeps its own look, and the pickers and states dusk already has go on working.
import { CHARACTER_BASES, STUDIO, type CharacterBase, type CharacterState } from "./character";
import type { MausColor, MausState } from "./mascot";

/** Each of dusk's 13 bot colours as a shell from the character package's palettes (Studio first, then its siblings). */
export const SHELL_FOR_COLOR: Record<MausColor, string> = {
  chrome: STUDIO.shells.cream,
  silver: "#D7E6EF",
  green: STUDIO.shells.sage,
  teal: "#9BD8C9",
  cyan: "#A9CBE0",
  blue: STUDIO.shells.sky,
  purple: STUDIO.shells.lilac,
  pink: "#FF9FD0",
  red: STUDIO.shells.clay,
  coral: STUDIO.shells.peach,
  orange: "#FFC23D",
  yellow: "#FFE27A",
  brown: STUDIO.shells.sand,
};

/** Each of dusk's bodies as a character shape. */
const BASE_FOR_BODY: Record<string, CharacterBase> = {
  kit: "dome", pip: "pebble", hop: "bean", bruin: "bear", boo: "bell", mochi: "mochi", loaf: "loaf", cheep: "bulb", ribbit: "puck",
  goo: "capsule", puff: "nubs", sprout: "sprout", drip: "tower", hearty: "peanut", starry: "bulb", hoot: "egg", boxo: "cube", egg: "egg",
  wisp: "capsule", tofu: "cube",
  pumpkin: "puck", ghost: "bell", witch: "tower", bat: "nubs", cat: "bear", skull: "egg", monster: "loaf", mummy: "capsule", vampire: "pebble", spider: "bean",
};

/** The shape for a body a bot chose; a bot that never chose one gets a shape of its own from its id, so a crew varies. */
export function characterBase(bodyId: string | null | undefined, seed?: string): CharacterBase {
  if (bodyId && BASE_FOR_BODY[bodyId]) return BASE_FOR_BODY[bodyId];
  if (!seed) return "dome";
  let hash = 0x811c9dc5;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return CHARACTER_BASES[hash % CHARACTER_BASES.length]!;
}

const THINKING = new Set<MausState>(["thinking", "searching", "curious", "confused", "listening", "radar", "orbit", "dictating", "writing", "suspicious"]);
const WORKING = new Set<MausState>(["working", "loading", "progress", "humming", "uploading", "sending", "receiving", "bouncing", "dragging", "spawning"]);
const NEEDS = new Set<MausState>(["alerting", "notifying", "excited", "surprised", "scared", "waking"]);
const BLOCKED = new Set<MausState>(["sad", "angry", "powering-down"]);
const DONE = new Set<MausState>(["happy", "proud", "celebrate", "laughing", "playful", "shy"]);

/** A dusk mascot state as one of the character's six. */
export function characterState(state: MausState | undefined): CharacterState {
  if (!state) return "idle";
  if (THINKING.has(state)) return "thinking";
  if (WORKING.has(state)) return "working";
  if (NEEDS.has(state)) return "needs";
  if (BLOCKED.has(state)) return "blocked";
  if (DONE.has(state)) return "done";
  return "idle";
}
