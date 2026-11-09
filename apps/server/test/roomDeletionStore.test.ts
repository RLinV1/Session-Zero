import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { RedisSeqSource } from "../src/store/redisSeq";
import type { RoomStore } from "../src/store/roomStore";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";

/**
 * `deleteRoom` contract for both stores (ADR 0009). Postgres runs only when DATABASE_URL is
 * set, and the Redis case only when REDIS_URL is set too, like postgresStore.test.ts.
 */
const url = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const seq = url && redisUrl ? await RedisSeqSource.connect(redisUrl) : null;
const postgres = url ? await PostgresRoomStore.connect(url, seq) : null;

afterAll(async () => {
  await postgres?.close();
  await seq?.close();
});

const stores: [string, RoomStore | null][] = [
  ["memory", new MemoryRoomStore()],
  ["postgres", postgres],
];

for (const [label, store] of stores) {
  describe.skipIf(!store)(`room deletion store contract: ${label} (KAN-72)`, () => {
    const s = () => store!;

    /** A room with an owner, a player, a revoked player, a library asset in use and an upload. */
    const furnishedRoom = async (gmId: string, name: string) => {
      const roomId = randomUUID();
      const inviteCode = randomUUID().slice(0, 10);
      await s().createRoom(roomId, inviteCode, { ownerGmId: gmId, name });
      await s().append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name } }]);
      const live = randomUUID();
      const revoked = randomUUID();
      const revokedParticipant = randomUUID();
      await s().saveCredential(live, { roomId, participantId: randomUUID() });
      await s().saveCredential(revoked, { roomId, participantId: revokedParticipant });
      await s().revokeCredentials(roomId, revokedParticipant);
      const uploadKey = `${randomUUID()}.png`;
      await s().recordRoomUpload(roomId, uploadKey, UPLOAD_ALLOWANCE);
      return { roomId, inviteCode, live, revoked, uploadKey };
    };

    const libraryAsset = async (gmId: string) => {
      const id = randomUUID();
      await s().createAsset({
        id,
        ownerGmId: gmId,
        kind: "map",
        objectKey: `${randomUUID()}.png`,
        url: "/uploads/map.png",
        name: "Crypt map",
        width: 100,
        height: 100,
        grid: DEFAULT_GRID,
        createdAt: new Date().toISOString(),
      }, UPLOAD_ALLOWANCE);
      return id;
    };

    it("reports the room's owner, null for an unowned room and undefined for no room", async () => {
      const gmId = await s().registerGm(randomUUID());
      const owned = await furnishedRoom(gmId, "Owned");
      const unowned = randomUUID();
      await s().createRoom(unowned, randomUUID().slice(0, 10));

      expect(await s().findRoomOwner(owned.roomId)).toBe(gmId);
      expect(await s().findRoomOwner(unowned)).toBeNull();
      expect(await s().findRoomOwner(randomUUID())).toBeUndefined();
    });

    it("removes every trace of the room and returns its upload keys", async () => {
      const gmId = await s().registerGm(randomUUID());
      const room = await furnishedRoom(gmId, "Crypt");
      const assetId = await libraryAsset(gmId);
      await s().setAssetRefs(room.roomId, [assetId]);

      expect(await s().deleteRoom(room.roomId)).toEqual({ uploadKeys: [room.uploadKey] });

      expect(await s().roomExists(room.roomId)).toBe(false);
      expect(await s().findRoomOwner(room.roomId)).toBeUndefined();
      expect(await s().findRoomByInvite(room.inviteCode)).toBeNull();
      expect(await s().getInviteCode(room.roomId)).toBeNull();
      expect(await s().findCredential(room.live)).toBeNull();
      expect(await s().findRevokedCredential(room.revoked)).toBeNull();
      expect(await s().loadEvents(room.roomId)).toEqual([]);
      expect((await s().listOwnedRooms(gmId)).map((r) => r.id)).not.toContain(room.roomId);
      expect(await s().assetUsage(assetId, gmId)).toEqual([]);
    });

    it("leaves the library asset, the GM and the GM's other rooms untouched", async () => {
      const gmId = await s().registerGm(randomUUID());
      const crypt = await furnishedRoom(gmId, "Crypt");
      const keep = await furnishedRoom(gmId, "Keep");
      const assetId = await libraryAsset(gmId);
      await s().setAssetRefs(crypt.roomId, [assetId]);
      await s().setAssetRefs(keep.roomId, [assetId]);

      await s().deleteRoom(crypt.roomId);

      expect(await s().findAsset(assetId, gmId)).not.toBeNull();
      expect(await s().assetUsage(assetId, gmId)).toEqual([{ id: keep.roomId, name: "Keep" }]);
      expect((await s().listOwnedRooms(gmId)).map((r) => r.id)).toEqual([keep.roomId]);
      expect(await s().findRoomByInvite(keep.inviteCode)).toBe(keep.roomId);
      expect(await s().findCredential(keep.live)).not.toBeNull();
      expect(await s().findRevokedCredential(keep.revoked)).not.toBeNull();
      expect(await s().loadEvents(keep.roomId)).toHaveLength(1);
      expect(await s().deleteRoom(keep.roomId)).toEqual({ uploadKeys: [keep.uploadKey] });
    });

    it("returns null for a room that does not exist, including a second delete", async () => {
      const gmId = await s().registerGm(randomUUID());
      const room = await furnishedRoom(gmId, "Twice");
      expect(await s().deleteRoom(randomUUID())).toBeNull();
      await s().deleteRoom(room.roomId);
      expect(await s().deleteRoom(room.roomId)).toBeNull();
    });
  });
}

describe.skipIf(!postgres)("room deletion on Postgres (KAN-72, ADR 0009)", () => {
  it("rolls back entirely when the delete fails partway through", async () => {
    const admin = new PrismaClient({ datasources: { db: { url: url! } } });
    const gmId = await postgres!.registerGm(randomUUID());
    const roomId = randomUUID();
    await postgres!.createRoom(roomId, randomUUID().slice(0, 10), { ownerGmId: gmId, name: "Stuck" });
    await postgres!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Stuck" } }]);
    const cred = randomUUID();
    await postgres!.saveCredential(cred, { roomId, participantId: randomUUID() });
    await postgres!.recordRoomUpload(roomId, "stuck.png", UPLOAD_ALLOWANCE);

    // The room row is removed last; failing there proves the children's deletes roll back.
    const trigger = `fail_delete_${roomId.replace(/-/g, "")}`;
    await admin.$executeRawUnsafe(`
      CREATE FUNCTION ${trigger}() RETURNS trigger AS $$
      BEGIN
        IF OLD.id = '${roomId}' THEN RAISE EXCEPTION 'forced failure'; END IF;
        RETURN OLD;
      END $$ LANGUAGE plpgsql`);
    await admin.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      await expect(postgres!.deleteRoom(roomId)).rejects.toThrow();
    } finally {
      await admin.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON rooms`);
      await admin.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
      await admin.$disconnect();
    }

    expect(await postgres!.roomExists(roomId)).toBe(true);
    expect(await postgres!.loadEvents(roomId)).toHaveLength(1);
    expect(await postgres!.findCredential(cred)).not.toBeNull();
    expect(await postgres!.deleteRoom(roomId)).toEqual({ uploadKeys: ["stuck.png"] });
  });

  it.skipIf(!seq)("clears the room's Redis seq counter", async () => {
    const redis = new Redis(redisUrl!);
    const roomId = randomUUID();
    await postgres!.createRoom(roomId, randomUUID().slice(0, 10));
    await postgres!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Counted" } }]);
    expect(await redis.get(`room:${roomId}:seq`)).toBe("1");

    await postgres!.deleteRoom(roomId);

    expect(await redis.get(`room:${roomId}:seq`)).toBeNull();
    await redis.quit();
  });
});
