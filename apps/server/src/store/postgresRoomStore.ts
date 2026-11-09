import { preparationRevision, preparationProblem, versionedBoard, publicBoard, PreparationConflictError } from "./libraryPreparation";
import type { SaveLibraryPreparation } from "@vtt/shared";
import { SHIPPED_GRID_CORRECTIONS } from "../domain/shippedMaps";
import {
  Prisma,
  PrismaClient,
  type Build,
  type BuildFile,
  type BuildItem,
  type DiceLook,
  type EncounterTemplate,
  type LibraryAnimation,
  type LibraryAsset,
  type LibraryCreature,
  type Session,
  type User,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { GridDetectionCandidate } from "@vtt/shared";
import { DETECTION_STALE_MS, DETECTION_MAX_ATTEMPTS, DETECTION_VERSION, detectionJob, type DetectionJob, type DetectionError, type DetectionOutcome, type DetectionRecord, type DetectionTarget, type DetectionState } from "./gridDetectionStore";
import { ConditionId, DEFAULT_GRID, DEFAULT_TOKEN_COLOR, presetFromLog, type BuildFlag, type GameProfile, type LibraryMapBoard, TokenAttacks, type AssetKind, type CommittedEvent, type DieName, type DomainEvent, type GmRoomSummary, type GridSpec, type LegacySummary } from "@vtt/shared";
import {
  BuildClosedError,
  BuildItemLockedError,
  BuildLimitError,
  BuildPublishConflictError,
  assertBuildFileFits,
  uniqueEncounterName,
  type BuildPublishPlan,
  type BuildPublishResult,
  type BuildFileKind,
  type BuildFileLimits,
  type BuildFileRecord,
  type BuildFileUsage,
  type BuildItemKind,
  type BuildItemRecord,
  type BuildRecord,
  type BuildStatus,
  type NewBuildItem,
  type NewBuildRecord,
} from "./buildStore";
import {
  EmailTakenError,
  type DeletedUser,
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
  type UnsizedUpload,
  type UploadAllowance,
  type UploadScope,
  type UploadUsage,
} from "./libraryStore";
import { assertFitsAllowance } from "./libraryStore";
import type { KeepSeatConflict, MemberRecord } from "./membershipStore";
import type { RedisSeqSource } from "./redisSeq";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore, type RoomUploadDetails } from "./roomStore";

/**
 * As with event payloads, parameterized JSON text preserves all JS doubles (ADR 0043). The complete
 * map goes in one statement, so readers can never see it with its grid or geometry missing.
 */
async function insertAssetRow(tx: Prisma.TransactionClient, asset: LibraryAssetRecord) {
  await tx.$executeRaw`
    INSERT INTO library_assets
      (id, owner_gm_id, kind, object_key, url, name, width, height, byte_size, grid, board,
       source_hash, detection_source_hash, detection_version, detection_error,
       detection_status, detection_attempt, detection_result, detection_updated_at, created_at)
    VALUES (${asset.id}::uuid, ${asset.ownerGmId}::uuid, ${asset.kind}, ${asset.objectKey},
      ${asset.url}, ${asset.name}, ${asset.width}, ${asset.height}, ${asset.byteSize ?? null}::int,
      ${asset.grid ? JSON.stringify(asset.grid) : null}::jsonb,
      ${asset.board ? JSON.stringify(asset.board) : null}::jsonb,
      ${asset.sourceHash ?? null}, ${asset.detectionSourceHash ?? null}, ${asset.detectionVersion ?? null}, ${asset.detectionError ?? null},
      ${asset.detectionStatus ?? null}, ${asset.detectionAttempt ?? 0},
      ${asset.detectionResult ? JSON.stringify(asset.detectionResult) : null}::jsonb,
      ${asset.detectionStatus ? new Date(asset.detectionUpdatedAt ?? Date.now()) : null}, ${new Date(asset.createdAt)})
  `;
}

/** One writer per build at a time, and only while it's open, so checks and writes are one step. */
async function lockOpenBuild(tx: Prisma.TransactionClient, buildId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${buildId}`}))`;
  const build = await tx.build.findUnique({ where: { id: buildId }, select: { status: true } });
  if (build?.status !== "open") throw new BuildClosedError();
}

async function readBuildFileUsage(client: Pick<Prisma.TransactionClient, "buildFile">, buildId: string): Promise<BuildFileUsage> {
  const [all, maps] = await Promise.all([
    client.buildFile.aggregate({ where: { buildId }, _count: true, _sum: { sizeBytes: true } }),
    client.buildFile.count({ where: { buildId, kind: "map" } }),
  ]);
  return { files: all._count, maps, bytes: all._sum.sizeBytes ?? 0 };
}

function toBuildRecord(row: Build): BuildRecord {
  return {
    id: row.id, ownerGmId: row.ownerGmId, name: row.name, status: row.status as BuildStatus,
    gameProfile: row.gameProfile as GameProfile | null,
    passHash: row.passHash, passExpiresAt: row.passExpiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function toBuildFileRecord(row: BuildFile): BuildFileRecord {
  return {
    ...row,
    kind: row.kind as BuildFileKind,
    grid: row.grid as GridSpec | null,
    board: row.board as LibraryMapBoard | null,
    detectionError: row.detectionError as DetectionError | null,
    detectionStatus: row.detectionStatus as DetectionState | null,
    detectionResult: row.detectionResult as GridDetectionCandidate | null,
    detectionUpdatedAt: row.detectionUpdatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBuildItemRecord(row: BuildItem): BuildItemRecord {
  return {
    buildId: row.buildId, kind: row.kind as BuildItemKind, key: row.key,
    data: row.data as Record<string, unknown>, flags: row.flags as BuildFlag[], notCarriedOver: row.notCarriedOver,
    editedByUser: row.editedByUser, publishedId: row.publishedId, updatedAt: row.updatedAt.toISOString(),
  };
}

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

  async recordRoomUpload(roomId: string, objectKey: string, allowance: UploadAllowance, details: RoomUploadDetails = {}) {
    const { purpose = "token", width, height, byteSize, analysis } = details;
    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId }, select: { ownerGmId: true } });
      const scope: UploadScope = room?.ownerGmId ? { ownerGmId: room.ownerGmId } : { roomId };
      await lockUploadAllowance(tx, scope);
      assertFitsAllowance(await readUploadUsage(tx, scope), { items: 0, bytes: byteSize ?? 0 }, allowance);
      await tx.roomUpload.upsert({
        where: { roomId_objectKey: { roomId, objectKey } },
        create: {
          roomId, objectKey, purpose, width, height, byteSize, sourceHash: analysis?.sourceHash,
          ...(purpose === "map" && analysis?.sourceHash && {
            detectionSourceHash: analysis.sourceHash, detectionVersion: analysis.detectionVersion, detectionError: analysis.detectionError,
            detectionStatus: analysis.detectionError ? "error" : "queued", detectionAttempt: 1, detectionUpdatedAt: new Date(),
          }),
        },
        update: {},
      });
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

  async listOwnedRoomIds(ownerGmId: string) {
    const rooms = await this.prisma.room.findMany({ where: { ownerGmId }, select: { id: true } });
    return rooms.map((r) => r.id);
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

  async createAsset(asset: LibraryAssetRecord, allowance: UploadAllowance) {
    await this.prisma.$transaction(async (tx) => {
      const scope = { ownerGmId: asset.ownerGmId };
      await lockUploadAllowance(tx, scope);
      assertFitsAllowance(await readUploadUsage(tx, scope), { items: 1, bytes: asset.byteSize ?? 0 }, allowance);
      await insertAssetRow(tx, asset);
    });
  }

  async uploadUsage(scope: UploadScope) {
    return readUploadUsage(this.prisma, scope);
  }

  async uploadUsageByOwner() {
    const rows = await this.prisma.$queryRaw<{ owner: string; items: bigint; bytes: bigint }[]>`
      WITH usage AS (
        SELECT owner_gm_id AS owner, 1 AS items, COALESCE(byte_size, 0)::bigint AS bytes
          FROM library_assets WHERE object_key NOT LIKE 'shipped:%'
        UNION ALL
        SELECT r.owner_gm_id, 0, COALESCE(u.byte_size, 0)::bigint
          FROM room_uploads u JOIN rooms r ON r.id = u.room_id WHERE r.owner_gm_id IS NOT NULL
        UNION ALL
        SELECT d.owner_gm_id, 0, COALESCE((f.value->>'bytes')::bigint, 0)
          FROM dice_looks d, jsonb_each(d.faces) f
      )
      SELECT owner::text, SUM(items)::bigint AS items, SUM(bytes)::bigint AS bytes
        FROM usage GROUP BY owner HAVING SUM(items) > 0 OR SUM(bytes) > 0 ORDER BY bytes DESC`;
    return rows.map((row) => ({ ownerGmId: row.owner, items: Number(row.items), bytes: Number(row.bytes) }));
  }

  async listUnsizedUploads() {
    const [assets, uploads] = await Promise.all([
      this.prisma.libraryAsset.findMany({ where: { byteSize: null, NOT: { objectKey: { startsWith: "shipped:" } } }, select: { id: true, objectKey: true } }),
      this.prisma.roomUpload.findMany({ where: { byteSize: null }, select: { roomId: true, objectKey: true } }),
    ]);
    return [
      ...assets.map((a): UnsizedUpload => ({ table: "library", id: a.id, objectKey: a.objectKey })),
      ...uploads.map((u): UnsizedUpload => ({ table: "room", roomId: u.roomId, objectKey: u.objectKey })),
    ];
  }

  async setUploadSize(upload: UnsizedUpload, bytes: number) {
    if (upload.table === "library") await this.prisma.libraryAsset.updateMany({ where: { id: upload.id, byteSize: null }, data: { byteSize: bytes } });
    else await this.prisma.roomUpload.updateMany({ where: { roomId: upload.roomId, objectKey: upload.objectKey, byteSize: null }, data: { byteSize: bytes } });
  }

  async seedShippedMaps(ownerGmId: string, rows: LibraryAssetRecord[]) {
    return this.prisma.$transaction(async (tx) => {
      // The row lock makes concurrent callers take turns, so a slug is never inserted twice.
      const locked = await tx.$queryRaw<{ seeded: string[] }[]>`
        SELECT shipped_maps_seeded AS seeded FROM gm_identities WHERE id = ${ownerGmId}::uuid FOR UPDATE`;
      if (locked.length !== 1) return false;
      // JSONB equality compares the complete grid; an edited line style must also survive.
      let corrected = false;
      for (const { map, previous } of SHIPPED_GRID_CORRECTIONS) {
        const result = await tx.libraryAsset.updateMany({
          where: { ownerGmId, kind: "map", objectKey: `shipped:${map.slug}`, url: map.url,
            width: map.width, height: map.height, grid: { equals: previous } },
          data: { grid: map.grid },
        });
        corrected ||= result.count > 0;
      }
      const seeded = new Set(locked[0]!.seeded);
      const fresh = rows.filter((r) => !seeded.has(shippedSlug(r)));
      if (fresh.length === 0) return corrected;
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
      : target.scope === "build"
        ? await this.prisma.buildFile.findUnique({ where: { id: target.fileId } })
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

  /** One detection row, wherever its scope keeps it, changed only if it still matches `where`. */
  private async updateDetection(target: DetectionTarget, where: Record<string, unknown>, data: Record<string, unknown>) {
    const result = target.scope === "library"
      ? await this.prisma.libraryAsset.updateMany({ where: { id: target.id, ...where }, data })
      : target.scope === "build"
        ? await this.prisma.buildFile.updateMany({ where: { id: target.fileId, ...where }, data })
        : await this.prisma.roomUpload.updateMany({ where: { roomId: target.roomId, objectKey: target.objectKey, ...where }, data });
    return result.count === 1;
  }

  async markDetectionRunning(job: DetectionJob) {
    if (job.configVersion !== DETECTION_VERSION || job.attempt > DETECTION_MAX_ATTEMPTS) return false;
    const where = { ...this.detectionWhere(job), detectionStatus: "queued", ...(job.target.scope === "room" ? { purpose: "map" } : { kind: "map" }) };
    return this.updateDetection(job.target, where, { detectionStatus: "running", detectionUpdatedAt: new Date() });
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
    return this.updateDetection(target, where, data);
  }

  async deferDetection(job: DetectionJob, consumeAttempt: boolean) {
    if (job.configVersion !== DETECTION_VERSION) return false;
    if (consumeAttempt && job.attempt >= DETECTION_MAX_ATTEMPTS) return this.finishDetection(job, { status: "error", error: "execution_failed" });
    const target = job.target;
    const where = { ...this.detectionWhere(job), detectionStatus: "running" };
    const data = { detectionStatus: "queued", detectionAttempt: job.attempt + Number(consumeAttempt),
      detectionResult: Prisma.DbNull, detectionError: null, detectionUpdatedAt: new Date() };
    return this.updateDetection(target, where, data);
  }

  async retryDetection(target: DetectionTarget) {
    const row = await this.findDetection(target);
    if (!row || row.status !== "error" || row.error !== "execution_failed" || row.attempt >= DETECTION_MAX_ATTEMPTS) return null;
    const where = { ...this.detectionWhere(row), detectionStatus: "error", detectionError: "execution_failed" };
    const data = { detectionStatus: "queued", detectionAttempt: { increment: 1 }, detectionResult: Prisma.DbNull, detectionError: null, detectionUpdatedAt: new Date() };
    return await this.updateDetection(target, where, data) ? row.attempt + 1 : null;
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
    const builds = await this.prisma.buildFile.findMany({
      where: { kind: "map", ...where, detectionSourceHash: { equals: this.prisma.buildFile.fields.sourceHash } }, take: limit, orderBy: { detectionUpdatedAt: "asc" },
    });
    const rows = [
      ...library.map((r) => ({ ...r, target: { scope: "library" as const, id: r.id } as DetectionTarget })),
      ...rooms.map((r) => ({ ...r, target: { scope: "room" as const, roomId: r.roomId, objectKey: r.objectKey } as DetectionTarget })),
      ...builds.map((r) => ({ ...r, target: { scope: "build" as const, fileId: r.id } as DetectionTarget })),
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
        const changed = await this.updateDetection(raw.target, check, data);
        if (changed && row.attempt < DETECTION_MAX_ATTEMPTS) pending.push({ ...detectionJob(row), attempt: row.attempt + 1 });
      }
    }
    return pending;
  }

  // ---------- AI game builds (ADR 0053) ----------

  async createBuild(build: NewBuildRecord, maxOpen: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:${build.ownerGmId}`}))`;
      const open = await tx.build.count({ where: { ownerGmId: build.ownerGmId, status: "open" } });
      if (open >= maxOpen) throw new BuildLimitError(`You can have up to ${maxOpen} open builds. Finish or discard one first.`);
      return toBuildRecord(await tx.build.create({ data: build }));
    });
  }

  async listBuilds(ownerGmId: string) {
    return (await this.prisma.build.findMany({ where: { ownerGmId }, orderBy: { createdAt: "desc" } })).map(toBuildRecord);
  }

  async findBuild(id: string, ownerGmId: string) {
    const row = await this.prisma.build.findFirst({ where: { id, ownerGmId } });
    return row ? toBuildRecord(row) : null;
  }

  async findBuildByPassHash(passHash: string) {
    const row = await this.prisma.build.findUnique({ where: { passHash } });
    return row ? toBuildRecord(row) : null;
  }

  async findBuildOwnerName(ownerGmId: string) {
    return (await this.prisma.user.findFirst({ where: { ownerId: ownerGmId }, select: { displayName: true } }))?.displayName ?? null;
  }

  async setBuildPass(id: string, ownerGmId: string, passHash: string, expiresAt: string) {
    const result = await this.prisma.build.updateMany({ where: { id, ownerGmId, status: "open" }, data: { passHash, passExpiresAt: new Date(expiresAt) } });
    return result.count === 1;
  }

  async clearBuildPass(id: string, ownerGmId: string) {
    const result = await this.prisma.build.updateMany({ where: { id, ownerGmId }, data: { passHash: null, passExpiresAt: null } });
    return result.count === 1;
  }

  async endBuildPasses(ownerGmId: string) {
    await this.prisma.build.updateMany({ where: { ownerGmId }, data: { passHash: null, passExpiresAt: null } });
  }

  async saveGameProfile(buildId: string, profile: GameProfile) {
    const result = await this.prisma.build.updateMany({
      where: { id: buildId, status: "open" }, data: { gameProfile: profile as Prisma.InputJsonValue, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new BuildClosedError();
  }

  async buildFileUsage(buildId: string): Promise<BuildFileUsage> {
    return readBuildFileUsage(this.prisma, buildId);
  }

  async addBuildFile(file: BuildFileRecord, limits: BuildFileLimits) {
    await this.prisma.$transaction(async (tx) => {
      await lockOpenBuild(tx, file.buildId);
      assertBuildFileFits(await readBuildFileUsage(tx, file.buildId), file, limits);
      await tx.buildFile.create({
        data: {
          ...file,
          grid: file.grid === null ? Prisma.DbNull : (file.grid as Prisma.InputJsonValue),
          board: file.board === null ? Prisma.DbNull : (file.board as Prisma.InputJsonValue),
          detectionResult: file.detectionResult === null ? Prisma.DbNull : (file.detectionResult as Prisma.InputJsonValue),
          detectionUpdatedAt: file.detectionUpdatedAt ? new Date(file.detectionUpdatedAt) : null,
          createdAt: new Date(file.createdAt),
        },
      });
      await tx.build.update({ where: { id: file.buildId }, data: { updatedAt: new Date() } });
    });
  }

  async listBuildFiles(buildId: string) {
    return (await this.prisma.buildFile.findMany({ where: { buildId }, orderBy: { createdAt: "asc" } })).map(toBuildFileRecord);
  }

  async findBuildFile(buildId: string, fileId: string) {
    const row = UUID.test(fileId) ? await this.prisma.buildFile.findFirst({ where: { id: fileId, buildId } }) : null;
    return row ? toBuildFileRecord(row) : null;
  }

  async saveBuildItem(item: NewBuildItem, maxForKind: number | null) {
    return this.prisma.$transaction(async (tx) => {
      await lockOpenBuild(tx, item.buildId);
      const where = { buildId_kind_key: { buildId: item.buildId, kind: item.kind, key: item.key } };
      const existing = await tx.buildItem.findUnique({ where });
      if (existing?.publishedId) throw new BuildItemLockedError("published");
      if (existing?.editedByUser) throw new BuildItemLockedError("edited");
      if (!existing && maxForKind !== null && await tx.buildItem.count({ where: { buildId: item.buildId, kind: item.kind } }) >= maxForKind) {
        throw new BuildLimitError(`A build can hold up to ${maxForKind} of these.`);
      }
      const values = {
        data: item.data as Prisma.InputJsonValue, flags: item.flags as Prisma.InputJsonValue, notCarriedOver: item.notCarriedOver, updatedAt: new Date(),
      };
      const row = await tx.buildItem.upsert({ where, create: { id: randomUUID(), buildId: item.buildId, kind: item.kind, key: item.key, ...values }, update: values });
      await tx.build.update({ where: { id: item.buildId }, data: { updatedAt: new Date() } });
      return toBuildItemRecord(row);
    });
  }

  async listBuildItems(buildId: string) {
    return (await this.prisma.buildItem.findMany({ where: { buildId }, orderBy: { key: "asc" } })).map(toBuildItemRecord);
  }

  async findBuildItem(buildId: string, kind: BuildItemKind, key: string) {
    const row = await this.prisma.buildItem.findUnique({ where: { buildId_kind_key: { buildId, kind, key } } });
    return row ? toBuildItemRecord(row) : null;
  }

  async removeBuildItem(buildId: string, kind: BuildItemKind, key: string, byOwner = false) {
    return this.prisma.$transaction(async (tx) => {
      await lockOpenBuild(tx, buildId);
      const where = { buildId_kind_key: { buildId, kind, key } };
      const existing = await tx.buildItem.findUnique({ where });
      if (!existing) return false;
      if (existing.publishedId) throw new BuildItemLockedError("published");
      if (existing.editedByUser && !byOwner) throw new BuildItemLockedError("edited");
      await tx.buildItem.delete({ where });
      await tx.build.update({ where: { id: buildId }, data: { updatedAt: new Date() } });
      return true;
    });
  }

  async editBuildItem(item: NewBuildItem) {
    return this.prisma.$transaction(async (tx) => {
      await lockOpenBuild(tx, item.buildId);
      const where = { buildId_kind_key: { buildId: item.buildId, kind: item.kind, key: item.key } };
      const existing = await tx.buildItem.findUnique({ where });
      if (existing?.publishedId) throw new BuildItemLockedError("published");
      const values = {
        data: item.data as Prisma.InputJsonValue, flags: item.flags as Prisma.InputJsonValue, notCarriedOver: item.notCarriedOver, editedByUser: true, updatedAt: new Date(),
      };
      const row = await tx.buildItem.upsert({ where, create: { id: randomUUID(), buildId: item.buildId, kind: item.kind, key: item.key, ...values }, update: values });
      await tx.build.update({ where: { id: item.buildId }, data: { updatedAt: new Date() } });
      return toBuildItemRecord(row);
    });
  }

  async publishBuild(plan: BuildPublishPlan, allowance: UploadAllowance, maxEncounters: number) {
    return missingImageAsError(() => this.prisma.$transaction(async (tx) => {
      await lockOpenBuild(tx, plan.buildId);
      const scope = { ownerGmId: plan.ownerGmId };
      await lockUploadAllowance(tx, scope);
      assertFitsAllowance(await readUploadUsage(tx, scope), { items: plan.assets.length, bytes: plan.assets.reduce((sum, a) => sum + (a.record.byteSize ?? 0), 0) }, allowance);
      const current = await tx.buildItem.findMany({ where: { buildId: plan.buildId }, select: { kind: true, key: true, updatedAt: true } });
      const versions = new Map(current.map((i) => [`${i.kind}/${i.key}`, i.updatedAt.toISOString()]));
      if (plan.reviewed.some((r) => versions.get(`${r.kind}/${r.key}`) !== r.updatedAt)) throw new BuildPublishConflictError();

      const result: BuildPublishResult = { assets: plan.assets.length, creatures: [], maps: [], encounters: [] };
      for (const { fileId, record } of plan.assets) {
        // Claimed only if still unpublished, so two publishes at once can't both add this file.
        const claimed = await tx.buildFile.updateMany({ where: { id: fileId, buildId: plan.buildId, publishedAssetId: null }, data: { publishedAssetId: record.id } });
        if (claimed.count !== 1) throw new BuildPublishConflictError();
        await insertAssetRow(tx, record);
      }
      const claim = async (kind: BuildItemKind, key: string, publishedId: string) => {
        const claimed = await tx.buildItem.updateMany({ where: { buildId: plan.buildId, kind, key, publishedId: null }, data: { publishedId } });
        if (claimed.count !== 1) throw new BuildPublishConflictError();
      };
      for (const { key, record } of plan.creatures) {
        await claim("creature", key, record.id);
        await tx.libraryCreature.create({ data: { ...record, createdAt: new Date(record.createdAt) } });
        result.creatures.push({ key, id: record.id });
      }
      for (const { key, assetId } of plan.maps) {
        await tx.buildItem.updateMany({ where: { buildId: plan.buildId, kind: "map", key, publishedId: null }, data: { publishedId: assetId } });
        result.maps.push({ key, id: assetId });
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`encounter_templates:${plan.ownerGmId}`}))`;
      for (const { key, record } of plan.encounters) {
        await claim("encounter", key, record.id);
        const names = (await tx.encounterTemplate.findMany({ where: { ownerGmId: plan.ownerGmId }, select: { name: true } })).map((e) => e.name);
        const name = uniqueEncounterName(record.name, names);
        await insertEncounter(tx, { ...record, name }, maxEncounters);
        result.encounters.push({ key, id: record.id, name });
      }
      await tx.build.update({ where: { id: plan.buildId }, data: { updatedAt: new Date() } });
      return result;
      // A large publish is hundreds of statements, well past Prisma's default of 5 seconds.
    }, { timeout: 30_000, maxWait: 10_000 }));
  }

  async closeBuild(id: string, ownerGmId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${id}`}))`;
      const build = await tx.build.findFirst({ where: { id, ownerGmId }, select: { id: true } });
      if (!build) return null;
      const files = await tx.buildFile.findMany({ where: { buildId: id, publishedAssetId: null }, select: { id: true, objectKey: true } });
      await tx.buildFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
      await tx.buildItem.deleteMany({ where: { buildId: id, publishedId: null } });
      await tx.build.update({ where: { id }, data: { status: "closed", passHash: null, passExpiresAt: null, updatedAt: new Date() } });
      return { objectKeys: files.map((f) => f.objectKey) };
    });
  }

  async listAbandonedBuilds(before: string) {
    return this.prisma.build.findMany({ where: { status: "open", updatedAt: { lt: new Date(before) } }, select: { id: true, ownerGmId: true } });
  }

  async forgetPublished(buildId: string, removed: { fileIds: string[]; items: { kind: BuildItemKind; key: string }[] }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${buildId}`}))`;
      await tx.buildFile.deleteMany({ where: { buildId, id: { in: removed.fileIds } } });
      const open = (await tx.build.findUnique({ where: { id: buildId }, select: { status: true } }))?.status === "open";
      for (const { kind, key } of removed.items) {
        if (open) await tx.buildItem.updateMany({ where: { buildId, kind, key }, data: { publishedId: null } });
        else await tx.buildItem.deleteMany({ where: { buildId, kind, key } });
      }
    });
  }

  async markBuildItem(buildId: string, kind: BuildItemKind, key: string, state: { editedByUser?: boolean; publishedId?: string }) {
    const result = await this.prisma.buildItem.updateMany({ where: { buildId, kind, key }, data: state });
    return result.count === 1;
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
    return row ? publicBoard(row.board as unknown as LibraryMapBoard | null) : null;
  }

  async setAssetBoard(id: string, ownerGmId: string, board: LibraryMapBoard) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM library_assets WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid FOR UPDATE`;
      const row = await tx.libraryAsset.findFirst({ where: { id, ownerGmId, kind: "map" } });
      if (!row) return false;
      const old = publicBoard(toAssetRecord(row).board);
      const next = versionedBoard({ ...board, ...(board.terrain === undefined && old.terrain ? { terrain: old.terrain } : {}) });
      const problem = preparationProblem(toAssetRecord(row), toAssetRecord(row).grid ?? DEFAULT_GRID, publicBoard(next));
      if (problem) throw new PreparationConflictError(problem);
      await tx.$executeRaw`UPDATE library_assets SET board = ${JSON.stringify(next)}::jsonb WHERE id = ${id}::uuid`;
      return true;
    });
  }

  async updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM library_assets WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid FOR UPDATE`;
      const row = await tx.libraryAsset.findFirst({ where: { id, ownerGmId } });
      if (!row) return null;
      const asset = toAssetRecord(row);
      if (patch.grid) {
        const problem = preparationProblem(asset, patch.grid, publicBoard(asset.board));
        if (problem) throw new PreparationConflictError(problem);
        const board = versionedBoard(publicBoard(asset.board));
        await tx.$executeRaw`UPDATE library_assets SET grid = ${JSON.stringify(patch.grid)}::jsonb, board = ${JSON.stringify(board)}::jsonb, name = COALESCE(${patch.name ?? null}, name) WHERE id = ${id}::uuid`;
      } else if (patch.name !== undefined) await tx.libraryAsset.update({ where: { id }, data: { name: patch.name } });
      const updated = await tx.libraryAsset.findUnique({ where: { id } });
      return updated ? toAssetRecord(updated) : null;
    });
  }

  async findAssetPreparation(id: string, ownerGmId: string) {
    const asset = await this.findAsset(id, ownerGmId);
    return asset?.kind === "map" ? { grid: asset.grid, board: publicBoard(asset.board), revision: preparationRevision(asset) } : null;
  }

  async saveAssetPreparation(id: string, ownerGmId: string, change: SaveLibraryPreparation) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM library_assets WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid FOR UPDATE`;
      const row = await tx.libraryAsset.findFirst({ where: { id, ownerGmId, kind: "map" } });
      if (!row) return null;
      const asset = toAssetRecord(row);
      if (preparationRevision(asset) !== change.revision) throw new PreparationConflictError("This map changed. Reopen it before saving; your draft has been kept.");
      const problem = preparationProblem(asset, change.grid, change.board, change.resetTerrain);
      if (problem) throw new PreparationConflictError(problem);
      const board = versionedBoard(change.board);
      await tx.$executeRaw`UPDATE library_assets SET grid = ${JSON.stringify(change.grid)}::jsonb, board = ${JSON.stringify(board)}::jsonb WHERE id = ${id}::uuid`;
      return { grid: change.grid, board: publicBoard(board), revision: preparationRevision({ ...asset, grid: change.grid, board }) };
    });
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

  async deleteUser(userId: string): Promise<DeletedUser | null> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { ownerId: true } });
      if (!user) return null;
      const ownerGmId = user.ownerId;
      const sessionHashes = (await tx.session.findMany({ where: { userId }, select: { tokenHash: true } })).map((s) => s.tokenHash);
      const credentialHashes = (
        await tx.credential.findMany({ where: { sessionHash: { in: sessionHashes } }, select: { tokenHash: true } })
      ).map((c) => c.tokenHash);
      // Credentials first: their foreign key to sessions is RESTRICT. No ON DELETE CASCADE anywhere.
      await tx.credential.deleteMany({ where: { sessionHash: { in: sessionHashes } } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.roomMember.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { activeDiceLookId: null } });

      const buildIds = (await tx.build.findMany({ where: { ownerGmId }, select: { id: true } })).map((b) => b.id);
      // So an AI saving at this moment waits, rather than making the foreign keys refuse the delete.
      for (const id of [...buildIds].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${id}`}))`;
      // A published file's object belongs to its library row, which is collected below.
      const buildFiles = await tx.buildFile.findMany({ where: { buildId: { in: buildIds }, publishedAssetId: null }, select: { objectKey: true } });
      await tx.buildItem.deleteMany({ where: { buildId: { in: buildIds } } });
      await tx.buildFile.deleteMany({ where: { buildId: { in: buildIds } } });
      await tx.build.deleteMany({ where: { ownerGmId } });

      const looks = await tx.diceLook.findMany({ where: { ownerGmId } });
      const assets = await tx.libraryAsset.findMany({ where: { ownerGmId }, select: { id: true, objectKey: true } });
      await tx.assetRef.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
      await tx.libraryCreature.deleteMany({ where: { ownerGmId } });
      await tx.encounterTemplate.deleteMany({ where: { ownerGmId } });
      await tx.libraryAnimation.deleteMany({ where: { ownerGmId } });
      await tx.diceLook.deleteMany({ where: { ownerGmId } });
      await tx.libraryAsset.deleteMany({ where: { ownerGmId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.gmIdentity.delete({ where: { id: ownerGmId } });
      return {
        credentialHashes,
        objectKeys: [
          ...looks.flatMap((l) => Object.values(toDiceLookRecord(l).faces).map((f) => f.objectKey)),
          ...assets.map((a) => a.objectKey).filter((k) => !k.startsWith("shipped:")),
          ...buildFiles.map((f) => f.objectKey),
        ],
      };
    });
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
  async setDiceLookFace(id: string, ownerGmId: string, die: DieName, face: DiceFaceRecord | null, at: string, allowance: UploadAllowance) {
    if (!UUID.test(id)) return null;
    return this.prisma.$transaction(async (tx) => {
      // The allowance lock first, always, so this cannot deadlock against another upload.
      await lockUploadAllowance(tx, { ownerGmId });
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM dice_looks WHERE id = ${id}::uuid AND owner_gm_id = ${ownerGmId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const row = await tx.diceLook.findUniqueOrThrow({ where: { id } });
      const faces = { ...(row.faces as unknown as DiceLookRecord["faces"]) };
      if (face) assertFitsAllowance(await readUploadUsage(tx, { ownerGmId }), { items: 0, bytes: (face.bytes ?? 0) - (faces[die]?.bytes ?? 0) }, allowance);
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

type SqlReader = Pick<Prisma.TransactionClient, "$queryRaw">;

/** One lock per allowance, so concurrent uploads cannot pass the limit together. Held until the transaction ends. */
async function lockUploadAllowance(tx: Prisma.TransactionClient, scope: UploadScope) {
  const holder = "ownerGmId" in scope ? scope.ownerGmId : scope.roomId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload_allowance:${holder}`}))`;
}

/** Summed from the rows on every call, so deleting anything frees its share with nothing to keep in step. */
async function readUploadUsage(db: SqlReader, scope: UploadScope): Promise<UploadUsage> {
  const rows = "ownerGmId" in scope
    ? await db.$queryRaw<{ items: bigint; bytes: bigint }[]>`
      SELECT
        (SELECT COUNT(*) FROM library_assets WHERE owner_gm_id = ${scope.ownerGmId}::uuid AND object_key NOT LIKE 'shipped:%')::bigint AS items,
        ((SELECT COALESCE(SUM(byte_size), 0) FROM library_assets WHERE owner_gm_id = ${scope.ownerGmId}::uuid AND object_key NOT LIKE 'shipped:%')
          + (SELECT COALESCE(SUM(u.byte_size), 0) FROM room_uploads u JOIN rooms r ON r.id = u.room_id WHERE r.owner_gm_id = ${scope.ownerGmId}::uuid)
          + (SELECT COALESCE(SUM((f.value->>'bytes')::bigint), 0) FROM dice_looks d, jsonb_each(d.faces) f WHERE d.owner_gm_id = ${scope.ownerGmId}::uuid)
        )::bigint AS bytes`
    : await db.$queryRaw<{ items: bigint; bytes: bigint }[]>`
      SELECT 0::bigint AS items, COALESCE(SUM(byte_size), 0)::bigint AS bytes FROM room_uploads WHERE room_id = ${scope.roomId}::uuid`;
  return { items: Number(rows[0]!.items), bytes: Number(rows[0]!.bytes) };
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
    byteSize: row.byteSize,
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
