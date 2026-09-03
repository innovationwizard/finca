// =============================================================================
// scripts/generate-brand-assets.ts — Regenerate the static brand assets in
// public/ from one source of truth: the login brand panel
// (src/app/login/page.tsx) and public/icon.svg. Run after any brand change
// (name, palette, logo) so link previews and app icons never drift again.
//   npx tsx scripts/generate-brand-assets.ts
// =============================================================================

import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";

// Palette — tailwind.config.ts
const FINCA_900 = "#1B3A2D";
const FINCA_800 = "#245C3E";
const FINCA_400 = "#6BB891";
const FINCA_300 = "#9DD0B5";
const FINCA_100 = "#E8F5EE";

const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

// Lucide `Sprout`, the same mark the login panel and public/icon.svg use.
function sprout(x: number, y: number, size: number, color: string) {
  const s = size / 24;
  return `<g transform="translate(${x},${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 20h10"/>
    <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>
  </g>`;
}

// og-image.png — the login brand panel at 1200x630 (WhatsApp / OG / Twitter).
const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#ffffff" fill-opacity="0.055"/>
    </pattern>
    <filter id="tileShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F2318" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="${FINCA_900}"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <rect x="534" y="152" width="132" height="132" rx="32" fill="${FINCA_800}" filter="url(#tileShadow)"/>
  ${sprout(567, 185, 66, FINCA_100)}
  <text x="600" y="396" text-anchor="middle" ${FONT} font-size="76" font-weight="700" fill="#ffffff" letter-spacing="-1.6">Finca Nueva Esperanza</text>
  <text x="600" y="454" text-anchor="middle" ${FONT} font-size="33" font-weight="400" fill="${FINCA_300}">Sistema de Gestión Agrícola</text>
  <text x="600" y="502" text-anchor="middle" ${FONT} font-size="26" font-weight="400" fill="${FINCA_400}">Grupo Orión</text>
</svg>`;

// Minimal single-image .ico wrapper around a PNG (supported by every current
// browser); sharp cannot write .ico itself.
function pngToIco(png: Buffer, size: number) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size; // width  (0 means 256)
  entry[1] = size === 256 ? 0 : size; // height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

async function main() {
  const og = await sharp(Buffer.from(OG_SVG)).png().toBuffer();
  writeFileSync("public/og-image.png", og);
  console.log("wrote public/og-image.png (1200x630)");

  // App icons — rasterized from public/icon.svg, the design of record. The
  // previous PNGs had lost the sprout and were blank green tiles.
  const iconSvg = readFileSync("public/icon.svg");
  const targets: Array<[string, number]> = [
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-192.png", 192],
    ["public/apple-icon.png", 180],
  ];
  for (const [file, size] of targets) {
    await sharp(iconSvg, { density: 600 }).resize(size, size).png().toFile(file);
    console.log(`wrote ${file} (${size}x${size})`);
  }

  const fav = await sharp(iconSvg, { density: 600 }).resize(32, 32).png().toBuffer();
  writeFileSync("public/favicon.ico", pngToIco(fav, 32));
  console.log("wrote public/favicon.ico (32x32)");
}

main();
