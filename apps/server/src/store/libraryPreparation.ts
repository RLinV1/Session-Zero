import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_GRID, EMPTY_LIBRARY_BOARD, canRenderGrid, gridGeometryChanged, libraryBoardProblem, cellRect, type GridSpec, type LibraryMapBoard } from "@vtt/shared";
import type { LibraryAssetRecord } from "./libraryStore";

type StoredBoard = LibraryMapBoard & { preparationVersion?: string };
export class PreparationConflictError extends Error {}
export function publicBoard(board: LibraryMapBoard | null | undefined): LibraryMapBoard {
  const { preparationVersion: _version, ...content } = (board ?? EMPTY_LIBRARY_BOARD) as StoredBoard;
  return content;
}
export function preparationRevision(asset: LibraryAssetRecord): string {
  const version = (asset.board as StoredBoard | null | undefined)?.preparationVersion;
  if (version) return version;
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, stable(value)])) : v;
  return createHash("sha256").update(JSON.stringify(stable({ grid: asset.grid, board: publicBoard(asset.board), width: asset.width, height: asset.height, url: asset.url }))).digest("hex");
}
export const versionedBoard = (board: LibraryMapBoard): StoredBoard => ({ ...publicBoard(board), preparationVersion: randomUUID() });
export function preparationProblem(asset: LibraryAssetRecord, grid: GridSpec, board: LibraryMapBoard, reset = false): string | null {
  if (!canRenderGrid(grid.cellSize, asset)) return "Grid cell size is too small for this map.";
  const old = publicBoard(asset.board);
  if (old.terrain?.length && gridGeometryChanged(asset.grid ?? DEFAULT_GRID, grid) && !reset) return "Changing grid spacing or origin requires an explicit terrain reset.";
  if (board.terrain?.some((run) => { const a = cellRect(run.start, run.row, grid), b = cellRect(run.end, run.row, grid); return a.minX >= asset.width || b.maxX <= 0 || a.minY >= asset.height || a.maxY <= 0 || a.minX < -grid.cellSize || b.maxX > asset.width + grid.cellSize; })) return "Terrain must lie on the map.";
  return libraryBoardProblem(board, asset);
}
