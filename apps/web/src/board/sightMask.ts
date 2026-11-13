import polygonClipping, { type Polygon as ClipPolygon } from "polygon-clipping";
import { fogPalette, type Rgb } from "./fogTexture";

type Point = { x: number; y: number };

/** The darkness takes the map's fog-bank colour, taken down this far so it reads near-black but never pure black. */
export const SIGHT_DARKEN = 0.16;
/** Mask pixels per grid cell, and the most along either side: enough for a clean edge, small enough to rebuild on every move. */
const SIGHT_PX_PER_CELL = 10;
const SIGHT_MAX_SIDE = 1536;

/**
 * The darkness's strength when it dims the map rather than hiding it: the map shows through, and
 * nothing on it outside sight does (the server still withholds it, ADR 0044).
 */
export const DIMMED_ALPHA = 0.62;

/**
 * How strongly the darkness covers the map. With at least one token to see through, it is opaque
 * outside the viewer's sight. With none (a player who has just joined, or whose only token is
 * hidden) the viewer would see nothing at all, not even where the map is; so the map shows dimmed
 * instead. That reveals nothing new: the map's picture is on their screen either way. Unless the
 * GM chose "Hide map from players without a token": then it is fully dark (ADR 0057).
 */
export function sightMaskAlpha(polygons: ReadonlyArray<ReadonlyArray<Point>>, hideMap = false): number {
  return hideMap || polygons.some((p) => p.length >= 3) ? 1 : DIMMED_ALPHA;
}

/** Near-black tinted to the map (jungle: green-black, ice: blue-black). */
export function sightColor(base?: Rgb | null): Rgb {
  return fogPalette(base).dark.map((c) => Math.max(4, Math.round(c * SIGHT_DARKEN))) as unknown as Rgb;
}

/**
 * Most sight corners merged into shapes. Past it (about 30 owned tokens crowded together, where
 * heavy overlap makes the merge slow) the board draws the canvas mask instead. Measured on the
 * largest shipped map: up to this many corners, a merge takes at most about 15 ms.
 */
export const MAX_MERGED_SIGHT_CORNERS = 800;

/** One dark area as flat `[x0, y0, x1, y1, ...]` rings: its outline, and lit islands inside it. */
export interface DarkShape {
  outer: number[];
  holes: number[][];
}

/**
 * The line-of-sight darkness as shapes (FR-GM-19): the map minus the viewer's sight, every token's
 * sight merged first, so overlapping sight from several owned tokens leaves no seams or slivers.
 * Drawn as vector shapes, its edge stays crisp and smooth at any zoom, with no fade
 * (fog-inner-fade-and-shared-dice). Null when the sight has more than `MAX_MERGED_SIGHT_CORNERS`
 * corners, and throws if the clipper can't resolve it; either way the board falls back to
 * `makeSightMaskCanvas`, which handles any overlap at a flat cost.
 */
export function darknessShapes(polygons: ReadonlyArray<ReadonlyArray<Point>>, width: number, height: number): DarkShape[] | null {
  const map: ClipPolygon = [[[0, 0], [width, 0], [width, height], [0, height]]];
  // Whole map pixels: the clipper's sweep can fail on nearly collinear edges at full float
  // precision, and a sub-pixel shift of the sight edge is invisible.
  const rounded = polygons.filter((p) => p.length >= 3).map((p): ClipPolygon => [p.map((q) => [Math.round(q.x), Math.round(q.y)])]);
  // Tokens on the same square see the same thing: merge each distinct sight once.
  const sight = [...new Map(rounded.map((p) => [p[0]!.join(";"), p])).values()];
  if (sight.reduce((n, p) => n + p[0]!.length, 0) > MAX_MERGED_SIGHT_CORNERS) return null;
  const dark = sight.length > 0 ? polygonClipping.difference(map, ...sight) : [map];
  return dark.map(([outer, ...holes]) => ({ outer: flatRing(outer!), holes: holes.map(flatRing) }));
}

/** A clipper ring as a flat list, without the repeated closing point. */
function flatRing(ring: ReadonlyArray<readonly [number, number]>): number[] {
  const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return open.flatMap(([x, y]) => [x, y]);
}

/**
 * The line-of-sight darkness at a fraction of the map's size (FR-GM-19): opaque `rgb` everywhere
 * outside the sight polygons and clear inside, with no fade either side. The board draws
 * `darknessShapes` instead and uses this only if the clipper fails; the map editor's Sight step
 * uses it for its preview image. The caller scales the sprite by 1/scale.
 */
export function makeSightMaskCanvas(
  polygons: ReadonlyArray<ReadonlyArray<Point>>,
  width: number,
  height: number,
  cell: number,
  rgb: Rgb,
): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, SIGHT_PX_PER_CELL / Math.max(1, cell), SIGHT_MAX_SIDE / Math.max(1, width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, scale };
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgb(${rgb.map(Math.round).join(",")})`;
  ctx.fillRect(0, 0, width, height);
  for (const points of polygons) {
    if (points.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.clearRect(0, 0, width, height);
    ctx.restore();
  }
  return { canvas, scale };
}
