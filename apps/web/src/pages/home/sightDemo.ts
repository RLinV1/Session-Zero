import {
  DEFAULT_GRID,
  footprintCrossesWall,
  pathCrossesWall,
  sightPolygon,
  snapTokenCenter,
  type GridSpec,
  type Point,
  type Segment,
} from "@vtt/shared";
import { CROP } from "./crops";

/**
 * The home page's line-of-sight demo runs the table's own rules on a home crop: the lit area is
 * `sightPolygon` over the map's stored walls, and a move is refused as the table refuses a
 * player's (gm-home: "Line of sight is operable"). Everything here is in crop pixels, where the
 * squares are exactly 70 px from the top-left corner.
 */
export const CROP_GRID: GridSpec = { ...DEFAULT_GRID, cellSize: CROP.cell, offsetX: 0, offsetY: 0 };

/** The crop's whole squares: 20 across, 11 down (the last partial row is not a square). */
export const COLS = Math.floor(CROP.width / CROP.cell);
export const ROWS = Math.floor(CROP.height / CROP.cell);

/** How far a torch carries, in squares: the table's sight range (ADR 0044). */
export const TORCH_SQUARES = 6;

export const squareCenter = (col: number, row: number): Point => ({ x: (col + 0.5) * CROP.cell, y: (row + 0.5) * CROP.cell });

export const squareOf = (p: Point): { col: number; row: number } => ({ col: Math.floor(p.x / CROP.cell), row: Math.floor(p.y / CROP.cell) });

/** What a token at `at` can see: the table's line of sight, cut off at the torch's reach. */
export function litArea(walls: readonly Segment[], at: Point): Point[] {
  return sightPolygon(walls, at, { width: CROP.width, height: CROP.height }, TORCH_SQUARES * CROP.cell);
}

/**
 * Where a one-square token ends up when moved toward `to`: the square under `to`, or nowhere
 * new when the table would refuse a player's move there. The same rule as `decide`'s: the token
 * may not stand across a wall, nor pass through one it is not already touching.
 */
export function moveTo(walls: readonly Segment[], from: Point, to: Point): { at: Point; refused: "wall" | "edge" | null } {
  const target = snapTokenCenter(to, 1, CROP_GRID);
  const { col, row } = squareOf(target);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return { at: from, refused: "edge" };
  if (target.x === from.x && target.y === from.y) return { at: from, refused: null };
  if (footprintCrossesWall(target, 1, CROP_GRID, walls)) return { at: from, refused: "wall" };
  const ahead = walls.filter((w) => !footprintCrossesWall(from, 1, CROP_GRID, [w]));
  if (pathCrossesWall(from, target, ahead)) return { at: from, refused: "wall" };
  return { at: target, refused: null };
}

/** The SVG `points` attribute for a polygon. */
export const svgPoints = (poly: readonly Point[]) => poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
