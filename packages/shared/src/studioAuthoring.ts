import { z } from "zod";
import { BuildKey, DraftLine, DraftMark, DraftOpening, DraftSquare } from "./build";
import { Point, segmentCrossesRect, type GridSpec } from "./geometry";
import { StudioScene } from "./studio";
import { MAX_TERRAIN_CELLS, PaintRun, type Rect } from "./terrain";

const id = z.uuid();
const version = z.string().min(1).max(64);
export const StudioRectangle = z.strictObject({
  minX: z.number().nonnegative(), minY: z.number().nonnegative(),
  maxX: z.number().positive(), maxY: z.number().positive(),
}).refine((r) => r.minX < r.maxX && r.minY < r.maxY, "Select a region with positive area.");
export type StudioRectangle = z.infer<typeof StudioRectangle>;

export const StudioSelection = z.strictObject({
  region: StudioRectangle,
  layers: z.array(z.enum(["geometry", "terrain", "placements"])).min(1).max(3),
  objectIds: z.array(id).max(2550),
  wholeObjectIds: z.array(id).max(2550),
});
export type StudioSelection = z.infer<typeof StudioSelection>;
export type StudioEditLayer = StudioSelection["layers"][number];

const ObjectBounds = z.object({ minX: z.number(), minY: z.number(), maxX: z.number(), maxY: z.number() });
export const StudioSelectionObject = z.object({
  id, layer: z.enum(["geometry", "placements"]), bounds: ObjectBounds.nullable(),
  kind: z.enum(["wall", "door", "window", "opening", "mark", "token"]),
  segment: z.object({ a: Point, b: Point }).optional(),
  state: z.enum(["open", "closed", "locked"]).optional(), label: z.string().optional(), hidden: z.boolean().optional(),
});
export type StudioSelectionObject = z.infer<typeof StudioSelectionObject>;

export function studioObjectCoverage(object: StudioSelectionObject, region: StudioRectangle): "inside" | "crossing" | "outside" {
  const box = object.bounds;
  if (!box) return "outside";
  if (studioContains(region, box)) return "inside";
  return (object.segment ? segmentCrossesRect(object.segment, region) : studioOverlaps(region, box)) ? "crossing" : "outside";
}
export const studioContains = (region: Rect, box: Rect) =>
  box.minX >= region.minX && box.minY >= region.minY && box.maxX <= region.maxX && box.maxY <= region.maxY;
export const studioOverlaps = (a: Rect, b: Rect) => a.maxX > b.minX && a.minX < b.maxX && a.maxY > b.minY && a.minY < b.maxY;

/** Positive-area intersection with the region, including negative indices at cropped map edges. */
export function studioTerrainCoverage(region: StudioRectangle, grid: Pick<GridSpec, "offsetX" | "offsetY" | "cellSize">) {
  const { offsetX, offsetY, cellSize } = grid;
  const span = (min: number, max: number, offset: number) => {
    let first = Math.floor((min - offset) / cellSize);
    let last = Math.ceil((max - offset) / cellSize) - 1;
    // Use the same cell edges as cellRect when division rounds a fractional grid boundary.
    const left = (cell: number) => offset + cell * cellSize;
    if (left(first - 1) + cellSize > min) first--;
    else if (left(first) + cellSize <= min) first++;
    if (left(last + 1) < max) last++;
    else if (left(last) >= max) last--;
    return [first, last] as const;
  };
  const [fromColumn, toColumn] = span(region.minX, region.maxX, offsetX);
  const [fromRow, toRow] = span(region.minY, region.maxY, offsetY);
  return { fromColumn, toColumn, fromRow, toRow };
}

const StudioTarget = z.object({ mapKey: BuildKey, encounterKey: BuildKey.nullable() });
export const StudioInspection = z.object({
  target: StudioTarget, inspectedVersion: version, workingRevisionId: id.nullable(), drifted: z.boolean(),
  scene: StudioScene, objects: z.array(StudioSelectionObject),
});
export type StudioInspection = z.infer<typeof StudioInspection>;

export const StudioRevisionHeader = z.object({
  id, parentId: id.nullable(), restoredFrom: id.optional(), requestId: id.optional(), actor: z.enum(["owner", "studio"]), at: z.string(),
});
export type StudioRevisionHeader = z.infer<typeof StudioRevisionHeader>;
export const StudioRevisionView = z.object({ target: StudioTarget, revision: StudioRevisionHeader, scene: StudioScene, objects: z.array(StudioSelectionObject) });
export type StudioRevisionView = z.infer<typeof StudioRevisionView>;

export const StudioCorrectionActivity = z.object({
  observed: z.boolean(),
  outcome: z.discriminatedUnion("status", [
    z.object({ status: z.enum(["advanced", "stale"]), revisionId: id }),
    z.object({ status: z.literal("refused"), code: z.enum(["conflict", "invalid", "scope", "permission", "limit"]) }),
  ]).optional(),
});
export type StudioCorrectionActivity = z.infer<typeof StudioCorrectionActivity>;
export const StudioCorrectionReceipt = z.object({ requestId: id, baseRevisionId: id, scope: StudioSelection });
export type StudioCorrectionReceipt = z.infer<typeof StudioCorrectionReceipt>;
export const StudioCorrectionHistory = z.object({
  target: StudioTarget, workingRevisionId: id, referenceRevisionId: id, revisions: z.array(StudioRevisionHeader),
  requests: z.array(StudioCorrectionReceipt.extend({ instruction: z.string(), activity: StudioCorrectionActivity, at: z.string().optional() })),
});
export type StudioCorrectionHistory = z.infer<typeof StudioCorrectionHistory>;

const CorrectionInstruction = z.string().trim().min(1).max(2000);
const CorrectionTarget = z.strictObject({
  encounterKey: BuildKey.nullable(), inspectedVersion: version, selection: StudioSelection,
});
export const StudioCorrectionInput = CorrectionTarget.extend({ operationId: id, instruction: CorrectionInstruction });
export type StudioCorrectionInput = z.infer<typeof StudioCorrectionInput>;

export const StudioChatSelectionDraft = CorrectionTarget.extend({ mapKey: BuildKey });
export const StudioChatSelectionUpdate = z.strictObject({
  viewId: id, sequence: z.number().int().min(1).max(2 ** 31 - 1), draft: StudioChatSelectionDraft.nullable(),
});
export type StudioChatSelectionUpdate = z.infer<typeof StudioChatSelectionUpdate>;
export const StudioChatSelectionReference = z.object({ selectionId: id.nullable() });
export const StudioChatCorrectionInput = z.strictObject({ instruction: CorrectionInstruction });

const opening = z.strictObject({
  kind: DraftOpening.shape.kind, state: DraftOpening.shape.state, reason: DraftOpening.shape.reason,
});
export const StudioOperation = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("line.add"), line: DraftLine }),
  z.strictObject({ op: z.literal("line.update"), id, line: DraftLine }),
  z.strictObject({ op: z.literal("line.remove"), id }),
  z.strictObject({ op: z.literal("opening.set"), id, opening }),
  z.strictObject({ op: z.literal("mark.add"), mark: DraftMark }),
  z.strictObject({ op: z.literal("mark.update"), id, mark: DraftMark }),
  z.strictObject({ op: z.literal("mark.remove"), id }),
  z.strictObject({ op: z.literal("terrain.paint"), runs: z.array(PaintRun).min(1).max(MAX_TERRAIN_CELLS) }),
  z.strictObject({ op: z.literal("placement.move"), id, square: DraftSquare }),
  z.strictObject({ op: z.literal("placement.set_visibility"), id, hidden: z.boolean() }),
]);
export type StudioOperation = z.infer<typeof StudioOperation>;
export const StudioProposalInput = z.strictObject({
  baseRevisionId: id, operationId: id, operations: z.array(StudioOperation).min(1).max(MAX_TERRAIN_CELLS),
});
export type StudioProposalInput = z.infer<typeof StudioProposalInput>;
export const StudioRestoreInput = z.strictObject({ revisionId: id, expectedCurrentRevisionId: id, operationId: id });
export type StudioRestoreInput = z.infer<typeof StudioRestoreInput>;

export const StudioOwnerIds = z.strictObject({
  lines: z.array(id.nullable()).max(500).optional(), marks: z.array(id.nullable()).max(50).optional(),
  placements: z.array(id.nullable()).max(500).optional(),
});
export type StudioOwnerIds = z.infer<typeof StudioOwnerIds>;
export interface StudioOwnerVersion {
  token: string;
  ids?: StudioOwnerIds;
}
