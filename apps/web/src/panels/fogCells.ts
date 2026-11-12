import { cellAt, type FogRegion, type GridSpec, type MapImage, type Point } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * Grid-cell arithmetic for the Fog of war section (FR-GM-17): naming fogged regions by the cells
 * they cover, and fogging the whole map. Cells are numbered from 1 at the map's top-left, counting a partial first column or row
 * that a grid offset leaves at the edge, so "column 1" is always the leftmost strip the GM sees.
 */

/** A 1-based column and row. */
interface Cell {
  col: number;
  row: number;
}

/** The 1-based cell holding board point `p`, clamped to the map. */
function cellOf(p: Point, map: MapImage, grid: GridSpec): Cell {
  const first = cellAt({ x: 0, y: 0 }, grid);
  const at = cellAt({ x: clamp(p.x, 0, map.width - 0.5), y: clamp(p.y, 0, map.height - 0.5) }, grid);
  return { col: at.col - first.col + 1, row: at.row - first.row + 1 };
}

/** The whole map as one fog rectangle. */
export function wholeMapRegion(map: MapImage): { shape: "rect"; from: Point; to: Point } {
  return { shape: "rect", from: { x: 0, y: 0 }, to: { x: map.width, y: map.height } };
}

/** Where a region sits, in the cells the GM counts: "columns 3–6, rows 2–4" or "column 3, row 2". */
export function describeCells(region: Pick<FogRegion, "points">, map: MapImage, grid: GridSpec): string {
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  // Edges sit on grid lines, so step half a pixel inside before asking which cell a corner is in.
  const lo = cellOf({ x: Math.min(...xs) + 0.5, y: Math.min(...ys) + 0.5 }, map, grid);
  const hi = cellOf({ x: Math.max(...xs) - 0.5, y: Math.max(...ys) - 0.5 }, map, grid);
  const columns = lo.col === hi.col ? t("fog.column", { n: lo.col }) : t("fog.columns", { from: lo.col, to: hi.col });
  const rows = lo.row === hi.row ? t("fog.row", { n: lo.row }) : t("fog.rows", { from: lo.row, to: hi.row });
  return `${columns}${t("common.listSep")}${rows}`;
}

/** Whether a region is exactly the whole map, so the list can call it that. */
export function coversWholeMap(region: FogRegion, map: MapImage): boolean {
  if (region.shape !== "rect") return false;
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  return Math.min(...xs) <= 0 && Math.min(...ys) <= 0 && Math.max(...xs) >= map.width && Math.max(...ys) >= map.height;
}

/** `n` limited to the range `lo`..`hi`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
