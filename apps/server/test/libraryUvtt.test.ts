import { readFile, readdir, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryMapBoard, UvttPreparation, replayTo, type CommandInput, type LibraryUvttImportResponse } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { UvttValidationPool } from "../src/uvtt/validationPool";
import { startServer, viewFor, type TestClient } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { store = new MemoryRoomStore(); server = await startServer(store); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); vi.restoreAllMocks(); });
async function document(format: "png" | "webp" = "png") {
  const image = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#afafaf" } }).toFormat(format).toBuffer();
  return { format: 0.3, image: image.toString("base64"), resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: -0.25, y: 0.5 } },
    line_of_sight: [[{ x: -0.25, y: 2.5 }, { x: 7.75, y: 2.5 }]],
    objects_line_of_sight: [[{ x: 1, y: 4 }, { x: 2, y: 4 }]],
    portals: [{ bounds: [{ x: 2, y: 2.5 }, { x: 3, y: 2.5 }], position: { x: 1, y: 0 }, rotation: 0.8, closed: false, freestanding: true }], lights: [],
  };
}
async function upload(cookie?: string, data?: string | Uint8Array, endpoint = "/api/library/uvtt/imports", headers: Record<string, string> = {}, filename = "my_map.dd2vtt") {
  const body = new FormData(); body.append("file", new Blob([data ?? JSON.stringify(await document())]), filename);
  return fetch(server.base + endpoint, { method: "POST", headers: { ...headers, ...(cookie ? { cookie } : {}) }, body });
}
const ok = async (client: TestClient, command: CommandInput) => {
  const result = await client.command(command); expect(result.type).toBe("ack");
  if (result.type !== "ack") throw new Error(result.message); return result;
};
const connect = async (creds: Parameters<typeof server.connect>[0]) => { const client = await server.connect(creds); clients.push(client); return client; };

describe("UVTT maps in the asset library (KAN-43/44, FR-GM-06/07/12)", () => {
  it.each(["png", "webp"] as const)("saves a complete %s map with exact phase and portal metadata, without a room", async (format) => {
    const account = await server.signUp(); const other = await server.signUp(); const input = await document(format);
    const response = await upload(account.cookie, JSON.stringify(input), undefined, {}, format === "png" ? "my_map.uvtt" : "my_map.df2vtt");
    expect(response.status).toBe(201);
    const { asset, diagnostics } = await response.json() as LibraryUvttImportResponse;
    expect(asset).toMatchObject({ name: "my map", width: 400, height: 300, grid: { cellSize: 50, offsetX: 12.5, offsetY: 25 } });
    expect(JSON.stringify({ asset, diagnostics })).not.toMatch(/objectKey|ownerGmId|"image"|"walls"/);
    expect(diagnostics).toEqual([expect.objectContaining({ path: "lights", severity: "warning" })]);
    const board = LibraryMapBoard.parse(await (await fetch(`${server.base}/api/library/${asset.id}/board`, { headers: { cookie: account.cookie } })).json());
    expect(board.walls).toHaveLength(4); expect(board.fog).toEqual([]);
    expect(board.walls.find((w: { uvttPortal?: unknown }) => w.uvttPortal)).toMatchObject({
      a: { x: 112.5, y: 100 }, b: { x: 162.5, y: 100 }, uvttPortal: { position: { x: 62.5, y: -25 }, rotation: 0.8, closed: false, freestanding: true },
    });
    expect(board.walls.some((w: { source?: string }) => w.source === "objects_line_of_sight")).toBe(true);
    const image = await readFile(`${server.uploadDir}/${asset.url.split("/").at(-1)}`);
    expect(image).toEqual(Buffer.from(input.image, "base64"));
    expect(await store.findDetection({ scope: "library", id: asset.id })).toBeNull();
    expect((await fetch(`${server.base}/api/library/${asset.id}/board`, { headers: { cookie: other.cookie } })).status).toBe(404);
    expect((await fetch(`${server.base}/api/library/${asset.id}/board`)).status).toBe(401);
  });

  it("imports the complete checked-in Dungeondraft export with its independently recorded portal geometry", async () => {
    const account = await server.signUp();
    const bytes = gunzipSync(await readFile(new URL("./fixtures/uvtt/dungeondraft-test.dd2vtt.gz", import.meta.url)));
    const response = await upload(account.cookie, bytes);
    expect(response.status).toBe(201);
    const { asset } = await response.json() as LibraryUvttImportResponse;
    const owner = (await store.findUserById(account.view!.id))!.ownerId;
    const board = (await store.findAssetBoard(asset.id, owner))!;
    expect(asset).toMatchObject({ width: 1280, height: 1280, grid: { cellSize: 64 } });
    const portals = board.walls.filter((wall) => wall.uvttPortal);
    expect(portals).toHaveLength(3);
    expect(portals[0]).toMatchObject({ a: { x: 704, y: 384 }, uvttPortal: { position: { x: 736, y: 384 } } });
  });

  it("authorizes and checks origin before validation, and rate-limits attempts", async () => {
    const validate = vi.spyOn(UvttValidationPool.prototype, "validate");
    expect((await upload()).status).toBe(401);
    const account = await server.signUp();
    expect((await upload(account.cookie, undefined, undefined, { origin: "https://elsewhere.invalid" })).status).toBe(403);
    expect(validate).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) expect((await upload(account.cookie, "{")).status).toBe(422);
    expect((await upload(account.cookie)).status).toBe(429);
    expect(validate).toHaveBeenCalledTimes(5);
  });

  it("rejects malformed supported data without assets, and removes image/raw files after failed storage", async () => {
    const account = await server.signUp(); const owner = (await store.findUserById(account.view!.id))!.ownerId;
    const create = vi.spyOn(store, "createAsset");
    const malformed = await document(); malformed.portals[0]!.bounds = [{ x: 1, y: 2 }];
    expect((await upload(account.cookie, JSON.stringify(malformed))).status).toBe(422);
    expect(create).not.toHaveBeenCalled();
    const validate = vi.spyOn(UvttValidationPool.prototype, "validate");
    create.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await upload(account.cookie)).status).toBe(500);
    expect(await store.listAssets(owner)).toEqual([]);
    expect(await readdir(server.uploadDir)).toEqual([]);
    await expect(stat(validate.mock.calls[0]![0])).rejects.toMatchObject({ code: "ENOENT" });
    expect((await upload(account.cookie)).status).toBe(201);
    expect(await store.listAssets(owner)).toHaveLength(1);
  });

  it("refuses a session ended during image validation", async () => {
    const account = await server.signUp(); const validate = UvttValidationPool.prototype.validate;
    vi.spyOn(UvttValidationPool.prototype, "validate").mockImplementationOnce(async function (this: UvttValidationPool, filename, grid) {
      const result = await validate.call(this, filename, grid);
      await account.request("POST", "/api/auth/signout"); return result;
    });
    expect((await upload(account.cookie)).status).toBe(401);
    expect(await readdir(server.uploadDir)).toEqual([]);
  });

  it("honors room imports' library option, keeps the saved copy on cancel/room deletion, and scopes ownership", async () => {
    const creds = await server.createRoom(); const other = await server.signUp();
    const endpoint = `/api/rooms/${creds.roomId}/uvtt/imports?saveToLibrary=1`;
    const authorization = `Bearer ${creds.guestToken}`;
    expect((await upload(undefined, undefined, endpoint, { authorization })).status).toBe(401);
    expect((await upload(other.cookie, undefined, endpoint, { authorization })).status).toBe(403);
    const response = await upload(creds.cookie, undefined, endpoint, { authorization }); expect(response.status).toBe(201);
    const prep = UvttPreparation.parse(await response.json()); expect(prep.map.assetId).toBeTruthy();
    const owner = (await store.findRoomOwner(creds.roomId))!;
    expect(await store.findAssetBoard(prep.map.assetId!, owner)).toEqual({ walls: prep.walls, fog: [] });
    await fetch(`${server.base}/api/rooms/${creds.roomId}/uvtt/imports/${prep.id}`, { method: "DELETE", headers: { authorization } });
    const deleted = await store.deleteRoom(creds.roomId);
    expect(deleted?.uploadKeys).toEqual([]);
    expect(await store.findAsset(prep.map.assetId!, owner)).toMatchObject({ grid: prep.grid });
    expect(await stat(`${server.uploadDir}/${prep.map.url.split("/").at(-1)}`)).toBeTruthy();
  });

  it("keeps unchecked room uploads room-owned and out of the library", async () => {
    const creds = await server.createRoom();
    const response = await upload(creds.cookie, undefined, `/api/rooms/${creds.roomId}/uvtt/imports`, { authorization: `Bearer ${creds.guestToken}` });
    expect(response.status).toBe(201); const prep = UvttPreparation.parse(await response.json());
    expect(prep.map.assetId).toBeUndefined();
    expect(await store.listAssets((await store.findRoomOwner(creds.roomId))!)).toEqual([]);
    expect(await store.hasRoomUpload(creds.roomId, prep.map.url.split("/").at(-1)!)).toBe(true);
  });

  it("round trips edited library portals and fractional phase through room export and library re-import", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds); const input = await document("webp");
    const { asset } = await (await upload(creds.cookie, JSON.stringify(input))).json() as LibraryUvttImportResponse;
    const owner = (await store.findRoomOwner(creds.roomId))!;
    const board = (await store.findAssetBoard(asset.id, owner))!;
    const edited = { walls: board.walls.map((wall) => wall.uvttPortal ? { ...wall, uvttPortal: { ...wall.uvttPortal, closed: true, rotation: 0, position: { x: 127.5, y: 88.25 } } } : wall), fog: [] };
    const response = await fetch(`${server.base}/api/library/${asset.id}/board`, { method: "PUT", headers: { cookie: creds.cookie, "content-type": "application/json" }, body: JSON.stringify(edited) });
    expect(response.status).toBe(200);
    await ok(gm, { type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: asset.grid!, includeLibraryBoard: true });
    const exported = await fetch(`${server.base}/api/rooms/${creds.roomId}/uvtt/export`, { headers: { authorization: `Bearer ${creds.guestToken}` } });
    expect(exported.status).toBe(200);
    const next = await upload(creds.cookie, await exported.text()); expect(next.status).toBe(201);
    const roundTrip = (await next.json() as LibraryUvttImportResponse).asset;
    expect(roundTrip.grid).toEqual(asset.grid);
    const closePoint = (point: { x: number; y: number }) => ({ x: expect.closeTo(point.x, 6), y: expect.closeTo(point.y, 6) });
    expect(await store.findAssetBoard(roundTrip.id, owner)).toEqual({ ...edited, walls: edited.walls.map((wall) => ({
      ...wall, a: closePoint(wall.a), b: closePoint(wall.b),
      ...(wall.uvttPortal?.position && { uvttPortal: { ...wall.uvttPortal, position: closePoint(wall.uvttPortal.position) } }),
    })) });
    expect(await readFile(`${server.uploadDir}/${roundTrip.url.split("/").at(-1)}`)).toEqual(Buffer.from(input.image, "base64"));
  });

  it("places saved geometry in one filtered, undoable scene across two GMs and two players, then reloads it", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds); const gm2 = await connect(creds);
    const alice = await connect(await server.join(creds.inviteCode, "Alice")); const bob = await connect(await server.join(creds.inviteCode, "Bob"));
    const response = await upload(creds.cookie); const { asset } = await response.json() as LibraryUvttImportResponse;
    const savedBoard = (await store.findAssetBoard(asset.id, (await store.findRoomOwner(creds.roomId))!))!;
    const libraryFog = { shape: "rect", points: [{ x: 100, y: 60 }, { x: 150, y: 60 }, { x: 150, y: 100 }, { x: 100, y: 100 }] };
    const saved = await fetch(`${server.base}/api/library/${asset.id}/board`, { method: "PUT", headers: { cookie: creds.cookie, "content-type": "application/json" }, body: JSON.stringify({ ...savedBoard, fog: [libraryFog] }) });
    expect(saved.status).toBe(200);
    await ok(gm, { type: "scene.setMap", map: { url: "/old.png", width: 800, height: 600 } });
    await ok(gm, { type: "wall.add", walls: [{ a: { x: 0, y: 20 }, b: { x: 10, y: 20 } }] });
    await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 80, y: 80 } } });
    await ok(gm, { type: "token.create", name: "Hero", position: { x: 241, y: 161 }, ownerIds: [alice.participantId] });
    await ok(gm, { type: "token.create", name: "Secret dragon", position: { x: 677, y: 533 }, hidden: true, ownerIds: [bob.participantId] });
    await alice.waitForSeq(gm.seq);
    const hero = Object.values(alice.state.tokens).find((t) => t.name === "Hero")!;
    await ok(alice, { type: "token.move", tokenId: hero.id, to: { x: 243, y: 163 } }); await gm.waitForSeq(alice.seq);
    const before = structuredClone(gm.state); const seq = gm.seq; const offsets = [alice.rawLog.length, bob.rawLog.length];
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id };
    const command: CommandInput = { type: "scene.setMap", map, grid: asset.grid!, includeLibraryBoard: true };
    vi.spyOn(store, "append").mockRejectedValueOnce(new Error("temporary append failure"));
    expect((await gm2.command(command)).type).toBe("rejected"); expect(gm2.seq).toBe(seq);
    expect(await ok(gm2, command)).toMatchObject({ seq: seq + 1 }); await gm.waitForSeq(gm2.seq);
    const applied = structuredClone(gm.state);
    expect(gm.state.scene).toEqual({ map, grid: asset.grid });
    expect(gm.state.tokens[hero.id]!.position).toEqual({ x: 121.5, y: 81.5 });
    expect(Object.values(gm.state.walls)).toHaveLength(4); expect(Object.values(gm.state.fog)).toEqual([expect.objectContaining(libraryFog)]);
    for (const [i, player] of [alice, bob].entries()) {
      await player.waitForSeq(gm.seq); expect(player.state).toEqual(viewFor(gm.state, player));
      const messages = player.rawLog.slice(offsets[i]).join("\n");
      for (const secret of ["uvttPortal", "objects_line_of_sight", '"previous"', '"wallChange"', '"fogChange"', '"tokenChanges"', "Secret dragon"]) expect(messages).not.toContain(secret);
    }
    const commandId = gm.state.undo.at(-1)!.commandId;
    await fetch(`${server.base}/api/library/${asset.id}/board`, { method: "PUT", headers: { cookie: creds.cookie, "content-type": "application/json" }, body: JSON.stringify({ walls: [], fog: [] }) });
    expect(gm.state.walls).toEqual(applied.walls); expect(gm.state.fog).toEqual(applied.fog);
    await ok(gm, { type: "history.undo", commandId });
    expect(gm.state.scene).toEqual(before.scene); expect(gm.state.tokens).toEqual(before.tokens); expect(gm.state.walls).toEqual(before.walls); expect(gm.state.fog).toEqual(before.fog);
    for (const player of [alice, bob]) { await player.waitForSeq(gm.seq); expect(player.state).toEqual(viewFor(gm.state, player)); }
    const log = await store.loadEvents(creds.roomId);
    expect(log.slice(seq).map((e) => e.event.type)).toEqual(["MapSet", "MapSet", "ActionUndone"]);
    const restarted = await startServer(store);
    try { const reconnected = await restarted.connect(creds); expect(reconnected.state).toEqual(replayTo(creds.roomId, log, gm.seq)); reconnected.close(); }
    finally { await restarted.close(); }
  });

  it("rejects other owners' library maps and player commands without changing the room", async () => {
    const own = await server.createRoom(); const other = await server.signUp();
    const { asset } = await (await upload(other.cookie)).json() as LibraryUvttImportResponse;
    const gm = await connect(own); const player = await connect(await server.join(own.inviteCode, "Player")); const seq = player.seq;
    const command: CommandInput = { type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, includeLibraryBoard: true };
    expect(await gm.command(command)).toMatchObject({ type: "rejected", code: "not_found" });
    expect(await player.command(command)).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(seq); expect(gm.state.scene.map).toBeNull();
  });
});
