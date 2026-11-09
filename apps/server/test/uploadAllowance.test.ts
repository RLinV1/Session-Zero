import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceLookView, LibraryAsset } from "@vtt/shared";
import { LocalDiskAssetStore } from "../src/store/assetStore";
import { UPLOAD_ALLOWANCE, type UploadAllowance } from "../src/store/libraryStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import type { NewRoomOptions } from "../src/store/libraryStore";
import { startServer, type TestClient } from "./helpers";
import { pngOfSize } from "./pngOfSize";

const NO_LIMIT: UploadAllowance = { maxItems: Number.MAX_SAFE_INTEGER, maxBytes: Number.MAX_SAFE_INTEGER };
const { maxBytes, maxItems } = UPLOAD_ALLOWANCE;
const PNG = pngOfSize(64, 64);
const LIBRARY_FULL = "Your library can hold up to 1,000 items. Delete some items to make room.";
const STORAGE_FULL = "This image doesn't fit in your 2 GB of image storage. Delete library art, dice pictures or rooms you no longer need to make room.";

/** Every room it creates has no owner, as rooms from before ownership do. */
class OwnerlessRooms extends MemoryRoomStore {
  override async createRoom(roomId: string, inviteCode: string, options: NewRoomOptions = {}) {
    await super.createRoom(roomId, inviteCode, { ...options, ownerGmId: null });
  }
}

async function uvttDocument() {
  const image = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#afafaf" } }).png().toBuffer();
  return JSON.stringify({ format: 0.3, image: image.toString("base64"), resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
    line_of_sight: [], objects_line_of_sight: [], portals: [], lights: [] });
}

describe("upload allowance (FR-GM-02)", () => {
  let store: MemoryRoomStore;
  let server: Awaited<ReturnType<typeof startServer>>;
  const clients: TestClient[] = [];
  beforeEach(async () => {
    store = new MemoryRoomStore();
    server = await startServer(store);
  });
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    await server.close();
    vi.restoreAllMocks();
  });

  const account = async () => {
    const email = `${randomUUID()}@example.com`;
    const signedIn = await server.signUp({ email });
    return { cookie: signedIn.cookie, json: signedIn.json.bind(signedIn), ownerId: (await store.findUserByEmail(email))!.ownerId };
  };
  /** Rows with no stored object behind them: only their sizes matter here. */
  const seed = async (ownerGmId: string, byteSize: number) => {
    const id = randomUUID();
    await store.createAsset({ id, ownerGmId, kind: "token", objectKey: `${id}.png`, url: `/uploads/${id}.png`, name: "Seeded",
      width: 1, height: 1, byteSize, grid: null, createdAt: new Date().toISOString() }, NO_LIMIT);
    return id;
  };
  const form = (fields: Record<string, string>, bytes: Uint8Array) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    data.append("file", new Blob([bytes], { type: "image/png" }), "art.png");
    return data;
  };
  const toLibrary = (cookie: string, bytes: Uint8Array = PNG) => fetch(`${server.base}/api/library`, {
    method: "POST", headers: { cookie }, body: form({ kind: "token", name: "Art", width: "64", height: "64" }, bytes),
  });
  const toRoom = (token: string, bytes: Uint8Array = PNG) => fetch(`${server.base}/api/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: form({ purpose: "token" }, bytes),
  });
  const toDie = (cookie: string, lookId: string, die: string, bytes: Uint8Array, side: number) => fetch(`${server.base}/api/library/dice/${lookId}/faces/${die}`, {
    method: "PUT", headers: { cookie }, body: form({ width: String(side), height: String(side) }, bytes),
  });
  const importUvtt = async (path: string, headers: Record<string, string>) => {
    const body = new FormData();
    body.append("file", new Blob([await uvttDocument()]), "map.uvtt");
    return fetch(server.base + path, { method: "POST", headers, body });
  };
  const stored = () => readdir(server.uploadDir);
  const expectRefused = async (res: Response, message: string) => {
    expect(res.status).toBe(409);
    expect(res.headers.get("retry-after")).toBeNull();
    expect(await res.json()).toEqual({ error: message });
  };

  it("refuses a full library before reading the file, naming the limit", async () => {
    const gm = await account();
    for (let i = 0; i < maxItems; i += 1) await seed(gm.ownerId, 0);
    const put = vi.spyOn(LocalDiskAssetStore.prototype, "put");
    await expectRefused(await toLibrary(gm.cookie), LIBRARY_FULL);
    expect(put).not.toHaveBeenCalled();
    expect(await stored()).toEqual([]);
    expect((await store.listAssets(gm.ownerId))).toHaveLength(maxItems);
  });

  it("doesn't count built-in maps toward the library's items", async () => {
    const gm = await account();
    const list = (await (await fetch(`${server.base}/api/library`, { headers: { cookie: gm.cookie } })).json()) as LibraryAsset[];
    expect(list.length).toBeGreaterThan(0);
    for (let i = 0; i < maxItems - 1; i += 1) await seed(gm.ownerId, 0);
    expect((await toLibrary(gm.cookie)).status).toBe(201);
    await expectRefused(await toLibrary(gm.cookie), LIBRARY_FULL);
  });

  it("refuses an account with no storage left before reading the file, on the library and in a room", async () => {
    const gm = await account();
    const room = await server.createRoom("GM", { cookie: gm.cookie });
    await seed(gm.ownerId, maxBytes);
    const put = vi.spyOn(LocalDiskAssetStore.prototype, "put");
    await expectRefused(await toLibrary(gm.cookie), STORAGE_FULL);
    await expectRefused(await toRoom(room.guestToken), STORAGE_FULL);
    expect(put).not.toHaveBeenCalled();
    expect(await stored()).toEqual([]);
  });

  it("refuses an image that doesn't fit once its size is known, and leaves nothing behind", async () => {
    const gm = await account();
    const room = await server.createRoom("GM", { cookie: gm.cookie });
    await seed(gm.ownerId, maxBytes - PNG.length + 1);
    await expectRefused(await toLibrary(gm.cookie), STORAGE_FULL);
    const record = vi.spyOn(store, "recordRoomUpload");
    await expectRefused(await toRoom(room.guestToken), STORAGE_FULL);
    await expect(record.mock.results[0]!.value).rejects.toThrow();
    expect(await stored()).toEqual([]);
    expect(await store.listAssets(gm.ownerId)).toHaveLength(1);
  });

  it("still accepts a smaller image after a larger one was refused", async () => {
    const gm = await account();
    const smaller = pngOfSize(1, 1);
    await seed(gm.ownerId, maxBytes - smaller.length);
    await expectRefused(await toLibrary(gm.cookie, PNG), STORAGE_FULL);
    expect((await toLibrary(gm.cookie, smaller)).status).toBe(201);
  });

  it("gives a room with no owner its own allowance", async () => {
    await server.close();
    const ownerless = new OwnerlessRooms();
    store = ownerless;
    server = await startServer(ownerless);
    const room = await server.createRoom();
    expect(await store.findRoomOwner(room.roomId)).toBeNull();
    expect((await toRoom(room.guestToken)).status).toBe(200);
    await store.recordRoomUpload(room.roomId, "seeded.png", NO_LIMIT, { byteSize: maxBytes });
    await expectRefused(await toRoom(room.guestToken), STORAGE_FULL);
  });

  it("allows a die's replacement at the limit, refuses one that grows the total, and keeps the picture", async () => {
    const gm = await account();
    const look = await gm.json<DiceLookView>("POST", "/api/library/dice", { name: "Jungle" });
    const small = pngOfSize(64, 64);
    const large = pngOfSize(512, 512);
    expect(large.length).toBeGreaterThan(small.length);
    await seed(gm.ownerId, maxBytes - small.length);

    expect((await toDie(gm.cookie, look.id, "d6", small, 64)).status).toBe(200);
    const before = await stored();
    expect((await toDie(gm.cookie, look.id, "d6", small, 64)).status).toBe(200);
    const afterSame = await stored();
    expect(afterSame).toHaveLength(1);
    expect(afterSame).not.toEqual(before);

    await expectRefused(await toDie(gm.cookie, look.id, "d6", large, 512), STORAGE_FULL);
    expect(await stored()).toEqual(afterSame);
    expect((await store.findDiceLook(look.id, gm.ownerId))!.faces.d6).toMatchObject({ width: 64, height: 64 });
  });

  it("counts UVTT imports to the library", async () => {
    const gm = await account();
    await seed(gm.ownerId, maxBytes);
    await expectRefused(await importUvtt("/api/library/uvtt/imports", { cookie: gm.cookie }), STORAGE_FULL);
    expect(await stored()).toEqual([]);
    expect(await store.listAssets(gm.ownerId)).toHaveLength(1);
  });

  it("counts UVTT imports into a room", async () => {
    const gm = await account();
    const room = await server.createRoom("GM", { cookie: gm.cookie });
    await seed(gm.ownerId, maxBytes);
    await expectRefused(await importUvtt(`/api/rooms/${room.roomId}/uvtt/imports`, { authorization: `Bearer ${room.guestToken}` }), STORAGE_FULL);
    expect(await stored()).toEqual([]);
  });

  it("records a UVTT image's size", async () => {
    const gm = await account();
    const res = await importUvtt("/api/library/uvtt/imports", { cookie: gm.cookie });
    expect(res.status).toBe(201);
    expect((await store.uploadUsage({ ownerGmId: gm.ownerId })).bytes).toBeGreaterThan(0);
  });

  it("keeps everything working for an account over the limit, until it uploads", async () => {
    const gm = await account();
    const upload = await toLibrary(gm.cookie);
    expect(upload.status).toBe(201);
    const art = (await upload.json()) as LibraryAsset;
    const big = await seed(gm.ownerId, maxBytes + 1024);

    const list = (await (await fetch(`${server.base}/api/library`, { headers: { cookie: gm.cookie } })).json()) as LibraryAsset[];
    expect(list.map((a) => a.id)).toContain(art.id);
    expect((await fetch(server.base + art.url)).status).toBe(200);

    const room = await server.createRoom("GM", { cookie: gm.cookie });
    const client = await server.connect(room);
    clients.push(client);
    expect(await client.command({ type: "scene.setMap", map: { url: art.url, width: art.width, height: art.height, assetId: art.id } })).toMatchObject({ type: "ack" });

    const rename = await fetch(`${server.base}/api/library/${art.id}`, {
      method: "PATCH", headers: { cookie: gm.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    expect(await rename.json()).toMatchObject({ name: "Renamed" });

    await expectRefused(await toLibrary(gm.cookie), STORAGE_FULL);
    expect((await fetch(`${server.base}/api/library/${big}`, { method: "DELETE", headers: { cookie: gm.cookie } })).status).toBe(204);
    expect((await toLibrary(gm.cookie)).status).toBe(201);
  });

  it("frees a room's share when the room is deleted", async () => {
    const gm = await account();
    const room = await server.createRoom("GM", { cookie: gm.cookie });
    expect((await toRoom(room.guestToken)).status).toBe(200);
    expect(await store.uploadUsage({ ownerGmId: gm.ownerId })).toMatchObject({ bytes: PNG.length });
    await store.deleteRoom(room.roomId);
    expect(await store.uploadUsage({ ownerGmId: gm.ownerId })).toMatchObject({ bytes: 0 });
  });

  it("never sends byte sizes to a client", async () => {
    const gm = await account();
    const uploaded = await (await toLibrary(gm.cookie)).text();
    const listed = await (await fetch(`${server.base}/api/library`, { headers: { cookie: gm.cookie } })).text();
    const look = await gm.json<DiceLookView>("POST", "/api/library/dice", { name: "Jungle" });
    const face = await (await toDie(gm.cookie, look.id, "d6", PNG, 64)).text();
    const looks = await (await fetch(`${server.base}/api/library/dice`, { headers: { cookie: gm.cookie } })).text();
    for (const body of [uploaded, listed, face, looks]) {
      expect(body).not.toMatch(/byteSize|"bytes"|objectKey/);
    }
    expect(JSON.parse(face)).toMatchObject({ faces: { d6: { width: 64, height: 64 } } });
    expect((await store.findDiceLook(look.id, gm.ownerId))!.faces.d6!.bytes).toBe(PNG.length);
  });
});
