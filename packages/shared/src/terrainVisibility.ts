import { cellRect, clippedArea, compressTerrain, effectiveTerrain, emptyTerrain, footprintInterval, rectPoints, terrainCells, type Rect, type TerrainView } from "./terrain";
import { cellAt, type Point } from "./geometry";
import type { RoomState } from "./state";
import type { Concealment } from "./visibility";

type KnowledgeState = Pick<RoomState, "scene" | "fog" | "sight">;
function bounds(points: readonly Point[]): Rect {
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) { result.minX = Math.min(result.minX, point.x); result.minY = Math.min(result.minY, point.y); result.maxX = Math.max(result.maxX, point.x); result.maxY = Math.max(result.maxY, point.y); }
  return result;
}
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/** Prepare once per projection/ruler: broad-phase bounds avoid clipping every fog polygon for every cell. */
export function terrainKnowledge(state: KnowledgeState, concealment?: Concealment): (col: number, row: number) => boolean {
  const map = state.scene.map, grid = state.scene.grid;
  const fog = Object.values(concealment?.fog ?? state.fog).map((region) => ({ points: region.points, bounds: bounds(region.points) }));
  const polygons = concealment ? concealment.sight : state.sight ?? null;
  const sight = polygons?.map((points) => ({ points, bounds: bounds(points) })) ?? null;
  return (col, row) => {
    if (!map) return false;
    const cell = cellRect(col, row, grid);
    const r = { minX: Math.max(0, cell.minX), minY: Math.max(0, cell.minY), maxX: Math.min(map.width, cell.maxX), maxY: Math.min(map.height, cell.maxY) };
    if (r.minX >= r.maxX || r.minY >= r.maxY) return false;
    // Match fog's conservative edge treatment: withhold cells within one pixel of its edge.
    const expanded = { minX: r.minX - 1, minY: r.minY - 1, maxX: r.maxX + 1, maxY: r.maxY + 1 };
    for (const region of fog) if (overlaps(expanded, region.bounds) && clippedArea(region.points, rectPoints(expanded)) > 1e-8) return false;
    if (sight === null) return true;
    const area = (r.maxX - r.minX) * (r.maxY - r.minY);
    // Requiring one polygon to cover the cell is conservative where sight polygons meet.
    return sight.some((polygon) => polygon.bounds.minX <= r.minX && polygon.bounds.minY <= r.minY && polygon.bounds.maxX >= r.maxX && polygon.bounds.maxY >= r.maxY && clippedArea(polygon.points, rectPoints(r)) >= area - Math.max(1e-8, area * 1e-10));
  };
}
/** Whole-cell knowledge comes only from committed fog/sight, never from painted overrides. */
export function terrainCellKnown(state: KnowledgeState, col: number, row: number, concealment?: Concealment): boolean {
  return terrainKnowledge(state, concealment)(col, row);
}

/** Whether the swept footprint stays in current known coverage; never use a drag as a sight origin. */
export function movementRouteKnown(state: KnowledgeState, from: Point, to: Point, size: number, concealment?: Concealment): boolean {
  const grid = state.scene.grid, known = terrainKnowledge(state, concealment), half = size * grid.cellSize / 2;
  const min = cellAt({ x: Math.min(from.x, to.x) - half, y: Math.min(from.y, to.y) - half }, grid);
  const max = cellAt({ x: Math.max(from.x, to.x) + half, y: Math.max(from.y, to.y) + half }, grid);
  // Coordinates accepted by movement can be far outside the map. Unsafe integer indices
  // can stop progressing under ++; count every iteration, including rejected intervals.
  const safeRange = (a: number, b: number) => Number.isSafeInteger(a) && Number.isSafeInteger(b) && b >= a && b - a <= 20_000;
  if (!safeRange(min.row, max.row) || !safeRange(min.col, max.col)) return false;
  let visited = 0, work = 0;
  for (let row = min.row; row <= max.row; row++) {
    if (++work > 40_000) return false;
    const band = cellRect(0, row, grid);
    const time = footprintInterval(from, to, half, { ...band, minX: -Number.MAX_VALUE, maxX: Number.MAX_VALUE });
    if (!time) continue;
    const x0 = from.x + (to.x - from.x) * time[0], x1 = from.x + (to.x - from.x) * time[1];
    const a = cellAt({ x: Math.min(x0, x1) - half, y: 0 }, grid).col;
    const b = cellAt({ x: Math.max(x0, x1) + half, y: 0 }, grid).col;
    if (!safeRange(a, b)) return false;
    for (let col = a; col <= b; col++) {
      if (++work > 40_000) return false;
      if (!footprintInterval(from, to, half, cellRect(col, row, grid))) continue;
      if (++visited > 20_000 || !known(col, row)) return false;
    }
  }
  return visited > 0;
}

export function terrainForViewer(state: RoomState, c: Concealment): TerrainView {
  const terrain = state.terrain ?? emptyTerrain(), permittedCell = terrainKnowledge(state, c);
  const known = new Map<string, boolean>();
  const permitted = (runs: ReturnType<typeof effectiveTerrain>) => {
    const cells = terrainCells(runs);
    for (const key of cells.keys()) {
      const [row, col] = key.split(":").map(Number);
      let visible = known.get(key);
      if (visible === undefined) { visible = permittedCell(col!, row!); known.set(key, visible); }
      if (!visible) cells.delete(key);
    }
    return compressTerrain(cells);
  };
  const effective = effectiveTerrain(terrain), effectiveCells = terrainCells(effective);
  const temporary = terrainCells(effectiveTerrain({ base: [], effects: terrain.effects }));
  // A marker reports only presence. Its colour follows public effective ground, never a weaker underlying layer.
  for (const key of temporary.keys()) temporary.set(key, effectiveCells.get(key)!);
  return { runs: permitted(effective), temporary: permitted(compressTerrain(temporary)) };
}
