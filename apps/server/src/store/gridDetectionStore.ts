import { GRID_DETECTION_VERSION, type GridDetectionCandidate } from "@vtt/shared";

export type DetectionTarget =
  | { scope: "library"; id: string }
  | { scope: "room"; roomId: string; objectKey: string };
export type DetectionState = "queued" | "running" | "suggested" | "no_grid" | "error";
export const DETECTION_STALE_MS = 90_000;
export const DETECTION_MAX_ATTEMPTS = 3;
export const DETECTION_MAX_PIXELS = Number(process.env.GRID_MAX_PIXELS ?? 16_000_000);
export const DETECTION_VERSION = `${GRID_DETECTION_VERSION}:max${DETECTION_MAX_PIXELS}`;
export type DetectionError = "oversized" | "invalid_image" | "source_changed" | "execution_failed";
export interface DetectionIdentity { sourceHash: string; configVersion: string }
export interface DetectionJob extends DetectionIdentity { target: DetectionTarget; attempt: number }
/** Nullable on historical uploads; never infer or backfill these fields. */
export interface UploadAnalysis {
  sourceHash?: string | null;
  detectionSourceHash?: string | null;
  detectionVersion?: string | null;
  detectionError?: DetectionError | null;
}
export const detectionJob = (row: DetectionRecord): DetectionJob => ({
  target: row.target, attempt: row.attempt, sourceHash: row.sourceHash, configVersion: row.configVersion,
});
export const matchesDetection = (row: DetectionRecord, job: DetectionJob) =>
  row.attempt === job.attempt && row.sourceHash === job.sourceHash && row.configVersion === job.configVersion;
export interface DetectionRecord extends DetectionJob {
  target: DetectionTarget;
  objectKey: string;
  width: number;
  height: number;
  status: DetectionState;
  attempt: number;
  candidate: GridDetectionCandidate | null;
  error: DetectionError | null;
}
export type DetectionOutcome = { status: "suggested"; candidate: GridDetectionCandidate }
  | { status: "no_grid" }
  | { status: "error"; error?: DetectionError };

/** Analysis metadata never becomes RoomState or a player-visible asset response. */
export interface GridDetectionStore {
  findDetection(target: DetectionTarget): Promise<DetectionRecord | null>;
  markDetectionRunning(job: DetectionJob): Promise<boolean>;
  finishDetection(job: DetectionJob, outcome: DetectionOutcome): Promise<boolean>;
  /** Busy releases the claim unchanged; a transient failure advances the bounded attempt. */
  deferDetection(job: DetectionJob, consumeAttempt: boolean): Promise<boolean>;
  /** Returns the new attempt, or null unless the row is currently in error. */
  retryDetection(target: DetectionTarget): Promise<number | null>;
  /** Requeue pending and stale running jobs. A recovered running job gets a new attempt. */
  recoverDetections(limit?: number): Promise<DetectionJob[]>;
}
