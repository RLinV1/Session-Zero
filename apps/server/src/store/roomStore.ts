import type { CommittedEvent, DomainEvent } from "@vtt/shared";
import type { IdentityStore } from "./identityStore";
import type { EncounterRecord, LibraryStore, NewEncounterRecord, NewRoomOptions } from "./libraryStore";
import type { GridDetectionStore, UploadAnalysis } from "./gridDetectionStore";
import type { RoomUploadPurpose } from "@vtt/shared";
import type { MembershipStore } from "./membershipStore";

export interface NewEvent {
  actorId: string | null;
  /** Shared by every event of one command's batch, so undo reverses it as a unit (ADR 0013). */
  commandId?: string;
  event: DomainEvent;
}

export interface CredentialRecord {
  roomId: string;
  participantId: string;
  /**
   * The sign-in this seat was created or kept under (ADR 0017 M4). The credential stops working
   * when that session ends. Absent for guests who never signed in.
   */
  sessionHash?: string | null;
}

/** Thrown when another writer appended first. The room's in-memory seq is stale. */
export class SeqConflictError extends Error {
  constructor(roomId: string, expected: number) {
    super(`Seq conflict in room ${roomId}: expected last seq ${expected}`);
  }
}

/**
 * Persistence boundary. The in-memory implementation is for dev/tests; a Postgres
 * implementation (see db/001_init.sql) must satisfy the same contract:
 *  - `append` is atomic: all events commit with consecutive seqs, or none do.
 *  - `append` fails with SeqConflictError if the room's last seq != expectedLastSeq.
 *  - events are never updated or deleted, except that `deleteRoom` erases a whole room's
 *    log together with the room (ADR 0009).
 */
export interface RoomStore extends LibraryStore, GridDetectionStore, IdentityStore, MembershipStore {
  createRoom(roomId: string, inviteCode: string, options?: NewRoomOptions): Promise<void>;
  roomExists(roomId: string): Promise<boolean>;
  findRoomByInvite(inviteCode: string): Promise<string | null>;
  /** The room's current invite code (FR-GM-20). Access config on the room row, not game state. */
  getInviteCode(roomId: string): Promise<string | null>;
  /**
   * Replaces the room's invite code; the old one stops resolving at once. `generate` is called
   * again if a code collides with another room's (at most 3 tries).
   */
  setInviteCode(roomId: string, generate: () => string): Promise<string>;

  saveCredential(tokenHash: string, record: CredentialRecord): Promise<void>;
  findCredential(tokenHash: string): Promise<CredentialRecord | null>;
  /**
   * Marks every credential of this participant revoked (FR-GM-20, ADR 0006). Room state is the
   * authority; this row is a second lock, written after the commit and re-applied when the room
   * loads. Idempotent.
   */
  revokeCredentials(roomId: string, participantId: string): Promise<void>;
  /** A credential that was revoked, so the handshake can say `revoked` rather than `unauthorized`. */
  findRevokedCredential(tokenHash: string): Promise<CredentialRecord | null>;

  append(roomId: string, expectedLastSeq: number, events: NewEvent[]): Promise<CommittedEvent[]>;
  loadEvents(roomId: string): Promise<CommittedEvent[]>;

  /** The GM identity that owns the room: null for an unowned room, undefined for no room. */
  findRoomOwner(roomId: string): Promise<string | null | undefined>;
  /** Records an image uploaded from inside the room, so deleting the room removes it (ADR 0009). */
  hasRoomUpload(roomId: string, objectKey: string): Promise<boolean>;
  recordRoomUpload(roomId: string, objectKey: string, purpose?: RoomUploadPurpose, width?: number, height?: number, analysis?: UploadAnalysis): Promise<void>;
  /**
   * Erases the room and everything scoped to it in one atomic step (ADR 0009): events,
   * snapshots, checkpoints, credentials (revoked ones too), memberships (ADR 0017), the invite
   * code, asset refs and upload records. Returns the upload keys for the caller to remove from the AssetStore once
   * this has committed, or null when there was no such room.
   */
  deleteRoom(roomId: string): Promise<{ uploadKeys: string[] } | null>;

  /** True for a temporary encounter-editing room (ADR 0033), which nobody may join. */
  isTemporaryRoom(roomId: string): Promise<boolean>;
  /**
   * One of this owner's temporary editing rooms and the template it saves to (ADR 0033); null
   * for a normal room, another owner's, or none, so the three read the same.
   */
  findEditSession(roomId: string, ownerGmId: string): Promise<{ editsEncounterId: string | null } | null>;
  /**
   * A temporary room's first save (ADR 0033): creates the template and links the room to it in
   * one step, so overlapping saves cannot both create one. When the room is already linked,
   * creates nothing and returns the linked id; null when the room is not one of this owner's
   * temporary rooms. Throws as `createEncounter` does, and then creates and links nothing.
   */
  createEncounterForEditRoom(roomId: string, encounter: NewEncounterRecord, maxPerOwner: number):
    Promise<{ created: EncounterRecord } | { linkedTo: string } | null>;
  /** Temporary rooms opened before `at`, for the sweep that deletes ones left behind. */
  listTemporaryRoomsBefore(at: string): Promise<string[]>;
}
