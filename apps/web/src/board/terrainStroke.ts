import { cellRect, compressTerrain, type GridSpec, type MapImage, type PaintRun, type TerrainKind, type TerrainRun } from "@vtt/shared";

/**
 * One terrain stroke in grid cells (board-terrain-tool): shared by the live board's Terrain tool
 * and the map editor's Terrain step, so both paint exactly the same squares. Pure: no React, no Pixi.
 */
export type Cell = { col: number; row: number };
export type StrokeShape = "brush" | "rect";
export type TerrainContext = { boardEpoch: number; revision: number };

/** The most squares one stroke may change; the server refuses more. */
export const MAX_STROKE_CELLS = 10000;

export interface TerrainStroke {
  from: Cell;
  to: Cell;
  /** "row:col" → the kind painted there (Difficult stands in while erasing). */
  cells: Map<string, TerrainKind>;
  /** Normal paint: the squares go back to plain ground. */
  erase: boolean;
  layerId: string;
  /** Captured when the stroke starts, so a concurrent change refuses it rather than overwriting. */
  context: TerrainContext;
}

/** Whether a cell overlaps the map image at all. */
export function cellInMap(col: number, row: number, grid: GridSpec, map: Pick<MapImage, "width" | "height">): boolean {
  const r = cellRect(col, row, grid);
  return r.minX < map.width && r.maxX > 0 && r.minY < map.height && r.maxY > 0;
}

export function startStroke(cell: Cell, paint: TerrainKind | null, layerId: string, context: TerrainContext): TerrainStroke {
  return { from: cell, to: cell, cells: new Map(), erase: paint === null, layerId, context };
}

/**
 * Extend a stroke to `to`: a brush adds the line from its last cell, a rectangle refills from its
 * first. Returns why the stroke is too big, or null. Mutates the stroke.
 */
export function extendStroke(
  stroke: TerrainStroke,
  to: Cell,
  { shape, paint, grid, map }: { shape: StrokeShape; paint: TerrainKind | null; grid: GridSpec; map: Pick<MapImage, "width" | "height"> },
): "rectTooBig" | "strokeTooBig" | null {
  const kind = paint ?? "difficult";
  const add = (col: number, row: number) => {
    if (cellInMap(col, row, grid, map) && stroke.cells.size <= MAX_STROKE_CELLS) stroke.cells.set(`${row}:${col}`, kind);
  };
  if (shape === "rect") {
    const from = stroke.from;
    const width = Math.abs(from.col - to.col) + 1, height = Math.abs(from.row - to.row) + 1;
    if (width * height > MAX_STROKE_CELLS) return "rectTooBig";
    stroke.cells.clear();
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++)
      for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col++) add(col, row);
  } else {
    const from = stroke.to;
    const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
    for (let i = 0; i <= steps; i++) add(Math.round(from.col + (to.col - from.col) * i / steps), Math.round(from.row + (to.row - from.row) * i / steps));
  }
  stroke.to = to;
  return stroke.cells.size > MAX_STROKE_CELLS ? "strokeTooBig" : null;
}

/** The stroke's squares as runs, for the preview. */
export function strokeRuns(stroke: TerrainStroke): TerrainRun[] {
  return compressTerrain(stroke.cells);
}

/** What to send as `terrain.paint`: null kinds when erasing. Empty when the stroke cannot be sent. */
export function strokePaint(stroke: TerrainStroke): PaintRun[] {
  if (stroke.cells.size === 0 || stroke.cells.size > MAX_STROKE_CELLS) return [];
  return strokeRuns(stroke).map((run) => ({ ...run, kind: stroke.erase ? null : run.kind }));
}
