import { MAX_MOVE_VIA, blocksMovement, cheapestPath, diagonalRuleOf, effectiveTerrain, emptyTerrain, clearanceSweepTouchesWall, clearanceTouchesWall, isSnapped, movementRouteKnown, overlapsToken, movementTerrain, routeCost, stepRulesOf, terrainCells, type GridSpec, type Participant, type Point, type RoomState, type TerrainRun, type Token } from "@vtt/shared";
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
  const destination = movementTerrain(to, to, token.size, grid, runs).blocked || clearanceTouchesWall(to, token.size, grid, walls);
  const obstruction = destination || (!reposition && (result.blocked || clearanceSweepTouchesWall(from, to, token.size, grid, walls.filter((w) => !clearanceTouchesWall(from, token.size, grid, [w])))));
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
  const plan = routePlanFor(state, you, token, from, to, free, reposition);
  // A snapped drop onto a token this board holds is refused on drop, so it shows blocked (token-no-stacking).
  return !free && overlapsToken(state.tokens, to, token.size, state.scene.grid, token.id) ? { ...plan, obstruction: "blocked" } : plan;
}

function routePlanFor(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free: boolean, reposition: boolean): DragPlan {
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

/** Searched legs, per room state and viewer, so a pointer move re-searches only the live leg (ruler-modes). */
const legCache = new WeakMap<RoomState, Map<string, Point[] | null>>();

/** Whether a ruler of `size` from `start` routes its legs as a drag would: on the grid, whole squares, a map to bound it. */
export function routeSearched(state: RoomState, start: Point, size: number): boolean {
  return !!state.scene.map && Number.isInteger(size) && size >= 1 && isSnapped(start, size, state.scene.grid);
}

/**
 * A Movement-mode route (ruler-modes): between each pair of stops, the path a drag of the same
 * footprint would show — cheapest, around Blocked terrain and the walls and doors this viewer knows
 * of — then priced in one pass so Alternating diagonals count across the stops. A leg with no path
 * stays straight and marks the route "Blocked". A start off the grid or of fractional size keeps
 * straight legs. Tokens are not checked: measuring up to one stays clear.
 */
export function routePlan(state: RoomState, you: Participant, stops: readonly Point[], tokenSize = 1) {
  const grid = state.scene.grid, rules = stepRulesOf(state), runs = viewerRuns(state, you);
  const searched = stops.length > 0 && routeSearched(state, stops[0]!, tokenSize);
  const size = searched ? tokenSize : 1;
  let points: Point[] = [...stops], noPath = false;
  if (searched) {
    const knowledge = { kinds: terrainCells(runs), walls: Object.values(state.walls).filter(blocksMovement), map: state.scene.map! };
    let cache = legCache.get(state);
    if (!cache) legCache.set(state, cache = new Map());
    points = stops.length > 0 ? [stops[0]!] : [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!, b = stops[i]!;
      const key = `${you.id}|${size}|${a.x},${a.y}>${b.x},${b.y}`;
      let via = cache.get(key);
      if (via === undefined) {
        via = cheapestPath(a, b, size, grid, rules, knowledge, "line")?.via ?? null;
        cache.set(key, via);
      }
      if (via === null) noPath = true;
      points.push(...(via ?? []), b);
    }
  }
  const route = routeCost(points, grid, rules, runs, size);
  const blocked = route.blocked || noPath;
  return { ...route, blocked, points, label: blocked ? t("board.blocked") : costLabel(route.cost, route.difficult, grid) };
}
