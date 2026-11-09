import { MAX_ENCOUNTER_NAME, type BuildFlag, type GameProfile, type GridDetectionCandidate, type GridSpec, type LibraryMapBoard } from "@vtt/shared";
import type { DetectionError, DetectionState } from "./gridDetectionStore";
import type { LibraryAssetRecord, NewCreatureRecord, NewEncounterRecord, UploadAllowance } from "./libraryStore";

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

/** Something a publish relied on changed underneath it. Nothing was published. */
export class BuildPublishConflictError extends Error {
  constructor(message = "This build changed while publishing. Reload the page and try again.") {
    super(message);
  }
}

/** Everything one publish adds. Assembled first, then written in one step. */
export interface BuildPublishPlan {
  buildId: string;
  ownerGmId: string;
  /** The drafts this publish relies on, at the versions the person looked at. Checked again in the write. */
  reviewed: { kind: BuildItemKind; key: string; updatedAt: string }[];
  assets: { fileId: string; record: LibraryAssetRecord }[];
  creatures: { key: string; record: NewCreatureRecord }[];
  maps: { key: string; assetId: string }[];
  encounters: { key: string; record: NewEncounterRecord }[];
}

export interface BuildPublishResult {
  assets: number;
  creatures: { key: string; id: string }[];
  maps: { key: string; id: string }[];
  /** `name` is what it was published as, which a name clash may have numbered. */
  encounters: { key: string; id: string; name: string }[];
}

/** A name not yet used in the owner's templates: "Crypt guards", then "Crypt guards (2)". Never overwrites. */
export function uniqueEncounterName(name: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((n) => n.trim().toLowerCase()));
  if (!taken.has(name.trim().toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, MAX_ENCOUNTER_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
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
  /**
   * False when there is no such item. Throws `BuildItemLockedError` or `BuildClosedError`. The
   * owner may remove what they edited (`byOwner`); a pass may not. Neither may remove what was published.
   */
  removeBuildItem(buildId: string, kind: BuildItemKind, key: string, byOwner?: boolean): Promise<boolean>;
  /** Marks an item as changed by its owner, or as published. */
  markBuildItem(buildId: string, kind: BuildItemKind, key: string, state: { editedByUser?: boolean; publishedId?: string }): Promise<boolean>;
  /** The owner's change: marks the item edited, so the AI can't overwrite it. Refuses what was published. */
  editBuildItem(item: NewBuildItem): Promise<BuildItemRecord>;

  /**
   * Adds everything in the plan, or nothing. Throws `UploadAllowanceError`, `EncounterLimitError`,
   * `BuildClosedError` or `BuildPublishConflictError`, and then has changed nothing.
   * Only ever adds: a name clash on an encounter gets a number.
   */
  publishBuild(plan: BuildPublishPlan, allowance: UploadAllowance, maxEncounters: number): Promise<BuildPublishResult>;
  /**
   * Closes a build: ends its pass, deletes its unpublished items and files, and keeps the record of
   * what it published. Returns the object keys to delete, or null when the owner has no such build.
   */
  closeBuild(id: string, ownerGmId: string): Promise<{ objectKeys: string[] } | null>;
  /** Open builds not changed since `before`, for the 14-day sweep. */
  listAbandonedBuilds(before: string): Promise<{ id: string; ownerGmId: string }[]>;
  /** After published items were removed: drops those files, and returns those items to draft (or drops them from a closed build). */
  forgetPublished(buildId: string, removed: { fileIds: string[]; items: { kind: BuildItemKind; key: string }[] }): Promise<void>;
}
