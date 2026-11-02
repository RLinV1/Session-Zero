import type { AnimationDef, LibraryMapBoard, AssetKind, EncounterTemplateData, AttackPreset, ConditionId, DieName, GmRoomSummary, GridSpec, LegacySummary } from "@vtt/shared";
import type { DetectionState, UploadAnalysis } from "./gridDetectionStore";

/** A stored library asset (ADR 0004). `objectKey` is the AssetStore key; it never leaves the server. */
export interface LibraryAssetRecord extends UploadAnalysis {
  id: string;
  ownerGmId: string;
  kind: AssetKind;
  objectKey: string;
  url: string;
  name: string;
  width: number;
  height: number;
  grid: GridSpec | null;
  /** Walls and fog prepared on a map (ADR 0037); never sent with the asset, read through `findAssetBoard`. */
  board?: LibraryMapBoard | null;
  detectionStatus?: DetectionState | null;
  detectionAttempt?: number;
  detectionResult?: import("@vtt/shared").GridDetectionCandidate | null;
  detectionUpdatedAt?: string | null;
  createdAt: string;
}

/** A reusable creature (ADR 0012). `imageUrl` is read from the linked token art, never stored. */
export interface LibraryCreatureRecord {
  id: string;
  ownerGmId: string;
  name: string;
  size: number;
  hp: number | null;
  attacks: AttackPreset[];
  maxHp: number | null;
  ac: number | null;
  /** Disc colour for imageless tokens (KAN-70). Rows from before it read as the default. */
  color: string;
  /** Conditions placed tokens start with (KAN-70). */
  conditions: ConditionId[];
  imageAssetId: string | null;
  imageUrl: string | null;
  createdAt: string;
}

/** Starting HP, colour and conditions may be left out for older creatures (KAN-70). */
export type NewCreatureRecord = Omit<LibraryCreatureRecord, "imageUrl" | "hp" | "attacks" | "color" | "conditions"> & Partial<Pick<LibraryCreatureRecord, "hp" | "attacks" | "color" | "conditions">>;
export type CreaturePatch = Partial<Pick<LibraryCreatureRecord, "name" | "size" | "hp" | "attacks" | "maxHp" | "ac" | "color" | "conditions" | "imageAssetId">>;

/** The creature would link to token art that does not exist (or was deleted mid-request). */
export class CreatureImageMissingError extends Error {
  constructor() {
    super("Image must be your own token art");
  }
}

/**
 * A saved encounter board (ADR 0024). `mapAssetId` is null once the map was deleted; `mapName`
 * and `mapUrl` are read from the linked map, never stored.
 */
export interface EncounterRecord {
  id: string;
  ownerGmId: string;
  name: string;
  version: number;
  data: EncounterTemplateData;
  mapAssetId: string | null;
  mapName: string | null;
  mapUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewEncounterRecord = Omit<EncounterRecord, "mapName" | "mapUrl">;

/** What an edit or a replace from a room changes on a template (ADR 0033). */
export interface EncounterUpdate {
  name: string;
  data: EncounterTemplateData;
  updatedAt: string;
}

/** The template would link to a map that does not exist (or was deleted mid-request). */
export class EncounterMapMissingError extends Error {
  constructor() {
    super("The map must be in your library");
  }
}

/** Names are unique within an owner's encounter library. */
export class EncounterNameConflictError extends Error {
  constructor() {
    super("An encounter template with this name already exists. Choose another name.");
  }
}

/** The owner already holds the most encounter templates they may (ADR 0024). */
export class EncounterLimitError extends Error {
  constructor(readonly limit: number) {
    super(`You can keep at most ${limit} encounter templates`);
  }
}

/** A GM's saved animation (ADR 0038). `def` is parsed with `AnimationDef` on every write. */
export interface LibraryAnimationRecord {
  id: string;
  ownerGmId: string;
  name: string;
  def: AnimationDef;
  createdAt: string;
  updatedAt: string;
}

/** The owner already holds the most animations they may (ADR 0038). */
export class AnimationLimitError extends Error {
  constructor(readonly limit: number) {
    super(`You can keep at most ${limit} animations`);
  }
}

/** One die's picture in a dice look (ADR 0017 O3). `objectKey` never leaves the server. */
export interface DiceFaceRecord {
  objectKey: string;
  url: string;
  width: number;
  height: number;
}

export interface DiceLookRecord {
  id: string;
  ownerGmId: string;
  name: string;
  faces: Partial<Record<DieName, DiceFaceRecord>>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRoomOptions {
  /** The owner row that owns the room (an account's, ADR 0017 O1); null for rooms created without one. */
  ownerGmId?: string | null;
  name?: string;
  /** A private room for editing an encounter template (ADR 0033). */
  temporary?: boolean;
  /** The template a temporary room saves to; null for a new template until its first save. */
  editsEncounterId?: string | null;
}

/**
 * GM identities, owned rooms and the asset library (ADR 0004). None of this is room state:
 * it lives beside the event log, and nothing here feeds back into `RoomState`.
 */
export interface LibraryStore {
  /** Idempotent: returns the existing identity for a hash already registered. */
  registerGm(tokenHash: string): Promise<string>;
  findGm(tokenHash: string): Promise<string | null>;
  /** Rooms the GM owns, most recently active first. */
  listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]>;

  createAsset(asset: LibraryAssetRecord): Promise<void>;
  listAssets(ownerGmId: string): Promise<LibraryAssetRecord[]>;
  /**
   * Inserts the rows whose shipped slug (`shipped:<slug>` object key) the owner was not yet given,
   * and records those slugs, in one step (ADR 0036). A deleted seeded map stays deleted. True if
   * it inserted anything.
   */
  seedShippedMaps(ownerGmId: string, rows: LibraryAssetRecord[]): Promise<boolean>;
  /** The asset only if `ownerGmId` owns it — callers never see another GM's rows. */
  findAsset(id: string, ownerGmId: string): Promise<LibraryAssetRecord | null>;
  updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }): Promise<LibraryAssetRecord | null>;
  /** The map's prepared walls and fog (empty when none); null when the owner has no such map. */
  findAssetBoard(id: string, ownerGmId: string): Promise<LibraryMapBoard | null>;
  /** Replaces the map's prepared walls and fog; false when the owner has no such map. */
  setAssetBoard(id: string, ownerGmId: string, board: LibraryMapBoard): Promise<boolean>;
  /** Removes the row and its reference index entries. Returns the removed row. */
  deleteAsset(id: string, ownerGmId: string): Promise<LibraryAssetRecord | null>;

  /** Replaces the set of asset ids a room's current state references. */
  setAssetRefs(roomId: string, assetIds: string[]): Promise<void>;
  /** Rooms owned by `ownerGmId` whose current state references the asset. */
  assetUsage(assetId: string, ownerGmId: string): Promise<{ id: string; name: string }[]>;

  /** The GM's creatures, newest first. Every creature read and write is scoped to its owner. */
  listCreatures(ownerGmId: string): Promise<LibraryCreatureRecord[]>;
  findCreature(id: string, ownerGmId: string): Promise<LibraryCreatureRecord | null>;
  /** Throws `CreatureImageMissingError` when `imageAssetId` names no asset. */
  createCreature(creature: NewCreatureRecord): Promise<LibraryCreatureRecord>;
  /** Null when the GM has no such creature. Throws `CreatureImageMissingError` like `createCreature`. */
  updateCreature(id: string, ownerGmId: string, patch: CreaturePatch): Promise<LibraryCreatureRecord | null>;
  deleteCreature(id: string, ownerGmId: string): Promise<boolean>;
  /** The GM's creatures whose image is this asset, for the delete warning. */
  creaturesUsingImage(assetId: string, ownerGmId: string): Promise<{ id: string; name: string }[]>;

  /** The owner's encounter templates, most recently saved first (ADR 0024, ADR 0033). Every read and write is scoped to its owner. */
  listEncounters(ownerGmId: string): Promise<EncounterRecord[]>;
  findEncounter(id: string, ownerGmId: string): Promise<EncounterRecord | null>;
  countEncounters(ownerGmId: string): Promise<number>;
  /**
   * Throws `EncounterMapMissingError` when `mapAssetId` names no asset, and `EncounterLimitError`
   * when the owner already holds `maxPerOwner`. The count and the insert are one step per owner,
   * so concurrent saves cannot pass the limit.
   */
  createEncounter(encounter: NewEncounterRecord, maxPerOwner: number): Promise<EncounterRecord>;
  /**
   * Replaces a template's name and board, keeping its id, map link, version and creation time
   * (ADR 0033). Null when the owner has no such template.
   */
  updateEncounter(id: string, ownerGmId: string, change: EncounterUpdate): Promise<EncounterRecord | null>;
  /** Null when the owner has no such template. */
  renameEncounter(id: string, ownerGmId: string, name: string, at: string): Promise<EncounterRecord | null>;
  deleteEncounter(id: string, ownerGmId: string): Promise<boolean>;
  /** The owner's templates whose map is this asset, for the delete warning. */
  encountersUsingMap(assetId: string, ownerGmId: string): Promise<{ id: string; name: string }[]>;

  /** The owner's animations, newest first (ADR 0038). Every read and write is scoped to its owner. */
  listAnimations(ownerGmId: string): Promise<LibraryAnimationRecord[]>;
  findAnimation(id: string, ownerGmId: string): Promise<LibraryAnimationRecord | null>;
  /** Throws `AnimationLimitError` when the owner already holds `maxPerOwner`; count and insert are one step. */
  createAnimation(animation: LibraryAnimationRecord, maxPerOwner: number): Promise<LibraryAnimationRecord>;
  /** Null when the owner has no such animation. */
  updateAnimation(id: string, ownerGmId: string, patch: { name?: string; def?: AnimationDef }, at: string): Promise<LibraryAnimationRecord | null>;
  deleteAnimation(id: string, ownerGmId: string): Promise<boolean>;

  /** What an owner row owns, for the legacy-move offer (ADR 0017 O2). */
  ownedCounts(ownerGmId: string): Promise<LegacySummary>;
  /**
   * Moves everything the device owner row owns to the account's owner row and deletes the
   * device row, all at once (ADR 0017 O2). Null when there is no such device row. A row that
   * belongs to an account is never a device row and is never deleted here.
   */
  claimDeviceOwner(deviceOwnerId: string, accountOwnerId: string): Promise<LegacySummary | null>;

  /** The owner's dice looks, newest first (ADR 0017 O3). Every read and write is scoped to its owner. */
  listDiceLooks(ownerGmId: string): Promise<DiceLookRecord[]>;
  countDiceLooks(ownerGmId: string): Promise<number>;
  findDiceLook(id: string, ownerGmId: string): Promise<DiceLookRecord | null>;
  createDiceLook(look: DiceLookRecord): Promise<void>;
  renameDiceLook(id: string, ownerGmId: string, name: string, at: string): Promise<DiceLookRecord | null>;
  /**
   * Sets one die's picture, or resets it to classic with `face: null`. Returns the updated look
   * and the object key it replaced, for the caller to delete; null when there is no such look.
   */
  setDiceLookFace(
    id: string,
    ownerGmId: string,
    die: DieName,
    face: DiceFaceRecord | null,
    at: string,
  ): Promise<{ look: DiceLookRecord; replacedKey: string | null } | null>;
  /** Deletes the look, clearing it as anyone's look in use. Returns its object keys, or null. */
  deleteDiceLook(id: string, ownerGmId: string): Promise<string[] | null>;
}

/** The catalog slug of a seeded row, from its `shipped:<slug>` object key. */
export const shippedSlug = (row: Pick<LibraryAssetRecord, "objectKey">) => row.objectKey.slice("shipped:".length);
