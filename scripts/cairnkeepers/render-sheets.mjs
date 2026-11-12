/* global document, window */
/**
 * Renders Cairnkeepers' printables as surveyor's field-book PDFs:
 *   games/cairnkeepers/character-sheet/cairnkeepers-character-sheet.pdf   blank sheet + quick reference
 *   games/cairnkeepers/character-sheet/pregens/<slug>.pdf                 the four pregenerated Guides
 *   games/cairnkeepers/cairnkeepers-rules.pdf                             rules.md + bestiary.md
 *   games/cairnkeepers/the-winter-road.pdf                                adventure.md (GM only)
 * and a PNG of each PDF's first page in --preview-dir (default: the OS temp dir) for a quick look.
 * The Markdown reader and the paginator are Lanternfall's (scripts/lanternfall/render-sheets.mjs).
 *
 *   node scripts/cairnkeepers/render-sheets.mjs [--preview-dir=<dir>]
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const GAME = fileURLToPath(new URL("../../games/cairnkeepers/", import.meta.url));
const SHEET = join(GAME, "character-sheet");
const previewDir = process.argv.find((a) => a.startsWith("--preview-dir="))?.split("=")[1] ?? tmpdir();

// A small Markdown reader for our own documents: headings, paragraphs, lists (nested), tables,
// block quotes, rules, images, and bold/italic/code/links inline.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/ — /g, " — ");
}
function markdown(src, baseDir) {
  const lines = src.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  const isTable = (l) => /^\s*\|/.test(l);
  const listItem = (l) => l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) { out.push(`<figure><img src="${IMAGE}${join(baseDir, m[2])}" alt="${esc(m[1])}"><figcaption>${inline(m[1])}</figcaption></figure>`); i++; continue; }
    if (line.startsWith(">")) {
      const block = [];
      while (i < lines.length && lines[i].startsWith(">")) { block.push(lines[i].replace(/^>\s?/, "")); i++; }
      const html = markdown(block.join("\n"), baseDir);
      const board = /^\s*\*\*On the board/.test(block[0]);
      out.push(board ? `<aside class="card">${html}</aside>` : `<blockquote>${html}</blockquote>`);
      continue;
    }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); i++; }
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (listItem(line)) {
      const stack = [];
      // A numbered list picks up where it left off after a table or a paragraph (`3.` starts at 3).
      const open = (indent, ordered, start) => { out.push(ordered ? (start > 1 ? `<ol start="${start}">` : "<ol>") : "<ul>"); stack.push({ indent, ordered }); };
      while (i < lines.length && (listItem(lines[i]) || (lines[i].trim() && /^\s{2,}/.test(lines[i]) && stack.length))) {
        const li = listItem(lines[i]);
        if (!li) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(lines[i].trim())}</li>`); i++; continue; }
        const indent = li[1].length, ordered = /\d/.test(li[2]);
        if (!stack.length || indent > stack[stack.length - 1].indent) open(indent, ordered, Number.parseInt(li[2], 10));
        while (stack.length && indent < stack[stack.length - 1].indent) {
          const top = stack.pop(); out.push(top.ordered ? "</ol>" : "</ul>");
          out[out.length - 1] += "</li>";
        }
        // A nested list sits inside the previous item, so reopen that item.
        if (out.length && /<\/li>$/.test(out[out.length - 2] ?? "") && /^<(?:ul|ol(?: start="\d+")?)>$/.test(out[out.length - 1])) {
          const list = out.pop(); out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ""); out.push(list);
        }
        // The item's wrapped lines join it before the inline pass, so *italics* can span a line break.
        let text = li[3];
        while (i + 1 < lines.length && lines[i + 1].trim() && /^\s{2,}/.test(lines[i + 1]) && !listItem(lines[i + 1]) && !isTable(lines[i + 1])) text += ` ${lines[++i].trim()}`;
        out.push(`<li>${inline(text)}</li>`);
        i++;
      }
      while (stack.length) { const top = stack.pop(); out.push(top.ordered ? "</ol>" : "</ul>"); if (stack.length) out[out.length - 1] += "</li>"; }
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*\||---+\s*$|!\[)/.test(lines[i]) && !listItem(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** Images are swapped for small JPEGs before printing (see embedImages), so the PDFs stay light. */
const IMAGE = "cairnkeepers-image:";
async function embedImages(html) {
  const paths = [...new Set([...html.matchAll(new RegExp(`${IMAGE}([^"]+)`, "g"))].map((m) => m[1]))];
  for (const path of paths) {
    const jpeg = await sharp(path).resize({ width: 1400, withoutEnlargement: true }).flatten({ background: "#f4f4e6" }).jpeg({ quality: 78 }).toBuffer();
    html = html.split(`${IMAGE}${path}`).join(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  }
  return html;
}

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Kalam:wght@400;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=block" rel="stylesheet">`;

/** One sheet of waterproof field-book paper as SVG: faintly mottled, grained, with water marks. */
const paperSvg = (seed, marks) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1100" width="850" height="1100" preserveAspectRatio="none">
  <defs>
    <filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.46  0 0 0 0 0.36  0 0 0 1.4 -0.6"/></filter>
    <filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 4}"/><feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.22  0 0 0 0 0.2  0 0 0 -1.4 0.8"/></filter>
    <filter id="w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${seed + 8}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="18"/><feGaussianBlur stdDeviation="1.4"/></filter>
    <radialGradient id="a" cx="0.5" cy="0.5" r="0.75"><stop offset="0.7" stop-color="#4a5a50" stop-opacity="0"/><stop offset="1" stop-color="#3a4a40" stop-opacity="0.3"/></radialGradient>
  </defs>
  <rect width="850" height="1100" fill="#edeedd"/>
  <rect width="850" height="1100" filter="url(#m)" opacity="0.4"/>
  <rect width="850" height="1100" filter="url(#g)" opacity="0.3"/>
  ${marks}
  <rect width="850" height="1100" fill="url(#a)"/>
</svg>`;
const water = (x, y, r) => `<g filter="url(#w)"><circle cx="${x}" cy="${y}" r="${r}" fill="#7fa4b9" opacity="0.08"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#5a8099" stroke-width="3" opacity="0.25"/></g>`;
const PAPERS = [
  paperSvg(4, water(760, 1000, 54)),
  paperSvg(9, ""),
  paperSvg(15, water(110, 150, 40)),
  paperSvg(22, water(700, 300, 30) + water(160, 980, 48)),
];

const NOTEBOOK_CSS = `
  @page { size: Letter; margin: 0; }
  :root { --ink: #1f262d; --pencil: rgba(31,38,45,0.45); --signal: #e0612b; --pen: #1b4a73; }
  html, body { margin: 0; background: #26303a; }
  body { color: var(--ink); font: 10.8pt/1.38 "Crimson Pro", Georgia, serif; }
  #flow { position: absolute; left: -9999px; width: 6.86in; }
  .page { position: relative; width: 8.5in; height: 11in; overflow: hidden; break-after: page; background: #edeedd; }
  .page > .paper { position: absolute; inset: 0; width: 100%; height: 100%; }
  .page > .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(60,120,120,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(60,120,120,0.18) 1px, transparent 1px),
      linear-gradient(rgba(60,120,120,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(60,120,120,0.1) 1px, transparent 1px);
    background-size: 1in 1in, 1in 1in, 0.2in 0.2in, 0.2in 0.2in; background-position: 0 0.6in; }
  .spiral { position: absolute; top: 0.08in; left: 0.45in; right: 0.45in; height: 0.42in; display: flex; justify-content: space-between; z-index: 3; }
  .spiral i { width: 0.14in; height: 0.42in; border-radius: 0.07in; background: linear-gradient(90deg, #5d666f, #c9d0d6 45%, #6a737c); box-shadow: 1px 2px 2px rgba(0,0,0,0.35); }
  .spiral i::after { content: ""; display: block; width: 0.1in; height: 0.1in; margin: 0.28in auto 0; border-radius: 50%; background: #1b2229; }
  .band { position: absolute; left: 0; right: 0; top: 0.62in; height: 0.07in; background: var(--signal); opacity: 0.85; }
  .content { position: absolute; top: 0.95in; bottom: 0.72in; left: 0.82in; right: 0.82in; overflow: hidden; }
  .folio { position: absolute; bottom: 0.32in; right: 0.82in; font: 700 13pt "Kalam", cursive; color: var(--signal); }
  .running { position: absolute; top: 0.74in; right: 0.82in; font: 8pt "Special Elite", monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(31,38,45,0.6); }
  .content > :first-child { margin-top: 0 !important; }
  h1 { font: 400 25pt/1.05 "Special Elite", monospace; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); }
  h2 { font: 400 14.5pt/1.1 "Special Elite", monospace; text-transform: uppercase; letter-spacing: 0.03em; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1.2px solid var(--pencil); }
  h3 { font: 600 12.5pt/1.15 "Crimson Pro", Georgia, serif; margin: 11px 0 4px; }
  h4 { font: 400 10.5pt "Special Elite", monospace; text-transform: uppercase; margin: 9px 0 2px; }
  p { margin: 0 0 7px; } ul, ol { margin: 0 0 7px; padding-left: 20px; } li { margin-bottom: 2px; }
  hr { border: 0; text-align: center; margin: 8px 0; height: 1em; } hr::after { content: "▲ ▲ ▲"; font-size: 8pt; letter-spacing: 0.4em; color: var(--pencil); }
  code { font-family: "Courier New", monospace; font-size: 9.4pt; background: rgba(224,97,43,0.13); padding: 0 3px; border-radius: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 9.8pt; }
  th { font: 400 8.6pt "Special Elite", monospace; text-transform: uppercase; text-align: left; border-bottom: 1.6px solid var(--ink); padding: 2px 5px; }
  td { border-bottom: 1px solid var(--pencil); padding: 2.5px 5px; vertical-align: top; }
  tr:nth-child(even) td { background: rgba(255,255,245,0.35); }
  blockquote { margin: 6px 0 10px; padding: 2px 12px; border-left: 3px solid var(--signal); font-style: italic; }
  aside.card { position: relative; margin: 14px 8px 14px; padding: 9px 12px 6px 22px; background: #f6e9c8; box-shadow: 2px 4px 10px rgba(0,0,0,0.22); font-size: 9.9pt;
    clip-path: polygon(0 10px, 12px 0, 100% 0, 100% 100%, 12px 100%, 0 calc(100% - 10px)); transform: rotate(-0.4deg); }
  aside.card.tilt { transform: rotate(0.4deg); }
  aside.card::before { content: ""; position: absolute; left: 7px; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: #edeedd; box-shadow: inset 0 0 0 2px #b9925a; transform: translateY(-50%); }
  aside.card p { margin: 0 0 4px; }
  figure { margin: 8px 0 12px; text-align: center; } figure img { max-width: 100%; max-height: 4.4in; border: 6px solid #fbfbf2; box-shadow: 2px 4px 10px rgba(0,0,0,0.3); }
  figcaption { font: 700 12pt "Kalam", cursive; color: var(--signal); margin-top: 4px; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover h1 { border: 0; font-size: 50pt; letter-spacing: 0.04em; margin: 18px 0 0; }
  .cover .sub { font: italic 15pt "Crimson Pro", serif; margin: 6px 0 30px; }
  .cover .hand { font: 700 17pt/1.2 "Kalam", cursive; color: var(--pen); transform: rotate(-2deg); max-width: 4.8in; }
  .cover .stamp { margin-top: 36px; border: 3px solid rgba(224,97,43,0.75); color: rgba(224,97,43,0.85); font: 11pt "Special Elite", monospace; letter-spacing: 0.14em; padding: 6px 16px; transform: rotate(5deg); }
  @media print { html, body { background: none; } }
`;

const EMBLEM = `<svg width="150" height="166" viewBox="0 0 58 64" aria-hidden="true">
  <ellipse cx="29" cy="56" rx="24" ry="6" fill="#8d9096" stroke="#1f262d" stroke-width="2.2"/><ellipse cx="29" cy="45" rx="19" ry="6" fill="#7a7d82" stroke="#1f262d" stroke-width="2.2"/>
  <ellipse cx="28" cy="35" rx="14" ry="5" fill="#9a9da2" stroke="#1f262d" stroke-width="2.2"/><ellipse cx="30" cy="26" rx="10" ry="4.5" fill="#868a90" stroke="#1f262d" stroke-width="2.2"/>
  <path d="M29 22 V4" stroke="#4f3b2a" stroke-width="2.4"/><path d="M29 5 L45 9 L29 13 Z" fill="#e0612b" stroke="#1f262d" stroke-width="1.6"/></svg>`;

/**
 * Runs in the page: pours the flowed document into Letter-sized pages, each on its own paper.
 * Chromium paints nothing in @page margins, so the pages carry their own margins instead.
 * Long tables and lists split between pages (a table repeats its header); a heading never ends a page.
 */
function paginate({ papers, cover, running }) {
  const flow = document.getElementById("flow");
  let n = 0, body;
  const makePage = () => {
    const page = document.createElement("section");
    page.className = "page";
    page.innerHTML = `<img class="paper" alt="" src="${papers[n % papers.length]}"><div class="grid"></div>
      <div class="spiral">${"<i></i>".repeat(22)}</div><div class="band"></div>
      <div class="content"></div>${n ? `<div class="running">${running}</div><div class="folio">${n}</div>` : ""}`;
    flow.before(page);
    n++;
    return page.querySelector(".content");
  };
  const coverBox = makePage();
  coverBox.classList.add("cover");
  coverBox.innerHTML = cover;
  body = makePage();
  const fits = () => body.scrollHeight <= body.clientHeight + 0.5;
  const newPage = () => {
    const prev = body;
    body = makePage();
    const last = prev.lastElementChild;
    if (last && /^H[1-4]$/.test(last.tagName)) body.append(last);
  };
  let cards = 0;
  for (const blk of [...flow.children]) {
    if (blk.matches("aside.card") && cards++ % 2) blk.classList.add("tilt");
    if (blk.tagName === "H1" && body.children.length) newPage();
    body.append(blk);
    if (fits()) continue;
    blk.remove();
    const isTable = blk.tagName === "TABLE";
    if ((isTable || blk.tagName === "UL" || blk.tagName === "OL") && blk.children.length) {
      const items = isTable ? [...blk.tBodies[0].rows] : [...blk.children];
      const shell = (start) => {
        const s = blk.cloneNode(false);
        if (isTable) { if (blk.tHead) s.append(blk.tHead.cloneNode(true)); s.append(document.createElement("tbody")); }
        if (blk.tagName === "OL") s.start = start;
        return s;
      };
      let part = shell(1);
      body.append(part);
      const holder = () => (isTable ? part.tBodies[0] : part);
      items.forEach((it, k) => {
        holder().append(it);
        if (fits()) return;
        it.remove();
        if (!holder().children.length) part.remove();
        newPage();
        part = shell(k + 1);
        body.append(part);
        holder().append(it);
      });
      continue;
    }
    newPage();
    body.append(blk);
  }
  flow.remove();
  return n;
}

function notebook(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${FONTS}<style>${NOTEBOOK_CSS}</style></head><body>
  <div id="flow">${bodyHtml}</div></body></html>`;
}
const coverHtml = (c) => `${EMBLEM}<h1>Cairnkeepers</h1><div class="sub">${c.sub}</div><div class="hand">${c.hand}</div><div class="stamp">${c.stamp}</div>`;

const pdfs = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const settle = async (p = page) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300); };
  // Chromium prints SVG filters as huge bitmaps on every page, so the paper is photographed once at
  // about 150 dpi and swapped in as a JPEG before printing.
  const hi = await browser.newPage({ deviceScaleFactor: 1.3, viewport: { width: 900, height: 1100 } });
  const paperShots = async (selector) => {
    await settle(hi);
    const shots = [];
    for (const el of await hi.$$(selector)) shots.push(`data:image/jpeg;base64,${(await el.screenshot({ type: "jpeg", quality: 72 })).toString("base64")}`);
    return shots;
  };
  const swapPaper = async (selector, shots) => {
    await page.evaluate(([sel, urls]) => {
      document.querySelectorAll(sel).forEach((svg, i) => { const img = document.createElement("img"); img.className = svg.getAttribute("class") ?? ""; img.alt = ""; img.src = urls[i]; svg.replaceWith(img); });
    }, [selector, shots]);
    await page.waitForFunction(() => [...document.images].every((im) => im.complete));
  };
  const sheetUrl = pathToFileURL(join(SHEET, "sheet.html")).href;
  await hi.goto(sheetUrl, { waitUntil: "networkidle" });
  const sheetPaper = await paperShots(".page > svg.paper");
  const bookPapers = [];
  for (const svg of PAPERS) {
    await hi.setContent(`<body style="margin:0">${svg}</body>`);
    bookPapers.push(...await paperShots("svg"));
  }

  // The character sheet: blank, then each pregen.
  await page.goto(sheetUrl, { waitUntil: "networkidle" });
  await settle();
  await swapPaper(".page > svg.paper", sheetPaper);
  const blank = join(SHEET, "cairnkeepers-character-sheet.pdf");
  await page.pdf({ path: blank, printBackground: true, preferCSSPageSize: true });
  pdfs.push(blank);
  await mkdir(join(SHEET, "pregens"), { recursive: true });
  for (const pregen of JSON.parse(await readFile(join(SHEET, "pregens.json"), "utf8"))) {
    await page.goto(sheetUrl, { waitUntil: "networkidle" });
    await settle();
    await swapPaper(".page > svg.paper", sheetPaper);
    await page.evaluate((d) => window.fillSheet(d), pregen);
    const out = join(SHEET, "pregens", `${pregen.slug}.pdf`);
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
    pdfs.push(out);
  }

  // The rulebook and the adventure, as a Guide's field book.
  const books = [
    { out: "cairnkeepers-rules.pdf", title: "Cairnkeepers — Rules", files: ["rules.md", "bestiary.md"],
      cover: { sub: "A Guide's field book: rules, callings, and what lives above the snowline", hand: "Property of the Cairnkeepers' Guild, Brennford. If found on the mountain, follow the cairns down and hand it in at the guildhouse.", stamp: "Cairnkeepers' Guild" } },
    { out: "the-winter-road.pdf", title: "The Winter Road", files: ["adventure.md"],
      cover: { sub: "The Winter Road — an adventure for the Game Master", hand: "For the GM's eyes only. Keep it closed at the table, and keep the Storm Clock where they can't see it.", stamp: "GM only" } },
  ];
  for (const book of books) {
    if (!book.files.every((f) => existsSync(join(GAME, f)))) { console.log(`skipped ${book.out}: missing ${book.files.join(", ")}`); continue; }
    const body = await embedImages((await Promise.all(book.files.map(async (f) => markdown(await readFile(join(GAME, f), "utf8"), GAME)))).join("\n"));
    await page.setContent(notebook(book.title, body), { waitUntil: "networkidle" });
    await settle();
    const pages = await page.evaluate(`(${paginate.toString()})(${JSON.stringify({ papers: bookPapers, cover: coverHtml(book.cover), running: book.title })})`);
    await page.waitForFunction(() => [...document.images].every((im) => im.complete));
    const out = join(GAME, book.out);
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
    console.log(`${book.out}: ${pages} pages`);
    pdfs.push(out);
  }
} finally {
  await browser.close();
}

for (const pdf of pdfs) {
  const png = join(previewDir, pdf.split("/").pop().replace(/\.pdf$/, ".png"));
  try { execFileSync("sips", ["-s", "format", "png", pdf, "--out", png], { stdio: "ignore" }); console.log(pdf.replace(GAME, ""), "→ preview", png); }
  catch { console.log(pdf.replace(GAME, "")); }
}
