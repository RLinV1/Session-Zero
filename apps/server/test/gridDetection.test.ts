import sharp from "sharp";
import { DETECTION_VERSION } from "../src/store/gridDetectionStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type GridDetectionStatus, type LibraryAsset } from "@vtt/shared";
import type { Detector } from "../src/domain/gridDetection";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

const PNG = await sharp({ create: { width: 768, height: 648, channels: 3, background: "#785634" } }).png().toBuffer();
const candidate = { cellSize: 64, offsetX: 7, offsetY: 13 };
const dimensions = { width: 768, height: 648 };

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  if (server) await server.close();
});

async function until<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for analysis: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function imageForm(fields: Record<string, string>, bytes = PNG, mimeType = "image/png") {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([bytes], { type: mimeType }), "sample.png");
  return form;
}

/** A signed-in GM's session cookie (ADR 0017): library routes act as the account. */
async function newGm() {
  return (await server.signUp()).cookie;
}

async function libraryUpload(cookie: string, kind: "map" | "token") {
  const res = await fetch(`${server.base}/api/library`, {
    method: "POST", headers: { cookie },
    body: imageForm({ kind, name: "Test art", width: "768", height: "648" }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}

async function roomUpload(token: string, purpose?: "map" | "token") {
  const fields: Record<string, string> = {};
  if (purpose) fields.purpose = purpose;
  if (purpose === "map") {
    fields.width = "768";
    fields.height = "648";
  }
  const res = await fetch(`${server.base}/api/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: imageForm(fields),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { url: string };
}

async function gmStatus(cookie: string, id: string) {
  const res = await fetch(`${server.base}/api/library/${id}/grid-detection`, { headers: { cookie } });
  return { status: res.status, body: (await res.json()) as GridDetectionStatus };
}

async function roomStatus(roomId: string, token: string, mapUrl = "") {
  const res = await fetch(`${server.base}/api/rooms/${roomId}/grid-detection`, {
    headers: { authorization: `Bearer ${token}`, "x-expected-map-url": mapUrl },
  });
  return { status: res.status, body: (await res.json()) as GridDetectionStatus };
}

describe("automatic map grid detection (FR-GM-03)", () => {
  const detector: Detector = async () => ({ status: "suggested", candidate });

  beforeEach(() => { server = undefined as unknown as typeof server; });

  it("uses decoded EXIF dimensions, keeps duplicate uploads independent and reuses no_grid while polling", async () => {
    const run = vi.fn<Detector>(async () => ({ status: "no_grid" }));
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const cookie = await newGm();
    const image = await sharp({ create: { width: 432, height: 240, channels: 3, background: "#123456" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const maps: LibraryAsset[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie },
        body: imageForm({ kind: "map", name: "EXIF", width: "700", height: "800" }, image, "image/jpeg") });
      expect(response.status).toBe(201);
      const map = await response.json() as LibraryAsset; maps.push(map);
      expect(map).toMatchObject({ width: 240, height: 432 });
      await until(() => gmStatus(cookie, map.id), (r) => r.body.status === "no_grid");
    }
    expect(maps[0]!.id).not.toBe(maps[1]!.id);
    for (let i = 0; i < 10; i++) for (const map of maps) expect((await gmStatus(cookie, map.id)).body.status).toBe("no_grid");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => call[1])).toEqual([{ width: 240, height: 432 }, { width: 240, height: 432 }]);
    const room = await server.createRoom();
    const response = await fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${room.guestToken}` },
      body: imageForm({ purpose: "map", width: "700", height: "800" }, image, "image/jpeg") });
    expect(response.status).toBe(200);
    const direct = await response.json() as { url: string };
    await until(() => roomStatus(room.roomId, room.guestToken, direct.url), (r) => r.body.status === "no_grid");
    expect(run.mock.calls.at(-1)?.[1]).toEqual({ width: 240, height: 432 });
  });

  it("records oversized images as terminal errors on both paths and leaves invalid images for manual fallback", async () => {
    const run = vi.fn(detector);
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const cookie = await newGm();
    const room = await server.createRoom("GM", { cookie });
    const oversized = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "#123456" } }).png().toBuffer();
    for (const scope of ["library", "room"] as const) {
      const response = await fetch(`${server.base}${scope === "library" ? "/api/library" : "/api/uploads"}`, {
        method: "POST", headers: scope === "library" ? { cookie } : { authorization: `Bearer ${room.guestToken}` },
        body: imageForm({ ...(scope === "library" ? { kind: "map", name: "Oversized" } : { purpose: "map" }), width: "5000", height: "4000" }, oversized),
      });
      expect(response.status).toBe(scope === "library" ? 201 : 200);
      const map = await response.json() as LibraryAsset;
      const target = scope === "library" ? { scope, id: map.id } : { scope, roomId: room.roomId, objectKey: map.url.slice("/uploads/".length) };
      expect(await server.store.findDetection(target)).toMatchObject({ status: "error", error: "oversized", attempt: 1 });
      expect(await server.store.retryDetection(target)).toBeNull();
    }
    const invalid = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie },
      body: imageForm({ kind: "map", name: "Invalid", width: "700", height: "800" }, Buffer.from("invalid")) });
    expect(invalid.status).toBe(201);
    expect((await gmStatus(cookie, (await invalid.json() as LibraryAsset).id)).body.status).toBe("error");
    expect(run).not.toHaveBeenCalled();
  });

  it("analyzes a new library map once, keeps its saved grid, and never reruns on placement or token upload", async () => {
    const run = vi.fn(detector);
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const gmToken = await newGm();
    const room = await server.createRoom("GM", { cookie: gmToken });
    const gm = await server.connect(room);
    clients.push(gm);
    const map = await libraryUpload(gmToken, "map");
    // Uploading establishes no grid (KAN-09); analysis only suggests one.
    expect(map.grid).toBeNull();
    expect(JSON.stringify(map)).not.toContain("detection");
    await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "suggested");
    expect(run).toHaveBeenCalledTimes(1);
    const art = await libraryUpload(gmToken, "token");
    expect((await gmStatus(gmToken, art.id)).status).toBe(404);
    const result = await gm.command({
      type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
    });
    expect(result.type).toBe("ack");
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).status).toBe(404);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("analyzes a direct room map and denies player, other room, and other GM status access", async () => {
    const run = vi.fn(detector);
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const room = await server.createRoom();
    const gm = await server.connect(room);
    clients.push(gm);
    const playerCreds = await server.join(room.inviteCode, "Player");
    const player = await server.connect(playerCreds);
    clients.push(player);
    await roomUpload(room.guestToken); // Existing token callers omit purpose.
    await roomUpload(room.guestToken, "token");
    const missingSize = await fetch(`${server.base}/api/uploads`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}` },
      body: imageForm({ purpose: "map" }),
    });
    expect(missingSize.status).toBe(400);
    const map = await roomUpload(room.guestToken, "map");
    expect((await gm.command({ type: "scene.setMap", map: { url: map.url, ...dimensions } })).type).toBe("ack");
    const result = await until(() => roomStatus(room.roomId, room.guestToken, map.url), (r) => r.body.status === "suggested");
    expect(result.body).toMatchObject({ status: "suggested", candidate });
    expect(run).toHaveBeenCalledTimes(1);
    expect((await roomStatus(room.roomId, playerCreds.guestToken, map.url)).status).toBe(403);
    const other = await server.createRoom("Other");
    expect((await roomStatus(room.roomId, other.guestToken, map.url)).status).toBe(403);
    expect(player.rawLog.join(" ")).not.toContain("confidence");
    expect(player.rawLog.join(" ")).not.toContain("detection");
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
    const replacement = await roomUpload(room.guestToken, "map");
    expect((await gm.command({ type: "scene.setMap", map: { url: replacement.url, ...dimensions } })).type).toBe("ack");
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).status).toBe(200);
    expect((await roomStatus(room.roomId, room.guestToken, "/uploads/never-uploaded.png")).status).toBe(404);
    expect((await roomStatus(room.roomId, room.guestToken, "https://example.com/x.png")).status).toBe(404);
  });

  it("serves a draft map's analysis before it is applied, to its own GM only (FR-GM-03)", async () => {
    server = await startServer(new MemoryRoomStore(), { detector: vi.fn(detector) });
    const room = await server.createRoom();
    const other = await server.createRoom("Other");
    const playerCreds = await server.join(room.inviteCode, "Player");
    const draft = await roomUpload(room.guestToken, "map");
    const result = await until(() => roomStatus(room.roomId, room.guestToken, draft.url), (r) => r.body.status === "suggested");
    expect(result.body).toMatchObject({ status: "suggested", candidate });
    expect((await roomStatus(room.roomId, playerCreds.guestToken, draft.url)).status).toBe(403);
    expect((await roomStatus(room.roomId, other.guestToken, draft.url)).status).toBe(403);
    expect((await roomStatus(other.roomId, other.guestToken, draft.url)).status).toBe(404);
    const token = await roomUpload(room.guestToken, "token");
    expect((await roomStatus(room.roomId, room.guestToken, token.url)).status).toBe(404);
  });

  it("automatically retries transient failures and rejects stale completions", async () => {
    const run = vi.fn<Detector>().mockRejectedValueOnce(new Error("service down"))
      .mockResolvedValue({ status: "suggested", candidate });
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const cookie = await newGm();
    const map = await libraryUpload(cookie, "map");
    const result = await until(() => gmStatus(cookie, map.id), (r) => r.body.status === "suggested");
    expect(result.body.attempt).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(await server.store.finishDetection({ target: { scope: "library", id: map.id }, attempt: 1,
      sourceHash: "old", configVersion: DETECTION_VERSION }, { status: "no_grid" })).toBe(false);
  });

  it("exhausts three transient attempts and denies player retries", async () => {
    const run = vi.fn<Detector>().mockRejectedValue(new Error("service down"));
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const room = await server.createRoom();
    const map = await roomUpload(room.guestToken, "map");
    const result = await until(() => roomStatus(room.roomId, room.guestToken, map.url), (r) => r.body.status === "error");
    expect(result.body.attempt).toBe(3);
    expect(run).toHaveBeenCalledTimes(3);
    const retryUrl = `${server.base}/api/rooms/${room.roomId}/grid-detection/retry`;
    const player = await server.join(room.inviteCode, "Player");
    expect((await fetch(retryUrl, { method: "POST", headers: {
      authorization: `Bearer ${player.guestToken}`, "x-expected-map-url": map.url,
    } })).status).toBe(403);
    expect((await fetch(retryUrl, { method: "POST", headers: {
      authorization: `Bearer ${room.guestToken}`, "x-expected-map-url": map.url,
    } })).status).toBe(409);
  });

  it("keeps uploads successful if dispatch fails and removes analysis with its asset or room", async () => {
    server = await startServer(new MemoryRoomStore(), {
      dispatcher: { enqueue: async () => { throw new Error("queue down"); }, close: async () => {} },
    });
    const gmToken = await newGm();
    const room = await server.createRoom("GM", { cookie: gmToken });
    const gm = await server.connect(room);
    clients.push(gm);
    const library = await libraryUpload(gmToken, "map");
    expect((await gmStatus(gmToken, library.id)).body.status).toBe("queued");
    const otherGm = await newGm();
    await server.createRoom("Other", { cookie: otherGm });
    expect((await gmStatus(otherGm, library.id)).status).toBe(404);
    expect((await fetch(`${server.base}/api/library/${library.id}/grid-detection`, {
      headers: { authorization: `Bearer ${room.guestToken}` },
    })).status).toBe(401);
    const map = await roomUpload(room.guestToken, "map");
    const key = map.url.slice("/uploads/".length);
    await gm.command({ type: "scene.setMap", map: { url: map.url, ...dimensions } });
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).body.status).toBe("queued");
    const removed = await fetch(`${server.base}/api/library/${library.id}`, { method: "DELETE", headers: { cookie: gmToken } });
    expect(removed.status).toBe(204);
    expect(await server.store.findDetection({ scope: "library", id: library.id })).toBeNull();
    const deleted = await fetch(`${server.base}/api/rooms/${room.roomId}`, { method: "DELETE", headers: { cookie: gmToken } });
    expect(deleted.status).toBe(204);
    expect(await server.store.findDetection({ scope: "room", roomId: room.roomId, objectKey: key })).toBeNull();
  });

  it("rejects malformed service candidates before exposing them to the GM", async () => {
    server = await startServer(new MemoryRoomStore(), {
      detector: async () => ({ status: "suggested", candidate: { ...candidate, offsetX: 64 } }),
    });
    const gmToken = await newGm();
    await server.createRoom("GM", { cookie: gmToken });
    const map = await libraryUpload(gmToken, "map");
    const result = await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "error");
    expect(result.body).toEqual({ status: "error", attempt: 3 });
  });

});
