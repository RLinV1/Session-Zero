import { MAX_MOVE_VIA, blocksMovement, cheapestPath, diagonalRuleOf, effectiveTerrain, emptyTerrain, footprintCrossesWall, isSnapped, movementRouteKnown, movementTerrain, routeCost, stepRulesOf, sweptCrossesWalls, terrainCells, type GridSpec, type Participant, type Point, type RoomState, type TerrainRun, type Token } from "@vtt/shared";
import { formatDistance, measure } from "./tools";

/** The terrain a viewer may cost with: effective terrain for the GM, their filtered view otherwise. */
function viewerRuns(state: RoomState, you: Participant): readonly TerrainRun[] {
  return you.role === "gm" ? effectiveTerrain(state.terrain ?? emptyTerrain()) : state.terrainView?.runs ?? [];
}

/** A cost as the board shows it: plain distance, plus how many steps Difficult terrain doubled. */
export function costLabel(cost: number, difficult: number, grid: GridSpec): string {
  return formatDistance(cost, grid) + (difficult ? t("board.difficult", { n: difficult }) : "");
}

import { t } from "../i18n/locale";
export type MovementPreview = { label: string; obstruction: "blocked" | "unknown" | "clear" };

export function movementPreview(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free = false, reposition = false): MovementPreview {
  const grid = state.scene.grid;
  const runs = viewerRuns(state, you);
  const result = movementTerrain(from, to, token.size, grid, runs, free);
  const unknown = you.role !== "gm" && !movementRouteKnown(state, from, to, token.size);
  const walls = Object.values(state.walls).filter(blocksMovement);
  const destination = movementTerrain(to, to, token.size, grid, runs).blocked || footprintCrossesWall(to, token.size, grid, walls);
  const obstruction = destination || (!reposition && (result.blocked || sweptCrossesWalls(from, to, token.size, grid, walls.filter((w) => !footprintCrossesWall(from, token.size, grid, [w])))));
  // A straight move shows distance only: terrain cost belongs to grid paths (ADR 0055).
  return { label: `${formatDistance(result.distance, grid)}${reposition ? t("move.reposition") : ""}`, obstruction: obstruction ? "blocked" : unknown ? "unknown" : "clear" };
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
 * Repositioned, follows the cheapest path the viewer knows of, labelled with its cost under the room's
 * rules ("25 ft"). Anything else, or a path the search can't find, is a straight line showing distance only.
 */
export function dragPlan(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free: boolean, reposition: boolean): DragPlan {
  const grid = state.scene.grid, map = state.scene.map, size = token.size;
  const pathed = !free && !reposition && !!map && Number.isInteger(size) && size >= 1 && isSnapped(from, size, grid);
  const straight = (): DragPlan => {
    const preview = movementPreview(state, you, token, from, to, free, reposition);
    return { points: [from, to], via: [], label: preview.label, obstruction: preview.obstruction };
  };
  if (!pathed) return straight();
  const runs = viewerRuns(state, you);
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
  return { points, via: path.via, label: costLabel(path.cost, path.difficult, grid), obstruction: "clear" };
}

export function movementReadout(...args: Parameters<typeof movementPreview>): string {
  return movementPreview(...args).label;
}

/**
 * A Range-mode measurement (ruler-modes): one straight line under the room's Diagonals rule,
 * ignoring terrain, labelled with plain distance. The Alt ruler stays free-hand straight-line.
 */
export function rangeMeasure(state: Pick<RoomState, "scene" | "diagonalRule">, from: Point, to: Point, free: boolean, tokenSize?: number) {
  return measure(from, to, state.scene.grid, free, free ? "euclidean" : diagonalRuleOf(state), tokenSize);
}

/** A Movement-mode route's cost and label (ruler-modes): "30 ft", " · N difficult", or "Blocked". */
export function routePlan(state: RoomState, you: Participant, points: readonly Point[]) {
  const grid = state.scene.grid;
  const route = routeCost(points, grid, stepRulesOf(state), viewerRuns(state, you));
  return { ...route, label: route.blocked ? t("board.blocked") : costLabel(route.cost, route.difficult, grid) };
}
