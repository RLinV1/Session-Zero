import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomRegistry } from "../src/domain/roomRegistry";
import { hashToken } from "../src/domain/credentials";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { CredentialConflictError } from "../src/store/roomStore";
import { newGuestToken, startServer } from "./helpers";

class RacingStore extends MemoryRoomStore {
  conflicts = 0;
  deleted: string[] = [];
  override async deleteRoom(roomId: string) {
    this.deleted.push(roomId);
    return super.deleteRoom(roomId);
  }
  override async saveCredential(...args: Parameters<MemoryRoomStore["saveCredential"]>) {
    if (this.conflicts > 0) {
      this.conflicts--;
      throw new CredentialConflictError();
    }
    return super.saveCredential(...args);
  }
}

describe("a room being served is not evicted mid-request (PR 226 finding 4624016556)", () => {
  const setup = async () => {
    const store = new MemoryRoomStore();
    const roomId = randomUUID();
    await store.createRoom(roomId, randomUUID().slice(0, 10));
    return { registry: new RoomRegistry(store), roomId };
  };

  it("keeps an acquired room through eviction and evicts it once released", async () => {
    const { registry, roomId } = await setup();
    const lease = await registry.acquire(roomId);
    await registry.evictIdle(60_000, Date.now() + 120_000);
    expect(await registry.loaded(roomId)).toBe(lease.room);
    lease.release();
    await registry.evictIdle(60_000, Date.now() + 120_000);
    expect(await registry.loaded(roomId)).toBeNull();
  });

  it("holds the room until every lease is released", async () => {
    const { registry, roomId } = await setup();
    const a = await registry.acquire(roomId);
    const b = await registry.acquire(roomId);
    a.release();
    a.release();
    await registry.evictIdle(60_000, Date.now() + 120_000);
    expect(await registry.loaded(roomId)).toBe(b.room);
    b.release();
    await registry.evictIdle(60_000, Date.now() + 120_000);
    expect(await registry.loaded(roomId)).toBeNull();
  });

  it("leaves nothing leased when the room does not exist", async () => {
    const { registry } = await setup();
    const lease = await registry.acquire(randomUUID());
    expect(lease.room).toBeNull();
    lease.release();
  });
});

describe("a lost credential race leaves no half-made state (PR 226 findings 4624016562, 4624016567)", () => {
  it("deletes the room and answers 409 when room creation loses the credential save", async () => {
    const store = new RacingStore();
    const server = await startServer(store);
    try {
      const { cookie } = await server.signUp();
      store.conflicts = 1;
      const res = await fetch(server.base + "/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ roomName: "Race", displayName: "GM", guestToken: newGuestToken() }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/already holds a seat/);
      expect(store.deleted).toHaveLength(1);
      expect(await store.roomExists(store.deleted[0]!)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("makes the just-joined participant leave and answers 409 when the join loses the credential save", async () => {
    const store = new RacingStore();
    const server = await startServer(store);
    try {
      const gm = await server.createRoom();
      store.conflicts = 1;
      const refused = await server.tryJoin(gm.inviteCode, "Racer");
      expect(refused.status).toBe(409);
      const events = await store.loadEvents(gm.roomId);
      const joined = events.find((e) => e.event.type === "ParticipantJoined" && e.event.participant.displayName === "Racer");
      expect(joined).toBeDefined();
      expect(events.some((e) => e.event.type === "ParticipantLeft" && e.event.participant.displayName === "Racer")).toBe(true);
      expect(await store.findCredential(hashToken(refused.guestToken))).toBeNull();
      const again = await server.tryJoin(gm.inviteCode, "Racer");
      expect(again.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
