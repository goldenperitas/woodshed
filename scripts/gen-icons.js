// Generates the app/PWA icons from a single SVG (vinyl record on ink ground,
// orange label ring, cream center with a bold "W"). Run: node scripts/gen-icons.js
const sharp = require("sharp");
const path = require("path");

const root = path.join(__dirname, "..");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="disc" cx="42%" cy="36%" r="78%">
      <stop offset="0%" stop-color="#2b2932"/>
      <stop offset="52%" stop-color="#141416"/>
      <stop offset="100%" stop-color="#0a0a0c"/>
    </radialGradient>
    <radialGradient id="sheen" cx="36%" cy="30%" r="42%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="#16130E"/>
  <circle cx="256" cy="256" r="204" fill="#0a0a0c"/>
  <circle cx="256" cy="256" r="200" fill="url(#disc)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2">
    <circle cx="256" cy="256" r="184"/>
    <circle cx="256" cy="256" r="164"/>
    <circle cx="256" cy="256" r="144"/>
    <circle cx="256" cy="256" r="124"/>
    <circle cx="256" cy="256" r="104"/>
  </g>
  <circle cx="256" cy="256" r="200" fill="url(#sheen)"/>
  <circle cx="256" cy="256" r="93" fill="#E1541B"/>
  <circle cx="256" cy="256" r="85" fill="#ECE3CE"/>
  <path d="M212 226 L232 290 L256 252 L280 290 L300 226" fill="none" stroke="#16130E" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="7" fill="#16130E"/>
</svg>`;

async function out(file, size) {
  await sharp(Buffer.from(SVG)).resize(size, size).png().toFile(path.join(root, file));
  console.log("wrote", file, `${size}x${size}`);
}

(async () => {
  await out("public/icon-512.png", 512);
  await out("public/icon-192.png", 192);
  await out("public/apple-touch-icon.png", 180);
  await out("app/icon.png", 256);
})();
