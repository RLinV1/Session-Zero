import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { RoomRegistry } from "../src/domain/roomRegistry";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { newGuestToken, startServer } from "./helpers";

function trackLeases() {
  const tracked = { open: 0, acquired: 0 };
  const acquire = RoomRegistry.prototype.acquire;
  vi.spyOn(RoomRegistry.prototype, "acquire").mockImplementation(async function (this: RoomRegistry, roomId: string) {
    const lease = await acquire.call(this, roomId);
    tracked.open++;
    tracked.acquired++;
    let done = false;
    return {
      room: lease.room,
      release: () => {
        if (!done) {
          done = true;
          tracked.open--;
        }
        lease.release();
      },
    };
  });
  return tracked;
}

describe("every path that serves a room leases it until it is done (PR 226 finding 4624326695)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("holds a lease from the socket handshake through attach, then lets go", async () => {
    const tracked = trackLeases();
    const attach = LiveRoom.prototype.attach;
    const atAttach: number[] = [];
    vi.spyOn(LiveRoom.prototype, "attach").mockImplementation(function (this: LiveRoom, client) {
      atAttach.push(tracked.open);
      return attach.call(this, client);
    });
    const server = await startServer();
    try {
      const creds = await server.createRoom();
      const gm = await server.connect(creds);
      expect(atAttach).toEqual([1]);
      expect(tracked.open).toBe(0);
      gm.close();
    } finally {
      await server.close();
    }
  });

  it("holds a lease while the preparation body is still arriving, and releases it after", async () => {
    const tracked = trackLeases();
    const server = await startServer();
    try {
      const creds = await server.createRoom();
      const before = tracked.open;
      const url = new URL(`${server.base}/api/rooms/${creds.roomId}/preparation`);
      const outcome = new Promise<number>((resolve, reject) => {
        const req = request(url, { method: "POST", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json", "content-length": "40" } }, (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        });
        req.on("error", reject);
        req.write('{"type":');
        setTimeout(() => {
          expect(tracked.open).toBe(before + 1);
          req.end('"scene.savePreparation", "edits": []}');
        }, 200);
      });
      expect([400, 409, 403, 200]).toContain(await outcome);
      await vi.waitFor(() => expect(tracked.open).toBe(before));
    } finally {
      await server.close();
    }
  });

  it("releases the lease when room creation fails before its first event", async () => {
    class BrokenDefaults extends MemoryRoomStore {
      override async getRoomDefaults(...args: Parameters<MemoryRoomStore["getRoomDefaults"]>): ReturnType<MemoryRoomStore["getRoomDefaults"]> {
        void args;
        throw new Error("defaults unavailable");
      }
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tracked = trackLeases();
    const server = await startServer(new BrokenDefaults());
    try {
      const { cookie } = await server.signUp();
      const res = await fetch(server.base + "/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ roomName: "Broken", displayName: "GM", guestToken: newGuestToken() }),
      });
      expect(res.status).toBe(500);
      expect(tracked.acquired).toBeGreaterThan(0);
      expect(tracked.open).toBe(0);
    } finally {
      await server.close();
    }
  });
});
