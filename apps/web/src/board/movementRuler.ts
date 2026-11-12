import { MAX_MOVE_VIA, blocksMovement, cheapestPath, effectiveTerrain, emptyTerrain, footprintCrossesWall, isSnapped, movementRouteKnown, movementTerrain, stepRulesOf, sweptCrossesWalls, terrainCells, type GridSpec, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { formatDistance } from "./tools";

export type MovementPreview = { label: string; obstruction: "blocked" | "unknown" | "clear" };

export function movementPreview(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free = false, reposition = false): MovementPreview {
  const grid = state.scene.grid;
  const runs = you.role === "gm" ? effectiveTerrain(state.terrain ?? emptyTerrain()) : state.terrainView?.runs ?? [];
  const result = movementTerrain(from, to, token.size, grid, runs, free);
  const unknown = you.role !== "gm" && !movementRouteKnown(state, from, to, token.size);
  const walls = Object.values(state.walls).filter(blocksMovement);
  const destination = movementTerrain(to, to, token.size, grid, runs).blocked || footprintCrossesWall(to, token.size, grid, walls);
  const obstruction = destination || (!reposition && (result.blocked || sweptCrossesWalls(from, to, token.size, grid, walls.filter((w) => !footprintCrossesWall(from, token.size, grid, [w])))));
  // A straight move shows distance only: terrain cost belongs to grid paths (ADR 0055).
  return { label: `${formatDistance(result.distance, grid)}${reposition ? " · Reposition" : ""}`, obstruction: obstruction ? "blocked" : unknown ? "unknown" : "clear" };
}

/** What a drag shows and sends: the line through `points`, its label, and the turns a drop commits. */
export interface DragPlan {
  points: Point[];
  /** The turning points `token.move` carries; empty for a straight move. */
  via: Point[];
  label: string;
  obstruction: MovementPreview["obstruction"];
}

/**
 * A drag's plan (ADR 0055). A grid-snapped token of whole-number size, dragged without Alt and not
 * Repositioned, follows the cheapest path the viewer knows of, costed under the room's rules against
 * their allowance. Anything else, or a path the search can't find, is a straight line showing distance only.
 */
export function dragPlan(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free: boolean, reposition: boolean, allowance: number): DragPlan {
  const grid = state.scene.grid, map = state.scene.map, size = token.size;
  const pathed = !free && !reposition && !!map && Number.isInteger(size) && size >= 1 && isSnapped(from, size, grid);
  const straight = (): DragPlan => {
    const preview = movementPreview(state, you, token, from, to, free, reposition);
    return { points: [from, to], via: [], label: preview.label, obstruction: preview.obstruction };
  };
  if (!pathed) return straight();
  const runs = you.role === "gm" ? effectiveTerrain(state.terrain ?? emptyTerrain()) : state.terrainView?.runs ?? [];
  const walls = Object.values(state.walls).filter(blocksMovement);
  const knowledge = { kinds: terrainCells(runs), walls, map }, rules = stepRulesOf(state);
  // Among equal costs, the path hugging the straight line; if it turns more than a move may carry,
  // the one turning least; failing that, or with no path at all, the straight drag (ADR 0055).
  let path = cheapestPath(from, to, size, grid, rules, knowledge, "line");
  if (path && path.via.length > MAX_MOVE_VIA) path = cheapestPath(from, to, size, grid, rules, knowledge, "turns");
  if (!path || path.via.length > MAX_MOVE_VIA) return straight();
  // The cost of the path shown, priced from what this viewer holds: a player's unseen fog, walls
  // and terrain are not counted. The server still judges the move on drop.
  const points = [from, ...path.via, to];
  return { points, via: path.via, label: budgetLabel(path.cost, allowance, grid) + (path.difficult ? ` · ${path.difficult} difficult` : ""), obstruction: "clear" };
}

export function movementReadout(...args: Parameters<typeof movementPreview>): string {
  return movementPreview(...args).label;
}

/** The viewer's own movement budget. Diagonals are a room rule now (ADR 0055); an old stored `rule` is ignored. */
export interface MovementSettings { allowance: number }
export const validAllowance = (value: number) => Number.isFinite(value) && value > 0 && value <= 100000;
export const defaultMovementSettings = (grid: GridSpec): MovementSettings => ({ allowance: Math.min(100000, grid.unitsPerCell * 6) });
export function isMovementSettings(value: unknown): value is MovementSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<MovementSettings>;
  return typeof v.allowance === "number" && validAllowance(v.allowance);
}
export function budgetLabel(distance: number, allowance: number, grid: GridSpec): string {
  const difference = allowance - distance;
  return `${formatDistance(distance, grid).replace(` ${grid.unitLabel}`, "")} / ${formatDistance(allowance, grid)} · ${formatDistance(Math.abs(difference), grid)} ${difference < -1e-9 ? "over" : "remaining"}`;
}
