// One-off brand asset generator (build-time tooling; not shipped in the app).
// Renders the Live TV brand mark — red-gradient rounded tile + white play
// triangle, exactly as drawn in components/LiveTvApp.tsx — into the full
// icon set + OG image. Run: node scripts/gen-icons.mjs  (requires sharp,
// already present via Next's dependency tree; nothing is added to package.json)
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PLAY =
  "M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z";

/* The UI tile: h-10 w-10 rounded-xl (12/40 = 30% radius), gradient
   red-500 (#ef4444) top → red-700 (#b91c1c) bottom, play at 50% size,
   optically nudged right. Rebuilt on a 512 viewBox. */
function tileSvg(size, { radiusRatio = 0.3, playRatio = 0.5 } = {}) {
  const r = Math.round(size * radiusRatio);
  const p = size * playRatio;
  const off = (size - p) / 2;
  const nudge = size * 0.025; // the UI's ml-0.5 optical shift
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ef4444"/>
      <stop offset="1" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <rect width="${size}" height="${size}" rx="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="${Math.max(2, size * 0.012)}"/>
  <g transform="translate(${off + nudge} ${off}) scale(${p / 24})">
    <path d="${PLAY}" fill="#ffffff"/>
  </g>
</svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("wrote", out, size + "x" + size);
}

/* Maskable: mark scaled to ~72% on the app background so the safe zone
   (center 80%) keeps the whole tile visible under any mask shape. */
function maskableSvg(size) {
  const inner = tileSvg(1000);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#09090c"/>
  <g transform="translate(${size * 0.14} ${size * 0.14}) scale(${(size * 0.72) / 1000})">${inner.replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "")}</g>
</svg>`;
}

/* ICO container with PNG-compressed entries (Vista+ format, universally
   readable by browsers). */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const b = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1);
    dir.writeUInt8(0, b + 2);
    dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(e.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += e.data.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

const pub = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
const app = (p) => new URL(`../app/${p}`, import.meta.url).pathname;
mkdirSync(dirname(pub("icons/x")), { recursive: true });

const master = tileSvg(1024);
writeFileSync(new URL("../public/icon.svg", import.meta.url), tileSvg(512));
console.log("wrote public/icon.svg");

await png(master, 512, pub("icons/icon-512.png"));
await png(master, 192, pub("icons/icon-192.png"));
await png(master, 180, pub("icons/apple-touch-icon.png"));
await png(master, 48, pub("icons/icon-48.png"));
await png(master, 32, pub("icons/icon-32.png"));
await png(master, 16, pub("icons/icon-16.png"));
await png(maskableSvg(512), 512, pub("icons/icon-maskable-512.png"));

const icoSizes = [16, 32, 48];
const icoEntries = [];
for (const s of icoSizes) {
  const data = await sharp(Buffer.from(tileSvg(256))).resize(s, s).png().toBuffer();
  icoEntries.push({ size: s, data });
}
writeFileSync(app("favicon.ico"), ico(icoEntries));
console.log("wrote app/favicon.ico (16/32/48)");

/* ---------------- OG image 1200×630 ---------------- */
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c0c10"/>
      <stop offset="1" stop-color="#09090c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#dc2626" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#dc2626" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ef4444"/>
      <stop offset="1" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(84 96)">
    <rect width="148" height="148" rx="40" fill="url(#tile)"/>
    <rect width="148" height="148" rx="40" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
    <g transform="translate(41 37) scale(3.083)"><path d="${PLAY}" fill="#ffffff"/></g>
  </g>
  <text x="262" y="168" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="76" font-weight="bold" fill="#f5f5f4">Live TV</text>
  <text x="266" y="218" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="27" fill="#ef4444" letter-spacing="4">FREE LIVE TV FROM EVERY COUNTRY</text>
  <text x="84" y="356" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="58" font-weight="bold" fill="#f5f5f4">Every public channel in the world,</text>
  <text x="84" y="428" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="58" font-weight="bold" fill="#f5f5f4">streaming in your browser.</text>
  <text x="84" y="492" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="29" fill="#a3a3a3">No sign-up. No cost. Just pick a channel and watch.</text>
  <g transform="translate(84 532)">
    <rect width="690" height="56" rx="28" fill="#17171d" stroke="#ffffff" stroke-opacity="0.1"/>
    <circle cx="34" cy="28" r="7" fill="#ef4444"/>
    <text x="56" y="37" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="24" fill="#e5e5e5">16,682 channels  ·  22,774 streams  ·  182 countries</text>
  </g>
  <text x="1116" y="586" text-anchor="end" font-family="'Liberation Sans','DejaVu Sans',sans-serif" font-size="24" fill="#737373">livetv.fabwaseem.com</text>
</svg>`;
writeFileSync("/tmp/og.svg", og);
await sharp(Buffer.from(og)).png().toFile(pub("og.png"));
console.log("wrote public/og.png 1200x630");
