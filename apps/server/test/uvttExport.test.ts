import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command, DEFAULT_GRID, UvttError, parseUvtt, normalizeUvtt, type GridSpec } from "@vtt/shared";
import { LiveRoom } from "../src/domain/liveRoom";
import { exportUvttScene, mapImageReader, type CapturedScene } from "../src/uvtt/exportScene";
import { LocalDiskAssetStore } from "../src/store/assetStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { animatedPng, animatedWebp } from "./uvttImageFixtures";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";

let dir: string; let store: MemoryRoomStore; let assets: LocalDiskAssetStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "uvtt-export-")); store = new MemoryRoomStore(); assets = new LocalDiskAssetStore(dir);
  await store.createRoom("room", "invite", { ownerGmId: "owner" });
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const grid = { ...DEFAULT_GRID, cellSize: 50, offsetX: 12.5, offsetY: 20 };
const snapshot = (url: string, editedGrid: GridSpec = grid): CapturedScene => ({ map: { url, width: 400, height: 300 }, grid: editedGrid, walls: {
  w: { id: "w", a: { x: 20.1234567, y: 40 }, b: { x: 100, y: 40 }, source: "objects_line_of_sight" },
  p: { id: "p", a: { x: 200, y: 10 }, b: { x: 200, y: 80 }, uvttPortal: { position: { x: 55, y: 70 }, rotation: 1.8, closed: false, freestanding: true } },
}, seq: 7 });
async function image(format: "png" | "jpeg" | "webp") {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: "#fe3f6a" } }).toFormat(format).toBuffer();
}

describe("UVTT safe applied-scene export (FR-GM-12, FR-GM-23)", () => {
  it.each(["png", "webp", "jpeg"] as const)("exports owned %s room assets with exact geometry and decoded pixels", async (format) => {
    const key = `${randomUUID()}.${format}`; const original = await image(format); await writeFile(path.join(dir, key), original);
    await store.recordRoomUpload("room", key, UPLOAD_ALLOWANCE);
    const scene = snapshot(`/uploads/${key}`);
    const output = await exportUvttScene(scene, mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null));
    const bytes = Buffer.from(output.image, "base64");
    if (format !== "jpeg") expect(bytes).toEqual(original);
    expect(await sharp(bytes).raw().toBuffer()).toEqual(await sharp(original).raw().toBuffer());
    const parsed = parseUvtt(output); const normalized = normalizeUvtt(parsed, scene.map!, DEFAULT_GRID);
    expect(normalized.grid).toEqual(grid);
    for (const [i, wall] of Object.values(scene.walls).entries()) {
      expect(normalized.walls[i]?.a.x).toBeCloseTo(wall.a.x, 6);
      if (wall.uvttPortal) {
        const portal = normalized.walls[i]?.uvttPortal;
        expect(portal?.closed).toBe(wall.uvttPortal.closed); expect(portal?.freestanding).toBe(wall.uvttPortal.freestanding); expect(portal?.rotation).toBe(wall.uvttPortal.rotation);
        expect(portal?.position?.x).toBeCloseTo(wall.uvttPortal.position!.x, 6); expect(portal?.position?.y).toBeCloseTo(wall.uvttPortal.position!.y, 6);
      } else expect(normalized.walls[i]?.uvttPortal).toBeUndefined();
    }
    expect(Object.keys(output)).toEqual(["format", "resolution", "line_of_sight", "objects_line_of_sight", "portals", "image"]);
  });
  it("reads only owned library records, including legacy references without assetId", async () => {
    const key = `${randomUUID()}.png`; const bytes = await image("png"); await writeFile(path.join(dir, key), bytes);
    await store.createAsset({ id: "art", ownerGmId: "owner", kind: "map", objectKey: key, url: `/uploads/${key}`, name: "Secret filename", width: 400, height: 300, grid: null, createdAt: new Date().toISOString() }, UPLOAD_ALLOWANCE);
    expect((await exportUvttScene(snapshot(`/uploads/${key}`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).image).toBe(bytes.toString("base64"));
    const noOwnership = snapshot(`/uploads/${key}`);
    noOwnership.map = { ...noOwnership.map!, assetId: "another-owner" };
    await expect(exportUvttScene(noOwnership, mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/Upload/);
  });
  it("supports shipped example maps through an explicit allowlist", async () => {
    await writeFile(path.join(dir, "map-ice.webp"), await image("webp"));
    expect((await exportUvttScene(snapshot("/img/map-ice.webp"), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, dir))).format).toBe(0.3);
    await writeFile(path.join(dir, "secret.webp"), await image("webp"));
    await expect(exportUvttScene(snapshot("/img/secret.webp"), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, dir))).rejects.toThrow(/Upload/);
    await expect(exportUvttScene(snapshot("/img/../secret.webp"), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, dir))).rejects.toThrow(UvttError);
  });
  it("rejects external URLs, foreign room uploads, fractional grids and changed image dimensions", async () => {
    const key = `${randomUUID()}.png`; await writeFile(path.join(dir, key), await image("png"));
    await store.createRoom("other", "invite2"); await store.recordRoomUpload("other", key, UPLOAD_ALLOWANCE);
    await expect(exportUvttScene(snapshot(`https://example.com/map.png`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/External/);
    await expect(exportUvttScene(snapshot(`/uploads/${key}`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/Upload/);
    await expect(exportUvttScene(snapshot(`/uploads/${key}`, { ...grid, cellSize: 50.2 }), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/integer/);
    await store.recordRoomUpload("room", key, UPLOAD_ALLOWANCE);
    const wrong = snapshot(`/uploads/${key}`); wrong.map = { ...wrong.map!, width: 399 };
    await expect(exportUvttScene(wrong, mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/dimensions/);
  });
  it("refuses animated and missing stored images with bounded guidance", async () => {
    const key = `${randomUUID()}.png`; await store.recordRoomUpload("room", key, UPLOAD_ALLOWANCE);
    await expect(exportUvttScene(snapshot(`/uploads/${key}`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/unavailable/);
    for (const bytes of [await animatedPng(), await animatedWebp()]) {
      await writeFile(path.join(dir, key), bytes);
      await expect(exportUvttScene(snapshot(`/uploads/${key}`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, null))).rejects.toThrow(/single-frame|animated/);
    }
    await expect(exportUvttScene(snapshot(`/uploads/${key}`), mapImageReader({ ownerId: "owner", roomId: "room" }, store, { ...assets, put: assets.put.bind(assets), delete: assets.delete.bind(assets), sizeOf: assets.sizeOf.bind(assets), readPrivate: async () => { throw new Error("Secret object path"); } }, null))).rejects.toThrow(/25 MiB/);
  });
  it("reads an immutable captured scene while later room activity proceeds", async () => {
    const key = `${randomUUID()}.png`; const bytes = await image("png"); await writeFile(path.join(dir, key), bytes); await store.recordRoomUpload("room", key, UPLOAD_ALLOWANCE);
    const scene = snapshot(`/uploads/${key}`);
    await store.append("room", 0, [
      { actorId: null, event: { type: "RoomCreated", name: "Captured scene" } },
      { actorId: null, event: { type: "ParticipantJoined", participant: { id: "gm", displayName: "GM", role: "gm" } } },
      { actorId: "gm", event: { type: "MapSet", map: scene.map, previous: null, gridChange: { grid, previous: DEFAULT_GRID }, tokenChanges: [], wallChange: { walls: Object.values(scene.walls), previous: [] } } },
    ]);
    const room = await LiveRoom.load("room", store);
    // Capture must wait for an earlier queued terrain edit, including its revision and sequence.
    const painting = room.submit("gm", Command.parse({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 0, end: 0, kind: "difficult" }], context: { boardEpoch: 1, revision: 1 } }));
    const captured = (await room.captureScene("gm"))!;
    expect((await painting).ok).toBe(true); expect(captured.terrainRevision).toBe(2);
    // Save to library reads base terrain from the same capture (ADR 0070).
    expect(captured.terrain).toEqual([{ row: 0, start: 0, end: 0, kind: "difficult" }]);
    expect(await room.captureScene("player")).toBeNull();
    let release!: () => void, started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const exporting = exportUvttScene(captured, mapImageReader({ ownerId: "owner", roomId: "room" }, store, { put: assets.put.bind(assets), delete: assets.delete.bind(assets), sizeOf: assets.sizeOf.bind(assets), readPrivate: async () => { started(); await gate; return bytes; } }, null));
    try {
      await reading;
      expect((await room.submit("gm", Command.parse({ type: "scene.setGrid", grid: { ...grid, cellSize: 70 }, resetTerrain: true }))).ok).toBe(true);
      expect((await room.submit("gm", Command.parse({ type: "scene.setMap", map: { ...scene.map!, url: "/changed.png" } }))).ok).toBe(true);
      expect(room.currentGrid().cellSize).toBe(70); expect(room.currentMap()?.url).toBe("/changed.png");
    } finally { release(); }
    const output = await exporting;
    expect(output.resolution.pixels_per_grid).toBe(50); expect(captured.seq).toBe(4);
    expect(captured.terrainRevision).toBe(2); expect(output).not.toHaveProperty("terrainRevision"); expect(output).not.toHaveProperty("terrain");
    expect(output.image).toBe(bytes.toString("base64")); expect(captured.walls).toEqual(scene.walls);
    // Export the shipped image itself, independently of the controlled allowlist fixture.
    const builtInDir = path.resolve(import.meta.dirname, "../../web/public/img");
    const builtIn = await readFile(path.join(builtInDir, "map-ice.webp"));
    const dimensions = await sharp(builtIn).metadata();
    expect(dimensions.width).toBe(3269);
    const example: CapturedScene = {
      map: { url: "/img/map-ice.webp", width: dimensions.width!, height: dimensions.height! },
      grid: { ...DEFAULT_GRID, cellSize: 70, offsetX: 47, offsetY: 46 }, walls: {}, seq: 3,
    };
    const builtInOutput = await exportUvttScene(example, mapImageReader({ ownerId: "owner", roomId: "room" }, store, assets, builtInDir));
    expect(Buffer.from(builtInOutput.image, "base64")).toEqual(builtIn);
    const imported = normalizeUvtt(parseUvtt(builtInOutput), example.map!, DEFAULT_GRID);
    expect(imported.grid.cellSize).toBe(70);
    expect(imported.grid.offsetX).toBeCloseTo(47, 9); expect(imported.grid.offsetY).toBeCloseTo(46, 9);
  });
});
