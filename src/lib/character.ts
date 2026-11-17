// Cofactory's agent characters (the agent-characters design package's renderer, src/bot.mjs, ported): a body, a dark
// visor and two eyes, in a 200 by 200 box with the ground at y 188. One pure description of the drawing feeds both the
// app's inline SVG (components/Character.tsx) and the icon build (scripts/make-cofactory-icons.mjs).

export const CHARACTER_BASES = ["dome", "pebble", "bell", "capsule", "loaf", "bulb", "tower", "mochi", "egg", "bean", "puck", "bear", "sprout", "nubs", "peanut", "cube"] as const;
export type CharacterBase = (typeof CHARACTER_BASES)[number];
export const CHARACTER_STATES = ["idle", "thinking", "working", "needs", "blocked", "done"] as const;
export type CharacterState = (typeof CHARACTER_STATES)[number];

/** The Studio theme: the brand's default look and its eight shells. */
export const STUDIO = {
  background: "#EFEAE1", visor: "#1B1A18", eyes: "#FFFFFF",
  shells: { cream: "#F4EFE6", sand: "#E9D9C4", peach: "#F2B9A0", clay: "#E8835A", sage: "#9FC6A8", sky: "#8DB8D8", lilac: "#B9A6D9", charcoal: "#3A3733" },
} as const;

const fmt = (v: number) => Math.round(v * 100) / 100;
const circ = (cx: number, cy: number, r: number) => `M${fmt(cx - r)} ${fmt(cy)} A${r} ${r} 0 1 1 ${fmt(cx + r)} ${fmt(cy)} A${r} ${r} 0 1 1 ${fmt(cx - r)} ${fmt(cy)} Z`;
const rrect = (x: number, y: number, w: number, h: number, r: number) => `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;

/** A colour darkened by `f` (0 to 1). */
export function shade(hex: string, f: number): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels.map((v) => Math.max(0, Math.round(v * (1 - f))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const PEB = "M100 32 C142 32 160 54 164 92 C168 130 170 152 166 168 C162 182 150 188 100 188 C50 188 38 182 34 168 C30 152 32 130 36 92 C40 54 58 32 100 32 Z";
/** Each body: its outline, the visor's centre and size, and where the darker sole band starts. */
const GEOMETRY: Record<CharacterBase, { d: string; vy: number; vw: number; vh: number; sole: number }> = {
  pebble: { d: PEB, vy: 104, vw: 100, vh: 64, sole: 160 },
  bell: { d: "M100 30 C130 30 144 52 146 82 C148 118 160 150 178 172 C182 180 176 188 166 188 H34 C24 188 18 180 22 172 C40 150 52 118 54 82 C56 52 70 30 100 30 Z", vy: 92, vw: 88, vh: 54, sole: 170 },
  dome: { d: "M30 188 C22 188 20 180 20 172 C20 96 52 34 100 34 C148 34 180 96 180 172 C180 180 178 188 170 188 Z", vy: 108, vw: 112, vh: 62, sole: 166 },
  capsule: { d: rrect(52, 18, 96, 170, 48), vy: 78, vw: 80, vh: 52, sole: 166 },
  loaf: { d: "M36 188 C24 188 20 180 20 168 V112 C20 80 48 62 76 66 C88 52 112 52 124 66 C152 62 180 80 180 112 V168 C180 180 176 188 164 188 Z", vy: 124, vw: 116, vh: 54, sole: 170 },
  bulb: { d: `${circ(100, 84, 64)} ${rrect(62, 128, 76, 60, 22)}`, vy: 88, vw: 100, vh: 58, sole: 170 },
  tower: { d: "M66 18 H134 C152 18 160 28 160 46 L166 166 C167 180 160 188 146 188 H54 C40 188 33 180 34 166 L40 46 C40 28 48 18 66 18 Z", vy: 72, vw: 92, vh: 54, sole: 166 },
  mochi: { d: "M100 74 C156 74 188 116 186 160 C185 180 172 188 150 188 H50 C28 188 15 180 14 160 C12 116 44 74 100 74 Z", vy: 130, vw: 104, vh: 50, sole: 172 },
  egg: { d: "M100 22 C140 22 164 76 164 122 C164 164 138 188 100 188 C62 188 36 164 36 122 C36 76 60 22 100 22 Z", vy: 112, vw: 96, vh: 58, sole: 168 },
  bean: { d: rrect(16, 72, 168, 116, 58), vy: 126, vw: 120, vh: 54, sole: 168 },
  puck: { d: "M100 96 C160 96 188 120 188 150 C188 176 170 188 140 188 H60 C30 188 12 176 12 150 C12 120 40 96 100 96 Z", vy: 146, vw: 112, vh: 42, sole: 176 },
  bear: { d: `${PEB} ${circ(54, 48, 20)} ${circ(146, 48, 20)}`, vy: 104, vw: 100, vh: 64, sole: 160 },
  sprout: { d: `${PEB} ${rrect(96, 12, 8, 26, 4)} ${circ(100, 14, 10)}`, vy: 104, vw: 100, vh: 64, sole: 160 },
  nubs: { d: `${PEB} ${rrect(16, 112, 30, 22, 11)} ${rrect(154, 112, 30, 22, 11)}`, vy: 104, vw: 100, vh: 64, sole: 160 },
  peanut: { d: `${circ(100, 70, 52)} ${rrect(44, 108, 112, 80, 40)}`, vy: 72, vw: 80, vh: 46, sole: 172 },
  cube: { d: rrect(28, 40, 144, 148, 30), vy: 104, vw: 108, vh: 60, sole: 166 },
};

/** Each body's extent (left, top, right; every body stands on y 188), so a slot can frame the body rather than the box. */
const BOUNDS: Record<CharacterBase, [number, number, number]> = {
  dome: [20, 34, 180], pebble: [32, 32, 168], bell: [18, 30, 182], capsule: [52, 18, 148], loaf: [20, 52, 180], bulb: [36, 20, 164],
  tower: [33, 18, 167], mochi: [12, 74, 188], egg: [36, 22, 164], bean: [16, 72, 184], puck: [12, 96, 188], bear: [32, 28, 168],
  sprout: [32, 4, 168], nubs: [16, 32, 184], peanut: [44, 18, 156], cube: [28, 40, 172],
};

/** A square box around the body with room for its outline: wide bodies fill the width, tall ones the height. */
function frame(base: CharacterBase): string {
  const [left, top, right] = BOUNDS[base];
  const pad = 8;
  const side = Math.max(right - left, 188 - top) + pad * 2;
  const cx = (left + right) / 2, cy = (top + 188) / 2;
  return `${fmt(cx - side / 2)} ${fmt(cy - side / 2)} ${fmt(side)} ${fmt(side)}`;
}

/** Eye shape and motion per state; w and h are the eye's size at a 64-unit visor, dx and dy shift the gaze. */
const STATE_SPEC: Record<CharacterState, { w: number; h: number; dx: number; dy: number; motion: string; blink: boolean; scan?: boolean; droop?: boolean; happy?: boolean }> = {
  idle: { w: 15, h: 22, dx: 0, dy: 0, motion: "cf-bob", blink: true },
  thinking: { w: 15, h: 22, dx: 5, dy: -5, motion: "cf-bob", blink: true, scan: true },
  working: { w: 18, h: 10, dx: 0, dy: 2, motion: "cf-bob cf-fast", blink: false },
  needs: { w: 18, h: 27, dx: 0, dy: 0, motion: "cf-hop", blink: true },
  blocked: { w: 18, h: 4, dx: 0, dy: 6, motion: "", blink: false, droop: true },
  done: { w: 15, h: 22, dx: 0, dy: 0, motion: "cf-bob", blink: false, happy: true },
};

export interface CharacterConfig {
  base: CharacterBase;
  shell: string;
  state?: CharacterState;
  visor?: string;
  eyes?: string;
  /** Rendered size in pixels: small characters get a heavier outline and a bigger face so they stay legible. */
  size?: number;
  /** Where the eyes look, each axis from -1 to 1 (a pointer over the character). */
  gaze?: { x: number; y: number } | null;
  /** Leave out the motion classes (a still mark, an exported image). */
  still?: boolean;
}

export interface CharacterDrawing {
  /** The box around the body, framed to the body so every character fills its slot like a mark. */
  viewBox: string;
  body: string;
  shell: string;
  outline: { color: string; width: number };
  sole: { y: number; color: string };
  visor: { x: number; y: number; width: number; height: number; rx: number; color: string };
  eyes: { kind: "open"; rects: Array<{ x: number; y: number; width: number; height: number; rx: number }>; color: string; blink: boolean; scan: boolean }
    | { kind: "happy"; d: string; color: string; width: number };
  motion: string;
  lean: string;
}

/** The drawing for one character, as plain numbers and paths. */
export function characterDrawing(config: CharacterConfig): CharacterDrawing {
  const geometry = GEOMETRY[config.base] ?? GEOMETRY.dome;
  const state = config.state ?? "idle";
  const spec = STATE_SPEC[state];
  const size = config.size ?? 200;
  // under ~48px the 3-unit outline thins to nothing and the face gets lost: thicken one, enlarge the other
  const small = size < 48;
  const tiny = size < 28;
  const visorScale = tiny ? 1.12 : small ? 1.06 : 1;
  const eyeScale = tiny ? 1.3 : small ? 1.15 : 1;
  const vh = geometry.vh * visorScale;
  const vw = geometry.vw * visorScale;
  const vx = 100 - vw / 2;
  const vy = geometry.vy - vh / 2;
  const k = (geometry.vh / 64) * eyeScale;
  const gx = Math.max(-1, Math.min(1, config.gaze?.x ?? 0)) * 6 * k;
  const gy = Math.max(-1, Math.min(1, config.gaze?.y ?? 0)) * 4 * k;
  const cx = 100 + spec.dx * k + gx;
  const cy = geometry.vy + spec.dy * k + gy;
  const ew = spec.w * k, eh = spec.h * k;
  const sep = 18 * (geometry.vh / 64) * eyeScale;
  const rx = Math.min(7 * k, eh / 2);
  const eyesColor = config.eyes ?? STUDIO.eyes;
  const arc = (x: number) => `M${fmt(x - 8 * k)} ${fmt(cy + 5 * k)} Q${fmt(x)} ${fmt(cy - 8 * k)} ${fmt(x + 8 * k)} ${fmt(cy + 5 * k)}`;
  return {
    viewBox: frame(GEOMETRY[config.base] ? config.base : "dome"),
    body: geometry.d,
    shell: config.shell,
    outline: { color: shade(config.shell, 0.16), width: tiny ? 9 : small ? 6 : 3 },
    sole: { y: geometry.sole, color: shade(config.shell, 0.08) },
    visor: { x: fmt(vx), y: fmt(vy), width: fmt(vw), height: fmt(vh), rx: fmt(vh * 0.47), color: config.visor ?? STUDIO.visor },
    eyes: spec.happy
      ? { kind: "happy", d: `${arc(cx - sep)} ${arc(cx + sep)}`, color: eyesColor, width: tiny ? 8 : 5 }
      : { kind: "open", color: eyesColor, blink: spec.blink && !config.still, scan: Boolean(spec.scan) && !config.still,
        rects: [cx - sep, cx + sep].map((x) => ({ x: fmt(x - ew / 2), y: fmt(cy - eh / 2), width: fmt(ew), height: fmt(eh), rx: fmt(rx) })) },
    motion: config.still ? "" : spec.motion,
    lean: spec.droop ? "rotate(-5 100 188)" : "",
  };
}

/** The same character as a standalone SVG string, for icons and exported images. */
export function characterSvg(config: CharacterConfig & { id?: string }, frame: { size?: number; x?: number; y?: number } = {}): string {
  const drawing = characterDrawing({ ...config, still: true });
  const id = config.id ?? "character";
  const eyes = drawing.eyes.kind === "happy"
    ? `<path d="${drawing.eyes.d}" fill="none" stroke="${drawing.eyes.color}" stroke-width="${drawing.eyes.width}" stroke-linecap="round"/>`
    : drawing.eyes.rects.map((rect) => `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rect.rx}" fill="${drawing.eyes.color}"/>`).join("");
  const size = frame.size ?? 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" x="${frame.x ?? 0}" y="${frame.y ?? 0}" width="${size}" height="${size}" viewBox="${drawing.viewBox}">`
    + `<defs><clipPath id="${id}-clip"><path d="${drawing.body}"/></clipPath></defs><g transform="${drawing.lean}">`
    + `<path d="${drawing.body}" fill="none" stroke="${drawing.outline.color}" stroke-width="${drawing.outline.width}" stroke-linejoin="round"/>`
    + `<path d="${drawing.body}" fill="${drawing.shell}"/>`
    + `<rect x="0" y="${drawing.sole.y}" width="200" height="60" fill="${drawing.sole.color}" clip-path="url(#${id}-clip)"/>`
    + `<rect x="${drawing.visor.x}" y="${drawing.visor.y}" width="${drawing.visor.width}" height="${drawing.visor.height}" rx="${drawing.visor.rx}" fill="${drawing.visor.color}"/>`
    + `${eyes}</g></svg>`;
}
