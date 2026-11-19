import { request } from "node:http";
import { io } from "socket.io-client";
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

function slowGet() {
  const get = RoomRegistry.prototype.get;
  vi.spyOn(RoomRegistry.prototype, "get").mockImplementation(async function (this: RoomRegistry, roomId: string) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return get.call(this, roomId);
  });
}

class SlowCredentials extends MemoryRoomStore {
  slow = false;
  override async findCredential(...args: Parameters<MemoryRoomStore["findCredential"]>) {
    if (this.slow) await new Promise((resolve) => setTimeout(resolve, 300));
    return super.findCredential(...args);
  }
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

  it("releases the lease of a request that closed while the room was still being acquired", async () => {
    const tracked = trackLeases();
    const server = await startServer();
    try {
      const creds = await server.createRoom();
      slowGet();
      const url = new URL(`${server.base}/api/rooms/${creds.roomId}/preparation`);
      const controller = new AbortController();
      const before = tracked.acquired;
      const pending = fetch(url, {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);
      await vi.waitFor(() => expect(tracked.acquired).toBe(before + 1));
      controller.abort();
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(tracked.open).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("releases the socket lease when the connection drops during acquisition", async () => {
    const tracked = trackLeases();
    const server = await startServer();
    try {
      const creds = await server.createRoom();
      slowGet();
      const before = tracked.acquired;
      const socket = io(server.base, { auth: { roomId: creds.roomId, guestToken: creds.guestToken }, transports: ["websocket"], reconnection: false });
      await vi.waitFor(() => expect(tracked.acquired).toBe(before + 1));
      socket.close();
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(tracked.open).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("keeps a map-library save's lease until the save settles", async () => {
    const tracked = trackLeases();
    const server = await startServer();
    try {
      const creds = await server.createRoom();
      const res = await fetch(`${server.base}/api/rooms/${creds.roomId}/map/library`, {
        method: "POST",
        headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json", cookie: creds.cookie },
        body: JSON.stringify({}),
      });
      await res.arrayBuffer();
      expect(tracked.acquired).toBeGreaterThan(0);
      await vi.waitFor(() => expect(tracked.open).toBe(0));
    } finally {
      await server.close();
    }
  });

  it("takes no socket lease when the connection drops during the credential lookup", async () => {
    const tracked = trackLeases();
    const store = new SlowCredentials();
    const server = await startServer(store);
    try {
      const creds = await server.createRoom();
      const before = tracked.acquired;
      store.slow = true;
      const socket = io(server.base, { auth: { roomId: creds.roomId, guestToken: creds.guestToken }, transports: ["websocket"], reconnection: false });
      await new Promise<void>((resolve) => socket.once("connect_error", () => resolve()).once("connect", () => resolve()).io.engine?.once("open", () => resolve()));
      socket.close();
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(tracked.acquired).toBe(before);
      expect(tracked.open).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("takes no request lease when the request aborts during the credential lookup", async () => {
    const tracked = trackLeases();
    const store = new SlowCredentials();
    const server = await startServer(store);
    try {
      const creds = await server.createRoom();
      const before = tracked.acquired;
      store.slow = true;
      const controller = new AbortController();
      const pending = fetch(`${server.base}/api/rooms/${creds.roomId}/preparation`, {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 100));
      controller.abort();
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(tracked.acquired).toBe(before);
      expect(tracked.open).toBe(0);
    } finally {
      await server.close();
    }
  });
});
