import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { RoomRegistry } from "../src/domain/roomRegistry";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const gmRoom = async () => {
  const store = new MemoryRoomStore();
  const roomId = randomUUID();
  const gmId = randomUUID();
  await store.createRoom(roomId, randomUUID().slice(0, 10));
  const room = await LiveRoom.load(roomId, store);
  await room.appendSystem(gmId, [
    { type: "RoomCreated", name: "Crypt" },
    { type: "ParticipantJoined", participant: { id: gmId, role: "gm", displayName: "GM" } },
  ]);
  return { store, roomId, gmId, room };
};

describe("M1: a bad event is never persisted (FR-GM-15, FR-SYNC-04)", () => {
  it("refuses an event that cannot be reduced, leaving the log and the room usable", async () => {
    const { store, roomId, gmId, room } = await gmRoom();
    const before = (await store.loadEvents(roomId)).length;

    await expect(room.appendSystem(gmId, [{ type: "TokenHiddenSet", tokenId: "missing", hidden: true, previous: false }])).rejects.toThrow();

    expect(await store.loadEvents(roomId)).toHaveLength(before);
    await expect(room.appendSystem(gmId, [{ type: "ParticipantRenamed", participantId: gmId, displayName: "Boss", previous: "GM" }])).resolves.toBeDefined();
    const reloaded = await LiveRoom.load(roomId, store);
    expect(reloaded).toBeDefined();
  });
});

describe("M3: idle rooms are evicted (FR-SYNC-04)", () => {
  it("drops a room with no clients that has been idle, and reloads it on demand", async () => {
    const { store, roomId } = await gmRoom();
    const registry = new RoomRegistry(store);
    const first = await registry.get(roomId);
    await registry.evictIdle(60_000, Date.now());
    expect(await registry.loaded(roomId)).toBe(first);
    await registry.evictIdle(60_000, Date.now() + 120_000);
    expect(await registry.loaded(roomId)).toBeNull();
    expect(await registry.get(roomId)).not.toBe(first);
  });
});
