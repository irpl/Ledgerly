// Generates PWA icons into public/icons/ from an inline SVG.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "fs";

const OUT = new URL("../public/icons/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Standard icon: dark slate tile, profit-green dollar mark.
const standard = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#0f172a"/>
  <circle cx="256" cy="256" r="${pad ? 168 : 176}" fill="#059669"/>
  <text x="256" y="268" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="bold"
        font-size="${pad ? 208 : 220}" fill="#ffffff">$</text>
</svg>`;

// Maskable: full-bleed background, content inside the 80% safe zone.
const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#0f172a"/>
  <circle cx="256" cy="256" r="150" fill="#059669"/>
  <text x="256" y="266" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="bold"
        font-size="180" fill="#ffffff">$</text>
</svg>`;

mkdirSync(OUT, { recursive: true });

await sharp(Buffer.from(standard(false))).resize(192, 192).png().toFile(`${OUT}icon-192.png`);
await sharp(Buffer.from(standard(false))).resize(512, 512).png().toFile(`${OUT}icon-512.png`);
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(`${OUT}maskable-512.png`);
await sharp(Buffer.from(standard(true))).resize(180, 180).png().toFile(`${OUT}apple-touch-icon.png`);

console.log("Icons written to public/icons/");
