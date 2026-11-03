import { footprintCrossesWall, type GridSpec, type Point } from "./geometry";
import { blocksMovement } from "./portals";
import { effectiveTerrain, emptyTerrain, movementTerrain, sweptCrossesWalls, type TerrainRun } from "./terrain";
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
