import type { GridSpec } from "@vtt/shared";
import { formatDistance } from "./tools";

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
  return `${formatDistance(distance, grid).replace(` ${grid.unitLabel}`, "")} / ${formatDistance(allowance, grid)} · ${formatDistance(Math.abs(difference), grid)} ${difference < -1e-9 ? "over" : "remaining"}`;
}
