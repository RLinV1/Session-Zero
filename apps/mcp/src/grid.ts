import { cellAt, snapTokenCenter, type GridSpec, type MapImage, type Point } from "@vtt/shared";

export interface Square {
  column: number;
  row: number;
}

/** As `snapTokenCenter` decides: odd-sized tokens center on a square, others on a grid corner. */
const centersOnSquare = (size: number) => size % 2 === 1;

/**
 * The square a token stands on (design D6): the one holding its center, or for an even-sized token
 * the one whose top-left corner its center is on. Rounding keeps that corner from reading as the
 * square before it when a fractional cell size leaves float noise.
 */
export function squareOfToken(position: Point, size: number, grid: GridSpec): Square {
  if (!centersOnSquare(size)) {
    return { column: Math.round((position.x - grid.offsetX) / grid.cellSize), row: Math.round((position.y - grid.offsetY) / grid.cellSize) };
  }
  const { col, row } = cellAt(position, grid);
  return { column: col, row };
}

/** The square a point on the board falls in, such as where someone pinged. */
export function squareAt(point: Point, grid: GridSpec): Square {
  const { col, row } = cellAt(point, grid);
  return { column: col, row };
}

/** The inverse of `squareOfToken`, in board coordinates (invariant 8). */
export function boardPointForSquare(square: Square, size: number, grid: GridSpec): Point {
  const half = centersOnSquare(size) ? grid.cellSize / 2 : 0;
  return snapTokenCenter(
    { x: grid.offsetX + square.column * grid.cellSize + half, y: grid.offsetY + square.row * grid.cellSize + half },
    size,
    grid,
  );
}

/** With no map there is no edge to be off. */
export function isOnMap(point: Point, map: MapImage | null): boolean {
  if (!map) return true;
  return point.x >= 0 && point.y >= 0 && point.x <= map.width && point.y <= map.height;
}
