import type { CSSProperties } from "react";
import { blocksMovement, blocksSight, type Point, type Segment } from "@vtt/shared";
import type { Rgb } from "../../board/fogTexture";
import table from "./homeCrops.json";
import { HOME_WALLS } from "./homeWalls";

/**
 * The home page's maps were drawn for it, each scene in its own theme and drawing style with its
 * tokens drawn to match (sources in scripts/home-src, prompts in public/img/home/CREDITS.md).
 * Every crop is 20 squares wide and starts on a grid line of its map, cut by
 * scripts/home-maps.mjs to 1400 x 788, so each has exact 70 px squares from its top-left corner.
 * The script and this module read one table (homeCrops.json).
 */
export const CROP = { width: table.crop.width, height: table.crop.height, cell: table.crop.width / table.crop.squares } as const;

export type CropSlug = "canal-market" | "sun-tomb" | "forge-hall" | "moor-inn" | "goblin-camp" | "merchant-deck";

const entry = (slug: CropSlug) => table.maps.find((m) => m.slug === slug)!;

/**
 * The script's own arithmetic: the scale to 70 px squares on each axis (a drawn grid isn't always
 * quite square), and the crop's whole-pixel origin.
 */
export function cropTransform(slug: CropSlug): { scaleX: number; scaleY: number; left: number; top: number } {
  const m = entry(slug);
  const scaleX = CROP.cell / m.cell;
  const scaleY = CROP.cell / m.cellY;
  return {
    scaleX,
    scaleY,
    left: Math.round((m.offX + m.col * m.cell) * scaleX),
    top: Math.round((m.offY + m.row * m.cellY) * scaleY),
  };
}

/** A point of a home map, in the pixels of its crop. */
export function toCrop(slug: CropSlug, p: Point): Point {
  const t = cropTransform(slug);
  return { x: p.x * t.scaleX - t.left, y: p.y * t.scaleY - t.top };
}

/** A point of a home crop, in the pixels of its whole map: `toCrop` undone. */
export function fromCrop(slug: CropSlug, p: Point): Point {
  const t = cropTransform(slug);
  return { x: (p.x + t.left) / t.scaleX, y: (p.y + t.top) / t.scaleY };
}

/** A map's wall on its crop, with what it is: a plain wall, a door or a window. */
export interface CropWall extends Segment {
  kind: "wall" | "door" | "window";
  /** A door or window's state; a plain wall has none. */
  state: "open" | "closed" | "locked" | null;
}

/** Every wall of a home map (homeWalls.ts), moved onto its crop, doors and windows included. */
export function cropWallLines(slug: CropSlug): CropWall[] {
  return (HOME_WALLS[slug] ?? []).map((w) => ({
    a: toCrop(slug, w.a),
    b: toCrop(slug, w.b),
    kind: w.portal?.kind ?? "wall",
    state: w.portal?.state ?? null,
  }));
}

/**
 * The walls on a home crop that stop sight (the default) or a token's move, by the table's own
 * rules (`blocksSight`, `blocksMovement`): an open door lets both through, and a window lets
 * sight through but not a token.
 */
export function cropWalls(slug: CropSlug, stops: "sight" | "movement" = "sight"): Segment[] {
  return (HOME_WALLS[slug] ?? [])
    .filter(stops === "sight" ? blocksSight : blocksMovement)
    .map((w) => ({ a: toCrop(slug, w.a), b: toCrop(slug, w.b) }));
}

/**
 * A map's average colour, as the board takes it when the map loads (`averageColor`, the trimmed
 * mean of a 16 x 16 shrink of the whole map), measured once from each whole map. The board tints
 * its sight darkness from it (`sightColor`), so the home page's darkness is the table's.
 */
const AVERAGE: Record<CropSlug, Rgb> = {
  "canal-market": [119, 108, 107],
  "sun-tomb": [151, 90, 54],
  "forge-hall": [148, 132, 118],
  "moor-inn": [138, 121, 90],
  "goblin-camp": [152, 130, 85],
  "merchant-deck": [123, 155, 143],
};

const map = (slug: CropSlug, alt: string) => ({ slug, src: `/img/home/${slug}.webp`, alt, average: AVERAGE[slug] });

/** One map per section, each its own place and drawing style. */
export const MAPS = {
  hero: map(
    "canal-market",
    "A hand-painted ink and watercolour battle map of a canal-side night market at dusk: cobbled quay, cloth-awninged stalls, lantern posts and an arched stone footbridge over dark water.",
  ),
  visibility: map(
    "sun-tomb",
    "A gouache battle map of a sandstone tomb: a pillared burial hall with a sarcophagus on a dais, a small side chamber of urns behind a single doorway, and a collapsed passage.",
  ),
  grid: map(
    "forge-hall",
    "A pencil-drawn battle map of a dwarven forge hall on toned paper: square flagstones, two glowing hearths, an anvil, a quench trough and a cart track across the floor.",
  ),
  walls: map(
    "moor-inn",
    "An ink floor plan of a timber-framed coaching inn: common room with long tables and a hearth, kitchen, corridor, two guest rooms, a stair, and doors and windows in every wall.",
  ),
  templates: map(
    "goblin-camp",
    "A linocut battle map of a goblin raiding camp in the ruins of a forest watchtower.",
  ),
  recover: map(
    "merchant-deck",
    "A two-colour risograph battle map of a merchant ship's deck at anchor: planked deck, two masts, a cargo hatch, cannons along the rails and a quarterdeck with the wheel.",
  ),
} as const;

const portrait = (name: string) => `/img/home/tokens/${name}.webp`;

/** The tokens' art for each map, cut from sheets drawn in that map's style. Each map has its own cast. */
export const PORTRAITS = {
  hero: { brenna: portrait("canal-brenna"), toma: portrait("canal-toma"), ash: portrait("canal-ash") },
  visibility: { nalani: portrait("tomb-nalani"), kaveh: portrait("tomb-kaveh"), guardian: portrait("tomb-guardian") },
  templates: {
    mara: portrait("camp-mara"),
    pell: portrait("camp-pell"),
    boss: portrait("camp-boss"),
    goblin: portrait("camp-goblin"),
    archer: portrait("camp-archer"),
    wolf: portrait("camp-wolf"),
  },
  recover: { sela: portrait("ship-sela"), dunn: portrait("ship-dunn"), cutthroat: portrait("ship-cutthroat") },
} as const;

/** The names the library strip shows for the maps. */
const NAMES: Record<CropSlug, string> = {
  "canal-market": "The Lantern Quay",
  "sun-tomb": "The Sun Tomb",
  "forge-hall": "Deepforge Hall",
  "moor-inn": "The Moorside Inn",
  "goblin-camp": "The Broken Watchtower",
  "merchant-deck": "The Gull's Wager",
};

/** The page's maps whole, as a library would hold them: their own size and squares. */
export const HOME_MAPS = table.maps.map((m) => {
  const slug = m.slug as CropSlug;
  return {
    slug,
    name: NAMES[slug],
    thumb: `/img/home/${slug}-thumb.webp`,
    width: m.width,
    height: m.height,
    grid: { cell: m.cell, cellY: m.cellY, offX: m.offX, offY: m.offY },
    squares: { across: Math.floor((m.width - m.offX) / m.cell), down: Math.floor((m.height - m.offY) / m.cellY) },
  };
});

/** Where a token in square (col, row) of a home crop is centred. */
export const inSquare = (col: number, row: number): CSSProperties => ({
  left: `${(((col + 0.5) * CROP.cell) / CROP.width) * 100}%`,
  top: `${(((row + 0.5) * CROP.cell) / CROP.height) * 100}%`,
});

/** Part of a home crop shown on its own: `cols` x `rows` squares from square (col, row). */
export interface CropView {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** A view's rectangle in crop pixels. */
export const viewRect = (v: CropView) => ({ x: v.col * CROP.cell, y: v.row * CROP.cell, width: v.cols * CROP.cell, height: v.rows * CROP.cell });

/** Where a crop pixel falls in a view, as CSS percentages of the view. */
export const atPoint = (v: CropView, p: Point): CSSProperties => ({
  left: `${((p.x / CROP.cell - v.col) / v.cols) * 100}%`,
  top: `${((p.y / CROP.cell - v.row) / v.rows) * 100}%`,
});

/** True when any part of a segment lies on the crop (Liang-Barsky clipping against its edges). */
export function onCrop({ a, b }: Segment): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [[-dx, a.x], [dx, CROP.width - a.x], [-dy, a.y], [dy, CROP.height - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
