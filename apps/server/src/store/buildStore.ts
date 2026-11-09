import type { BuildFlag, GameProfile, GridDetectionCandidate, GridSpec, LibraryMapBoard } from "@vtt/shared";
import type { DetectionError, DetectionState } from "./gridDetectionStore";

/**
 * The AI game builder's private drafts (FR-GM-26, FR-GM-27, ADR 0053). Nothing here is room state
 * or part of the library. A build's files and items stay here until their owner publishes them.
 */

export type BuildStatus = "open" | "closed";

export interface BuildRecord {
  id: string;
  ownerGmId: string;
  name: string;
  status: BuildStatus;
  gameProfile: GameProfile | null;
  /** SHA-256 of the live pass. Never leaves the server. */
  passHash: string | null;
  passExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewBuildRecord = Pick<BuildRecord, "id" | "ownerGmId" | "name">;

export type BuildFileKind = "map" | "token";

export interface BuildFileRecord {
  id: string;
  buildId: string;
  kind: BuildFileKind;
  objectKey: string;
  url: string;
  originalName: string;
  width: number;
  height: number;
  sizeBytes: number;
  /** Set only by a UVTT file, which is exact, so that map's grid counts as confirmed. */
  grid: GridSpec | null;
  board: LibraryMapBoard | null;
  sourceHash: string | null;
  detectionSourceHash: string | null;
  detectionVersion: string | null;
  detectionError: DetectionError | null;
  detectionStatus: DetectionState | null;
  detectionAttempt: number;
  detectionResult: GridDetectionCandidate | null;
  detectionUpdatedAt: string | null;
  publishedAssetId: string | null;
  createdAt: string;
}

export type BuildItemKind = "creature" | "map" | "encounter";

export interface BuildItemRecord {
  buildId: string;
  kind: BuildItemKind;
  key: string;
  /** Validated by the shared draft schema for its kind when it was saved. */
  data: Record<string, unknown>;
  flags: BuildFlag[];
  notCarriedOver: string;
  editedByUser: boolean;
  publishedId: string | null;
  updatedAt: string;
}

export type NewBuildItem = Pick<BuildItemRecord, "buildId" | "kind" | "key" | "data" | "flags" | "notCarriedOver">;

export interface BuildFileLimits {
  files: number;
  maps: number;
  bytes: number;
}

export interface BuildFileUsage {
  files: number;
  maps: number;
  bytes: number;
}

/** A limit a build or an account has reached. The message is for the person or AI that hit it. */
export class BuildLimitError extends Error {}

/** The build isn't open any more, so nothing can be added to it. */
export class BuildClosedError extends Error {
  constructor() {
    super("This build is closed.");
  }
}

/** The AI can't change this item: its owner edited it, or it has been published. */
export class BuildItemLockedError extends Error {
  constructor(readonly reason: "edited" | "published") {
    super(reason === "edited"
      ? "The user changed this item, so it can't be overwritten. Tell them what you wanted to change."
      : "This item has already been published, so it can't be changed here.");
  }
}

/** Refuses a file that doesn't fit, naming the limit. */
export function assertBuildFileFits(usage: BuildFileUsage, file: Pick<BuildFileRecord, "kind" | "sizeBytes">, limits: BuildFileLimits) {
  if (usage.files >= limits.files) throw new BuildLimitError(`A build can hold up to ${limits.files} files. Remove some, or start another build.`);
  if (file.kind === "map" && usage.maps >= limits.maps) throw new BuildLimitError(`A build can hold up to ${limits.maps} maps.`);
  if (usage.bytes + file.sizeBytes > limits.bytes) throw new BuildLimitError(`A build can hold up to ${Math.round(limits.bytes / 1024 ** 2)} MB of files.`);
}

export interface BuildStore {
  /** One step per owner, so overlapping requests can't pass `maxOpen`. Throws `BuildLimitError`. */
  createBuild(build: NewBuildRecord, maxOpen: number): Promise<BuildRecord>;
  listBuilds(ownerGmId: string): Promise<BuildRecord[]>;
  /** Null for another owner's build as for a missing one, so the two read the same. */
  findBuild(id: string, ownerGmId: string): Promise<BuildRecord | null>;
  findBuildByPassHash(passHash: string): Promise<BuildRecord | null>;
  /** The account's display name, so someone handed another person's pass can notice. */
  findBuildOwnerName(ownerGmId: string): Promise<string | null>;
  /** Replaces the live pass, which ends any earlier one. False unless the owner has this build open. */
  setBuildPass(id: string, ownerGmId: string, passHash: string, expiresAt: string): Promise<boolean>;
  /** False when the owner has no such build. */
  clearBuildPass(id: string, ownerGmId: string): Promise<boolean>;
  /** Ends every pass on the account, as a password change must. */
  endBuildPasses(ownerGmId: string): Promise<void>;
  /** Throws `BuildClosedError` when the build isn't open. */
  saveGameProfile(buildId: string, profile: GameProfile): Promise<void>;

  buildFileUsage(buildId: string): Promise<BuildFileUsage>;
  /** The check and the insert are one step per build. Throws `BuildLimitError` or `BuildClosedError`. */
  addBuildFile(file: BuildFileRecord, limits: BuildFileLimits): Promise<void>;
  listBuildFiles(buildId: string): Promise<BuildFileRecord[]>;
  /** Scoped by build, so a file id from another build reads as missing. */
  findBuildFile(buildId: string, fileId: string): Promise<BuildFileRecord | null>;

  /**
   * Saves by key: a repeat updates the item. The checks and the write are one step per build.
   * `maxForKind` caps new items only. Throws `BuildItemLockedError`, `BuildLimitError` or `BuildClosedError`.
   */
  saveBuildItem(item: NewBuildItem, maxForKind: number | null): Promise<BuildItemRecord>;
  listBuildItems(buildId: string): Promise<BuildItemRecord[]>;
  findBuildItem(buildId: string, kind: BuildItemKind, key: string): Promise<BuildItemRecord | null>;
  /** False when there is no such item. Throws `BuildItemLockedError` or `BuildClosedError`. */
  removeBuildItem(buildId: string, kind: BuildItemKind, key: string): Promise<boolean>;
  /** Marks an item as changed by its owner, or as published. Used by the review page. */
  markBuildItem(buildId: string, kind: BuildItemKind, key: string, state: { editedByUser?: boolean; publishedId?: string }): Promise<boolean>;
}
