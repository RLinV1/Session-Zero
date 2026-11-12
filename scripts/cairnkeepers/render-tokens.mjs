/**
 * Draws the Cairnkeepers tokens as SVG (cut-paper figures on a sky or ice field, in a rim: signal
 * orange for the Guides, iron for what they meet, rope for everyone else) and renders each to WebP
 * with a transparent outside.
 *
 * Outputs (games/cairnkeepers/art/tokens/): <name>.webp (256 px; the 3×3 boss 512 px),
 * src/<name>.svg, and token-sheet.webp, every token on one page.
 *
 *   node scripts/cairnkeepers/render-tokens.mjs [--only=<name>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const OUT = fileURLToPath(new URL("../../games/cairnkeepers/art/tokens/", import.meta.url));
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const INK = "#121820";
const FIG = "#2a3440";
const SIGNAL = "#e0612b";

/** Field colours: centre (where the light is), middle, edge. */
const FIELDS = {
  summit: ["#ffe1b5", "#d4703a", "#2c140c"],
  glacier: ["#eef7fc", "#79a8c4", "#122230"],
  storm: ["#dbe3ea", "#5f7183", "#10161d"],
  ice: ["#c4ecfa", "#3f86ab", "#051019"],
  rock: ["#e2d8c6", "#7a6e60", "#17130f"],
  hearth: ["#ffd9a0", "#b8562a", "#26100a"],
  snow: ["#ffffff", "#c9d8e2", "#4a5f70"],
};
const RIMS = { signal: ["#ffb07a", "#a63a12"], iron: ["#a7aeb6", "#3a3f46"], rope: ["#e2c992", "#6e5428"] };

// Shared pieces ----------------------------------------------------------------------------------
const lines = (d, color, w, extra = "") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const eyes = (pts, color = "#f1ead8", rx = 7, ry = 3.5) => pts.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}"/>`).join("");
/** A ring of spikes: fur round a hood, the edge of a snowflake. */
const spikes = (cx, cy, rx, ry, n, inner) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const t = (i / (n * 2)) * Math.PI * 2, k = i % 2 ? inner : 1;
    pts.push(`${(cx + Math.cos(t) * rx * k).toFixed(1)} ${(cy + Math.sin(t) * ry * k).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
};
const snowfall = (n, seed) => {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => `<circle cx="${(r() * 512).toFixed(0)}" cy="${(r() * 512).toFixed(0)}" r="${(1.5 + r() * 3).toFixed(1)}" fill="#fff" opacity="${(0.35 + r() * 0.45).toFixed(2)}"/>`).join("");
};

const PARKA = "M46 512 C56 428 110 376 188 356 L324 356 C402 376 456 428 466 512 Z";
const HOOD = "M256 100 C194 100 154 148 148 212 C142 272 168 330 214 356 L298 356 C344 330 370 272 364 212 C358 148 318 100 256 100 Z";
const ruff = (fill = "#ece6da") => `<path d="${spikes(256, 238, 86, 100, 22, 0.86)}" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
const face = (detail = "") => `<ellipse cx="256" cy="240" rx="56" ry="70" fill="#100d0b"/>${detail}`;

// The Guides -------------------------------------------------------------------------------------
function pathfinder() {
  return {
    light: [150, 120, "#ffffff"],
    back: lines("M372 470 L448 120", "#5a4532", 13) + `<path d="M430 106 L490 120 L486 136 L446 132 L436 162 L420 156 Z" fill="#8e98a2" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
    sil: `<path d="${PARKA}"/><path d="${HOOD}"/>`,
    detail: `${ruff()}${face(`
      <circle cx="232" cy="236" r="19" fill="#f2a24a" stroke="#1a1a1a" stroke-width="7"/><circle cx="280" cy="236" r="19" fill="#f2a24a" stroke="#1a1a1a" stroke-width="7"/>
      ${lines("M251 236 L261 236", "#1a1a1a", 6)}<circle cx="226" cy="230" r="5" fill="#fff" opacity="0.85"/><circle cx="274" cy="230" r="5" fill="#fff" opacity="0.85"/>`)}
      ${lines("M120 420 C150 396 190 392 214 404 M126 446 C158 420 196 416 220 428", "#c9a46a", 9)}
      <path d="M210 362 L302 362 L296 390 L216 390 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="4"/>
      ${lines("M150 470 C170 432 190 410 214 398 M362 470 C342 432 322 410 298 398", "#3a4654", 5)}`,
  };
}

function hauler() {
  return {
    light: [160, 130, "#ffffff"],
    back: `<rect x="136" y="96" width="240" height="300" rx="18" fill="#5c4632" stroke="${INK}" stroke-width="6"/>
      ${lines("M146 150 H366 M146 230 H366", "#3e2e20", 8)}
      <path d="M318 74 C318 58 356 58 356 74 L360 108 L314 108 Z" fill="#4a4f56" stroke="${INK}" stroke-width="4"/>
      ${lines("M86 470 L150 150", "#5a4532", 15)}<path d="M108 130 L196 150 L190 168 L102 150 Z" fill="#8e98a2" stroke="${INK}" stroke-width="4"/>`,
    sil: `<path d="M24 512 C34 420 96 364 176 346 L336 346 C416 364 478 420 488 512 Z"/><path d="M256 112 C190 112 152 160 148 222 C144 280 172 334 216 356 L296 356 C340 334 368 280 364 222 C360 160 322 112 256 112 Z"/>`,
    detail: `${ruff("#d8cfbf")}${face(`${eyes([[234, 238], [278, 238]], "#f1ead8", 7, 4)}
      <path d="M210 270 C222 312 290 312 302 270 C296 296 272 304 256 304 C240 304 216 296 210 270 Z" fill="#8a6440"/>`)}
      ${lines("M186 396 C230 424 282 424 326 396", "#c9a46a", 12)}
      <circle cx="256" cy="430" r="13" fill="${SIGNAL}" stroke="${INK}" stroke-width="4"/>`,
  };
}

function hunter() {
  return {
    light: [356, 140, "#ffffff"],
    back: lines("M96 96 C30 250 60 400 150 470", "#6a4b2e", 12) + lines("M96 96 L150 470", "#d9d2c0", 3) + lines("M396 120 L436 470 M412 112 L452 462 M428 108 L466 452", "#6a4b2e", 6) +
      `<path d="M388 102 L404 84 L414 110 Z M404 94 L420 76 L430 102 Z M420 88 L436 70 L446 96 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="2"/>`,
    sil: `<path d="${PARKA}"/><path d="M256 92 C192 92 152 146 148 212 C142 272 168 330 214 356 L298 356 C344 330 370 272 364 212 C360 146 320 92 256 92 Z"/><path d="M182 118 L196 64 L224 104 Z M330 118 L316 64 L288 104 Z"/>`,
    silFill: "#dfe6eb",
    detail: `${ruff("#f4f1ea")}${face(`${eyes([[234, 236], [278, 236]], "#cfe8f4", 8, 4)}`)}
      ${lines("M150 470 C170 432 190 410 214 398 M362 470 C342 432 322 410 298 398", "#9aa6b2", 5)}
      <path d="M232 360 L280 360 L272 380 L240 380 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="3"/>`,
  };
}

function stonespeaker() {
  const stones = [[150, 150], [372, 196], [130, 320]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${20 - i * 2}" fill="url(#halo)" opacity="0.9"/><path d="M${x - 16} ${y + 4} C${x - 14} ${y - 14} ${x + 12} ${y - 16} ${x + 16} ${y} C${x + 14} ${y + 14} ${x - 10} ${y + 16} ${x - 16} ${y + 4} Z" fill="#8a8f96" stroke="${INK}" stroke-width="3"/>${lines(`M${x - 6} ${y - 2} L${x + 6} ${y - 2}`, SIGNAL, 3)}`).join("");
  return {
    light: [256, 230, "#9fd8ff"],
    back: lines("M392 480 L420 110", "#4f3b2a", 12) + `<circle cx="422" cy="96" r="26" fill="#9aa0a6" stroke="${INK}" stroke-width="5"/>${lines("M410 92 L434 92 M422 82 L422 104", SIGNAL, 4)}`,
    sil: `<path d="${PARKA}"/><path d="M256 60 C230 100 180 140 160 206 C142 268 168 330 214 356 L298 356 C344 330 370 268 352 206 C332 140 282 100 256 60 Z"/>`,
    detail: `${face(`${eyes([[234, 244], [278, 244]], "#9fe1ff", 8, 5)}<circle cx="234" cy="244" r="14" fill="url(#halo)"/><circle cx="278" cy="244" r="14" fill="url(#halo)"/>`)}
      ${lines("M256 360 L256 470 M226 396 L286 396 M236 430 L276 430", "#9fd8ff", 4, 'opacity="0.8"')}
      ${stones}`,
  };
}

// What waits up there ----------------------------------------------------------------------------
function whiteCoat() {
  return {
    light: [256, 120, "#ffffff"],
    sil: `<path d="M120 470 C120 360 150 300 168 250 L150 120 L214 188 C238 180 274 180 298 188 L362 120 L344 250 C362 300 392 360 392 470 Z"/>`,
    silFill: "#e8eef2",
    detail: `<path d="M196 300 C210 380 240 430 256 440 C272 430 302 380 316 300 C296 330 216 330 196 300 Z" fill="#c9d3da" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="256" cy="420" rx="22" ry="16" fill="#151515"/>
      <path d="M212 262 L240 272 L212 280 Z M300 262 L272 272 L300 280 Z" fill="#e8c94a" stroke="${INK}" stroke-width="3"/>
      ${lines("M226 456 L240 470 M286 456 L272 470", "#fff", 5)}
      ${lines("M170 330 L130 360 M342 330 L382 360 M176 380 L138 420 M336 380 L374 420", "#aab6c0", 4)}`,
  };
}

function screeGoat() {
  return {
    light: [256, 140, "#ffffff"],
    back: lines("M206 150 C140 110 92 160 120 230 C132 260 160 262 168 240", "#d9cdb2", 26) + lines("M306 150 C372 110 420 160 392 230 C380 260 352 262 344 240", "#d9cdb2", 26) +
      lines("M206 150 C140 110 92 160 120 230 C132 260 160 262 168 240 M306 150 C372 110 420 160 392 230 C380 260 352 262 344 240", INK, 4),
    sil: `<path d="M196 160 C226 140 286 140 316 160 L340 260 C330 330 300 400 256 430 C212 400 182 330 172 260 Z"/><path d="M226 430 C240 470 272 470 286 430 L276 492 L236 492 Z"/><path d="M150 214 L196 196 L196 230 Z M362 214 L316 196 L316 230 Z"/>`,
    silFill: "#c8b48a",
    detail: `<rect x="214" y="236" width="24" height="14" rx="5" fill="#e3c25a" stroke="${INK}" stroke-width="3"/><rect x="274" y="236" width="24" height="14" rx="5" fill="#e3c25a" stroke="${INK}" stroke-width="3"/>
      ${lines("M220 243 L232 243 M280 243 L292 243", "#111", 4)}
      <ellipse cx="256" cy="396" rx="26" ry="16" fill="#5a4a36"/>${lines("M236 292 L256 330 L276 292", "#7a6648", 4)}`,
  };
}

function rimehand(boss = false) {
  return {
    light: boss ? [380, 380, "#ffb070"] : [256, 140, "#ffffff"],
    back: boss
      ? lines("M100 470 L170 120", "#4f3b2a", 14) + `<path d="M150 104 C190 80 226 104 222 140 L200 132 C200 114 180 110 168 122 Z" fill="#7d858e" stroke="${INK}" stroke-width="5"/>`
      : lines("M84 330 L428 330", "#5c4632", 14) + lines("M160 300 C200 330 200 330 160 360 M352 300 C312 330 312 330 352 360", "#7d858e", 8) + lines("M160 300 L160 360 M352 300 L352 360", "#d9d2c0", 2),
    sil: `<path d="${boss ? "M20 512 C30 420 94 362 176 344 L336 344 C418 362 482 420 492 512 Z" : PARKA}"/><path d="${HOOD}"/><path d="M168 150 C180 90 332 90 344 150 C350 170 160 170 168 150 Z"/>`,
    silFill: "#3d332c",
    detail: `<path d="${spikes(256, 128, 104, 44, 18, 0.8)}" fill="#7a6650" stroke="${INK}" stroke-width="4"/>
      ${face(`${eyes([[234, 228], [278, 228]], boss ? "#ffd27a" : "#f1ead8", 8, 4)}`)}
      <path d="M196 252 C220 270 292 270 316 252 L322 310 C290 330 222 330 190 310 Z" fill="#9a3a24" stroke="${INK}" stroke-width="4"/>
      ${boss ? `<g transform="translate(372 392)"><path d="M-44 -30 L44 -30 L52 30 C40 52 -40 52 -52 30 Z" fill="#2a2a2e" stroke="${INK}" stroke-width="5"/>${lines("M-30 -50 C-20 -80 10 -70 0 -100 M20 -50 C30 -80 0 -80 14 -110", "#c9c2b8", 7, 'opacity="0.8"')}<circle r="70" fill="url(#halo)" opacity="0.5"/></g>
        ${lines("M188 356 C176 400 180 440 196 470 M324 356 C336 400 332 440 316 470", "#7a6650", 12)}` : ""}`,
  };
}

function iceCrawlers() {
  const crawler = (x, y, ang, len) => {
    const segs = 6, parts = [];
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1), px = x + Math.cos(ang + t * 0.9) * len * t, py = y + Math.sin(ang + t * 0.9) * len * t;
      parts.push(`<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(16 - i * 1.4).toFixed(1)}" ry="${(11 - i * 0.8).toFixed(1)}" fill="#eef8fc" stroke="${INK}" stroke-width="4" transform="rotate(${((ang + t * 0.9) * 180 / Math.PI).toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`);
      parts.unshift(lines(`M${(px - 12).toFixed(0)} ${(py - 12).toFixed(0)} L${(px + 12).toFixed(0)} ${(py + 12).toFixed(0)} M${(px + 12).toFixed(0)} ${(py - 12).toFixed(0)} L${(px - 12).toFixed(0)} ${(py + 12).toFixed(0)}`, "#1d3a4a", 3));
    }
    return parts.join("") + `<circle cx="${x}" cy="${y}" r="3" fill="#ff6a3a"/>`;
  };
  const list = [[150, 160, 0.4, 120], [300, 120, 1.6, 110], [380, 260, 2.6, 120], [180, 330, -0.2, 130], [270, 400, -1.4, 100], [120, 260, 0.9, 90], [330, 350, 3.6, 100]];
  return {
    light: [256, 256, "#bfefff"],
    detail: `<path d="M0 0 L120 0 L60 200 Z M512 0 L400 0 L460 180 Z M512 512 L420 512 L480 330 Z" fill="#9fd4ea" opacity="0.4"/>${list.map(([x, y, a, l]) => crawler(x, y, a, l)).join("")}`,
  };
}

function cairnTaker() {
  const stone = (x, y, rx, ry, fill = "#7a7d82") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="5"/>`;
  return {
    light: [256, 300, "#9fe1ff"],
    sil: `<path d="M40 470 C40 330 110 190 256 170 C402 190 472 330 472 470 C400 500 112 500 40 470 Z"/>`,
    silFill: "#4c5560",
    detail: `${stone(156, 250, 46, 36)}${stone(256, 206, 54, 40, "#868a90")}${stone(356, 250, 46, 36)}${stone(110, 340, 40, 34, "#6d7177")}${stone(402, 340, 40, 34, "#6d7177")}
      ${[[156, 250], [256, 206], [356, 250]].map(([x, y]) => lines(`M${x - 18} ${y - 6} L${x + 18} ${y - 6}`, SIGNAL, 6)).join("")}
      <path d="M176 320 C200 300 312 300 336 320 L322 400 C290 420 222 420 190 400 Z" fill="#0b1118" stroke="${INK}" stroke-width="5"/>
      <ellipse cx="226" cy="350" rx="16" ry="9" fill="#bdf0ff"/><ellipse cx="286" cy="350" rx="16" ry="9" fill="#bdf0ff"/>
      <circle cx="226" cy="350" r="30" fill="url(#halo)"/><circle cx="286" cy="350" r="30" fill="url(#halo)"/>
      ${[200, 226, 252, 278, 304].map((x, i) => `<path d="M${x - 9} 404 L${x + 9} 404 L${x} ${440 + (i % 2) * 22} Z" fill="#cfeefa" stroke="${INK}" stroke-width="3"/>`).join("")}
      ${lines("M120 440 L60 500 M392 440 L452 500", "#3a4048", 30)}`,
  };
}

// People and pieces ------------------------------------------------------------------------------
function aldric() {
  return {
    light: [330, 400, "#ffcf8a"],
    sil: `<path d="${PARKA}"/><path d="${HOOD}"/>`,
    silFill: "#6b4a30",
    detail: `${face(`${eyes([[234, 226], [278, 226]], "#f1ead8", 6, 3)}<path d="M206 252 C214 330 298 330 306 252 C300 300 212 300 206 252 Z" fill="#eeeae2"/><path d="M206 252 C220 360 292 360 306 252 C288 296 224 296 206 252 Z" fill="#e2ddd2" stroke="${INK}" stroke-width="3"/>`)}
      <g transform="translate(330 410)"><ellipse rx="56" ry="20" fill="#8a6440" stroke="${INK}" stroke-width="5"/><ellipse cy="-6" rx="46" ry="12" fill="#c98a4a"/>${lines("M-20 -30 C-30 -50 -10 -60 -20 -84 M10 -30 C0 -54 22 -62 10 -90", "#f4e8d4", 6, 'opacity="0.8"')}</g>
      ${lines("M210 360 L240 470 M302 360 L272 470", "#c9a46a", 6)}`,
  };
}

function survivor() {
  return {
    light: [256, 160, "#ffffff"],
    sil: `<path d="M70 512 C80 420 140 360 210 346 L302 346 C372 360 432 420 442 512 Z"/><path d="M256 130 C200 130 168 172 166 226 C164 280 190 330 226 350 L286 350 C322 330 348 280 346 226 C344 172 312 130 256 130 Z"/>`,
    silFill: "#7d6a4e",
    detail: `<path d="M120 380 C170 350 342 350 392 380 L404 440 C340 420 172 420 108 440 Z" fill="#a8452c" stroke="${INK}" stroke-width="4"/>
      ${lines("M140 400 L380 400 M136 420 L384 420", "#e8c48a", 4)}
      <ellipse cx="256" cy="236" rx="46" ry="56" fill="#100d0b"/>${eyes([[238, 232], [274, 232]], "#f1ead8", 6, 3.5)}
      <path d="M206 268 C226 290 286 290 306 268 L304 300 C280 316 232 316 208 300 Z" fill="#d9cdb2" stroke="${INK}" stroke-width="3"/>`,
  };
}

function warmth() {
  return {
    light: [256, 360, "#ffc070"],
    detail: `<circle cx="256" cy="380" r="150" fill="url(#halo)"/>
      <path d="M196 420 C206 360 232 330 226 290 C262 320 268 352 262 380 C278 360 284 342 280 320 C312 352 320 392 312 420 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="5"/>
      <path d="M228 420 C232 392 244 378 246 360 C262 380 266 400 262 420 Z" fill="#ffd27a"/>
      ${lines("M150 440 L362 440 M170 460 L342 420 M170 420 L342 460", "#4a3420", 14)}
      <g transform="translate(256 210)"><path d="M-80 -50 L80 -50 L90 40 C70 70 -70 70 -90 40 Z" fill="#3a3d42" stroke="${INK}" stroke-width="6"/>
        <path d="M80 -30 C130 -40 140 -90 110 -110" fill="none" stroke="#3a3d42" stroke-width="12" stroke-linecap="round"/>
        <rect x="-60" y="-74" width="120" height="24" rx="10" fill="#2c2f34" stroke="${INK}" stroke-width="5"/>
        ${lines("M-30 -90 C-40 -120 -10 -130 -20 -160 M20 -90 C10 -124 40 -130 28 -168", "#f4f0e8", 8, 'opacity="0.85"')}</g>`,
  };
}

function stormClock() {
  const segs = Array.from({ length: 6 }, (_, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.06, a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - 0.06, r0 = 150, r1 = 196;
    const p = (a, r) => `${(256 + Math.cos(a) * r).toFixed(1)} ${(256 + Math.sin(a) * r).toFixed(1)}`;
    return `<path d="M${p(a0, r1)} A${r1} ${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0} ${r0} 0 0 0 ${p(a0, r0)} Z" fill="${i < 2 ? "#e8eef2" : "#3d4b58"}" stroke="${INK}" stroke-width="4"/>`;
  }).join("");
  return {
    light: [256, 256, "#ffffff"],
    detail: `${segs}<g stroke="#f4f8fb" stroke-width="12" stroke-linecap="round">${[0, 60, 120].map((a) => `<line x1="256" y1="160" x2="256" y2="352" transform="rotate(${a} 256 256)"/>`).join("")}</g>
      <g stroke="#f4f8fb" stroke-width="8" stroke-linecap="round">${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M236 180 L256 200 L276 180" fill="none" transform="rotate(${a} 256 256)"/>`).join("")}</g>
      <circle cx="256" cy="256" r="16" fill="${SIGNAL}" stroke="${INK}" stroke-width="4"/>`,
  };
}

function cairn(raised) {
  const pile = raised
    ? [[256, 420, 96, 34], [256, 362, 80, 30], [250, 308, 66, 28], [260, 258, 52, 24], [254, 214, 40, 20], [256, 178, 28, 16]]
    : [[170, 400, 56, 30], [300, 430, 64, 32], [380, 360, 44, 26], [220, 330, 40, 22], [130, 300, 36, 22], [330, 280, 40, 24]];
  return {
    light: raised ? [256, 120, "#ffffff"] : [256, 200, "#ffffff"],
    detail: `${raised ? "" : `<ellipse cx="256" cy="380" rx="200" ry="60" fill="#ffffff" opacity="0.35"/>`}
      ${pile.map(([x, y, rx, ry], i) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${["#8d9096", "#7a7d82", "#9a9da2", "#868a90"][i % 4]}" stroke="${INK}" stroke-width="5"/>${lines(`M${x - rx * 0.5} ${y - ry * 0.3} L${x + rx * 0.3} ${y - ry * 0.3}`, "#c4c7cc", 4)}`).join("")}
      ${raised ? `${lines("M256 166 L256 96", "#4f3b2a", 8)}<path d="M256 98 L330 116 L256 136 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="4"/>` : `${lines("M150 250 L210 210", "#4f3b2a", 8)}<path d="M206 206 L250 232 L214 248 Z" fill="${SIGNAL}" stroke="${INK}" stroke-width="3" opacity="0.8"/>`}`,
  };
}

function svgFor(name, def, field, rim) {
  const [c0, c1, c2] = FIELDS[field];
  const [lx, ly, lc] = def.light ?? [256, 200, "#ffffff"];
  const rimC = RIMS[rim];
  const ticks = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2, r0 = i % 6 ? 236 : 230; return `<line x1="${(256 + Math.cos(a) * r0).toFixed(1)}" y1="${(256 + Math.sin(a) * r0).toFixed(1)}" x2="${(256 + Math.cos(a) * 246).toFixed(1)}" y2="${(256 + Math.sin(a) * 246).toFixed(1)}" stroke="${INK}" stroke-width="${i % 6 ? 2 : 4}"/>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Cairnkeepers token: ${name}. Drawn by scripts/cairnkeepers/render-tokens.mjs. -->
  <defs>
    <radialGradient id="field" cx="${lx}" cy="${ly}" r="430" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c0}"/><stop offset="0.45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
    <radialGradient id="key" cx="${lx}" cy="${ly}" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${lc}" stop-opacity="0.6"/><stop offset="0.5" stop-color="${lc}" stop-opacity="0.18"/><stop offset="1" stop-color="${lc}" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="${lc}" stop-opacity="0.9"/><stop offset="0.5" stop-color="${lc}" stop-opacity="0.3"/><stop offset="1" stop-color="${lc}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette" cx="256" cy="256" r="232" gradientUnits="userSpaceOnUse"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.2 0.9"/></filter>
    <clipPath id="disc"><circle cx="256" cy="256" r="228"/></clipPath>
    ${def.sil ? `<g id="sil">${def.sil}</g><clipPath id="silclip">${def.sil}</clipPath>` : ""}
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rimC[0]}"/><stop offset="0.55" stop-color="${rimC[1]}"/><stop offset="1" stop-color="${rimC[0]}"/></linearGradient>
  </defs>
  <g clip-path="url(#disc)">
    <rect width="512" height="512" fill="url(#field)"/>
    ${field === "ice" || field === "rock" ? "" : snowfall(46, name.length * 97 + 13)}
    ${def.back ?? ""}
    ${def.sil ? `<use href="#sil" fill="#000" opacity="0.4" filter="url(#soft)" transform="translate(8 10)"/>
    <use href="#sil" fill="${def.silFill ?? FIG}"/>
    <g clip-path="url(#silclip)"><rect width="512" height="512" fill="url(#key)"/></g>
    <use href="#sil" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` : ""}
    ${def.detail}
    <rect width="512" height="512" filter="url(#grain)" opacity="0.2"/>
    <rect width="512" height="512" fill="url(#vignette)"/>
  </g>
  <circle cx="256" cy="256" r="240" fill="none" stroke="${INK}" stroke-width="26"/>
  <circle cx="256" cy="256" r="240" fill="none" stroke="url(#rim)" stroke-width="18"/>
  ${ticks}
  <circle cx="256" cy="256" r="228" fill="none" stroke="${INK}" stroke-width="3"/>
</svg>`;
}

export const TOKENS = [
  ["pathfinder-a", pathfinder, "summit", "signal"], ["pathfinder-b", pathfinder, "glacier", "signal"],
  ["hauler-a", hauler, "summit", "signal"], ["hauler-b", hauler, "glacier", "signal"],
  ["hunter-a", hunter, "summit", "signal"], ["hunter-b", hunter, "glacier", "signal"],
  ["stonespeaker-a", stonespeaker, "summit", "signal"], ["stonespeaker-b", stonespeaker, "glacier", "signal"],
  ["white-coat", whiteCoat, "storm", "iron"], ["scree-goat", screeGoat, "rock", "iron"],
  ["rimehand", () => rimehand(false), "storm", "iron"], ["kettle-varga", () => rimehand(true), "hearth", "iron"],
  ["ice-crawlers", iceCrawlers, "ice", "iron"], ["cairn-taker", cairnTaker, "ice", "iron"],
  ["brother-aldric", aldric, "hearth", "rope"], ["survivor", survivor, "glacier", "rope"],
  ["warmth", warmth, "hearth", "rope"], ["storm-clock", stormClock, "storm", "iron"],
  ["cairn-fallen", () => cairn(false), "snow", "rope"], ["cairn-raised", () => cairn(true), "snow", "signal"],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(join(OUT, "src"), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    const rendered = [];
    for (const [name, make, field, rim] of TOKENS) {
      if (only && name !== only) continue;
      const svg = svgFor(name, make(), field, rim);
      await writeFile(join(OUT, "src", `${name}.svg`), svg);
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
      const size = name === "cairn-taker" ? 512 : 256;
      await sharp(png).resize(size, size).webp({ quality: 90, alphaQuality: 100 }).toFile(join(OUT, `${name}.webp`));
      rendered.push({ name, png });
    }
    if (!only) {
      const cols = 5, cell = 220, rows = Math.ceil(rendered.length / cols);
      const tiles = await Promise.all(rendered.map(async ({ png }, i) => ({ input: await sharp(png).resize(200, 200).png().toBuffer(), left: (i % cols) * cell + 10, top: Math.floor(i / cols) * cell + 10 })));
      await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: "#eef3f6" } }).composite(tiles).webp({ quality: 88 }).toFile(join(OUT, "token-sheet.webp"));
    }
    console.log(`rendered ${rendered.length} tokens`);
  } finally {
    await browser.close();
  }
}
