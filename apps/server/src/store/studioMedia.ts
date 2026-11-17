import { z } from "zod";
import type { BuildFileRecord, BuildRecord } from "./buildStore";
import type { StudioDelegation } from "./studioStore";

export const StudioMediaMetadata = z.object({
  version: z.literal(1), originalSha256: z.string().regex(/^[a-f0-9]{64}$/), contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  rawWidth: z.number().int().positive(), rawHeight: z.number().int().positive(), orientation: z.number().int().min(1).max(8), canonicalId: z.string(),
  previewKey: z.string(), previewSha256: z.string(), previewBytes: z.number().int().nonnegative(), totalBytes: z.number().int().positive(),
  receiptKeys: z.array(z.string()).max(20),
});
export type StudioMediaMetadata = z.infer<typeof StudioMediaMetadata>;
export const StudioIntakeOutcome = z.object({ id: z.string(), kind: z.enum(["map", "token"]), name: z.string(), status: z.enum(["saved", "failed"]), fileId: z.string().optional(), code: z.string().optional(), at: z.string() });
export type StudioIntakeOutcome = z.infer<typeof StudioIntakeOutcome>;
export interface StudioMediaJob { id: string; buildId: string; state: "write" | "cancelled" | "delete"; keys: string[]; expiresAt: string }
export class StudioMediaConflictError extends Error { constructor() { super("studio_media_conflict"); } }
export interface StudioMediaPersistence {
  recordStudioIntake(buildId: string, outcome: StudioIntakeOutcome, delegation: StudioDelegation): Promise<void>;
  startStudioMedia(job: StudioMediaJob, delegation: StudioDelegation): Promise<void>;
  commitStudioFile(file: BuildFileRecord, limits: { files: number; maps: number; bytes: number }, delegation: StudioDelegation): Promise<{ file: BuildFileRecord; created: boolean }>;
  bindStudioFile(buildId: string, fileId: string | null, delegation: StudioDelegation): Promise<void>;
  failStudioMedia(id: string): Promise<void>;
  listStudioMediaJobs(now: string): Promise<string[]>;
  claimStudioMediaDeletion(id: string, now: string): Promise<StudioMediaJob | null>;
  finishStudioMediaDeletion(id: string, now: string): Promise<void>;
}
export function mediaKeys(file: Pick<BuildFileRecord, "objectKey" | "studio">): string[] { return file.studio ? [file.objectKey, file.studio.previewKey] : []; }
export function duplicateStudioFile(files: BuildFileRecord[], next: BuildFileRecord) {
  return files.find((f) => f.kind === next.kind && f.studio && next.studio && (f.studio.originalSha256 === next.studio.originalSha256 || f.studio.receiptKeys.some((key) => next.studio!.receiptKeys.includes(key))));
}
export function studioAccessBuild(build: BuildRecord | null) { return build?.status === "open"; }
