import { randomUUID } from "node:crypto";
import type { RoomUploadPurpose } from "@vtt/shared";
import { DETECTION_STALE_MS, DETECTION_MAX_ATTEMPTS, DETECTION_VERSION, detectionJob, matchesDetection, type DetectionJob, type DetectionOutcome, type DetectionRecord, type DetectionTarget, type UploadAnalysis } from "./gridDetectionStore";
import { DEFAULT_TOKEN_COLOR, EMPTY_LIBRARY_BOARD, presetFromLog, type LibraryMapBoard, type CommittedEvent, type DieName, type GmRoomSummary, type GridSpec, type LegacySummary } from "@vtt/shared";
import {
  EmailTakenError,
  type EndedSessions,
  type NewUserRecord,
  type SessionRecord,
  type UserRecord,
} from "./identityStore";
import {
  AnimationLimitError,
  CreatureImageMissingError,
  EncounterLimitError,
  EncounterNameConflictError,
  EncounterMapMissingError,
  type EncounterRecord,
  type EncounterUpdate,
  type NewEncounterRecord,
  type CreaturePatch,
  type DiceFaceRecord,
  type DiceLookRecord,
  type LibraryAnimationRecord,
  type LibraryAssetRecord,
  type LibraryCreatureRecord,
  type NewCreatureRecord,
  type NewRoomOptions,
  shippedSlug,
} from "./libraryStore";
import type { KeepSeatConflict, MemberRecord } from "./membershipStore";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Dev/test store. Loses everything on restart. */
export class MemoryRoomStore implements RoomStore {
  private events = new Map<string, CommittedEvent[]>();
  private invites = new Map<string, string>();
  private credentials = new Map<string, CredentialRecord & { revokedAt?: string }>();
  private rooms = new Map<string, {
    ownerGmId: string | null; name: string; createdAt: string; temporary: boolean; editsEncounterId: string | null;
  }>();
  private gms = new Map<string, string>();
  private assets = new Map<string, LibraryAssetRecord>();
  private creatures = new Map<string, NewCreatureRecord>();
  private encounters = new Map<string, NewEncounterRecord>();
  /** roomId -> asset ids its current state references. */
  private refs = new Map<string, Set<string>>();
  /** roomId -> object keys uploaded from inside it (ADR 0009). */
  private uploads = new Map<string, Set<string>>();
  private roomDetections = new Map<string, DetectionRecord>();
  private roomDetectionUpdatedAt = new Map<string, number>();
  /** Only unfinished, current-version uploads need the frequent recovery scan. */
  private recoveryTargets = new Map<string, DetectionTarget>();
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  /** `${roomId}/${participantId}` -> the account holding that seat (ADR 0017 M1). */
  private members = new Map<string, MemberRecord>();
  private diceLooks = new Map<string, DiceLookRecord>();
  private animations = new Map<string, LibraryAnimationRecord>();

  async createRoom(roomId: string, inviteCode: string, options: NewRoomOptions = {}) {
    if (this.events.has(roomId)) throw new Error(`Room ${roomId} already exists`);
    this.events.set(roomId, []);
    this.invites.set(inviteCode, roomId);
    this.rooms.set(roomId, {
      ownerGmId: options.ownerGmId ?? null,
      name: options.name ?? "",
      createdAt: new Date().toISOString(),
      temporary: options.temporary ?? false,
      editsEncounterId: options.editsEncounterId ?? null,
    });
  }

  async roomExists(roomId: string) {
    return this.events.has(roomId);
  }

  async findRoomByInvite(inviteCode: string) {
    return this.invites.get(inviteCode) ?? null;
  }

  /** The room's current invite code, found by scanning the invite map. */
  async getInviteCode(roomId: string) {
    for (const [code, id] of this.invites) if (id === roomId) return code;
    return null;
  }

  async setInviteCode(roomId: string, generate: () => string) {
    if (!this.events.has(roomId)) throw new Error(`No room ${roomId}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generate();
      if (this.invites.has(code)) continue;
      for (const [old, id] of this.invites) if (id === roomId) this.invites.delete(old);
      this.invites.set(code, roomId);
      return code;
    }
    throw new Error("Could not generate a unique invite code");
  }

  /** Stores a credential; re-saving a revoked token keeps it revoked, like the Postgres upsert. */
  async saveCredential(tokenHash: string, record: CredentialRecord) {
    // The foreign key Postgres enforces: a seat can only be bound to a session that exists.
    if (record.sessionHash && !this.sessions.has(record.sessionHash)) throw new Error("No such session");
    // Like the Postgres upsert, re-saving a token keeps its revoked mark: a removed token stays removed.
    const revokedAt = this.credentials.get(tokenHash)?.revokedAt;
    const row = { roomId: record.roomId, participantId: record.participantId, sessionHash: record.sessionHash ?? null };
    this.credentials.set(tokenHash, revokedAt ? { ...row, revokedAt } : row);
  }

  /** The credential for a token hash, or null when it is unknown or revoked. */
  async findCredential(tokenHash: string) {
    const row = this.credentials.get(tokenHash);
    // FR-GM-20: a revoked credential resolves to nothing, as in the Postgres store.
    if (!row || row.revokedAt) return null;
    return { roomId: row.roomId, participantId: row.participantId, sessionHash: row.sessionHash ?? null };
  }

  /** The credential for a token hash only when it has been revoked. */
  async findRevokedCredential(tokenHash: string) {
    const row = this.credentials.get(tokenHash);
    return row?.revokedAt ? { roomId: row.roomId, participantId: row.participantId } : null;
  }

  /** Marks every live credential of this participant in this room revoked. */
  async revokeCredentials(roomId: string, participantId: string) {
    const at = new Date().toISOString();
    for (const row of this.credentials.values()) {
      if (row.roomId === roomId && row.participantId === participantId && !row.revokedAt) row.revokedAt = at;
    }
  }

  async append(roomId: string, expectedLastSeq: number, events: NewEvent[]) {
    const log = this.events.get(roomId);
    if (!log) throw new Error(`No room ${roomId}`);
    if (log.length !== expectedLastSeq) throw new SeqConflictError(roomId, expectedLastSeq);
    const at = new Date().toISOString();
    const committed = events.map((e, i) => ({
      seq: expectedLastSeq + i + 1,
      at,
      actorId: e.actorId,
      ...(e.commandId ? { commandId: e.commandId } : {}),
      event: structuredClone(e.event),
    }));
    log.push(...committed);
    return committed;
  }

  async loadEvents(roomId: string) {
    return [...(this.events.get(roomId) ?? [])];
  }

  async findRoomOwner(roomId: string) {
    return this.rooms.get(roomId)?.ownerGmId;
  }

  async hasRoomUpload(roomId: string, objectKey: string) { return this.uploads.get(roomId)?.has(objectKey) ?? false; }

  async recordRoomUpload(roomId: string, objectKey: string, purpose: RoomUploadPurpose = "token", width?: number, height?: number, analysis?: UploadAnalysis) {
    if (!this.events.has(roomId)) throw new Error(`No room ${roomId}`);
    const keys = this.uploads.get(roomId) ?? new Set<string>();
    keys.add(objectKey);
    this.uploads.set(roomId, keys);
    if (purpose === "map" && width && height && analysis?.sourceHash && analysis.detectionVersion === DETECTION_VERSION) {
      const target = { scope: "room" as const, roomId, objectKey };
      this.setDetection(target, {
        target, objectKey, width, height,
        sourceHash: analysis.sourceHash, configVersion: analysis.detectionVersion,
        status: analysis.detectionError ? "error" : "queued", attempt: 1, candidate: null, error: analysis.detectionError ?? null,
      });
    }
  }

  /** Drops every map entry for the room. Nothing here can fail halfway, so it is atomic. */
  async deleteRoom(roomId: string) {
    if (!this.events.has(roomId)) return null;
    const uploadKeys = [...(this.uploads.get(roomId) ?? [])];
    this.events.delete(roomId);
    this.rooms.delete(roomId);
    this.refs.delete(roomId);
    this.uploads.delete(roomId);
    for (const key of uploadKeys) {
      this.roomDetections.delete(`${roomId}:${key}`);
      this.roomDetectionUpdatedAt.delete(`${roomId}:${key}`);
      this.trackDetection({ scope: "room", roomId, objectKey: key });
    }
    for (const [code, id] of this.invites) if (id === roomId) this.invites.delete(code);
    for (const [hash, row] of this.credentials) if (row.roomId === roomId) this.credentials.delete(hash);
    for (const [key, member] of this.members) if (member.roomId === roomId) this.members.delete(key);
    return { uploadKeys };
  }

  async isTemporaryRoom(roomId: string) {
    return this.rooms.get(roomId)?.temporary ?? false;
  }

  async findEditSession(roomId: string, ownerGmId: string) {
    const room = this.rooms.get(roomId);
    return room?.temporary && room.ownerGmId === ownerGmId ? { editsEncounterId: room.editsEncounterId } : null;
  }

  async createEncounterForEditRoom(roomId: string, encounter: NewEncounterRecord, maxPerOwner: number) {
    // No await between the link check, the insert and the link, so this is atomic on the one event loop.
    const room = this.rooms.get(roomId);
    if (!room?.temporary || room.ownerGmId !== encounter.ownerGmId) return null;
    if (room.editsEncounterId) return { linkedTo: room.editsEncounterId };
    const created = this.insertEncounter(encounter, maxPerOwner);
    room.editsEncounterId = created.id;
    return { created };
  }

  async listTemporaryRoomsBefore(at: string) {
    return [...this.rooms.entries()].filter(([, room]) => room.temporary && room.createdAt < at).map(([id]) => id);
  }

  async registerGm(tokenHash: string) {
    const existing = this.gms.get(tokenHash);
    if (existing) return existing;
    const id = randomUUID();
    this.gms.set(tokenHash, id);
    return id;
  }

  async findGm(tokenHash: string) {
    return this.gms.get(tokenHash) ?? null;
  }

  async listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]> {
    return this.summarize([...this.rooms.entries()].filter(([, room]) => room.ownerGmId === ownerGmId && !room.temporary));
  }

  async summarizeRooms(roomIds: string[]) {
    const wanted = new Set(roomIds);
    return this.summarize([...this.rooms.entries()].filter(([id, room]) => wanted.has(id) && !room.temporary));
  }

  private summarize(rooms: [string, { name: string; createdAt: string }][]): GmRoomSummary[] {
    return rooms
      .map(([id, room]) => ({
        id,
        name: room.name,
        preset: presetFromLog(this.events.get(id)?.[0]?.event),
        lastActiveAt: this.events.get(id)?.at(-1)?.at ?? room.createdAt,
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  async createAsset(asset: LibraryAssetRecord) {
    this.assets.set(asset.id, structuredClone({
      ...asset,
      ...(asset.detectionStatus && !asset.detectionUpdatedAt && { detectionUpdatedAt: new Date().toISOString() }),
    }));
    const target = { scope: "library" as const, id: asset.id };
    this.trackDetection(target, this.readDetection(target)?.status);
  }

  private seededSlugs = new Map<string, Set<string>>();

  async seedShippedMaps(ownerGmId: string, rows: LibraryAssetRecord[]) {
    const seeded = this.seededSlugs.get(ownerGmId) ?? new Set<string>();
    this.seededSlugs.set(ownerGmId, seeded);
    const fresh = rows.filter((r) => !seeded.has(shippedSlug(r)));
    for (const row of fresh) {
      seeded.add(shippedSlug(row));
      this.assets.set(row.id, structuredClone(row));
      const target = { scope: "library" as const, id: row.id };
      this.trackDetection(target, this.readDetection(target)?.status);
    }
    return fresh.length > 0;
  }

  async findDetection(target: DetectionTarget): Promise<DetectionRecord | null> {
    return this.readDetection(target);
  }

  private readDetection(target: DetectionTarget): DetectionRecord | null {
    if (target.scope === "room") {
      const row = this.roomDetections.get(`${target.roomId}:${target.objectKey}`);
      return row?.configVersion === DETECTION_VERSION ? structuredClone(row) : null;
    }
    const asset = this.assets.get(target.id);
    if (!asset || asset.kind !== "map" || !asset.detectionStatus || !asset.sourceHash
      || asset.sourceHash !== asset.detectionSourceHash || asset.detectionVersion !== DETECTION_VERSION) return null;
    return {
      target, objectKey: asset.objectKey, width: asset.width, height: asset.height,
      sourceHash: asset.sourceHash, configVersion: asset.detectionVersion,
      status: asset.detectionStatus, attempt: asset.detectionAttempt ?? 0,
      candidate: structuredClone(asset.detectionResult ?? null), error: asset.detectionError ?? null,
    };
  }

  async markDetectionRunning(job: DetectionJob) {
    const row = this.readDetection(job.target);
    if (!row || row.status !== "queued" || !matchesDetection(row, job) || job.attempt > DETECTION_MAX_ATTEMPTS) return false;
    this.setDetection(job.target, { ...row, status: "running" });
    return true;
  }

  async finishDetection(job: DetectionJob, outcome: DetectionOutcome) {
    const row = this.readDetection(job.target);
    if (!row || row.status !== "running" || !matchesDetection(row, job)) return false;
    this.setDetection(job.target, { ...row, status: outcome.status,
      candidate: outcome.status === "suggested" ? outcome.candidate : null,
      error: outcome.status === "error" ? outcome.error ?? "execution_failed" : null });
    return true;
  }

  async deferDetection(job: DetectionJob, consumeAttempt: boolean) {
    const row = this.readDetection(job.target);
    if (!row || row.status !== "running" || !matchesDetection(row, job)) return false;
    if (consumeAttempt && job.attempt >= DETECTION_MAX_ATTEMPTS) {
      return this.finishDetection(job, { status: "error", error: "execution_failed" });
    }
    this.setDetection(job.target, { ...row, status: "queued", attempt: job.attempt + Number(consumeAttempt), candidate: null, error: null });
    return true;
  }

  async retryDetection(target: DetectionTarget) {
    const row = this.readDetection(target);
    if (!row || row.status !== "error" || row.error !== "execution_failed" || row.attempt >= DETECTION_MAX_ATTEMPTS) return null;
    const attempt = row.attempt + 1;
    this.setDetection(target, { ...row, status: "queued", attempt, candidate: null, error: null });
    return attempt;
  }

  /** Recover pending and stale work without walking completed upload history. */
  async recoverDetections(limit = 100) {
    const jobs: DetectionJob[] = [];
    for (const target of this.recoveryTargets.values()) {
      if (jobs.length >= limit) break;
      const row = this.readDetection(target);
      if (!row || row.status !== "queued" && row.status !== "running") {
        this.trackDetection(target);
        continue;
      }
      if (row.status === "running") {
        const updatedAt = target.scope === "room"
          ? this.roomDetectionUpdatedAt.get(`${target.roomId}:${target.objectKey}`)
          : Date.parse(this.assets.get(target.id)?.detectionUpdatedAt ?? "");
        if (updatedAt !== undefined && updatedAt >= Date.now() - DETECTION_STALE_MS) continue;
        await this.deferDetection(detectionJob(row), true);
        const next = this.readDetection(target);
        if (next?.status === "queued") jobs.push(detectionJob(next));
      } else if (row.status === "queued" && row.attempt <= DETECTION_MAX_ATTEMPTS) jobs.push(detectionJob(row));
    }
    return jobs;
  }

  private setDetection(target: DetectionTarget, row: DetectionRecord) {
    if (target.scope === "room") {
      const key = `${target.roomId}:${target.objectKey}`;
      this.roomDetections.set(key, structuredClone(row));
      this.roomDetectionUpdatedAt.set(key, Date.now());
    } else {
      const asset = this.assets.get(target.id);
      if (!asset) return;
      this.assets.set(target.id, {
        ...asset, detectionStatus: row.status, detectionAttempt: row.attempt,
        detectionResult: row.candidate, detectionError: row.error, detectionUpdatedAt: new Date().toISOString(),
      });
    }
    this.trackDetection(target, row.status);
  }

  /** Keep recovery membership in step with creation, status changes, and deletion. */
  private trackDetection(target: DetectionTarget, status?: DetectionRecord["status"]) {
    const key = JSON.stringify(target.scope === "room" ? [target.scope, target.roomId, target.objectKey] : [target.scope, target.id]);
    if (status === "queued" || status === "running") this.recoveryTargets.set(key, { ...target });
    else this.recoveryTargets.delete(key);
  }

  async listAssets(ownerGmId: string) {
    return [...this.assets.values()]
      .filter((a) => a.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => structuredClone(a));
  }

  async findAsset(id: string, ownerGmId: string) {
    const asset = this.assets.get(id);
    return asset && asset.ownerGmId === ownerGmId ? structuredClone(asset) : null;
  }

  async updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId) return null;
    const next = { ...asset, ...(patch.name !== undefined && { name: patch.name }), ...(patch.grid && { grid: patch.grid }) };
    this.assets.set(id, next);
    return structuredClone(next);
  }

  async findAssetBoard(id: string, ownerGmId: string) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId || asset.kind !== "map") return null;
    return structuredClone(asset.board ?? EMPTY_LIBRARY_BOARD);
  }

  async setAssetBoard(id: string, ownerGmId: string, board: LibraryMapBoard) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId || asset.kind !== "map") return false;
    asset.board = structuredClone(board);
    return true;
  }

  async deleteAsset(id: string, ownerGmId: string) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId) return null;
    this.assets.delete(id);
    this.trackDetection({ scope: "library", id });
    for (const ids of this.refs.values()) ids.delete(id);
    // As `ON DELETE SET NULL` does in Postgres: the creatures stay, without their image.
    for (const creature of this.creatures.values()) if (creature.imageAssetId === id) creature.imageAssetId = null;
    for (const encounter of this.encounters.values()) if (encounter.mapAssetId === id) encounter.mapAssetId = null;
    return asset;
  }

  async setAssetRefs(roomId: string, assetIds: string[]) {
    // Ids with no library row (deleted, or never real) are dropped, so a room that still
    // shows a deleted asset cannot write it back into the index.
    this.refs.set(roomId, new Set(assetIds.filter((id) => this.assets.has(id))));
  }

  async assetUsage(assetId: string, ownerGmId: string) {
    const usage: { id: string; name: string }[] = [];
    for (const [roomId, ids] of this.refs) {
      const room = this.rooms.get(roomId);
      if (ids.has(assetId) && room?.ownerGmId === ownerGmId) usage.push({ id: roomId, name: room.name });
    }
    return usage;
  }

  async listCreatures(ownerGmId: string) {
    return [...this.creatures.values()]
      .filter((c) => c.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => this.withImage(c));
  }

  async findCreature(id: string, ownerGmId: string) {
    const creature = this.creatures.get(id);
    return creature && creature.ownerGmId === ownerGmId ? this.withImage(creature) : null;
  }

  async createCreature(creature: NewCreatureRecord) {
    this.requireImage(creature.imageAssetId);
    this.creatures.set(creature.id, structuredClone(creature));
    return this.withImage(creature);
  }

  async updateCreature(id: string, ownerGmId: string, patch: CreaturePatch) {
    const creature = this.creatures.get(id);
    if (!creature || creature.ownerGmId !== ownerGmId) return null;
    if (patch.imageAssetId !== undefined) this.requireImage(patch.imageAssetId);
    const next = { ...creature, ...patch };
    this.creatures.set(id, next);
    return this.withImage(next);
  }

  async deleteCreature(id: string, ownerGmId: string) {
    const creature = this.creatures.get(id);
    if (!creature || creature.ownerGmId !== ownerGmId) return false;
    return this.creatures.delete(id);
  }

  async creaturesUsingImage(assetId: string, ownerGmId: string) {
    return [...this.creatures.values()]
      .filter((c) => c.ownerGmId === ownerGmId && c.imageAssetId === assetId)
      .map((c) => ({ id: c.id, name: c.name }));
  }


  // ---------- Identity (ADR 0017) ----------

  async createUser(user: NewUserRecord) {
    for (const existing of this.users.values()) if (existing.email === user.email) throw new EmailTakenError();
    const now = new Date().toISOString();
    // The account's owner row has no token: nothing but a session can act as it.
    const record: UserRecord = {
      ...user, ownerId: randomUUID(), activeDiceLookId: null, createdAt: now, passwordChangedAt: now,
    };
    this.users.set(user.id, record);
    return structuredClone(record);
  }

  async findUserByEmail(email: string) {
    for (const user of this.users.values()) if (user.email === email) return structuredClone(user);
    return null;
  }

  async findUserById(id: string) {
    const user = this.users.get(id);
    return user ? structuredClone(user) : null;
  }

  async setPasswordHash(userId: string, passwordHash: string, changed: boolean) {
    const user = this.users.get(userId);
    if (!user) return;
    user.passwordHash = passwordHash;
    if (changed) user.passwordChangedAt = new Date().toISOString();
  }

  async setActiveDiceLook(userId: string, lookId: string | null) {
    const user = this.users.get(userId);
    if (user) user.activeDiceLookId = lookId;
  }

  async createSession(session: SessionRecord) {
    this.sessions.set(session.tokenHash, structuredClone(session));
  }

  async findSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    return session ? structuredClone(session) : null;
  }

  async touchSession(tokenHash: string, at: string) {
    const session = this.sessions.get(tokenHash);
    if (session) session.lastSeenAt = at;
  }

  async deleteSession(tokenHash: string) {
    return this.endSessions((s) => s.tokenHash === tokenHash);
  }

  async deleteUserSessions(userId: string, exceptHash?: string) {
    return this.endSessions((s) => s.userId === userId && s.tokenHash !== exceptHash);
  }

  async deleteExpiredSessions(now: string, idleBefore: string) {
    return this.endSessions((s) => s.expiresAt <= now || s.lastSeenAt < idleBefore);
  }

  /** Deletes the matching sessions and the seat credentials bound to them (ADR 0017 M4). */
  private endSessions(match: (s: SessionRecord) => boolean): EndedSessions {
    const ended = new Set([...this.sessions.values()].filter(match).map((s) => s.tokenHash));
    const credentialHashes: string[] = [];
    for (const [hash, row] of this.credentials) {
      if (row.sessionHash && ended.has(row.sessionHash)) {
        this.credentials.delete(hash);
        credentialHashes.push(hash);
      }
    }
    for (const hash of ended) this.sessions.delete(hash);
    return { credentialHashes };
  }

  // ---------- Membership (ADR 0017) ----------

  async findMember(roomId: string, userId: string) {
    for (const member of this.members.values()) {
      if (member.roomId === roomId && member.userId === userId) return { ...member };
    }
    return null;
  }

  async findMemberByParticipant(roomId: string, participantId: string) {
    const member = this.members.get(`${roomId}/${participantId}`);
    return member ? { ...member } : null;
  }

  async putMember(member: MemberRecord) {
    if (!this.events.has(member.roomId)) throw new Error(`No room ${member.roomId}`);
    const taken = this.members.get(`${member.roomId}/${member.participantId}`);
    if (taken && taken.userId !== member.userId) throw new Error("Seat belongs to another account");
    for (const [key, existing] of this.members) {
      if (existing.roomId === member.roomId && existing.userId === member.userId) this.members.delete(key);
    }
    this.members.set(`${member.roomId}/${member.participantId}`, { ...member });
  }

  async listMemberships(userId: string) {
    return [...this.members.values()].filter((m) => m.userId === userId).map((m) => ({ ...m }));
  }

  async keepSeat(member: MemberRecord, credentialHash: string, sessionHash: string): Promise<KeepSeatConflict | null> {
    if (await this.findMember(member.roomId, member.userId)) return "account_has_seat";
    if (this.members.has(`${member.roomId}/${member.participantId}`)) return "seat_taken";
    const credential = this.credentials.get(credentialHash);
    if (!credential || !this.sessions.has(sessionHash)) throw new Error("No such credential or session");
    this.members.set(`${member.roomId}/${member.participantId}`, { ...member });
    credential.sessionHash = sessionHash;
    return null;
  }

  // ---------- Legacy device identities and dice looks (ADR 0017) ----------

  async ownedCounts(ownerGmId: string): Promise<LegacySummary> {
    const count = <T extends { ownerGmId: string | null }>(rows: Iterable<T>) =>
      [...rows].filter((r) => r.ownerGmId === ownerGmId).length;
    return {
      rooms: count(this.rooms.values()),
      assets: count(this.assets.values()),
      creatures: count(this.creatures.values()),
      diceLooks: count(this.diceLooks.values()),
    };
  }

  async claimDeviceOwner(deviceOwnerId: string, accountOwnerId: string) {
    const device = [...this.gms].find(([, id]) => id === deviceOwnerId);
    if (!device) return null;
    const moved = await this.ownedCounts(deviceOwnerId);
    for (const rows of [this.rooms.values(), this.assets.values(), this.creatures.values(), this.diceLooks.values(), this.animations.values()]) {
      for (const row of rows as Iterable<{ ownerGmId: string | null }>) {
        if (row.ownerGmId === deviceOwnerId) row.ownerGmId = accountOwnerId;
      }
    }
    this.gms.delete(device[0]);
    return moved;
  }

  async listAnimations(ownerGmId: string) {
    return [...this.animations.values()]
      .filter((a) => a.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => structuredClone(a));
  }

  async findAnimation(id: string, ownerGmId: string) {
    const animation = this.animations.get(id);
    return animation && animation.ownerGmId === ownerGmId ? structuredClone(animation) : null;
  }

  async createAnimation(animation: LibraryAnimationRecord, maxPerOwner: number) {
    const held = [...this.animations.values()].filter((a) => a.ownerGmId === animation.ownerGmId).length;
    if (held >= maxPerOwner) throw new AnimationLimitError(maxPerOwner);
    this.animations.set(animation.id, structuredClone(animation));
    return structuredClone(animation);
  }

  async updateAnimation(id: string, ownerGmId: string, patch: { name?: string; def?: LibraryAnimationRecord["def"] }, at: string) {
    const animation = this.animations.get(id);
    if (!animation || animation.ownerGmId !== ownerGmId) return null;
    if (patch.name !== undefined) animation.name = patch.name;
    if (patch.def !== undefined) animation.def = structuredClone(patch.def);
    animation.updatedAt = at;
    return structuredClone(animation);
  }

  async deleteAnimation(id: string, ownerGmId: string) {
    const animation = this.animations.get(id);
    if (!animation || animation.ownerGmId !== ownerGmId) return false;
    return this.animations.delete(id);
  }

  async listDiceLooks(ownerGmId: string) {
    return [...this.diceLooks.values()]
      .filter((l) => l.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => structuredClone(l));
  }

  async countDiceLooks(ownerGmId: string) {
    return [...this.diceLooks.values()].filter((l) => l.ownerGmId === ownerGmId).length;
  }

  async findDiceLook(id: string, ownerGmId: string) {
    const look = this.diceLooks.get(id);
    return look && look.ownerGmId === ownerGmId ? structuredClone(look) : null;
  }

  async createDiceLook(look: DiceLookRecord) {
    this.diceLooks.set(look.id, structuredClone(look));
  }

  async renameDiceLook(id: string, ownerGmId: string, name: string, at: string) {
    const look = this.diceLooks.get(id);
    if (!look || look.ownerGmId !== ownerGmId) return null;
    look.name = name;
    look.updatedAt = at;
    return structuredClone(look);
  }

  async setDiceLookFace(id: string, ownerGmId: string, die: DieName, face: DiceFaceRecord | null, at: string) {
    const look = this.diceLooks.get(id);
    if (!look || look.ownerGmId !== ownerGmId) return null;
    const replacedKey = look.faces[die]?.objectKey ?? null;
    if (face) look.faces[die] = { ...face };
    else delete look.faces[die];
    look.updatedAt = at;
    return { look: structuredClone(look), replacedKey };
  }

  async deleteDiceLook(id: string, ownerGmId: string) {
    const look = this.diceLooks.get(id);
    if (!look || look.ownerGmId !== ownerGmId) return null;
    this.diceLooks.delete(id);
    // As `ON DELETE SET NULL` does in Postgres: whoever had it in use goes back to classic.
    for (const user of this.users.values()) if (user.activeDiceLookId === id) user.activeDiceLookId = null;
    return Object.values(look.faces).map((f) => f.objectKey);
  }

  // ---------- Encounter templates (ADR 0024) ----------

  async listEncounters(ownerGmId: string) {
    return [...this.encounters.values()]
      .filter((e) => e.ownerGmId === ownerGmId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((e) => this.withMap(e));
  }

  async findEncounter(id: string, ownerGmId: string) {
    const encounter = this.encounters.get(id);
    return encounter && encounter.ownerGmId === ownerGmId ? this.withMap(encounter) : null;
  }

  async countEncounters(ownerGmId: string) {
    return [...this.encounters.values()].filter((e) => e.ownerGmId === ownerGmId).length;
  }

  async createEncounter(encounter: NewEncounterRecord, maxPerOwner: number) {
    return this.insertEncounter(encounter, maxPerOwner);
  }

  /** Synchronous, so callers can make it part of a larger atomic step. */
  private insertEncounter(encounter: NewEncounterRecord, maxPerOwner: number) {
    if ([...this.encounters.values()].filter((e) => e.ownerGmId === encounter.ownerGmId).length >= maxPerOwner) {
      throw new EncounterLimitError(maxPerOwner);
    }
    this.assertEncounterName(encounter.ownerGmId, encounter.name);
    if (encounter.mapAssetId !== null && !this.assets.has(encounter.mapAssetId)) throw new EncounterMapMissingError();
    this.encounters.set(encounter.id, structuredClone(encounter));
    return this.withMap(encounter);
  }

  async updateEncounter(id: string, ownerGmId: string, change: EncounterUpdate) {
    const encounter = this.encounters.get(id);
    if (!encounter || encounter.ownerGmId !== ownerGmId) return null;
    this.assertEncounterName(ownerGmId, change.name, id);
    const next = { ...encounter, name: change.name, data: structuredClone(change.data), updatedAt: change.updatedAt };
    this.encounters.set(id, next);
    return this.withMap(next);
  }

  async renameEncounter(id: string, ownerGmId: string, name: string, at: string) {
    const encounter = this.encounters.get(id);
    if (!encounter || encounter.ownerGmId !== ownerGmId) return null;
    this.assertEncounterName(ownerGmId, name, id);
    const next = { ...encounter, name, updatedAt: at };
    this.encounters.set(id, next);
    return this.withMap(next);
  }

  private assertEncounterName(ownerGmId: string, name: string, exceptId?: string) {
    if ([...this.encounters.values()].some((entry) => entry.ownerGmId === ownerGmId && entry.id !== exceptId && entry.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      throw new EncounterNameConflictError();
    }
  }

  async deleteEncounter(id: string, ownerGmId: string) {
    const encounter = this.encounters.get(id);
    if (!encounter || encounter.ownerGmId !== ownerGmId) return false;
    // As Postgres's ON DELETE SET NULL: a temporary room editing it saves as a new template.
    for (const room of this.rooms.values()) if (room.editsEncounterId === id) room.editsEncounterId = null;
    return this.encounters.delete(id);
  }

  async encountersUsingMap(assetId: string, ownerGmId: string) {
    return [...this.encounters.values()]
      .filter((e) => e.mapAssetId === assetId && e.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ id: e.id, name: e.name }));
  }

  private withMap(encounter: NewEncounterRecord): EncounterRecord {
    const map = encounter.mapAssetId ? this.assets.get(encounter.mapAssetId) : undefined;
    return { ...structuredClone(encounter), mapName: map?.name ?? null, mapUrl: map?.url ?? null };
  }

  /** The foreign key Postgres enforces on `image_asset_id`. */
  private requireImage(assetId: string | null) {
    if (assetId !== null && !this.assets.has(assetId)) throw new CreatureImageMissingError();
  }

  private withImage(creature: NewCreatureRecord): LibraryCreatureRecord {
    const image = creature.imageAssetId ? this.assets.get(creature.imageAssetId) : undefined;
    return {
      ...structuredClone(creature),
      hp: creature.hp ?? null,
      attacks: structuredClone(creature.attacks ?? []),
      color: creature.color ?? DEFAULT_TOKEN_COLOR,
      conditions: creature.conditions ?? [],
      imageUrl: image?.url ?? null,
    };
  }
}
