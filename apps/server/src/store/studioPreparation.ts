import { StudioContext, type StudioPreparationOutcome } from "@vtt/shared";
import type { BuildFileRecord, BuildItemRecord, BuildRecord } from "./buildStore";
import type { StudioDelegation } from "./studioStore";

export interface StudioBuildAccess { ownerGmId: string; delegation?: StudioDelegation; passHash?: string }
export interface StudioPreparationRecords { build: BuildRecord; files: BuildFileRecord[]; items: BuildItemRecord[] }
export class StudioContextConflictError extends Error { constructor() { super("studio_context_conflict"); } }
export interface StudioPreparationStore {
  readStudioPreparation(buildId: string, access: StudioBuildAccess): Promise<StudioPreparationRecords>;
  setStudioContext(buildId: string, context: StudioContext, access: StudioBuildAccess): Promise<void>;
  recordStudioPreparation(buildId: string, outcome: StudioPreparationOutcome, access: StudioBuildAccess): Promise<void>;
}
export function assertStudioBuildAccess(build: BuildRecord, access: StudioBuildAccess) {
  if (build.ownerGmId !== access.ownerGmId || (access.passHash !== undefined &&
    (build.passHash !== access.passHash || !build.passExpiresAt || Date.parse(build.passExpiresAt) <= Date.now()))) throw new StudioContextConflictError();
}
export function assertStudioContext(context: StudioContext, files: readonly BuildFileRecord[], items: readonly BuildItemRecord[]) {
  StudioContext.parse(context);
  if (context.sourceFileId !== null && !files.some((f) => f.id === context.sourceFileId && f.kind === "map")) throw new StudioContextConflictError();
  if (context.mapKey !== null && (!context.sourceFileId || !items.some((i) => i.kind === "map" && i.key === context.mapKey && i.data.fileId === context.sourceFileId))) throw new StudioContextConflictError();
  if (context.encounterKey !== null && (!context.mapKey || !items.some((i) => i.kind === "encounter" && i.key === context.encounterKey && i.data.mapKey === context.mapKey))) throw new StudioContextConflictError();
}
