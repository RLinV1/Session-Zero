import { z } from "zod";
import { polygonArea, WALL_FOOTPRINT_INSET, type GridSpec, type Point, type Segment } from "./geometry";

export const MAX_TERRAIN_CELLS = 10_000;
export const MAX_TERRAIN_EFFECTS = 32;
export const MAX_TERRAIN_PAINT_BYTES = 32 * 1024;
export const TerrainKind = z.enum(["blocked", "difficult"]);
export type TerrainKind = z.infer<typeof TerrainKind>;
const coordinate = z.number().int().min(-1_000_000).max(1_000_000);
const span = { row: coordinate, start: coordinate, end: coordinate };
export const CellRun = z.object(span).strict().refine((r) => r.end >= r.start && r.end - r.start < MAX_TERRAIN_CELLS);
export type CellRun = z.infer<typeof CellRun>;
export const TerrainRun = z.object({ ...span, kind: TerrainKind }).strict();
export type TerrainRun = z.infer<typeof TerrainRun>;
export const PaintRun = z.object({ ...span, kind: TerrainKind.nullable() }).strict();
export type PaintRun = z.infer<typeof PaintRun>;
export const TerrainRuns = z.array(TerrainRun).max(MAX_TERRAIN_CELLS).superRefine((runs, ctx) => {
  let count = 0;
  let last: TerrainRun | undefined;
  for (const r of runs) {
    count += r.end - r.start + 1;
    if (r.end < r.start || (last && (r.row < last.row || (r.row === last.row && r.start <= last.end)))) {
      ctx.addIssue({ code: "custom", message: "Terrain runs must be ordered and non-overlapping" });
      break;
    }
    last = r;
  }
  if (count > MAX_TERRAIN_CELLS) ctx.addIssue({ code: "custom", message: "Too many terrain cells" });
});
export const TerrainEffect = z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(60), runs: TerrainRuns }).strict();
export type TerrainEffect = z.infer<typeof TerrainEffect>;
export const Terrain = z.object({ base: TerrainRuns, effects: z.array(TerrainEffect).max(MAX_TERRAIN_EFFECTS) }).strict().superRefine((t, ctx) => {
  if (terrainCount(t) > MAX_TERRAIN_CELLS || new Set(t.effects.map((e) => e.id)).size !== t.effects.length) {
    ctx.addIssue({ code: "custom", message: "Terrain exceeds bounds or contains duplicate effects" });
  }
});
export type Terrain = z.infer<typeof Terrain>;
export const TerrainContext = z.object({ boardEpoch: z.number().int().nonnegative(), revision: z.number().int().nonnegative() }).strict();
export const TerrainView = z.object({ runs: TerrainRuns, temporary: TerrainRuns }).strict();
export type TerrainView = z.infer<typeof TerrainView>;
export const emptyTerrain = (): Terrain => ({ base: [], effects: [] });
export const terrainCount = (t: Terrain): number => [t.base, ...t.effects.map((e) => e.runs)].reduce((n, runs) => n + runs.reduce((m, r) => m + r.end - r.start + 1, 0), 0);
export const hasTerrain = (t: Terrain | undefined): boolean => !!t && (t.base.length > 0 || t.effects.length > 0);
export const terrainLayer = (t: Terrain, id: string): TerrainRun[] | undefined => id === "base" ? t.base : t.effects.find((e) => e.id === id)?.runs;
export const gridGeometryChanged = (a: GridSpec, b: GridSpec): boolean => a.cellSize !== b.cellSize || a.offsetX !== b.offsetX || a.offsetY !== b.offsetY;
export const terrainAt = (runs: readonly TerrainRun[], col: number, row: number): TerrainKind | null => runs.find((r) => r.row === row && r.start <= col && r.end >= col)?.kind ?? null;

export function terrainCells(runs: readonly TerrainRun[]): Map<string, TerrainKind> {
  const cells = new Map<string, TerrainKind>();
  for (const r of runs) for (let col = r.start; col <= r.end; col++) cells.set(`${r.row}:${col}`, r.kind);
  return cells;
}
export function compressTerrain(cells: ReadonlyMap<string, TerrainKind>): TerrainRun[] {
  const sorted = [...cells].map(([key, kind]) => { const [row, col] = key.split(":").map(Number); return { row: row!, start: col!, end: col!, kind }; }).sort((a, b) => a.row - b.row || a.start - b.start);
  const runs: TerrainRun[] = [];
  for (const cell of sorted) {
    const last = runs.at(-1);
    if (last && last.row === cell.row && last.end + 1 === cell.start && last.kind === cell.kind) last.end = cell.end;
    else runs.push({ ...cell });
  }
  return runs;
}
export function paintTerrain(runs: readonly TerrainRun[], paint: readonly PaintRun[]): TerrainRun[] {
  const cells = terrainCells(runs);
  for (const r of paint) for (let col = r.start; col <= r.end; col++) {
    if (r.kind === null) cells.delete(`${r.row}:${col}`); else cells.set(`${r.row}:${col}`, r.kind);
  }
  return compressTerrain(cells);
}
export function replaceTerrainLayer(t: Terrain, id: string, runs: TerrainRun[]): Terrain {
  return id === "base" ? { ...t, base: runs } : { ...t, effects: t.effects.map((e) => e.id === id ? { ...e, runs } : e) };
}
export function effectiveTerrain(t: Terrain): TerrainRun[] {
  const cells = new Map<string, TerrainKind>();
  for (const runs of [t.base, ...t.effects.map((e) => e.runs)]) for (const [key, kind] of terrainCells(runs)) {
    if (cells.get(key) !== "blocked") cells.set(key, kind);
  }
  return compressTerrain(cells);
}
/** Previous values for precisely the affected cells, including implicit Normal. */
export function previousPaint(runs: readonly TerrainRun[], paint: readonly PaintRun[]): PaintRun[] {
  const result: PaintRun[] = [];
  for (const r of paint) for (let col = r.start; col <= r.end; col++) {
    const kind = terrainAt(runs, col, r.row);
    const last = result.at(-1);
    if (last && last.row === r.row && last.end + 1 === col && last.kind === kind) last.end = col;
    else result.push({ row: r.row, start: col, end: col, kind });
  }
  return result;
}
export function paintMatches(runs: readonly TerrainRun[], paint: readonly PaintRun[]): boolean {
  return paint.every((r) => { for (let col = r.start; col <= r.end; col++) if (terrainAt(runs, col, r.row) !== r.kind) return false; return true; });
}
export function paintProblem(paint: readonly PaintRun[]): string | null {
  let count = 0;
  const seen = new Set<string>();
  for (const r of paint) {
    count += r.end - r.start + 1;
    if (r.end < r.start || count > MAX_TERRAIN_CELLS) return "A gesture exceeds the terrain cell limit.";
    for (let col = r.start; col <= r.end; col++) { const key = `${r.row}:${col}`; if (seen.has(key)) return "A gesture contains overlapping cells."; seen.add(key); }
  }
  return null;
}

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export function cellRect(col: number, row: number, grid: GridSpec): Rect {
  const minX = grid.offsetX + col * grid.cellSize, minY = grid.offsetY + row * grid.cellSize;
  return { minX, minY, maxX: minX + grid.cellSize, maxY: minY + grid.cellSize };
}
export const rectPoints = (r: Rect): Point[] => [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function hull(points: Point[]): Point[] {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [], upper: Point[] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function sweptSquare(from: Point, to: Point, half: number): Point[] {
  return hull([from, to].flatMap((p) => rectPoints({ minX: p.x - half, maxX: p.x + half, minY: p.y - half, maxY: p.y + half })));
}
/** Clip a possibly concave subject against a convex counter-clockwise polygon. */
export function clippedArea(subject: readonly Point[], clip: readonly Point[]): number {
  let points = [...subject];
  for (let i = 0; i < clip.length && points.length; i++) {
    const a = clip[i]!, b = clip[(i + 1) % clip.length]!;
    const input = points; points = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!, q = input[(j + 1) % input.length]!;
      const d = cross(a, b, p), e = cross(a, b, q);
      if (d >= 0) points.push(p);
      if ((d >= 0) !== (e >= 0)) { const t = d / (d - e); points.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
    }
  }
  return Math.abs(polygonArea(points));
}
export function sweptCrossesPolygon(from: Point, to: Point, half: number, polygon: readonly Point[]): boolean {
  return clippedArea(polygon, sweptSquare(from, to, half)) > 1e-8;
}
/** Open square sweep; boundary contact alone is not overlap. */
export function footprintInterval(from: Point, to: Point, half: number, rect: Rect): [number, number] | null {
  let low = 0, high = 1;
  for (const [p, d, min, max] of [[from.x, to.x - from.x, rect.minX - half, rect.maxX + half], [from.y, to.y - from.y, rect.minY - half, rect.maxY + half]]) {
    if (d === 0) { if (p! <= min! || p! >= max!) return null; continue; }
    const a = (min! - p!) / d!, b = (max! - p!) / d!;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (high <= low) return null;
  }
  return [low, high];
}
export function sweptCrossesWalls(from: Point, to: Point, size: number, grid: GridSpec, walls: Iterable<Segment>): boolean {
  const polygon = sweptSquare(from, to, size * grid.cellSize / 2 * (1 - 2 * WALL_FOOTPRINT_INSET));
  for (const wall of walls) {
    let low = 0, high = 1, valid = true;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const p = cross(a, b, wall.a), q = cross(a, b, wall.b), d = q - p;
      if (d === 0) { if (p <= 0) { valid = false; break; } }
      else { const t = -p / d; if (d > 0) low = Math.max(low, t); else high = Math.min(high, t); }
      if (low >= high) { valid = false; break; }
    }
    if (valid) return true;
  }
  return false;
}
export function movementTerrain(from: Point, to: Point, size: number, grid: GridSpec, runs: readonly TerrainRun[], free = false): { distance: number; cost: number; blocked: boolean; affected: number } {
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
  const distance = (free ? Math.hypot(dx, dy) : Math.max(dx, dy)) / grid.cellSize * grid.unitsPerCell;
  const intervals: [number, number][] = [];
  let blocked = false;
  for (const r of runs) {
    const first = cellRect(r.start, r.row, grid), last = cellRect(r.end, r.row, grid);
    const interval = footprintInterval(from, to, size * grid.cellSize / 2, { ...first, maxX: last.maxX });
    if (interval) { if (r.kind === "blocked") blocked = true; else intervals.push(interval); }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let affected = 0, end = 0;
  for (const [a, b] of intervals) { affected += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  return { distance, cost: distance * (1 + affected), blocked, affected };
}
