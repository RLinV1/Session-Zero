import type { DraftMark, GridSpec, LibraryMapBoard, OpeningView, Point, TerrainKind, TerrainRun } from "@vtt/shared";

/**
 * The picture `view_file` gives an AI setting up a map (ADR 0053): the map with its grid, column and
 * row numbers, walls, numbered openings and proposed terrain drawn on it, so the AI reads positions off numbers
 * instead of guessing pixels. Pure layout: the route renders the SVG over the image with sharp.
 *
 * Numbers are drawn as strokes, not text, so the picture doesn't depend on fonts in the container.
 */

type GridNumbers = Pick<GridSpec, "cellSize" | "offsetX" | "offsetY">;

/** A block of squares to look at closely, inclusive. */
export interface OverlayRegion { fromColumn: number; toColumn: number; fromRow: number; toRow: number }

export interface OverlayInput {
  /** The stored image's size, in map pixels. */
  width: number;
  height: number;
  grid: GridNumbers | null;
  walls: LibraryMapBoard["walls"];
  openings: readonly Pick<OpeningView, "number" | "a" | "b">[];
  marks: readonly DraftMark[];
  /** Proposed permanent terrain, in squares of `grid` (ADR 0071). Drawn only with a grid. */
  terrain?: readonly TerrainRun[];
  region: OverlayRegion | null;
  /** Longest side of the picture. */
  maxEdge: number;
}

export interface OverlayLabel { kind: "column" | "row" | "opening" | "mark"; text: string; x: number; y: number }

export interface OverlayLayout {
  /** The part of the image shown, in map pixels. */
  crop: { left: number; top: number; width: number; height: number };
  /** The picture's size. */
  out: { width: number; height: number };
  /** Where each number is drawn, in the picture's pixels: the centre of its box. */
  labels: OverlayLabel[];
  svg: string;
}

/** A small region is enlarged to make squares easier to see, up to this much. */
const MAX_ENLARGE = 4;
/** Height of a drawn digit, in the picture's pixels. */
const DIGIT = 12;
const DIGIT_WIDTH = DIGIT * 0.5;
const GAP = 3;
const PAD = 3;

// Seven-segment digits on a 4 by 8 box.
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [0, 0, 4, 0], b: [4, 0, 4, 4], c: [4, 4, 4, 8], d: [0, 8, 4, 8], e: [0, 4, 0, 8], f: [0, 0, 0, 4], g: [0, 4, 4, 4],
};
const DIGITS: Record<string, string> = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgecd", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

const round = (n: number) => Math.round(n * 10) / 10;
const labelWidth = (text: string) => text.length * DIGIT_WIDTH + (text.length - 1) * GAP + PAD * 2;
const labelHeight = DIGIT + PAD * 2;

/** One number in a box, centred on (x, y). */
function numberBox(text: string, x: number, y: number, border: string): string {
  const w = labelWidth(text), h = labelHeight;
  const left = x - w / 2, top = y - h / 2;
  // The 4 by 8 segment box, stretched to a digit's width and height.
  const sx = DIGIT_WIDTH / 4, sy = DIGIT / 8;
  const strokes = [...text].map((ch, i) => {
    const ox = left + PAD + i * (DIGIT_WIDTH + GAP), oy = top + PAD;
    return [...(DIGITS[ch] ?? "")].map((s) => {
      const [x1, y1, x2, y2] = SEGMENTS[s]!;
      return `M${round(ox + x1 * sx)} ${round(oy + y1 * sy)}L${round(ox + x2 * sx)} ${round(oy + y2 * sy)}`;
    }).join("");
  }).join("");
  return `<rect x="${round(left)}" y="${round(top)}" width="${round(w)}" height="${round(h)}" rx="2" fill="#000" fill-opacity="0.75" stroke="${border}" stroke-width="1.5"/>`
    + `<path d="${strokes}" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
}

const WALL_STYLE = {
  wall: 'stroke="#ff3b30" stroke-width="3"',
  door: 'stroke="#ffd60a" stroke-width="5"',
  window: 'stroke="#64d2ff" stroke-width="5"',
  opening: 'stroke="#ff9f0a" stroke-width="5" stroke-dasharray="6 4"',
} as const;

/**
 * Terrain as the board draws it (board-palette in apps/web/src/board/mapPalette.ts): the same colour
 * families, Difficult single-hatched in violet, Blocked crosshatched in red over a dark tint, so the
 * kinds differ by pattern as well as colour and Blocked never reads as a red wall line.
 */
const TERRAIN_STYLE: Record<TerrainKind, { inner: string; outer: string; tint: string; tintOpacity: number; cross: boolean }> = {
  difficult: { inner: "#9b4de8", outer: "#160b26", tint: "#9b4de8", tintOpacity: 0.22, cross: false },
  blocked: { inner: "#e0525a", outer: "#1f0a0c", tint: "#1f0a0c", tintOpacity: 0.45, cross: true },
};

/** One pattern per kind, a quarter square apart, and each run as one rectangle filled with it. */
function terrainParts(terrain: readonly TerrainRun[], grid: GridNumbers, scale: number, at: (p: Point) => Point, out: { width: number; height: number }): string[] {
  const step = Math.max(4, (grid.cellSize * scale) / 4);
  const defs = (Object.keys(TERRAIN_STYLE) as TerrainKind[]).map((kind) => {
    const style = TERRAIN_STYLE[kind];
    const lines = `M0 0L${round(step)} ${round(step)}${style.cross ? `M${round(step)} 0L0 ${round(step)}` : ""}`;
    return `<pattern id="terrain-${kind}" width="${round(step)}" height="${round(step)}" patternUnits="userSpaceOnUse">`
      + `<path d="${lines}" stroke="${style.outer}" stroke-opacity="0.5" stroke-width="3" fill="none"/>`
      + `<path d="${lines}" stroke="${style.inner}" stroke-opacity="0.9" stroke-width="1.5" fill="none"/></pattern>`;
  });
  const rects: string[] = [];
  for (const run of terrain) {
    const a = at({ x: grid.offsetX + run.start * grid.cellSize, y: grid.offsetY + run.row * grid.cellSize });
    const b = at({ x: grid.offsetX + (run.end + 1) * grid.cellSize, y: grid.offsetY + (run.row + 1) * grid.cellSize });
    const left = Math.max(0, a.x), top = Math.max(0, a.y), right = Math.min(out.width, b.x), bottom = Math.min(out.height, b.y);
    if (right <= left || bottom <= top) continue;
    const style = TERRAIN_STYLE[run.kind];
    const box = `x="${round(left)}" y="${round(top)}" width="${round(right - left)}" height="${round(bottom - top)}"`;
    rects.push(`<rect ${box} fill="${style.tint}" fill-opacity="${style.tintOpacity}"/><rect ${box} fill="url(#terrain-${run.kind})" stroke="${style.inner}" stroke-opacity="0.9" stroke-width="1.5" data-terrain="${run.kind}"/>`);
  }
  return rects.length > 0 ? [`<defs>${defs.join("")}</defs>`, ...rects] : [];
}

export function mapOverlay(input: OverlayInput): OverlayLayout {
  const { grid } = input;
  let left = 0, top = 0, right = input.width, bottom = input.height;
  if (grid && input.region) {
    const r = input.region;
    left = Math.max(0, grid.offsetX + Math.min(r.fromColumn, r.toColumn) * grid.cellSize);
    right = Math.min(input.width, grid.offsetX + (Math.max(r.fromColumn, r.toColumn) + 1) * grid.cellSize);
    top = Math.max(0, grid.offsetY + Math.min(r.fromRow, r.toRow) * grid.cellSize);
    bottom = Math.min(input.height, grid.offsetY + (Math.max(r.fromRow, r.toRow) + 1) * grid.cellSize);
    if (right - left < 1 || bottom - top < 1) { left = 0; top = 0; right = input.width; bottom = input.height; }
  }
  const crop = { left: Math.floor(left), top: Math.floor(top), width: Math.ceil(right) - Math.floor(left), height: Math.ceil(bottom) - Math.floor(top) };
  const scale = Math.min(MAX_ENLARGE, input.maxEdge / Math.max(crop.width, crop.height));
  const out = { width: Math.max(1, Math.round(crop.width * scale)), height: Math.max(1, Math.round(crop.height * scale)) };
  const at = (p: Point) => ({ x: (p.x - crop.left) * scale, y: (p.y - crop.top) * scale });
  const shown = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= out.width && p.y <= out.height;

  const parts: string[] = [];
  const labels: OverlayLabel[] = [];

  // Under the grid lines and walls, so neither is hidden by it.
  if (grid && input.terrain?.length) parts.push(...terrainParts(input.terrain, grid, scale, at, out));

  if (grid) {
    const cell = grid.cellSize * scale;
    const first = (offset: number, start: number) => Math.floor((start - offset) / grid.cellSize);
    const lines: string[] = [];
    for (let c = first(grid.offsetX, crop.left); grid.offsetX + c * grid.cellSize <= crop.left + crop.width; c++) {
      const x = at({ x: grid.offsetX + c * grid.cellSize, y: 0 }).x;
      if (x >= 0 && x <= out.width) lines.push(`M${round(x)} 0V${out.height}`);
    }
    for (let r = first(grid.offsetY, crop.top); grid.offsetY + r * grid.cellSize <= crop.top + crop.height; r++) {
      const y = at({ x: 0, y: grid.offsetY + r * grid.cellSize }).y;
      if (y >= 0 && y <= out.height) lines.push(`M0 ${round(y)}H${out.width}`);
    }
    parts.push(`<path d="${lines.join("")}" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="1" fill="none"/>`);

    // Every column and row is numbered when there is room, otherwise every 2nd, 5th or 10th.
    const every = (size: number) => [1, 2, 5, 10, 20, 50, 100].find((n) => n * size >= labelWidth("000") + 2) ?? 100;
    const columnStep = every(cell), rowStep = every(cell);
    for (let c = Math.max(0, first(grid.offsetX, crop.left)); grid.offsetX + c * grid.cellSize < crop.left + crop.width; c++) {
      if (c % columnStep !== 0) continue;
      const x = at({ x: grid.offsetX + (c + 0.5) * grid.cellSize, y: 0 }).x;
      if (x < 0 || x > out.width) continue;
      labels.push({ kind: "column", text: String(c), x: round(x), y: round(labelHeight / 2 + 1) });
    }
    for (let r = Math.max(0, first(grid.offsetY, crop.top)); grid.offsetY + r * grid.cellSize < crop.top + crop.height; r++) {
      if (r % rowStep !== 0) continue;
      const y = at({ x: 0, y: grid.offsetY + (r + 0.5) * grid.cellSize }).y;
      if (y < 0 || y > out.height) continue;
      labels.push({ kind: "row", text: String(r), x: round(labelWidth(String(r)) / 2 + 1), y: round(y) });
    }
  }

  const wallPaths: Record<keyof typeof WALL_STYLE, string[]> = { wall: [], door: [], window: [], opening: [] };
  for (const wall of input.walls) {
    const a = at(wall.a), b = at(wall.b);
    const style = wall.portal ? wall.portal.kind : wall.uvttPortal ? "opening" : "wall";
    wallPaths[style].push(`M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`);
  }
  for (const style of ["wall", "opening", "window", "door"] as const) {
    if (wallPaths[style].length > 0) parts.push(`<path d="${wallPaths[style].join("")}" ${WALL_STYLE[style]} stroke-linecap="round" fill="none"/>`);
  }

  // A number on the map's edge would cover a column or row number, so it moves just inside them.
  const edgeX = grid ? labelWidth("000") + 2 : 0, edgeY = grid ? labelHeight + 2 : 0;
  const inside = (text: string, p: { x: number; y: number }) => ({
    x: round(Math.min(out.width - labelWidth(text) / 2, Math.max(edgeX + labelWidth(text) / 2, p.x))),
    y: round(Math.min(out.height - labelHeight / 2, Math.max(edgeY + labelHeight / 2, p.y))),
  });
  for (const opening of input.openings) {
    const middle = at({ x: (opening.a.x + opening.b.x) / 2, y: (opening.a.y + opening.b.y) / 2 });
    const text = String(opening.number);
    if (shown(middle)) labels.push({ kind: "opening", text, ...inside(text, middle) });
  }
  if (grid) {
    input.marks.forEach((mark, index) => {
      const centre = at({ x: grid.offsetX + (mark.square.column + 0.5) * grid.cellSize, y: grid.offsetY + (mark.square.row + 0.5) * grid.cellSize });
      if (!shown(centre)) return;
      parts.push(`<circle cx="${round(centre.x)}" cy="${round(centre.y)}" r="${round(Math.max(8, grid.cellSize * scale * 0.4))}" stroke="#ff2d95" stroke-width="3" fill="none"/>`);
      const text = String(index + 1);
      labels.push({ kind: "mark", text, ...inside(text, centre) });
    });
  }

  const border = { column: "#00e5ff", row: "#00e5ff", opening: "#ff9f0a", mark: "#ff2d95" } as const;
  for (const label of labels) parts.push(numberBox(label.text, label.x, label.y, border[label.kind]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}" viewBox="0 0 ${out.width} ${out.height}">${parts.join("")}</svg>`;
  return { crop, out, labels, svg };
}
