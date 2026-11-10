import { effectiveTerrain, emptyTerrain, movementTerrain, movementRouteKnown, sweptCrossesWalls, footprintCrossesWall, blocksMovement, type GridSpec, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { formatDistance } from "./tools";

import { t } from "../i18n/locale";
export type MovementPreview = { label: string; obstruction: "blocked" | "unknown" | "clear" };

export function movementPreview(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free = false, reposition = false): MovementPreview {
  const grid = state.scene.grid;
  const runs = you.role === "gm" ? effectiveTerrain(state.terrain ?? emptyTerrain()) : state.terrainView?.runs ?? [];
  const result = movementTerrain(from, to, token.size, grid, runs, free);
  const unknown = you.role !== "gm" && !movementRouteKnown(state, from, to, token.size);
  const walls = Object.values(state.walls).filter(blocksMovement);
  const destination = movementTerrain(to, to, token.size, grid, runs).blocked || footprintCrossesWall(to, token.size, grid, walls);
  const obstruction = destination || (!reposition && (result.blocked || sweptCrossesWalls(from, to, token.size, grid, walls.filter((w) => !footprintCrossesWall(from, token.size, grid, [w])))));
  const cost = unknown ? t("move.costUnknown") : Math.abs(result.cost - result.distance) > 1e-8 ? t("move.cost", { cost: formatDistance(result.cost, grid) }) : "";
  return { label: `${formatDistance(result.distance, grid)}${cost}${reposition ? t("move.reposition") : ""}`, obstruction: obstruction ? "blocked" : unknown ? "unknown" : "clear" };
}

export function movementReadout(...args: Parameters<typeof movementPreview>): string {
  return movementPreview(...args).label;
}

export type DistanceRule = "equal" | "alternating" | "euclidean";
export interface MovementSettings { allowance: number; rule: DistanceRule }
export const validAllowance = (value: number) => Number.isFinite(value) && value > 0 && value <= 100000;
export const defaultMovementSettings = (grid: GridSpec): MovementSettings => ({ allowance: Math.min(100000, grid.unitsPerCell * 6), rule: "equal" });
export function isMovementSettings(value: unknown): value is MovementSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<MovementSettings>;
  return typeof v.allowance === "number" && validAllowance(v.allowance) && ["equal", "alternating", "euclidean"].includes(v.rule ?? "");
}
export function budgetLabel(distance: number, allowance: number, grid: GridSpec): string {
  const difference = allowance - distance;
  const parts = { used: formatDistance(distance, grid).replace(` ${grid.unitLabel}`, ""), budget: formatDistance(allowance, grid), left: formatDistance(Math.abs(difference), grid) };
  return t(difference < -1e-9 ? "board.over" : "board.remaining", parts);
}
