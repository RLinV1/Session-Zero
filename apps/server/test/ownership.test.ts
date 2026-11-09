import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GM_TOKEN_HEADER, type GmRoomSummary, type LegacySummary, type LibraryAsset } from "@vtt/shared";
import { hashToken } from "../src/domain/credentials";
import type { RoomStore } from "../src/store/roomStore";
import { newGuestToken, startServer } from "./helpers";
import { storeCases } from "./storeHarness";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A legacy GM device identity from before accounts, owning one of everything. Made directly in
 * the store: the server no longer creates device identities.
 */
async function seedLegacy(store: RoomStore) {
  const token = newGuestToken();
  const ownerGmId = await store.registerGm(hashToken(token));
  const roomId = randomUUID();
  await store.createRoom(roomId, randomUUID().slice(0, 10), { ownerGmId, name: "Old cave" });
  const assetId = randomUUID();
  const now = new Date().toISOString();
  await store.createAsset({
    id: assetId, ownerGmId, kind: "token", objectKey: `${randomUUID()}.png`, url: "/uploads/x.png",
    name: "Old goblin", width: 256, height: 256, grid: null, createdAt: now,
  }, UPLOAD_ALLOWANCE);
  await store.createCreature({
    id: randomUUID(), ownerGmId, name: "Goblin", size: 1, maxHp: 7, ac: 15, imageAssetId: assetId, createdAt: now,
  });
  await store.createDiceLook({ id: randomUUID(), ownerGmId, name: "Old dice", faces: {}, createdAt: now, updatedAt: now });
  return { token, ownerGmId, roomId, assetId };
}

describe("only accounts create (asset-library, library-creatures, gm-dashboard; FR-GM-01)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  const roomBody = () => ({ roomName: "Cave", displayName: "GM", guestToken: newGuestToken() });
  const imageForm = () => {
    const form = new FormData();
    form.append("kind", "token");
    form.append("name", "Orc art");
    form.append("width", "256");
    form.append("height", "256");
    form.append("file", new Blob([PNG], { type: "image/png" }), "cave.png");
    return form;
  };

  it("refuses room creation, library upload and creature creation with no session, even with a legacy token", async () => {
    const legacy = await seedLegacy(server.store);
    const variants: Record<string, string>[] = [{}, { [GM_TOKEN_HEADER]: legacy.token }];
    for (const headers of variants) {
      const room = await fetch(`${server.base}/api/rooms`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(roomBody()),
      });
      expect(room.status).toBe(401);
      const upload = await fetch(`${server.base}/api/library`, { method: "POST", headers, body: imageForm() });
      expect(upload.status).toBe(401);
      const creature = await fetch(`${server.base}/api/library/creatures`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ name: "Orc" }),
      });
      expect(creature.status).toBe(401);
    }
    expect(await server.store.ownedCounts(legacy.ownerGmId)).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });
  });

  it("makes what a signed-in account creates its own", async () => {
    const sam = await server.signUp();
    const room = await sam.json<{ roomId: string }>("POST", "/api/rooms", roomBody());
    const upload = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie: sam.cookie }, body: imageForm() });
    expect(upload.status).toBe(201);
    const asset = (await upload.json()) as LibraryAsset;
    await sam.json("POST", "/api/library/creatures", { name: "Orc", imageAssetId: asset.id });

    const ownerId = (await server.store.findUserById(sam.view!.id))!.ownerId;
    expect(await server.store.findRoomOwner(room.roomId)).toBe(ownerId);
    expect(await server.store.ownedCounts(ownerId)).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 0 });
  });

  it("still parses a room request from an older client that sends gmToken", async () => {
    const sam = await server.signUp();
    const res = await sam.request("POST", "/api/rooms", { ...roomBody(), gmToken: newGuestToken() });
    expect(res.status).toBe(200);
  });

  it("lets a legacy token still read, rename and delete what it owns", async () => {
    const legacy = await seedLegacy(server.store);
    const headers = { [GM_TOKEN_HEADER]: legacy.token };
    const rooms = (await (await fetch(`${server.base}/api/gm/rooms`, { headers })).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.name)).toEqual(["Old cave"]);
    const renamed = await fetch(`${server.base}/api/library/${legacy.assetId}`, {
      method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    expect(renamed.status).toBe(200);
    expect((await fetch(`${server.base}/api/library/${legacy.assetId}`, { method: "DELETE", headers })).status).toBe(204);
  });
});

describe("moving a legacy device identity into an account (user-accounts, ADR 0017 O2)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  const claim = (cookie: string, token: string) =>
    fetch(`${server.base}/api/gm/legacy/claim`, { method: "POST", headers: { cookie, [GM_TOKEN_HEADER]: token } });

  it("reports what the token owns, and 401 for a token the server doesn't know", async () => {
    const legacy = await seedLegacy(server.store);
    const ok = await fetch(`${server.base}/api/gm/legacy`, { headers: { [GM_TOKEN_HEADER]: legacy.token } });
    expect(await ok.json()).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });
    const unknown = await fetch(`${server.base}/api/gm/legacy`, { headers: { [GM_TOKEN_HEADER]: newGuestToken() } });
    expect(unknown.status).toBe(401);
  });

  it("moves rooms, assets, creatures and dice looks, and the old token stops working", async () => {
    const legacy = await seedLegacy(server.store);
    const sam = await server.signUp();
    const res = await claim(sam.cookie, legacy.token);
    expect(res.status).toBe(200);
    expect((await res.json()) as LegacySummary).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });

    const ownerId = (await server.store.findUserById(sam.view!.id))!.ownerId;
    expect(await server.store.ownedCounts(ownerId)).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });
    expect((await sam.json<GmRoomSummary[]>("GET", "/api/gm/rooms")).map((r) => r.name)).toEqual(["Old cave"]);
    const old = await fetch(`${server.base}/api/library`, { headers: { [GM_TOKEN_HEADER]: legacy.token } });
    expect(old.status).toBe(401);
  });

  it("works once: a second claim, from this account or another, finds nothing", async () => {
    const legacy = await seedLegacy(server.store);
    const sam = await server.signUp();
    const alex = await server.signUp();
    expect((await claim(sam.cookie, legacy.token)).status).toBe(200);
    expect((await claim(sam.cookie, legacy.token)).status).toBe(404);
    expect((await claim(alex.cookie, legacy.token)).status).toBe(404);
    const alexOwner = (await server.store.findUserById(alex.view!.id))!.ownerId;
    expect(await server.store.ownedCounts(alexOwner)).toEqual({ rooms: 0, assets: 0, creatures: 0, diceLooks: 0 });
  });

  it("needs a session; signing in alone moves nothing", async () => {
    const legacy = await seedLegacy(server.store);
    const res = await fetch(`${server.base}/api/gm/legacy/claim`, { method: "POST", headers: { [GM_TOKEN_HEADER]: legacy.token } });
    expect(res.status).toBe(401);
    await server.signUp();
    expect(await server.store.ownedCounts(legacy.ownerGmId)).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });
  });
});

describe.each(storeCases)("claiming in the %s store (ADR 0017 O2)", (_name, makeStore) => {
  const store = makeStore();

  it("never treats an account's own owner row as a device row", async () => {
    const a = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@x.com`, displayName: "A", passwordHash: "x" });
    const b = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@x.com`, displayName: "B", passwordHash: "x" });
    expect(await store.claimDeviceOwner(a.ownerId, b.ownerId)).toBeNull();
  });

  it("moves nothing when the move fails partway", async () => {
    const legacy = await seedLegacy(store);
    // An owner id with no row: the first repoint already breaks a foreign key in Postgres. The
    // memory store has no foreign keys, so only Postgres can fail here.
    if (_name !== "postgres") return;
    await expect(store.claimDeviceOwner(legacy.ownerGmId, randomUUID())).rejects.toThrow();
    expect(await store.ownedCounts(legacy.ownerGmId)).toEqual({ rooms: 1, assets: 1, creatures: 1, diceLooks: 1 });
    expect(await store.findGm(hashToken(legacy.token))).toBe(legacy.ownerGmId);
  });
});
