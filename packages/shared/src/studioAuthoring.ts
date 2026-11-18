import { z } from "zod";
import { BuildKey, DraftLine, DraftMark, DraftOpening, DraftSquare } from "./build";
import { MAX_TERRAIN_CELLS, PaintRun } from "./terrain";

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

export const StudioCorrectionInput = z.strictObject({
  encounterKey: BuildKey.nullable(), inspectedVersion: version, operationId: id,
  instruction: z.string().trim().min(1).max(2000), selection: StudioSelection,
});
export type StudioCorrectionInput = z.infer<typeof StudioCorrectionInput>;

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
