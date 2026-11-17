import sharp from "sharp";
// Deterministic synthetic art: no private/user artwork or external image service.
const grid = Array.from({ length: 21 }, (_, i) => `<path d="M ${i * 60} 0 V 900"/>`).join("")
  + Array.from({ length: 16 }, (_, i) => `<path d="M 0 ${i * 60} H 1200"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
<rect width="1200" height="900" fill="#cabd9b"/>
<g fill="#ede1c2" stroke="#60594d" stroke-width="18"><path d="M 120 120 H 480 V 420 H 120 Z"/><path d="M 720 120 H 1080 V 420 H 720 Z"/><path d="M 120 600 H 1080 V 780 H 120 Z"/></g>
<g fill="#cabd9b"><path d="M 480 240 H 720 V 300 H 480 Z"/><path d="M 240 390 H 300 V 630 H 240 Z"/><path d="M 900 390 H 960 V 630 H 900 Z"/></g>
<g fill="#8b8461"><circle cx="240" cy="240" r="24"/><circle cx="960" cy="240" r="24"/></g>
<g fill="#9b8e76"><path d="M 748 637 l 19 -8 12 20 -20 8 Z"/><path d="M 794 659 l 20 -10 10 19 -19 9 Z"/><path d="M 745 705 l 22 -8 8 15 -21 10 Z"/></g>
<g stroke="#47463f" stroke-width="1" opacity=".6">${grid}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL("../../browser/fixtures/studio-preparation.png", import.meta.url).pathname);
console.log("Generated deterministic synthetic preparation map: 1200x900, 60px grid.");
