import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newGuestToken, startServer, type HttpAccount } from "./helpers";
import { MAX_OWNED_ROOMS } from "../src/domain/roomLifecycle";
import { RateLimiter } from "../src/identity/rateLimit";
import { randomUUID } from "node:crypto";
import { DEFAULT_GRID } from "@vtt/shared";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";

let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.close());

const create = (who: HttpAccount) =>
  who.request("POST", "/api/rooms", { roomName: "Test", displayName: "GM", guestToken: newGuestToken() });
const owned = async (who: HttpAccount) => server.store.listOwnedRoomIds((await server.store.findUserById(who.view!.id))!.ownerId);
const edit = (who: HttpAccount, mapAssetId: string) =>
  who.request("POST", "/api/library/encounter-edits", { mapAssetId, guestToken: newGuestToken() });
async function mapFor(who: HttpAccount) {
  const id = randomUUID();
  const ownerGmId = (await server.store.findUserById(who.view!.id))!.ownerId;
  await server.store.createAsset({ id, ownerGmId, kind: "map", objectKey: id, url: `/uploads/${id}.png`, name: "Map", width: 700, height: 700, grid: DEFAULT_GRID, createdAt: new Date().toISOString() }, UPLOAD_ALLOWANCE);
  return id;
}

describe("room creation limits (FR-GM-01)", () => {
  it("refuses the 21st room in an hour with Retry-After, per account", async () => {
    const sam = await server.signUp();
    const other = await server.signUp();
    for (let i = 0; i < 20; i++) expect((await create(sam)).status).toBe(200);
    const res = await create(sam);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await res.json()) as { error: string }).error).toMatch(/lot of rooms/);
    expect(await owned(sam)).toHaveLength(20);
    expect((await create(other)).status).toBe(200);
  });

  it("refuses the 101st owned room, and deleting one frees a place", async () => {
    server.app.limits.roomCreationsPerAccount = new RateLimiter(1000, 60 * 60_000);
    const sam = await server.signUp();
    for (let i = 0; i < MAX_OWNED_ROOMS; i++) expect((await create(sam)).status).toBe(200);
    const res = await create(sam);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/100 rooms/);
    const ids = await owned(sam);
    expect(ids).toHaveLength(MAX_OWNED_ROOMS);

    expect((await sam.request("DELETE", `/api/rooms/${ids[0]}`)).status).toBe(204);
    expect((await create(sam)).status).toBe(200);
    expect(await owned(sam)).toHaveLength(MAX_OWNED_ROOMS);
  });

  it.each([false, true])("keeps concurrent requests from exceeding the owned-room cap (mixed endpoints: %s)", async (mixed) => {
    const sam = await server.signUp();
    const mapId = await mapFor(sam);
    const ownerGmId = (await server.store.findUserById(sam.view!.id))!.ownerId;
    for (let i = 0; i < MAX_OWNED_ROOMS - 1; i++) {
      await server.store.createRoom(`existing-${i}`, `invite-${i}`, { ownerGmId, name: "Existing" });
    }
    const createRoom = server.store.createRoom.bind(server.store);
    // A database write yields while another request reads the owner's room count.
    vi.spyOn(server.store, "createRoom").mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return createRoom(...args);
    });
    const responses = await Promise.all([create(sam), mixed ? edit(sam, mapId) : create(sam), create(sam)]);
    expect(responses.filter((res) => res.ok)).toHaveLength(1);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(2);
    expect(await owned(sam)).toHaveLength(MAX_OWNED_ROOMS);
  });

  it("shares the hourly budget with temporary editing rooms", async () => {
    const sam = await server.signUp();
    const mapId = await mapFor(sam);
    for (let i = 0; i < 20; i++) expect((await edit(sam, mapId)).status).toBe(201);
    for (const res of [await create(sam), await edit(sam, mapId)]) {
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(((await res.json()) as { error: string }).error).toMatch(/lot of rooms/);
    }
    expect(await owned(sam)).toHaveLength(20);
  });

  it.each(["en", "zh-TW"])("refuses temporary editing rooms at the owned-room cap in %s", async (locale) => {
    const sam = await server.signUp();
    const mapId = await mapFor(sam);
    const ownerGmId = (await server.store.findUserById(sam.view!.id))!.ownerId;
    for (let i = 0; i < MAX_OWNED_ROOMS; i++) await server.store.createRoom(`existing-${i}`, `invite-${i}`, { ownerGmId, name: "Existing" });
    const res = await sam.request("POST", "/api/library/encounter-edits", { mapAssetId: mapId, guestToken: newGuestToken() }, { "accept-language": locale });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeNull();
    expect(((await res.json()) as { error: string }).error).toMatch(locale === "en" ? /100 rooms/ : /房間/);
    expect(await owned(sam)).toHaveLength(MAX_OWNED_ROOMS);
  });

  it.each(["room", "template-edit", "map-edit"])("does not spend the creation budget on invalid templates or maps (%s)", async (entrypoint) => {
    const sam = await server.signUp();
    for (let i = 0; i < 20; i++) {
      const res = await sam.request("POST", entrypoint === "room" ? "/api/rooms" : "/api/library/encounter-edits", {
        ...(entrypoint === "room" && { roomName: "Test", displayName: "GM" }),
        guestToken: newGuestToken(),
        ...(entrypoint === "map-edit" ? { mapAssetId: randomUUID() } : { templateId: randomUUID() }),
      });
      expect(res.status).toBe(entrypoint === "map-edit" ? 400 : 404);
    }
    expect((await create(sam)).status).toBe(200);
    expect(await owned(sam)).toHaveLength(1);
  });
});
