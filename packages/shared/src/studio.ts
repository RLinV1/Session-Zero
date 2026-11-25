import { z } from "zod";
import { BuildKey, DraftMark, DraftSquare, DraftProposedGrid } from "./build";
import { GridSpec, Point } from "./geometry";
import { Wall } from "./state";
import { TerrainRun } from "./terrain";

/** Display selection only. It never redirects a keyed authoring operation (ADR 0073 D13). */
export const StudioContext = z.strictObject({
  sourceFileId: z.uuid().nullable(), mapKey: BuildKey.nullable(), encounterKey: BuildKey.nullable(),
});
export type StudioContext = z.infer<typeof StudioContext>;
export const EMPTY_STUDIO_CONTEXT: StudioContext = { sourceFileId: null, mapKey: null, encounterKey: null };

export const StudioPreparationOutcome = z.strictObject({
  id: z.uuid(), at: z.string(), operation: z.enum(["map", "setup", "creature", "encounter", "profile"]),
  targetKey: BuildKey.nullable(), status: z.enum(["saved", "refused"]),
  code: z.enum(["saved", "permission", "invalid", "conflict", "locked", "limit", "unavailable"]),
});
export type StudioPreparationOutcome = z.infer<typeof StudioPreparationOutcome>;

export const StudioFile = z.object({
  id: z.uuid(), kind: z.enum(["map", "token"]), name: z.string(), width: z.number().positive(), height: z.number().positive(),
  sizeBytes: z.number().nonnegative(), privacy: z.enum(["private", "legacy-public"]),
  originalSha256: z.string().nullable(), canonicalId: z.string().nullable(), orientation: z.number().nullable(), previewHash: z.string().nullable(),
});
export type StudioFile = z.infer<typeof StudioFile>;
export const StudioIssue = z.object({ kind: z.enum(["problem", "uncertain"]), key: z.string().nullable(), message: z.string() });
export const StudioScene = z.object({
  source: StudioFile.nullable(), mapName: z.string().nullable(), encounterName: z.string().nullable(),
  grid: GridSpec.nullable(), gridStatus: z.enum(["none", "proposed", "confirmed"]), gridBy: z.string().nullable(),
  detection: z.object({ status: z.enum(["queued", "running", "suggested", "no_grid", "error"]), suggestion: DraftProposedGrid.nullable(), error: z.string().nullable(), attempt: z.number() }).nullable(),
  walls: z.array(Wall), terrain: z.array(TerrainRun), terrainState: z.enum(["empty", "noGrid", "otherGrid", "ready"]), marks: z.array(DraftMark),
  tokens: z.array(z.object({
    index: z.number().int(), id: z.uuid().optional(), creatureKey: BuildKey, name: z.string(), size: z.number().positive(),
    color: z.string(), imageFileId: z.uuid().nullable(), hidden: z.boolean(), square: DraftSquare.nullable(), center: Point.nullable(),
  })),
  issues: z.array(StudioIssue),
});
export type StudioScene = z.infer<typeof StudioScene>;
export const StudioSnapshot = z.object({
  version: z.literal(2), buildId: z.uuid(), buildName: z.string(), ownerName: z.string().nullable(),
  sourceFileId: z.uuid().nullable(), files: z.array(StudioFile),
  context: StudioContext,
  maps: z.array(z.object({ key: BuildKey, name: z.string(), fileId: z.uuid() })),
  encounters: z.array(z.object({ key: BuildKey, name: z.string(), mapKey: BuildKey })),
  allowed: z.object({ grids: z.boolean(), walls: z.boolean(), terrain: z.boolean() }),
  workingRevisionId: z.uuid().optional(), workingBindingChanged: z.boolean().optional(),
  correctionHistoryVersion: z.uuid().optional(), correctionsAllowed: z.boolean().optional(),
  scene: StudioScene, outcomes: z.array(StudioPreparationOutcome).max(20),
  intakeOutcomes: z.array(z.object({ id: z.string(), kind: z.enum(["map", "token"]), name: z.string(), status: z.enum(["saved", "failed"]), fileId: z.string().optional(), code: z.string().optional(), at: z.string() })),
  /** Render/cache identity only, never an authoring revision or write precondition. */
  fingerprint: z.string(), refreshIntervalMs: z.number().positive(), websitePath: z.string(),
});
export type StudioSnapshot = z.infer<typeof StudioSnapshot>;
