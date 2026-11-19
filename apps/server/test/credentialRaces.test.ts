import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { RoomRegistry } from "../src/domain/roomRegistry";
import { hashToken } from "../src/domain/credentials";
import { MAX_EVENTS_PER_ROOM } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { CredentialConflictError } from "../src/store/roomStore";
import { TestClient, newGuestToken, startServer } from "./helpers";

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

class FailingMembers extends MemoryRoomStore {
  failures = 0;
  override async putMember(...args: Parameters<MemoryRoomStore["putMember"]>) {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("membership store down");
    }
    return super.putMember(...args);
  }
}

class StuckLeave extends FailingMembers {
  appendsBroken = false;
  override async putMember(...args: Parameters<MemoryRoomStore["putMember"]>) {
    if (this.failures > 0) this.appendsBroken = true;
    return super.putMember(...args);
  }
  override async append(...args: Parameters<MemoryRoomStore["append"]>) {
    if (this.appendsBroken) throw new Error("event log down");
    return super.append(...args);
  }
}

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

  it("claims the credential before the join, so losing the race leaves no seat even when a leave would be refused (PR 226 finding 4624016567)", async () => {
    const store = new RacingStore();
    const server = await startServer(store);
    const submit = vi.spyOn(LiveRoom.prototype, "submit");
    try {
      const gm = await server.createRoom();
      store.conflicts = 1;
      const refused = await server.tryJoin(gm.inviteCode, "Racer");
      expect(refused.status).toBe(409);
      expect(submit.mock.calls.some(([, command]) => command.type === "participant.leave")).toBe(false);
      const events = await store.loadEvents(gm.roomId);
      expect(events.some((e) => e.event.type === "ParticipantJoined" && e.event.participant.displayName === "Racer")).toBe(false);
      expect(await store.findCredential(hashToken(refused.guestToken))).toBeNull();
      const again = await server.tryJoin(gm.inviteCode, "Racer");
      expect(again.status).toBe(200);
    } finally {
      submit.mockRestore();
      await server.close();
    }
  });

  it("takes the credential back when the join is rejected, so the same token can try again", async () => {
    const store = new RacingStore();
    const server = await startServer(store);
    try {
      const gm = await server.createRoom();
      const guestToken = newGuestToken();
      const join = (displayName: string) => fetch(`${server.base}/api/invites/${gm.inviteCode}/join`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName, guestToken }),
      });
      expect((await join("GM")).status).toBe(409);
      expect(await store.findCredential(hashToken(guestToken))).toBeNull();
      expect((await join("Fresh")).status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("removes the seat and the credential when the signed-in membership write fails after the join committed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new FailingMembers();
    const server = await startServer(store);
    try {
      const gm = await server.createRoom();
      const account = await server.signUp();
      store.failures = 1;
      const failed = await server.joinAs(account, gm.inviteCode, "Doomed");
      expect(failed.status).toBe(500);
      expect(await store.findCredential(hashToken(failed.guestToken))).toBeNull();
      const events = await store.loadEvents(gm.roomId);
      const joined = events.find((e) => e.event.type === "ParticipantJoined" && e.event.participant.displayName === "Doomed");
      expect(joined).toBeDefined();
      expect(events.some((e) => e.event.type === "ParticipantLeft" && joined?.event.type === "ParticipantJoined" && e.event.participant.id === joined.event.participant.id)).toBe(true);
      const again = await server.joinAs(account, gm.inviteCode, "Doomed");
      expect(again.status).toBe(200);
    } finally {
      vi.restoreAllMocks();
      await server.close();
    }
  });

  it("keeps the credential of a seat it could not remove, so the same token can resume it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new StuckLeave();
    const server = await startServer(store);
    try {
      const gm = await server.createRoom();
      const account = await server.signUp();
      store.failures = 1;
      const failed = await server.joinAs(account, gm.inviteCode, "Stuck");
      expect(failed.status).toBe(500);
      const credential = await store.findCredential(hashToken(failed.guestToken));
      expect(credential).not.toBeNull();
      const events = await store.loadEvents(gm.roomId);
      expect(events.some((e) => e.event.type === "ParticipantLeft" && e.event.participant.id === credential!.participantId)).toBe(false);
      store.appendsBroken = false;
      const client = await TestClient.connect(server.base, { roomId: gm.roomId, guestToken: failed.guestToken });
      expect(client.state?.participants[credential!.participantId]?.displayName).toBe("Stuck");
    } finally {
      vi.restoreAllMocks();
      await server.close();
    }
  });

  it("answers 409 and leaves no seat when the credential race is lost with the room log at its ceiling", async () => {
    let full = false;
    const store = new RacingStore();
    const get = RoomRegistry.prototype.get;
    vi.spyOn(RoomRegistry.prototype, "get").mockImplementation(async function (this: RoomRegistry, roomId: string) {
      const room = await get.call(this, roomId);
      if (room && full) Object.assign(room, { seq: MAX_EVENTS_PER_ROOM });
      return room;
    });
    const server = await startServer(store);
    const submit = vi.spyOn(LiveRoom.prototype, "submit");
    try {
      const gm = await server.createRoom();
      full = true;
store.conflicts = 1;
      const refused = await server.tryJoin(gm.inviteCode, "Racer");
      expect(refused.status).toBe(409);
      expect(submit.mock.calls.some(([, command]) => command.type === "participant.leave")).toBe(false);
      const events = await store.loadEvents(gm.roomId);
      expect(events.some((e) => e.event.type === "ParticipantJoined" && e.event.participant.displayName === "Racer")).toBe(false);
      expect(await store.findCredential(hashToken(refused.guestToken))).toBeNull();
    } finally {
      vi.restoreAllMocks();
      await server.close();
    }
  });
});
