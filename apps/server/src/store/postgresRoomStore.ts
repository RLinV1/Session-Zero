import {
  Prisma,
  PrismaClient,
  type DiceLook,
  type EncounterTemplate,
  type LibraryAnimation,
  type LibraryAsset,
  type LibraryCreature,
  type Session,
  type User,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { GridDetectionCandidate, RoomUploadPurpose } from "@vtt/shared";
import { DETECTION_STALE_MS, DETECTION_MAX_ATTEMPTS, DETECTION_VERSION, detectionJob, type DetectionJob, type UploadAnalysis, type DetectionError, type DetectionOutcome, type DetectionRecord, type DetectionTarget, type DetectionState } from "./gridDetectionStore";
import { ConditionId, DEFAULT_TOKEN_COLOR, EMPTY_LIBRARY_BOARD, presetFromLog, type LibraryMapBoard, TokenAttacks, type AssetKind, type CommittedEvent, type DieName, type DomainEvent, type GmRoomSummary, type GridSpec, type LegacySummary } from "@vtt/shared";
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
import type { RedisSeqSource } from "./redisSeq";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Postgres unique-violation code; Prisma surfaces it as P2002. */
const PRISMA_UNIQUE_VIOLATION = "P2002";
/** Foreign-key violation: here, a creature linking to token art deleted mid-request. */
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";
/** Joined so a creature carries its art's URL; null once the art is deleted (ON DELETE SET NULL). */
const WITH_IMAGE = { image: { select: { url: true } } } as const;
/** Joined so a template carries its map name and address; null once the map is deleted (ON DELETE SET NULL). */
const WITH_MAP = { map: { select: { name: true, url: true } } } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Append-only event store on Postgres via Prisma (DESIGN.md §2, §5;
 * docs/adr/0001-event-model.md).
 *
 * The ordering guarantee lives in the schema, not in application code:
 * `@@id([roomId, seq])` makes a duplicate seq a constraint violation, and the whole
 * append runs inside one `$transaction` — so a batch of events either commits with
 * consecutive seqs or not at all (FR-SYNC-04). Rows are never updated or deleted;
 * undo is a new compensating event (FR-REC-03). The one exception is `deleteRoom`, which
 * erases a whole room with its log (ADR 0009).
 */
export class PostgresRoomStore implements RoomStore {
  private constructor(
    private prisma: PrismaClient,
    private seqSource: RedisSeqSource | null,
  ) {}

  static async connect(connectionString: string, seqSource: RedisSeqSource | null = null) {
    const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
    await prisma.$connect();
    return new PostgresRoomStore(prisma, seqSource);
  }

  async createRoom(roomId: string, inviteCode: string, options: NewRoomOptions = {}) {
    await this.prisma.room.create({
      data: {
        id: roomId, inviteCode, ownerGmId: options.ownerGmId ?? null, name: options.name ?? null,
        temporary: options.temporary ?? false, editsEncounterId: options.editsEncounterId ?? null,
      },
    });
  }

  async roomExists(roomId: string) {
    return (await this.prisma.room.count({ where: { id: roomId } })) === 1;
  }

  async findRoomByInvite(inviteCode: string) {
    const room = await this.prisma.room.findUnique({ where: { inviteCode }, select: { id: true } });
    return room?.id ?? null;
  }

  /** The room's current invite code from the rooms row. */
  async getInviteCode(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, select: { inviteCode: true } });
    return room?.inviteCode ?? null;
  }

  async setInviteCode(roomId: string, generate: () => string) {
    for (let attempt = 0; ; attempt++) {
      const inviteCode = generate();
      try {
        await this.prisma.room.update({ where: { id: roomId }, data: { inviteCode } });
        return inviteCode;
      } catch (err) {
        // P2002: another room already has this code (unique index). Try a fresh one.
        const collided = (err as { code?: string }).code === "P2002";
        if (!collided || attempt >= 2) throw err;
      }
    }
  }

  /** The credential for a token hash only when `revoked_at` is set. */
  async findRevokedCredential(tokenHash: string) {
    const row = await this.prisma.credential.findUnique({ where: { tokenHash } });
    return row?.revokedAt ? { roomId: row.roomId, participantId: row.participantId } : null;
  }

  /** Sets `revoked_at` on every live credential of this participant in this room. */
  async revokeCredentials(roomId: string, participantId: string) {
    await this.prisma.credential.updateMany({
      where: { roomId, participantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async saveCredential(tokenHash: string, record: CredentialRecord) {
    const data = { roomId: record.roomId, participantId: record.participantId, sessionHash: record.sessionHash ?? null };
    await this.prisma.credential.upsert({
      where: { tokenHash },
      create: { tokenHash, ...data },
      update: data,
    });
  }

  async findCredential(tokenHash: string) {
    const row = await this.prisma.credential.findUnique({ where: { tokenHash } });
    // FR-GM-20: a revoked credential resolves to nothing, as if it had never existed.
    if (!row || row.revokedAt) return null;
    return { roomId: row.roomId, participantId: row.participantId, sessionHash: row.sessionHash };
  }

  async append(roomId: string, expectedLastSeq: number, events: NewEvent[]): Promise<CommittedEvent[]> {
    if (events.length === 0) return [];

    // Redis hands out the range when it is available; the composite PK is what enforces it.
    const firstSeq = this.seqSource
      ? await this.seqSource.reserve(roomId, events.length)
      : expectedLastSeq + 1;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { _max } = await tx.event.aggregate({
          where: { roomId },
          _max: { seq: true },
        });
        if ((_max.seq ?? 0) !== expectedLastSeq) throw new SeqConflictError(roomId, expectedLastSeq);

        const committed: CommittedEvent[] = [];
        for (const [i, e] of events.entries()) {
          // Prisma's JSON input encoder can change a 17-digit double (e.g.
          // 15.000000000000002 -> 15). Pass canonical JS JSON as a text parameter so
          // checkpoints/reload see the exact values broadcast after this append.
          const [row] = await tx.$queryRaw<{ seq: number; createdAt: Date; actorId: string | null; commandId: string | null }[]>`
            INSERT INTO events (room_id, seq, type, payload, actor_id, command_id)
            VALUES (${roomId}::uuid, ${firstSeq + i}, ${e.event.type}, ${JSON.stringify(e.event)}::jsonb, ${e.actorId}::uuid, ${e.commandId ?? null}::uuid)
            RETURNING seq, created_at AS "createdAt", actor_id AS "actorId", command_id AS "commandId"
          `;
          if (!row) throw new Error("Event append returned no row");
          committed.push({
            seq: row.seq,
            at: row.createdAt.toISOString(),
            actorId: row.actorId,
            ...(row.commandId ? { commandId: row.commandId } : {}),
            event: e.event,
          });
        }
        return committed;
      });
    } catch (err) {
      // A duplicate seq means another writer won the race; surface it as a seq conflict
      // so the caller reloads rather than retrying blindly.
      if (isUniqueViolation(err)) throw new SeqConflictError(roomId, expectedLastSeq);
      throw err;
    }
  }

  async loadEvents(roomId: string): Promise<CommittedEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: { roomId },
      orderBy: { seq: "asc" },
    });

    const events = rows.map((r) => ({
      seq: r.seq,
      at: r.createdAt.toISOString(),
      actorId: r.actorId,
      // Null on events from before undo existed; `eventMeta` then groups them by seq (ADR 0013).
      ...(r.commandId ? { commandId: r.commandId } : {}),
      event: r.payload as unknown as DomainEvent,
    }));

    // Keep Redis at or ahead of the log, so a Redis reset cannot reissue a used seq.
    if (this.seqSource && events.length > 0) {
      await this.seqSource.syncTo(roomId, events.at(-1)!.seq);
    }
    return events;
  }

  async findRoomOwner(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, select: { ownerGmId: true } });
    return room ? room.ownerGmId : undefined;
  }

  async hasRoomUpload(roomId: string, objectKey: string) {
    return !!(await this.prisma.roomUpload.findUnique({ where: { roomId_objectKey: { roomId, objectKey } }, select: { objectKey: true } }));
  }

  async recordRoomUpload(roomId: string, objectKey: string, purpose: RoomUploadPurpose = "token", width?: number, height?: number, analysis?: UploadAnalysis) {
    await this.prisma.roomUpload.upsert({
      where: { roomId_objectKey: { roomId, objectKey } },
      create: {
        roomId, objectKey, purpose, width, height, sourceHash: analysis?.sourceHash,
        ...(purpose === "map" && analysis?.sourceHash && {
          detectionSourceHash: analysis.sourceHash, detectionVersion: analysis.detectionVersion, detectionError: analysis.detectionError,
          detectionStatus: analysis.detectionError ? "error" : "queued", detectionAttempt: 1, detectionUpdatedAt: new Date(),
        }),
      },
      update: {},
    });
  }

  /**
   * Children first, then the room, in one transaction (ADR 0009). No ON DELETE CASCADE on
   * purpose: this list is the whole of what a room delete removes, and it stays reviewable.
   */
  async deleteRoom(roomId: string) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      if ((await tx.room.count({ where: { id: roomId } })) === 0) return null;
      // The only path allowed to remove events, and only this room's: the insert-only trigger
      // checks this transaction-local setting (migration 0007, KAN-42).
      await tx.$executeRaw`SELECT set_config('vtt.room_delete', ${roomId}, true)`;
      const uploads = await tx.roomUpload.findMany({ where: { roomId }, select: { objectKey: true } });
      await tx.assetRef.deleteMany({ where: { roomId } });
      await tx.credential.deleteMany({ where: { roomId } });
      await tx.roomMember.deleteMany({ where: { roomId } });
      await tx.checkpoint.deleteMany({ where: { roomId } });
      await tx.snapshot.deleteMany({ where: { roomId } });
      await tx.event.deleteMany({ where: { roomId } });
      await tx.roomUpload.deleteMany({ where: { roomId } });
      await tx.room.delete({ where: { id: roomId } });
      return { uploadKeys: uploads.map((u) => u.objectKey) };
    });
    // After the commit, and best-effort: a stale counter for a room that no longer exists is harmless.
    if (deleted && this.seqSource) {
      await this.seqSource.forget(roomId).catch((err) => {
        console.error(`[vtt] could not clear the seq counter for deleted room ${roomId}`, err);
      });
    }
    return deleted;
  }

  async isTemporaryRoom(roomId: string) {
    if (!UUID.test(roomId)) return false;
    return (await this.prisma.room.count({ where: { id: roomId, temporary: true } })) === 1;
  }

  async findEditSession(roomId: string, ownerGmId: string) {
    if (!UUID.test(roomId)) return null;
    const room = await this.prisma.room.findFirst({ where: { id: roomId, ownerGmId, temporary: true }, select: { editsEncounterId: true } });
    return room ? { editsEncounterId: room.editsEncounterId } : null;
  }

  async createEncounterForEditRoom(roomId: string, encounter: NewEncounterRecord, maxPerOwner: number) {
    if (!UUID.test(roomId)) return null;
    return this.withEncounterErrors(() => this.prisma.$transaction(async (tx) => {
      // The room row lock makes a second save of this room wait, then see the first one's link.
      // Lock order is the room, then the owner's template lock; nothing takes them the other way.
      const [room] = await tx.$queryRaw<{ edits_encounter_id: string | null }[]>`
        SELECT edits_encounter_id FROM rooms
        WHERE id = ${roomId}::uuid AND owner_gm_id = ${encounter.ownerGmId}::uuid AND temporary
        FOR UPDATE`;
      if (!room) return null;
      if (room.edits_encounter_id) return { linkedTo: room.edits_encounter_id };
      const created = await insertEncounter(tx, encounter, maxPerOwner);
      await tx.room.update({ where: { id: roomId }, data: { editsEncounterId: created.id } });
      return { created: toEncounterRecord(created) };
    }));
  }

  async listTemporaryRoomsBefore(at: string) {
    const rooms = await this.prisma.room.findMany({ where: { temporary: true, createdAt: { lt: new Date(at) } }, select: { id: true } });
    return rooms.map((r) => r.id);
  }

  async registerGm(tokenHash: string) {
    const row = await this.prisma.gmIdentity.upsert({
      where: { tokenHash },
      create: { id: randomUUID(), tokenHash },
      update: {},
      select: { id: true },
    });
    return row.id;
  }

  async findGm(tokenHash: string) {
    const row = await this.prisma.gmIdentity.findUnique({ where: { tokenHash }, select: { id: true } });
    return row?.id ?? null;
  }

  async listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]> {
    return this.summarize({ ownerGmId, temporary: false });
  }

  async summarizeRooms(roomIds: string[]) {
    const ids = roomIds.filter((id) => UUID.test(id));
    return ids.length ? this.summarize({ id: { in: ids }, temporary: false }) : [];
  }

  private async summarize(where: Prisma.RoomWhereInput): Promise<GmRoomSummary[]> {
    const rooms = await this.prisma.room.findMany({
      where,
      select: {
        id: true,
        name: true,
        createdAt: true,
        events: { select: { createdAt: true }, orderBy: { seq: "desc" }, take: 1 },
      },
    });
    // The preset is on each room's first event, RoomCreated (KAN-63).
    const first = rooms.length
      ? await this.prisma.event.findMany({ where: { roomId: { in: rooms.map((r) => r.id) }, seq: 1 }, select: { roomId: true, payload: true } })
      : [];
    const firstById = new Map(first.map((e) => [e.roomId, e.payload as unknown as DomainEvent]));
    return rooms
      .map((r) => ({
        id: r.id,
        name: r.name ?? "",
        preset: presetFromLog(firstById.get(r.id)),
        lastActiveAt: (r.events[0]?.createdAt ?? r.createdAt).toISOString(),
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  async createAsset(asset: LibraryAssetRecord) {
    // As with event payloads, parameterized JSON text preserves all JS doubles (ADR 0043).
    // Insert the complete map in one statement: readers can never see missing grid/geometry.
    await this.prisma.$executeRaw`
      INSERT INTO library_assets
        (id, owner_gm_id, kind, object_key, url, name, width, height, grid, board,
         source_hash, detection_source_hash, detection_version, detection_error,
         detection_status, detection_attempt, detection_result, detection_updated_at, created_at)
      VALUES (${asset.id}::uuid, ${asset.ownerGmId}::uuid, ${asset.kind}, ${asset.objectKey},
        ${asset.url}, ${asset.name}, ${asset.width}, ${asset.height},
        ${asset.grid ? JSON.stringify(asset.grid) : null}::jsonb,
        ${asset.board ? JSON.stringify(asset.board) : null}::jsonb,
        ${asset.sourceHash ?? null}, ${asset.detectionSourceHash ?? null}, ${asset.detectionVersion ?? null}, ${asset.detectionError ?? null},
        ${asset.detectionStatus ?? null}, ${asset.detectionAttempt ?? 0},
        ${asset.detectionResult ? JSON.stringify(asset.detectionResult) : null}::jsonb,
        ${asset.detectionStatus ? new Date(asset.detectionUpdatedAt ?? Date.now()) : null}, ${new Date(asset.createdAt)})
    `;
  }

  async seedShippedMaps(ownerGmId: string, rows: LibraryAssetRecord[]) {
    return this.prisma.$transaction(async (tx) => {
      // The row lock makes concurrent callers take turns, so a slug is never inserted twice.
      const locked = await tx.$queryRaw<{ seeded: string[] }[]>`
        SELECT shipped_maps_seeded AS seeded FROM gm_identities WHERE id = ${ownerGmId}::uuid FOR UPDATE`;
      if (locked.length !== 1) return false;
      const seeded = new Set(locked[0]!.seeded);
      const fresh = rows.filter((r) => !seeded.has(shippedSlug(r)));
      if (fresh.length === 0) return false;
      await tx.libraryAsset.createMany({
        data: fresh.map((a) => ({
          id: a.id, ownerGmId: a.ownerGmId, kind: a.kind, objectKey: a.objectKey, url: a.url, name: a.name,
          width: a.width, height: a.height, grid: a.grid ?? Prisma.DbNull, createdAt: new Date(a.createdAt),
        })),
      });
      await tx.gmIdentity.update({
        where: { id: ownerGmId },
        data: { shippedMapsSeeded: [...seeded, ...fresh.map(shippedSlug)] },
      });
      await tx.gmIdentity.updateMany({
        where: { id: ownerGmId, shippedMapsSeededAt: null },
        data: { shippedMapsSeededAt: new Date() },
      });
      return true;
    });
  }

  async findDetection(target: DetectionTarget): Promise<DetectionRecord | null> {
    const row = target.scope === "library"
      ? await this.prisma.libraryAsset.findUnique({ where: { id: target.id } })
      : await this.prisma.roomUpload.findUnique({ where: { roomId_objectKey: { roomId: target.roomId, objectKey: target.objectKey } } });
    if (!row || ("kind" in row ? row.kind !== "map" : row.purpose !== "map") || !row.detectionStatus
      || !row.sourceHash || row.sourceHash !== row.detectionSourceHash || row.detectionVersion !== DETECTION_VERSION
      || !row.width || !row.height) return null;
    return {
      target, objectKey: row.objectKey, width: row.width, height: row.height,
      sourceHash: row.sourceHash, configVersion: row.detectionVersion,
      status: row.detectionStatus as DetectionState, attempt: row.detectionAttempt,
      candidate: (row.detectionResult as GridDetectionCandidate | null) ?? null, error: row.detectionError as DetectionError | null,
    };
  }

  private detectionWhere(job: DetectionJob) {
    return { sourceHash: job.sourceHash, detectionSourceHash: job.sourceHash,
      detectionVersion: job.configVersion,
      detectionAttempt: job.attempt };
  }

  async markDetectionRunning(job: DetectionJob) {
    if (job.configVersion !== DETECTION_VERSION || job.attempt > DETECTION_MAX_ATTEMPTS) return false;
    const where = { ...this.detectionWhere(job), detectionStatus: "queued" };
    const data = { detectionStatus: "running", detectionUpdatedAt: new Date() };
    const target = job.target;
    const result = target.scope === "library"
      ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, kind: "map", ...where }, data })
      : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, purpose: "map", ...where }, data });
    return result.count === 1;
  }

  async finishDetection(job: DetectionJob, outcome: DetectionOutcome) {
    if (job.configVersion !== DETECTION_VERSION) return false;
    const target = job.target;
    const where = { ...this.detectionWhere(job), detectionStatus: "running" };
    const data = {
      detectionStatus: outcome.status,
      detectionResult: outcome.status === "suggested" ? outcome.candidate as Prisma.InputJsonValue : Prisma.DbNull,
      detectionError: outcome.status === "error" ? outcome.error ?? "execution_failed" : null,
      detectionUpdatedAt: new Date(),
    };
    const result = target.scope === "library"
      ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, ...where }, data })
      : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, ...where }, data });
    return result.count === 1;
  }

  async deferDetection(job: DetectionJob, consumeAttempt: boolean) {
    if (job.configVersion !== DETECTION_VERSION) return false;
    if (consumeAttempt && job.attempt >= DETECTION_MAX_ATTEMPTS) return this.finishDetection(job, { status: "error", error: "execution_failed" });
    const target = job.target;
    const where = { ...this.detectionWhere(job), detectionStatus: "running" };
    const data = { detectionStatus: "queued", detectionAttempt: job.attempt + Number(consumeAttempt),
      detectionResult: Prisma.DbNull, detectionError: null, detectionUpdatedAt: new Date() };
    const result = target.scope === "library"
      ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, ...where }, data })
      : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, ...where }, data });
    return result.count === 1;
  }

  async retryDetection(target: DetectionTarget) {
    const row = await this.findDetection(target);
    if (!row || row.status !== "error" || row.error !== "execution_failed" || row.attempt >= DETECTION_MAX_ATTEMPTS) return null;
    const where = { ...this.detectionWhere(row), detectionStatus: "error", detectionError: "execution_failed" };
    const data = { detectionStatus: "queued", detectionAttempt: { increment: 1 }, detectionResult: Prisma.DbNull, detectionError: null, detectionUpdatedAt: new Date() };
    const result = target.scope === "library"
      ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, ...where }, data })
      : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, ...where }, data });
    return result.count === 1 ? row.attempt + 1 : null;
  }

  async recoverDetections(limit = 100) {
    const stale = new Date(Date.now() - DETECTION_STALE_MS);
    const pending: DetectionJob[] = [];
    const where = { detectionVersion: DETECTION_VERSION, sourceHash: { not: null },
      OR: [{ detectionStatus: "queued" }, { detectionStatus: "running", detectionUpdatedAt: { lt: stale } }] };
    const library = await this.prisma.libraryAsset.findMany({
      where: { kind: "map", ...where, detectionSourceHash: { equals: this.prisma.libraryAsset.fields.sourceHash } }, take: limit, orderBy: { detectionUpdatedAt: "asc" },
    });
    const rooms = await this.prisma.roomUpload.findMany({
      where: { purpose: "map", ...where, detectionSourceHash: { equals: this.prisma.roomUpload.fields.sourceHash } }, take: limit, orderBy: { detectionUpdatedAt: "asc" },
    });
    const rows = [
      ...library.map((r) => ({ ...r, target: { scope: "library" as const, id: r.id } })),
      ...rooms.map((r) => ({ ...r, target: { scope: "room" as const, roomId: r.roomId, objectKey: r.objectKey } })),
    ].sort((a, b) => (a.detectionUpdatedAt?.getTime() ?? 0) - (b.detectionUpdatedAt?.getTime() ?? 0));
    for (const raw of rows) {
      if (pending.length >= limit) break;
      if (raw.sourceHash !== raw.detectionSourceHash) continue;
      const row = await this.findDetection(raw.target);
      if (!row) continue;
      if (row.status === "queued" && row.attempt <= DETECTION_MAX_ATTEMPTS) pending.push(detectionJob(row));
      else if (row.status === "running") {
        // CAS includes the stale timestamp as well as source/version/attempt: a
        // concurrently refreshed claim cannot be recovered by an old scan.
        const data = row.attempt >= DETECTION_MAX_ATTEMPTS
          ? { detectionStatus: "error", detectionError: "execution_failed", detectionUpdatedAt: new Date() }
          : { detectionStatus: "queued", detectionAttempt: { increment: 1 }, detectionUpdatedAt: new Date() };
        const check = { ...this.detectionWhere(row), detectionStatus: "running", detectionUpdatedAt: { lt: stale } };
        const target = raw.target;
        const changed = target.scope === "library"
          ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, ...check }, data })
          : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, ...check }, data });
        if (changed.count === 1 && row.attempt < DETECTION_MAX_ATTEMPTS) pending.push({ ...detectionJob(row), attempt: row.attempt + 1 });
      }
    }
    return pending;
  }

  async listAssets(ownerGmId: string) {
    const rows = await this.prisma.libraryAsset.findMany({ where: { ownerGmId }, orderBy: { createdAt: "desc" } });
    return rows.map(toAssetRecord);
  }

  async findAsset(id: string, ownerGmId: string) {
    const row = await this.prisma.libraryAsset.findFirst({ where: { id, ownerGmId } });
    return row ? toAssetRecord(row) : null;
  }

  async findAssetBoard(id: string, ownerGmId: string) {
    const row = await this.prisma.libraryAsset.findFirst({ where: { id, ownerGmId, kind: "map" }, select: { board: true } });
    return row ? ((row.board as unknown as LibraryMapBoard | null) ?? EMPTY_LIBRARY_BOARD) : null;
  }

  async setAssetBoard(id: string, ownerGmId: string, board: LibraryMapBoard) {
    const count = await this.prisma.$executeRaw`
      UPDATE library_assets SET board = ${JSON.stringify(board)}::jsonb
      WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid AND kind = 'map'
    `;
    return count === 1;
  }

  async updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }) {
    const count = patch.grid ? await this.prisma.$executeRaw`
      UPDATE library_assets SET grid = ${JSON.stringify(patch.grid)}::jsonb, name = COALESCE(${patch.name ?? null}, name)
      WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid
    ` : (await this.prisma.libraryAsset.updateMany({ where: { id, ownerGmId }, data: { ...(patch.name !== undefined && { name: patch.name }) } })).count;
    return count === 1 ? this.findAsset(id, ownerGmId) : null;
  }

  async deleteAsset(id: string, ownerGmId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.libraryAsset.findFirst({ where: { id, ownerGmId } });
      if (!row) return null;
      await tx.assetRef.deleteMany({ where: { assetId: id } });
      await tx.libraryAsset.delete({ where: { id } });
      return toAssetRecord(row);
    });
  }

  async setAssetRefs(roomId: string, assetIds: string[]) {
    // Only ids with a library row: a room still showing a deleted asset must not write it
    // back into the index. The ids arrive in client commands, so they may not be uuids.
    const uuids = assetIds.filter((id) => UUID.test(id));
    await this.prisma.$transaction(async (tx) => {
      const existing = uuids.length
        ? await tx.libraryAsset.findMany({ where: { id: { in: uuids } }, select: { id: true } })
        : [];
      await tx.assetRef.deleteMany({ where: { roomId } });
      await tx.assetRef.createMany({ data: existing.map(({ id }) => ({ assetId: id, roomId })) });
    });
  }

  async assetUsage(assetId: string, ownerGmId: string) {
    const refs = await this.prisma.assetRef.findMany({
      where: { assetId, room: { ownerGmId } },
      select: { room: { select: { id: true, name: true } } },
    });
    return refs.map((r) => ({ id: r.room.id, name: r.room.name ?? "" }));
  }

  async listCreatures(ownerGmId: string) {
    const rows = await this.prisma.libraryCreature.findMany({
      where: { ownerGmId }, orderBy: { createdAt: "desc" }, include: WITH_IMAGE,
    });
    return rows.map(toCreatureRecord);
  }

  async findCreature(id: string, ownerGmId: string) {
    const row = await this.prisma.libraryCreature.findFirst({ where: { id, ownerGmId }, include: WITH_IMAGE });
    return row ? toCreatureRecord(row) : null;
  }

  async createCreature(creature: NewCreatureRecord) {
    const row = await missingImageAsError(() => this.prisma.libraryCreature.create({
      data: { ...creature, createdAt: new Date(creature.createdAt) },
      include: WITH_IMAGE,
    }));
    return toCreatureRecord(row);
  }

  async updateCreature(id: string, ownerGmId: string, patch: CreaturePatch) {
    const { count } = await missingImageAsError(() => this.prisma.libraryCreature.updateMany({ where: { id, ownerGmId }, data: patch }));
    return count === 1 ? this.findCreature(id, ownerGmId) : null;
  }

  async deleteCreature(id: string, ownerGmId: string) {
    const { count } = await this.prisma.libraryCreature.deleteMany({ where: { id, ownerGmId } });
    return count === 1;
  }

  // ---------- Encounter templates (ADR 0024) ----------

  async listEncounters(ownerGmId: string) {
    const rows = await this.prisma.encounterTemplate.findMany({
      where: { ownerGmId }, orderBy: { updatedAt: "desc" }, include: WITH_MAP,
    });
    return rows.map(toEncounterRecord);
  }

  async findEncounter(id: string, ownerGmId: string) {
    // `encounter.apply` carries any string; a non-uuid reads as no template instead of a query error.
    if (!UUID.test(id)) return null;
    const row = await this.prisma.encounterTemplate.findFirst({ where: { id, ownerGmId }, include: WITH_MAP });
    return row ? toEncounterRecord(row) : null;
  }

  countEncounters(ownerGmId: string) {
    return this.prisma.encounterTemplate.count({ where: { ownerGmId } });
  }

  async createEncounter(encounter: NewEncounterRecord, maxPerOwner: number) {
    return this.withEncounterErrors(async () =>
      toEncounterRecord(await this.prisma.$transaction((tx) => insertEncounter(tx, encounter, maxPerOwner))));
  }

  private async withEncounterErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_FOREIGN_KEY_VIOLATION) throw new EncounterMapMissingError();
      throw err;
    }
  }

  async updateEncounter(id: string, ownerGmId: string, change: EncounterUpdate) {
    if (!UUID.test(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.encounterTemplate.findFirst({ where: { id, ownerGmId }, select: { id: true } }))) return null;
      await assertEncounterName(tx, ownerGmId, change.name, id);
      const { count } = await tx.encounterTemplate.updateMany({
        where: { id, ownerGmId },
        data: { name: change.name, data: change.data as unknown as Prisma.InputJsonValue, updatedAt: new Date(change.updatedAt) },
      });
      const row = count === 1 ? await tx.encounterTemplate.findFirst({ where: { id, ownerGmId }, include: WITH_MAP }) : null;
      return row ? toEncounterRecord(row) : null;
    });
  }

  async renameEncounter(id: string, ownerGmId: string, name: string, at: string) {
    if (!UUID.test(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.encounterTemplate.findFirst({ where: { id, ownerGmId }, select: { id: true } }))) return null;
      await assertEncounterName(tx, ownerGmId, name, id);
      const { count } = await tx.encounterTemplate.updateMany({ where: { id, ownerGmId }, data: { name, updatedAt: new Date(at) } });
      const row = count === 1 ? await tx.encounterTemplate.findFirst({ where: { id, ownerGmId }, include: WITH_MAP }) : null;
      return row ? toEncounterRecord(row) : null;
    });
  }

  async deleteEncounter(id: string, ownerGmId: string) {
    if (!UUID.test(id)) return false;
    const { count } = await this.prisma.encounterTemplate.deleteMany({ where: { id, ownerGmId } });
    return count === 1;
  }

  async encountersUsingMap(assetId: string, ownerGmId: string) {
    return this.prisma.encounterTemplate.findMany({
      where: { mapAssetId: assetId, ownerGmId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" },
    });
  }

  async creaturesUsingImage(assetId: string, ownerGmId: string) {
    return this.prisma.libraryCreature.findMany({
      where: { imageAssetId: assetId, ownerGmId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" },
    });
  }


  // ---------- Identity (ADR 0017) ----------

  /** The user and its owner row in one transaction, so an account never exists without an owner. */
  async createUser(user: NewUserRecord) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const owner = await tx.gmIdentity.create({ data: { id: randomUUID() }, select: { id: true } });
        return tx.user.create({ data: { ...user, ownerId: owner.id } });
      });
      return toUserRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new EmailTakenError();
      throw err;
    }
  }

  async findUserByEmail(email: string) {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toUserRecord(row) : null;
  }

  async findUserById(id: string) {
    const row = UUID.test(id) ? await this.prisma.user.findUnique({ where: { id } }) : null;
    return row ? toUserRecord(row) : null;
  }

  async setPasswordHash(userId: string, passwordHash: string, changed: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, ...(changed && { passwordChangedAt: new Date() }) },
    });
  }

  async setActiveDiceLook(userId: string, lookId: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { activeDiceLookId: lookId } });
  }

  async createSession(session: SessionRecord) {
    await this.prisma.session.create({
      data: {
        tokenHash: session.tokenHash,
        userId: session.userId,
        createdAt: new Date(session.createdAt),
        lastSeenAt: new Date(session.lastSeenAt),
        expiresAt: new Date(session.expiresAt),
      },
    });
  }

  async findSession(tokenHash: string) {
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });
    return row ? toSessionRecord(row) : null;
  }

  async touchSession(tokenHash: string, at: string) {
    await this.prisma.session.updateMany({ where: { tokenHash }, data: { lastSeenAt: new Date(at) } });
  }

  async deleteSession(tokenHash: string) {
    return this.endSessions({ tokenHash });
  }

  async deleteUserSessions(userId: string, exceptHash?: string) {
    return this.endSessions({ userId, ...(exceptHash && { tokenHash: { not: exceptHash } }) });
  }

  async deleteExpiredSessions(now: string, idleBefore: string) {
    return this.endSessions({ OR: [{ expiresAt: { lte: new Date(now) } }, { lastSeenAt: { lt: new Date(idleBefore) } }] });
  }

  /**
   * Deletes the matching sessions and the seat credentials bound to them, in one transaction
   * (ADR 0017 M4). The foreign key is RESTRICT, so a session can never be removed while a
   * credential still points at it and that seat would quietly become a guest seat.
   */
  private async endSessions(where: Prisma.SessionWhereInput): Promise<EndedSessions> {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.findMany({ where, select: { tokenHash: true } });
      if (sessions.length === 0) return { credentialHashes: [] };
      const hashes = sessions.map((s) => s.tokenHash);
      const credentials = await tx.credential.findMany({ where: { sessionHash: { in: hashes } }, select: { tokenHash: true } });
      await tx.credential.deleteMany({ where: { sessionHash: { in: hashes } } });
      await tx.session.deleteMany({ where: { tokenHash: { in: hashes } } });
      return { credentialHashes: credentials.map((c) => c.tokenHash) };
    });
  }

  // ---------- Membership (ADR 0017) ----------

  async findMember(roomId: string, userId: string) {
    return this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { roomId: true, participantId: true, userId: true },
    });
  }

  async findMemberByParticipant(roomId: string, participantId: string) {
    return this.prisma.roomMember.findUnique({
      where: { roomId_participantId: { roomId, participantId } },
      select: { roomId: true, participantId: true, userId: true },
    });
  }

  /** One row per (room, account): an existing row is re-pointed at the new participant. */
  async putMember(member: MemberRecord) {
    await this.prisma.$transaction(async (tx) => {
      await tx.roomMember.deleteMany({ where: { roomId: member.roomId, userId: member.userId } });
      await tx.roomMember.create({ data: member });
    });
  }

  async listMemberships(userId: string) {
    return this.prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true, participantId: true, userId: true },
    });
  }

  async keepSeat(member: MemberRecord, credentialHash: string, sessionHash: string): Promise<KeepSeatConflict | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const byAccount = await tx.roomMember.count({ where: { roomId: member.roomId, userId: member.userId } });
        if (byAccount > 0) return "account_has_seat";
        const bySeat = await tx.roomMember.count({ where: { roomId: member.roomId, participantId: member.participantId } });
        if (bySeat > 0) return "seat_taken";
        await tx.roomMember.create({ data: member });
        await tx.credential.update({ where: { tokenHash: credentialHash }, data: { sessionHash } });
        return null;
      });
    } catch (err) {
      // Two keeps raced: the unique indexes decided, and this one lost.
      if (!isUniqueViolation(err)) throw err;
      return (await this.findMember(member.roomId, member.userId)) ? "account_has_seat" : "seat_taken";
    }
  }

  // ---------- Legacy device identities and dice looks (ADR 0017) ----------

  async ownedCounts(ownerGmId: string): Promise<LegacySummary> {
    const where = { ownerGmId };
    const [rooms, assets, creatures, diceLooks] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.libraryAsset.count({ where }),
      this.prisma.libraryCreature.count({ where }),
      this.prisma.diceLook.count({ where }),
    ]);
    return { rooms, assets, creatures, diceLooks };
  }

  /**
   * One transaction: lock the device row, repoint everything it owns, delete it (ADR 0017 O2).
   * `token_hash IS NOT NULL` is what makes it a device row; an account's owner row has none.
   */
  async claimDeviceOwner(deviceOwnerId: string, accountOwnerId: string) {
    if (!UUID.test(deviceOwnerId)) return null;
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM gm_identities WHERE id = ${deviceOwnerId}::uuid AND token_hash IS NOT NULL FOR UPDATE`;
      if (locked.length === 0) return null;
      const from = { ownerGmId: deviceOwnerId };
      const to = { ownerGmId: accountOwnerId };
      const rooms = await tx.room.updateMany({ where: from, data: to });
      const assets = await tx.libraryAsset.updateMany({ where: from, data: to });
      const creatures = await tx.libraryCreature.updateMany({ where: from, data: to });
      const diceLooks = await tx.diceLook.updateMany({ where: from, data: to });
      // Animations move too, or the foreign key would block deleting the device row.
      await tx.libraryAnimation.updateMany({ where: from, data: to });
      await tx.gmIdentity.delete({ where: { id: deviceOwnerId } });
      return { rooms: rooms.count, assets: assets.count, creatures: creatures.count, diceLooks: diceLooks.count };
    });
  }

  async listAnimations(ownerGmId: string) {
    const rows = await this.prisma.libraryAnimation.findMany({ where: { ownerGmId }, orderBy: { createdAt: "desc" } });
    return rows.map(toAnimationRecord);
  }

  async findAnimation(id: string, ownerGmId: string) {
    const row = UUID.test(id) ? await this.prisma.libraryAnimation.findFirst({ where: { id, ownerGmId } }) : null;
    return row ? toAnimationRecord(row) : null;
  }

  async createAnimation(animation: LibraryAnimationRecord, maxPerOwner: number) {
    const row = await this.prisma.$transaction(async (tx) => {
      // One lock per owner, so concurrent saves cannot pass the limit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library_animations:${animation.ownerGmId}`}))`;
      if ((await tx.libraryAnimation.count({ where: { ownerGmId: animation.ownerGmId } })) >= maxPerOwner) {
        throw new AnimationLimitError(maxPerOwner);
      }
      return tx.libraryAnimation.create({
        data: {
          ...animation,
          def: animation.def as unknown as Prisma.InputJsonValue,
          createdAt: new Date(animation.createdAt),
          updatedAt: new Date(animation.updatedAt),
        },
      });
    });
    return toAnimationRecord(row);
  }

  async updateAnimation(id: string, ownerGmId: string, patch: { name?: string; def?: LibraryAnimationRecord["def"] }, at: string) {
    if (!UUID.test(id)) return null;
    const { count } = await this.prisma.libraryAnimation.updateMany({
      where: { id, ownerGmId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.def !== undefined && { def: patch.def as unknown as Prisma.InputJsonValue }),
        updatedAt: new Date(at),
      },
    });
    return count === 1 ? this.findAnimation(id, ownerGmId) : null;
  }

  async deleteAnimation(id: string, ownerGmId: string) {
    if (!UUID.test(id)) return false;
    const { count } = await this.prisma.libraryAnimation.deleteMany({ where: { id, ownerGmId } });
    return count === 1;
  }

  async listDiceLooks(ownerGmId: string) {
    const rows = await this.prisma.diceLook.findMany({ where: { ownerGmId }, orderBy: { createdAt: "desc" } });
    return rows.map(toDiceLookRecord);
  }

  async countDiceLooks(ownerGmId: string) {
    return this.prisma.diceLook.count({ where: { ownerGmId } });
  }

  async findDiceLook(id: string, ownerGmId: string) {
    const row = UUID.test(id) ? await this.prisma.diceLook.findFirst({ where: { id, ownerGmId } }) : null;
    return row ? toDiceLookRecord(row) : null;
  }

  async createDiceLook(look: DiceLookRecord) {
    await this.prisma.diceLook.create({
      data: {
        ...look,
        faces: look.faces as unknown as Prisma.InputJsonValue,
        createdAt: new Date(look.createdAt),
        updatedAt: new Date(look.updatedAt),
      },
    });
  }

  async renameDiceLook(id: string, ownerGmId: string, name: string, at: string) {
    const { count } = await this.prisma.diceLook.updateMany({ where: { id, ownerGmId }, data: { name, updatedAt: new Date(at) } });
    return count === 1 ? this.findDiceLook(id, ownerGmId) : null;
  }

  /** Read-modify-write under a row lock, so two face uploads to one look can't lose each other. */
  async setDiceLookFace(id: string, ownerGmId: string, die: DieName, face: DiceFaceRecord | null, at: string) {
    if (!UUID.test(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM dice_looks WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const row = await tx.diceLook.findUniqueOrThrow({ where: { id } });
      const faces = { ...(row.faces as unknown as DiceLookRecord["faces"]) };
      const replacedKey = faces[die]?.objectKey ?? null;
      if (face) faces[die] = face;
      else delete faces[die];
      const updated = await tx.diceLook.update({
        where: { id },
        data: { faces: faces as unknown as Prisma.InputJsonValue, updatedAt: new Date(at) },
      });
      return { look: toDiceLookRecord(updated), replacedKey };
    });
  }

  async deleteDiceLook(id: string, ownerGmId: string) {
    if (!UUID.test(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.diceLook.findFirst({ where: { id, ownerGmId } });
      if (!row) return null;
      // `users.active_dice_look_id` is ON DELETE SET NULL: whoever had it in use goes back to classic.
      await tx.diceLook.delete({ where: { id } });
      return Object.values(toDiceLookRecord(row).faces).map((f) => f.objectKey);
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  if (err.code === PRISMA_UNIQUE_VIOLATION) return true;
  // Parameterized raw INSERT errors carry PostgreSQL's SQLSTATE in Prisma's metadata.
  return err.code === "P2010" && "meta" in err && typeof err.meta === "object" && err.meta !== null && "code" in err.meta && err.meta.code === "23505";
}

async function missingImageAsError<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === PRISMA_FOREIGN_KEY_VIOLATION) {
      throw new CreatureImageMissingError();
    }
    throw err;
  }
}

/**
 * One save at a time per owner: the advisory lock is held until the transaction ends, so the count
 * cannot go stale before the insert.
 */
async function insertEncounter(tx: Prisma.TransactionClient, encounter: NewEncounterRecord, maxPerOwner: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`encounter_templates:${encounter.ownerGmId}`}))`;
  if ((await tx.encounterTemplate.count({ where: { ownerGmId: encounter.ownerGmId } })) >= maxPerOwner) {
    throw new EncounterLimitError(maxPerOwner);
  }
  await assertEncounterName(tx, encounter.ownerGmId, encounter.name);
  return tx.encounterTemplate.create({
    data: {
      ...encounter,
      data: encounter.data as unknown as Prisma.InputJsonValue,
      createdAt: new Date(encounter.createdAt),
      updatedAt: new Date(encounter.updatedAt),
    },
    include: WITH_MAP,
  });
}

/** Uses the same owner lock as creation so concurrent creates and renames cannot collide. */
async function assertEncounterName(tx: Prisma.TransactionClient, ownerGmId: string, name: string, exceptId?: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`encounter_templates:${ownerGmId}`}))`;
  const entries = await tx.encounterTemplate.findMany({ where: { ownerGmId }, select: { id: true, name: true } });
  if (entries.some((entry) => entry.id !== exceptId && entry.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new EncounterNameConflictError();
  }
}

function toEncounterRecord(row: EncounterTemplate & { map: { name: string; url: string } | null }): EncounterRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    name: row.name,
    version: row.version,
    // Validated again where it is applied (ADR 0024), so a row from an older format is not trusted here.
    data: row.data as unknown as EncounterRecord["data"],
    mapAssetId: row.mapAssetId,
    mapName: row.map?.name ?? null,
    mapUrl: row.map?.url ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCreatureRecord(row: LibraryCreature & { image: { url: string } | null }): LibraryCreatureRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    name: row.name,
    size: row.size,
    hp: row.hp,
    attacks: TokenAttacks.parse(row.attacks),
    maxHp: row.maxHp,
    ac: row.ac,
    color: row.color ?? DEFAULT_TOKEN_COLOR,
    conditions: row.conditions.filter((c): c is ConditionId => ConditionId.safeParse(c).success),
    imageAssetId: row.imageAssetId,
    imageUrl: row.image?.url ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAssetRecord(row: LibraryAsset): LibraryAssetRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    kind: row.kind as AssetKind,
    objectKey: row.objectKey,
    url: row.url,
    name: row.name,
    width: row.width,
    height: row.height,
    grid: (row.grid as unknown as GridSpec | null) ?? null,
    board: (row.board as unknown as LibraryMapBoard | null) ?? null,
    sourceHash: row.sourceHash, detectionSourceHash: row.detectionSourceHash, detectionVersion: row.detectionVersion,
    detectionError: row.detectionError as DetectionError | null,
    detectionStatus: row.detectionStatus as DetectionState | null,
    detectionAttempt: row.detectionAttempt,
    detectionResult: (row.detectionResult as GridDetectionCandidate | null) ?? null,
    detectionUpdatedAt: row.detectionUpdatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    ownerId: row.ownerId,
    activeDiceLookId: row.activeDiceLookId,
    createdAt: row.createdAt.toISOString(),
    passwordChangedAt: row.passwordChangedAt.toISOString(),
  };
}

function toSessionRecord(row: Session): SessionRecord {
  return {
    tokenHash: row.tokenHash,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function toAnimationRecord(row: LibraryAnimation): LibraryAnimationRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    name: row.name,
    def: row.def as unknown as LibraryAnimationRecord["def"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDiceLookRecord(row: DiceLook): DiceLookRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    name: row.name,
    faces: row.faces as unknown as DiceLookRecord["faces"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
