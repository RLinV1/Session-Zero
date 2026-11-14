import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, SaveMapToLibraryResult, sharedMsg, type CommandInput, type LibraryAsset } from "@vtt/shared";
import { LiveRoom } from "../src/domain/liveRoom";
import { UPLOAD_ALLOWANCE, UploadAllowanceError } from "../src/store/libraryStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, viewFor, type TestClient } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { store = new MemoryRoomStore(); server = await startServer(store); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); vi.restoreAllMocks(); });

const png = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#4a7a52" } }).png().toBuffer();
const connect = async (creds: Parameters<typeof server.connect>[0]) => { const client = await server.connect(creds); clients.push(client); return client; };
const ok = async (client: TestClient, command: CommandInput) => {
  const result = await client.command(command);
  if (result.type !== "ack") throw new Error(JSON.stringify(result));
};
async function roomUpload(token: string, bytes: Uint8Array) {
  const body = new FormData();
  body.append("purpose", "map"); body.append("width", "400"); body.append("height", "300");
  body.append("file", new Blob([bytes], { type: "image/png" }), "cave.png");
  const res = await fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
  expect(res.status).toBe(200);
  return ((await res.json()) as { url: string }).url;
}
async function libraryUpload(cookie: string, bytes: Uint8Array) {
  const body = new FormData();
  body.append("kind", "map"); body.append("name", "Goblin Cave"); body.append("width", "400"); body.append("height", "300");
  body.append("file", new Blob([bytes], { type: "image/png" }), "cave.png");
  const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body });
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}
const save = (creds: { roomId: string; guestToken: string }, cookie: string | null, body: unknown = {}) =>
  fetch(`${server.base}/api/rooms/${creds.roomId}/map/library`, {
    method: "POST", headers: { authorization: `Bearer ${creds.guestToken}`, ...(cookie ? { cookie } : {}), "content-type": "application/json" }, body: JSON.stringify(body),
  });
const wall = { a: { x: 70, y: 0 }, b: { x: 70, y: 140 } };
const door = { a: { x: 140, y: 0 }, b: { x: 140, y: 70 }, portal: { kind: "door", state: "closed" } } as const;
const fog = { shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] } as const;

describe("save a room's map to the library (asset-library, FR-GM-17, ADR 0070)", () => {
  it("copies a map uploaded straight into the room, links the room to it, and overwrites that copy next time", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const alice = await connect(await server.join(creds.inviteCode, "Alice"));
    const bytes = await png();
    const url = await roomUpload(creds.guestToken, bytes);
    await ok(gm, { type: "scene.setMap", map: { url, width: 400, height: 300 }, grid: DEFAULT_GRID });
    await ok(gm, { type: "wall.add", walls: [wall, door] });
    await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } });
    await ok(gm, { type: "terrain.paint", layerId: "base", paint: [{ row: 1, start: 1, end: 2, kind: "difficult" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } });

    const res = await save(creds, creds.cookie);
    expect(res.status).toBe(201);
    const first = SaveMapToLibraryResult.parse(await res.json());
    expect(first).toMatchObject({ created: true, name: "Scene 1" });
    const owner = (await store.findRoomOwner(creds.roomId))!;
    const asset = (await store.findAsset(first.assetId, owner))!;
    expect(asset.url).not.toBe(url);
    expect(await readFile(path.join(server.uploadDir, asset.url.split("/").at(-1)!))).toEqual(bytes);
    const prepared = (await store.findAssetPreparation(first.assetId, owner))!;
    expect(prepared.grid).toEqual(DEFAULT_GRID);
    expect(prepared.board.walls).toEqual([wall, door]);
    expect(prepared.board.fog).toEqual([{ shape: "rect", points: expect.arrayContaining([...fog.points]) }]);
    expect(prepared.board.fog[0]!.points).toHaveLength(4);
    expect(prepared.board.terrain).toEqual([{ row: 1, start: 1, end: 2, kind: "difficult" }]);
    await vi.waitFor(() => expect(gm.state.scene.map?.assetId).toBe(first.assetId));
    // The board looks the same to everyone; players get only the filtered view.
    await vi.waitFor(() => expect(alice.state).toEqual(viewFor(gm.state, alice)));
    expect(gm.state.undo.at(-1)).toMatchObject({ undoable: false });

    await ok(gm, { type: "wall.add", walls: [{ a: { x: 210, y: 0 }, b: { x: 210, y: 70 } }] });
    const second = SaveMapToLibraryResult.parse(await (await save(creds, creds.cookie)).json());
    expect(second).toEqual({ assetId: first.assetId, name: "Scene 1", created: false });
    expect((await store.findAssetPreparation(first.assetId, owner))!.board.walls).toHaveLength(3);
    expect((await store.listAssets(owner)).filter((a) => a.kind === "map" && a.id === first.assetId)).toHaveLength(1);
  });

  it("completely replaces the library map the room's map came from", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const asset = await libraryUpload(creds.cookie, await png());
    const libraryFog = { shape: "rect", points: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }, { x: 200, y: 260 }] };
    const put = await fetch(`${server.base}/api/library/${asset.id}/board`, { method: "PUT", headers: { cookie: creds.cookie, "content-type": "application/json" }, body: JSON.stringify({ walls: [], fog: [libraryFog] }) });
    expect(put.status).toBe(200);
    await ok(gm, { type: "scene.setMap", map: { url: asset.url, width: 400, height: 300, assetId: asset.id }, grid: { ...DEFAULT_GRID, cellSize: 50 } });
    await ok(gm, { type: "wall.add", walls: [wall] });
    const res = await save(creds, creds.cookie);
    expect(res.status).toBe(200);
    expect(SaveMapToLibraryResult.parse(await res.json())).toEqual({ assetId: asset.id, name: "Goblin Cave", created: false });
    const owner = (await store.findRoomOwner(creds.roomId))!;
    const prepared = (await store.findAssetPreparation(asset.id, owner))!;
    expect(prepared.grid?.cellSize).toBe(50);
    expect(prepared.board.walls).toEqual([wall]);
    // The room has no fog, so the library map's fog is gone.
    expect(prepared.board.fog).toEqual([]);
    expect((await store.findAsset(asset.id, owner))!.url).toBe(asset.url);
  });

  it("saves a built-in map as a new copy and leaves the built-in alone", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    await ok(gm, { type: "scene.setMap", map: { url: "/img/map-ice.webp", width: 3269, height: 1882 }, grid: { ...DEFAULT_GRID, cellSize: 70, offsetX: 47, offsetY: 46 } });
    await ok(gm, { type: "wall.add", walls: [wall] });
    const res = await save(creds, creds.cookie);
    expect(res.status).toBe(201);
    const result = SaveMapToLibraryResult.parse(await res.json());
    expect(result).toMatchObject({ name: "Hollowfrost Keep", created: true });
    const owner = (await store.findRoomOwner(creds.roomId))!;
    const copy = (await store.findAsset(result.assetId, owner))!;
    expect(copy.url).toMatch(/^\/uploads\//);
    expect(copy.objectKey).not.toMatch(/^shipped:/);
    expect((await store.findAssetBoard(result.assetId, owner))!.walls).toEqual([wall]);
    await vi.waitFor(() => expect(gm.state.scene.map).toMatchObject({ url: "/img/map-ice.webp", assetId: result.assetId }));
  });

  it("saves and links a scene the GM is preparing privately, leaving the live board alone", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const alice = await connect(await server.join(creds.inviteCode, "Alice"));
    const live = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.setMap", map: { url: live, width: 400, height: 300 } });
    await ok(gm, { type: "scene.create", name: "Crypt", activate: false });
    const sceneId = Object.keys(gm.state.savedScenes!).find((id) => gm.state.sceneNames![id] === "Crypt")!;
    const crypt = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.prepare", sceneId, command: { type: "scene.setMap", map: { url: crypt, width: 400, height: 300 } } });
    await ok(gm, { type: "scene.prepare", sceneId, command: { type: "wall.add", walls: [wall] } });
    const res = await save(creds, creds.cookie, { sceneId });
    expect(res.status).toBe(201);
    const result = SaveMapToLibraryResult.parse(await res.json());
    expect(result.name).toBe("Crypt");
    const owner = (await store.findRoomOwner(creds.roomId))!;
    expect((await store.findAssetBoard(result.assetId, owner))!.walls).toEqual([wall]);
    await vi.waitFor(() => expect(gm.state.savedScenes![sceneId]!.table.scene.map?.assetId).toBe(result.assetId));
    expect(gm.state.scene.map?.assetId).toBeUndefined();
    // The private scene's link never reaches a player: they learn only that a seq passed.
    await alice.waitForSeq(gm.seq);
    const raw = alice.rawLog.join("\n");
    expect(raw).not.toContain(result.assetId); expect(raw).not.toContain(crypt);
    expect((await save(creds, creds.cookie, { sceneId: "no-such-scene" })).status).toBe(404);
  });

  it("creates nothing when the upload allowance is full", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const url = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.setMap", map: { url, width: 400, height: 300 } });
    vi.spyOn(store, "createAsset").mockRejectedValueOnce(new UploadAllowanceError("items", UPLOAD_ALLOWANCE));
    const res = await save(creds, creds.cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/library can hold/);
    expect(await store.listAssets((await store.findRoomOwner(creds.roomId))!)).toEqual([]);
    expect(gm.state.scene.map?.assetId).toBeUndefined();
  });

  it("removes the copy again when the room refuses the link", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const url = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.setMap", map: { url, width: 400, height: 300 } });
    const submit = LiveRoom.prototype.submit;
    vi.spyOn(LiveRoom.prototype, "submit").mockImplementation(function (this: LiveRoom, actorId, command) {
      return command.type === "scene.linkMap"
        ? Promise.resolve({ ok: false, code: "invalid", message: "The map changed.", text: sharedMsg("reject.mapChangedSave") })
        : submit.call(this, actorId, command);
    });
    const res = await save(creds, creds.cookie);
    expect(res.status).toBe(409);
    expect(await store.listAssets((await store.findRoomOwner(creds.roomId))!)).toEqual([]);
  });

  it("makes one copy when two first saves race, and removes the other", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const url = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.setMap", map: { url, width: 400, height: 300 } });
    const results = await Promise.all([save(creds, creds.cookie), save(creds, creds.cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const owner = (await store.findRoomOwner(creds.roomId))!;
    const maps = (await store.listAssets(owner)).filter((a) => a.kind === "map" && a.url.startsWith("/uploads/"));
    expect(maps).toHaveLength(1);
    await vi.waitFor(() => expect(gm.state.scene.map?.assetId).toBe(maps[0]!.id));
  });

  it("refuses players, other accounts and callers who aren't signed in", async () => {
    const creds = await server.createRoom(); const gm = await connect(creds);
    const url = await roomUpload(creds.guestToken, await png());
    await ok(gm, { type: "scene.setMap", map: { url, width: 400, height: 300 } });
    const player = await server.join(creds.inviteCode, "Alice");
    expect((await save(player, creds.cookie)).status).toBe(403);
    const stranger = await server.signUp();
    expect((await save(creds, stranger.cookie)).status).toBe(404);
    expect((await save(creds, null)).status).toBe(401);
    expect((await save(creds, creds.cookie, { sceneId: 3 })).status).toBe(400);
    expect(await store.listAssets((await store.findRoomOwner(creds.roomId))!)).toEqual([]);
  });
});

describe("export a library map as UVTT (asset-library, FR-GM-12, ADR 0070)", () => {
  it("exports the map as last saved, says when doors lose their identity, and only to its owner", async () => {
    const { cookie } = await server.signUp();
    const asset = await libraryUpload(cookie, await png());
    const noGrid = await fetch(`${server.base}/api/library/${asset.id}/export`, { headers: { cookie } });
    expect(noGrid.status).toBe(409);
    expect((await fetch(`${server.base}/api/library/${asset.id}`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ grid: { ...DEFAULT_GRID, cellSize: 50 } }) })).status).toBe(200);
    expect((await fetch(`${server.base}/api/library/${asset.id}/board`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ walls: [wall, door], fog: [] }) })).status).toBe(200);
    const res = await fetch(`${server.base}/api/library/${asset.id}/export`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-uvtt-warnings")).toBe("portal_identity_omitted,portal_lock_omitted");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Goblin-Cave.uvtt"');
    const output = (await res.json()) as { resolution: { pixels_per_grid: number }; line_of_sight: unknown[]; portals: unknown[] };
    expect(output.resolution.pixels_per_grid).toBe(50);
    expect(output.line_of_sight).toHaveLength(1); expect(output.portals).toHaveLength(1);
    const other = await server.signUp();
    expect((await fetch(`${server.base}/api/library/${asset.id}/export`, { headers: { cookie: other.cookie } })).status).toBe(404);
    expect((await fetch(`${server.base}/api/library/${asset.id}/export`)).status).toBe(401);
  });

  it("no longer exports from a room", async () => {
    const creds = await server.createRoom();
    const res = await fetch(`${server.base}/api/rooms/${creds.roomId}/uvtt/export`, { headers: { authorization: `Bearer ${creds.guestToken}` } });
    expect(res.status).toBe(404);
  });
});
