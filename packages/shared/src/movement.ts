import { cellAt, footprintCrossesWall, type GridSpec, type Point } from "./geometry";
import { blocksMovement } from "./portals";
import { effectiveTerrain, emptyTerrain, movementTerrain, sweptCrossesWalls, terrainCells, type TerrainRun } from "./terrain";
import type { RoomState, Token, Wall } from "./state";

function footprintBlocked(grid: GridSpec, walls: Wall[], terrain: TerrainRun[], size: number, to: Point): boolean {
  return footprintCrossesWall(to, size, grid, walls) || movementTerrain(to, to, size, grid, terrain).blocked;
}

/** A resize or Reposition must end clear of physical obstructions, regardless of its origin. */
export function destinationBlocked(state: RoomState, size: number, to: Point): boolean {
  return footprintBlocked(state.scene.grid, Object.values(state.walls).filter(blocksMovement), effectiveTerrain(state.terrain ?? emptyTerrain()), size, to);
}

/** Physical restrictions for an authorized move; fog and sight only conceal, never obstruct. */
export function movementBlocked(state: RoomState, token: Token, to: Point, reposition = false): boolean {
  const grid = state.scene.grid;
  const walls = Object.values(state.walls).filter(blocksMovement);
  const terrain = effectiveTerrain(state.terrain ?? emptyTerrain());
  if (footprintBlocked(grid, walls, terrain, token.size, to)) return true;
  if (reposition) return false;
  if (movementTerrain(token.position, to, token.size, grid, terrain).blocked) return true;
  const ahead = walls.filter((w) => !footprintCrossesWall(token.position, token.size, grid, [w]));
  return sweptCrossesWalls(token.position, to, token.size, grid, ahead);
}

export type RulerRule = "equal" | "alternating" | "euclidean";
const MAX_RULER_STEPS = 5000;

/**
 * Ruler cost over painted terrain (FR-TAC-03): each cell stepped into costs its step length,
 * doubled when Difficult; entering a Blocked cell flags the path. The origin cell is free.
 * `runs` must already be viewer-filtered (effective terrain for the GM, `terrainView.runs` otherwise).
 */
export function rulerPathCost(from: Point, to: Point, grid: GridSpec, rule: RulerRule, runs: readonly TerrainRun[]): { cells: number; cost: number; difficult: number; blocked: boolean } {
  const a = cellAt(from, grid), b = cellAt(to, grid);
  const dc = b.col - a.col, dr = b.row - a.row, n = Math.min(Math.max(Math.abs(dc), Math.abs(dr)), MAX_RULER_STEPS);
  const kinds = terrainCells(runs);
  const out = { cells: n, cost: 0, difficult: 0, blocked: false };
  let col = a.col, row = a.row, diagonals = 0;
  for (let i = 1; i <= n; i++) {
    const nc = a.col + Math.round(dc * i / n), nr = a.row + Math.round(dr * i / n);
    const diagonal = nc !== col && nr !== row;
    col = nc; row = nr;
    let step = 1;
    if (diagonal) { diagonals++; step = rule === "euclidean" ? Math.SQRT2 : rule === "alternating" && diagonals % 2 === 0 ? 2 : 1; }
    const kind = kinds.get(`${row}:${col}`);
    if (kind === "blocked") out.blocked = true;
    if (kind === "difficult") { out.difficult++; step *= 2; }
    out.cost += step;
  }
  out.cost *= grid.unitsPerCell;
  return out;
}
