/**
 * Renders the Cairnkeepers maps from layouts.mjs. For each map it writes, in games/cairnkeepers/art/maps/:
 *   <slug>.webp         the battle map (70 px per 5 ft square)
 *   <slug>-gm-key.webp  the map at half size with the grid, the terrain, the obscuring fog, the
 *                       doors and windows, and the area numbers
 *   <slug>.dd2vtt       Universal VTT: the image, grid, walls and openings (doors, windows and ice;
 *                       UVTT can't say which, or carry terrain and fog)
 *   <slug>.board.json   everything the library map holds: grid, walls with their doors, windows and
 *                       ice (locked windows: see-through, impassable), terrain runs and fog regions
 * and a check image (rock walls red, ice cyan, doors yellow, locked magenta, terrain and fog
 * outlined) in the directory given by --check-dir (default: the OS temp dir).
 *
 *   node scripts/cairnkeepers/render-maps.mjs [--only=<slug>] [--check-dir=<dir>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { drawMap } from "./draw-map.mjs";
import { LAYOUTS, OBSCURING, TERRAIN } from "./layouts.mjs";

const CELL = 70;
const GRID = { cellSize: CELL, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const OUT = fileURLToPath(new URL("../../games/cairnkeepers/art/maps/", import.meta.url));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const only = arg("only");
const checkDir = arg("check-dir") ?? tmpdir();

const SOLID = "X#o", ICE = "I";
const isPortal = (ch) => ch === "D" || ch === "L" || ch === "w";
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function check(layout) {
  const rows = layout.grid.length, cols = layout.grid[0].length;
  layout.grid.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`${layout.slug}: row ${r} is ${row.length} wide, expected ${cols}`);
    const bad = [...row].find((ch) => !".:_ce=sp v*^-ibdV~rX#oIDLw".replace(" ", "").includes(ch));
    if (bad) throw new Error(`${layout.slug}: row ${r} has unknown square "${bad}"`);
  });
  return { rows, cols };
}

/** Doors and windows: across the middle of their square, at right angles to the way through. */
function buildPortals(grid, cols, rows) {
  const open = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || (!SOLID.includes(grid[r][c]) && grid[r][c] !== ICE && !isPortal(grid[r][c]));
  const portals = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = grid[r][c];
    if (!isPortal(ch)) continue;
    const eastWest = open(c - 1, r) && open(c + 1, r);
    if (!eastWest && !(open(c, r - 1) && open(c, r + 1))) throw new Error(`Portal at ${c},${r} has no way through`);
    portals.push({ c, r, orient: eastWest ? "v" : "h", kind: ch === "w" ? "window" : "door", lock: ch === "L" });
  }
  return portals;
}

/** Faces between open ground and `solid`, merged along straight runs. */
function faces(grid, cols, rows, solid) {
  const runs = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const here = grid[r][c];
    if (SOLID.includes(here) || here === ICE) continue;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || !solid.includes(grid[nr][nc])) continue;
      const key = dr !== 0 ? `H|${(r + (dr > 0 ? 1 : 0)) * CELL}` : `V|${(c + (dc > 0 ? 1 : 0)) * CELL}`;
      if (!runs.has(key)) runs.set(key, new Set());
      runs.get(key).add(dr !== 0 ? c * CELL : r * CELL);
    }
  }
  const out = [];
  for (const [key, set] of runs) {
    const [orient, lineStr] = key.split("|"), line = Number(lineStr), starts = [...set].sort((a, b) => a - b);
    let s = starts[0], e = s + CELL;
    const flush = () => out.push(orient === "H" ? { a: { x: s, y: line }, b: { x: e, y: line } } : { a: { x: line, y: s }, b: { x: line, y: e } });
    for (const st of starts.slice(1)) { if (st === e) e += CELL; else { flush(); s = st; e = st + CELL; } }
    flush();
  }
  return out;
}

function buildWalls(grid, cols, rows, portals) {
  const walls = faces(grid, cols, rows, SOLID);
  // Ice is a wall you can see through: a window nobody can open.
  for (const w of faces(grid, cols, rows, ICE)) walls.push({ ...w, portal: { kind: "window", state: "locked" } });
  for (const p of portals) {
    const x0 = p.c * CELL, y0 = p.r * CELL, portal = { kind: p.kind, state: p.lock ? "locked" : "closed" };
    walls.push(p.orient === "v"
      ? { a: { x: x0 + CELL / 2, y: y0 }, b: { x: x0 + CELL / 2, y: y0 + CELL }, portal }
      : { a: { x: x0, y: y0 + CELL / 2 }, b: { x: x0 + CELL, y: y0 + CELL / 2 }, portal });
  }
  return walls;
}

/** The ground's terrain as the app stores it: row runs of the same kind (see compressTerrain). */
function buildTerrain(grid) {
  const runs = [];
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const kind = TERRAIN[row[c]];
      if (!kind) continue;
      const last = runs.at(-1);
      if (last && last.row === r && last.end + 1 === c && last.kind === kind) last.end = c;
      else runs.push({ row: r, start: c, end: c, kind });
    }
  });
  return runs;
}

/** Connected regions of obscuring squares, each as an outline in board pixels (or rectangles). */
function buildFog(grid, cols, rows) {
  const seen = new Set(), regions = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!OBSCURING.includes(grid[r][c]) || seen.has(`${c},${r}`)) continue;
    const ch = grid[r][c], cells = [], stack = [[c, r]];
    seen.add(`${c},${r}`);
    while (stack.length) {
      const [x, y] = stack.pop(); cells.push([x, y]);
      for (const [dc, dr] of DIRS) {
        const nx = x + dc, ny = y + dr;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && grid[ny][nx] === ch && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
      }
    }
    regions.push(...outline(cells));
  }
  return regions;
}

/** The clockwise outline of a region of squares; rectangles per row run if it has holes or too many corners. */
function outline(cells) {
  const inside = new Set(cells.map(([c, r]) => `${c},${r}`));
  const has = (c, r) => inside.has(`${c},${r}`);
  const next = new Map();
  const edge = (x0, y0, x1, y1) => next.set(`${x0},${y0}`, [x1, y1]);
  for (const [c, r] of cells) {
    if (!has(c, r - 1)) edge(c, r, c + 1, r);
    if (!has(c + 1, r)) edge(c + 1, r, c + 1, r + 1);
    if (!has(c, r + 1)) edge(c + 1, r + 1, c, r + 1);
    if (!has(c - 1, r)) edge(c, r + 1, c, r);
  }
  const loop = [];
  const startKey = next.keys().next().value;
  let key = startKey, guard = 0;
  do {
    const [x, y] = key.split(",").map(Number);
    loop.push([x, y]);
    const n = next.get(key);
    if (!n) break;
    key = `${n[0]},${n[1]}`;
  } while (key !== startKey && ++guard < 10000);
  // Drop the corners that sit on a straight line.
  const pts = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
    return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
  });
  const edges = [...next.keys()].length;
  if (loop.length === edges && pts.length <= 64) return [{ shape: "polygon", points: pts.map(([x, y]) => ({ x: x * CELL, y: y * CELL })) }];
  const rects = [];
  const byRow = new Map();
  for (const [c, r] of cells) { if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(c); }
  for (const [r, list] of byRow) {
    list.sort((a, b) => a - b);
    let s = list[0], e = s;
    const flush = () => rects.push({ shape: "polygon", points: [[s, r], [e + 1, r], [e + 1, r + 1], [s, r + 1]].map(([x, y]) => ({ x: x * CELL, y: y * CELL })) });
    for (const c of list.slice(1)) { if (c === e + 1) e = c; else { flush(); s = c; e = c; } }
    flush();
  }
  return rects;
}

const grid1 = (p) => ({ x: p.x / CELL, y: p.y / CELL });

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const layout of LAYOUTS) {
    if (only && layout.slug !== only) continue;
    const { rows, cols } = check(layout);
    const portals = buildPortals(layout.grid, cols, rows);
    const walls = buildWalls(layout.grid, cols, rows, portals);
    const terrain = buildTerrain(layout.grid);
    const fog = buildFog(layout.grid, cols, rows);
    const W = cols * CELL, H = rows * CELL;
    const args = { grid: layout.grid, cols, rows, cell: CELL, props: layout.props, kind: layout.kind, seed: layout.seed, portals, keys: layout.keys, terrain, fog };
    const render = async (mode) => {
      const url = await page.evaluate(`(${drawMap.toString()})(${JSON.stringify({ ...args, mode })})`);
      return Buffer.from(url.split(",")[1], "base64");
    };
    const t0 = Date.now();
    const png = await render("art");
    const webp = await sharp(png).webp({ quality: 86 }).toBuffer();
    await writeFile(join(OUT, `${layout.slug}.webp`), webp);
    const key = await render("key");
    await sharp(key).resize(Math.round(W / 2), Math.round(H / 2)).webp({ quality: 84 }).toFile(join(OUT, `${layout.slug}-gm-key.webp`));

    const openings = walls.filter((w) => w.portal);
    const uvtt = {
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: cols, y: rows }, pixels_per_grid: CELL },
      line_of_sight: walls.filter((w) => !w.portal).map((w) => [grid1(w.a), grid1(w.b)]),
      portals: openings.map((w) => ({
        position: grid1({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }),
        bounds: [grid1(w.a), grid1(w.b)],
        rotation: w.a.x === w.b.x ? Math.PI / 2 : 0,
        closed: true,
        freestanding: false,
      })),
      image: webp.toString("base64"),
    };
    await writeFile(join(OUT, `${layout.slug}.dd2vtt`), JSON.stringify(uvtt));
    await writeFile(join(OUT, `${layout.slug}.board.json`), JSON.stringify({ map: layout.name, width: W, height: H, grid: GRID, board: { terrain, walls, fog } }, null, 1) + "\n");

    const lines = walls.map((w) => {
      const color = w.portal ? (w.portal.state === "locked" ? (w.portal.kind === "window" ? "#00ffff" : "#ff00ff") : w.portal.kind === "window" ? "#00a0ff" : "#ffff00") : "#ff2020";
      return `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${color}" stroke-width="5"/>`;
    });
    const cellsSvg = terrain.flatMap((run) => Array.from({ length: run.end - run.start + 1 }, (_, i) => `<rect x="${(run.start + i) * CELL + 6}" y="${run.row * CELL + 6}" width="${CELL - 12}" height="${CELL - 12}" fill="none" stroke="${run.kind === "blocked" ? "#ff4040" : "#3070ff"}" stroke-width="2" stroke-dasharray="${run.kind === "blocked" ? "0" : "6 4"}"/>`));
    const fogSvg = fog.map((f) => `<polygon points="${f.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="rgba(0,160,60,0.18)" stroke="#00a040" stroke-width="4"/>`);
    const overlay = join(checkDir, `${layout.slug}-check.png`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${cellsSvg.join("")}${fogSvg.join("")}${lines.join("")}</svg>`;
    const checked = await sharp(png).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    await sharp(checked).resize(Math.round(W / 2)).png().toFile(overlay);
    const count = (k) => terrain.filter((t) => t.kind === k).reduce((n, t) => n + t.end - t.start + 1, 0);
    console.log(`${layout.slug}: ${W}×${H}, ${walls.length - openings.length} walls, ${openings.filter((w) => w.portal.kind === "door").length} doors, ${openings.filter((w) => w.portal.kind === "window" && w.portal.state === "closed").length} windows, ${openings.filter((w) => w.portal.kind === "window" && w.portal.state === "locked").length} ice faces; terrain ${count("difficult")} difficult + ${count("blocked")} blocked; ${fog.length} fog regions (${fog.map((f) => f.points.length).join("/")} points); ${(webp.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
    console.log("  check:", overlay);
  }
} finally {
  await browser.close();
}
