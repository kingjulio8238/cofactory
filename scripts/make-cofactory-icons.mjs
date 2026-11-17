// node --experimental-strip-types scripts/make-cofactory-icons.mjs: the desktop, tray and web icons and the startup
// screen's crew, all drawn from Cofactory's agent character (src/lib/character.ts). macOS only (iconutil).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

import { characterDrawing, characterSvg, STUDIO } from "../src/lib/character.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const png = (source, size) => new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
function write(path, bytes) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  console.log(path);
}

// the mark: the brand's default character, a cream dome, on a clay tile
const TILE = STUDIO.shells.clay;
const MARK = { base: "dome", shell: STUDIO.shells.cream, state: "idle" };
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
/** The character standing on a rounded tile, its body filling about 70% of the tile. */
const tile = ({ size, x = 0, y = 0, radius }) => {
  const body = Math.round(size * 0.72);
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${TILE}"/>`
    + characterSvg({ ...MARK, size: Math.max(body, 64), id: `mark${size}` }, { size: body, x: x + (size - body) / 2, y: y + size - body - size * 0.06 });
};

// apple's macOS icon grid: the artwork is an 824 px rounded square centred in 1024
const MAC = svg(1024, 1024, `<title>Cofactory</title>${tile({ size: 824, x: 100, y: 100, radius: 185 })}`);
const FULL = svg(1024, 1024, tile({ size: 1024, radius: 0 }));
const FAVICON = svg(64, 64, `<title>Cofactory</title>${tile({ size: 64, radius: 14 })}`);

write("build/icon.svg", `${MAC}\n`);
write("build/icon-1024.png", png(MAC, 1024));
write("electron/resources/app-icon.png", png(MAC, 1024));
const iconset = join(root, "build/icon.iconset");
for (const base of [16, 32, 64, 128, 256, 512]) {
  write(`build/icon.iconset/icon_${base}x${base}.png`, png(MAC, base));
  write(`build/icon.iconset/icon_${base}x${base}@2x.png`, png(MAC, base * 2));
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(root, "build/icon.icns")]);
console.log("build/icon.icns");

// png-in-ico: a 6 byte header, a 16 byte entry per image, then the pngs; 256 is written as 0
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head[at] = size >= 256 ? 0 : size;
    head[at + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((image) => image.data)]);
}
write("build/icon.ico", ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(MAC, size) }))));

// a macOS template image: only its alpha is read, so the body is solid and the visor a hole with the eyes back in it
const drawing = characterDrawing({ ...MARK, size: 22, still: true });
const eyes = drawing.eyes.kind === "open" ? drawing.eyes.rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`).join("") : "";
const TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}"><defs><mask id="m"><rect x="-50" y="-50" width="300" height="300" fill="#fff"/>`
  + `<rect x="${drawing.visor.x}" y="${drawing.visor.y}" width="${drawing.visor.width}" height="${drawing.visor.height}" rx="${drawing.visor.rx}" fill="#000"/></mask></defs>`
  + `<path d="${drawing.body}" fill="#000" mask="url(#m)"/><g fill="#000">${eyes}</g></svg>`;
write("electron/resources/trayTemplate.png", png(TEMPLATE, 18));
write("electron/resources/trayTemplate@2x.png", png(TEMPLATE, 36));
write("electron/resources/tray-icon.png", png(svg(64, 64, tile({ size: 64, radius: 14 })), 32));

write("public/app-icon.svg", `${FAVICON}\n`);
write("apps/dashboard/favicon.svg", `${FAVICON}\n`);
write("public/app-icon-192.png", png(FULL, 192));
write("public/app-icon-512.png", png(FULL, 512));
write("public/apple-touch-icon.png", png(FULL, 180));

// the startup screen's crew: the factory's roles in their signature looks, one image per pose, and a silhouette
const CREW = {
  lead: { base: "tower", shell: STUDIO.shells.sky },
  scout: { base: "sprout", shell: STUDIO.shells.clay },
  ceo: { base: "bear", shell: STUDIO.shells.lilac },
  builder: { base: "cube", shell: STUDIO.shells.sage },
  marketer: { base: "bell", shell: "#FF9FD0" },
};
const POSES = { idle: "idle", happy: "done", working: "working", thinking: "thinking", sleeping: "blocked" };
const crew = Object.fromEntries(Object.entries(CREW).map(([name, look]) => [name, {
  svg: Object.fromEntries(Object.entries(POSES).map(([pose, state]) => [pose, characterSvg({ ...look, state, size: 64, id: `${name}-${pose}` }, { size: 128 })])),
  ghost: characterSvg({ ...look, shell: "#000000", size: 64, id: `${name}-ghost` }, { size: 128 }).replace(/fill="#(?!000000)[0-9A-F]{6}"/g, 'fill="none"').replace(/stroke="#[0-9A-F]{6}"/g, 'stroke="none"'),
}]));
write("electron/resources/startup-characters.json", `${JSON.stringify(crew)}\n`);
