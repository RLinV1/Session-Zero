import { GridSpec, gridLineStyle, type GridDetectionCandidate } from "@vtt/shared";
import { canRenderGrid, type BoardSize } from "../board/gridRenderLimit";

/** Text values let the GM clear a field while editing without turning it into zero. */
export interface GridDraft {
  cellSize: string;
  offsetX: string;
  offsetY: string;
  unitsPerCell: string;
  unitLabel: string;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
}

/** Session intent is independent of value equality and survives grid-tab remounts. */
export interface GridSuggestionSession { blocked: boolean; applied: boolean }
export const newGridSuggestionSession = (): GridSuggestionSession => ({ blocked: false, applied: false });

/** Lives beside the draft so geometry and the first editable frame commit together. */
export interface GridPreparation {
  phase: "checking" | "waiting" | "editable";
  notice: string | null;
}
export const newGridPreparation = (wait: boolean): GridPreparation => ({ phase: wait ? "checking" : "editable", notice: null });

export function toGridDraft(grid: GridSpec): GridDraft {
  return {
    cellSize: String(grid.cellSize),
    offsetX: String(grid.offsetX),
    offsetY: String(grid.offsetY),
    unitsPerCell: String(grid.unitsPerCell),
    unitLabel: grid.unitLabel,
    lineColor: grid.lineColor,
    lineWidth: grid.lineWidth,
    lineOpacity: grid.lineOpacity,
  };
}

/** A suggestion changes only alignment. Units and style remain the GM's draft choices. */
export function withGridSuggestion(draft: GridDraft, candidate: GridDetectionCandidate): GridDraft {
  return {
    ...draft,
    cellSize: String(candidate.cellSize),
    offsetX: String(candidate.offsetX),
    offsetY: String(candidate.offsetY),
  };
}

export function parseGridDraft(draft: GridDraft, board: BoardSize | null = null): GridSpec | null {
  if ([draft.cellSize, draft.offsetX, draft.offsetY, draft.unitsPerCell, draft.unitLabel]
    .some((value) => value.trim() === "")) return null;
  const parsed = GridSpec.safeParse({
    cellSize: Number(draft.cellSize),
    offsetX: Number(draft.offsetX),
    offsetY: Number(draft.offsetY),
    unitsPerCell: Number(draft.unitsPerCell),
    unitLabel: draft.unitLabel,
    lineColor: draft.lineColor,
    lineWidth: draft.lineWidth,
    lineOpacity: draft.lineOpacity,
  });
  if (!parsed.success) return null;
  return canRenderGrid(parsed.data.cellSize, board) ? parsed.data : null;
}

export function gridsEqual(a: GridSpec, b: GridSpec): boolean {
  const aStyle = gridLineStyle(a);
  const bStyle = gridLineStyle(b);
  return a.cellSize === b.cellSize && a.offsetX === b.offsetX && a.offsetY === b.offsetY
    && a.unitsPerCell === b.unitsPerCell && a.unitLabel === b.unitLabel
    && aStyle.color.toLowerCase() === bStyle.color.toLowerCase()
    && aStyle.width === bStyle.width && aStyle.opacity === bStyle.opacity;
}
