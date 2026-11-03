import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DetectedWallsResponse, type ServerMessage, type WallDetectionStatus } from "@vtt/shared";
import type { WallJobData, WallJobEvent, WallJobQueue } from "../src/domain/wallDetection";
import { startServer, type TestClient } from "./helpers";

/** 1×1 PNG: the stand-in worker never decodes it, but the server reads real bytes from storage. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MAP = { width: 700, height: 700 };
const PREVIEW = { contentType: "image/jpeg", width: 10, height: 10, data: Buffer.from("preview-bytes").toString("base64") };
/** A wall along the edge between columns 1 and 2, the full height of the map. */
const WALL = { a: { x: 140, y: 0 }, b: { x: 140, y: 700 } };

/** Plays the Python worker's part: records jobs, and emits queue events when told to. */
class StandInQueue implements WallJobQueue {
  jobs = new Map<string, WallJobData>();
  /** Stored images, as the worker would find them by key: raw bytes, each with the expiry it was last given. */
  images = new Map<string, { bytes: Uint8Array; ttl: number }>();
  puts = 0;
  extends = 0;
  alive = true;
  async workerAlive() {
    return this.alive;
  }
  removed: string[] = [];
  private handler: (event: WallJobEvent) => void = () => {};
  async add(jobId: string, data: WallJobData) {
    this.jobs.set(jobId, data);
  }
  async putImage(key: string, bytes: Uint8Array, ttlSeconds: number) {
    this.puts += 1;
    this.images.set(key, { bytes, ttl: ttlSeconds });
  }
  async extendImage(key: string, ttlSeconds: number) {
    this.extends += 1;
    const image = this.images.get(key);
    if (image) image.ttl = ttlSeconds;
  }
  async dropImage(key: string) {
    this.images.delete(key);
  }
  /** The bytes a job's worker would read, by the key in its data. */
  imageOf(data: WallJobData) {
    return this.images.get(data.imageKey)?.bytes;
  }
  async remove(jobId: string) {
    this.removed.push(jobId);
  }
  onEvent(handler: (event: WallJobEvent) => void) {
    this.handler = handler;
  }
  async close() {}
  /** The single job queued so far. */
  only() {
    expect(this.jobs.size).toBe(1);
    return [...this.jobs.entries()][0]!;
  }
  emit(event: WallJobEvent) {
    this.handler(event);
  }
}

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
});

async function upload(token: string, purpose: "map" | "token") {
  const form = new FormData();
  form.append("purpose", purpose);
  if (purpose === "map") {
    form.append("width", String(MAP.width));
    form.append("height", String(MAP.height));
  }
  form.append("file", new Blob([PNG], { type: "image/png" }), "map.png");
  const res = await fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  expect(res.status).toBe(200);
  return ((await res.json()) as { url: string }).url;
}

const api = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${server.base}${path}`, { ...init, headers: { authorization: `Bearer ${token}` } });

/** A room with a GM and a player connected, and an uploaded map applied. */
async function roomWithMap(queue: WallJobQueue | null) {
  server = await startServer(undefined, { wallQueue: queue });
  const room = await server.createRoom();
  const gm = await server.connect(room);
  const playerCreds = await server.join(room.inviteCode, "Aria");
  const player = await server.connect(playerCreds);
  clients.push(gm, player);
  const url = await upload(room.guestToken, "map");
  expect(await gm.command({ type: "scene.setMap", map: { url, ...MAP } })).toMatchObject({ type: "ack" });
  return { room, gm, player, playerCreds, url };
}

const statusOf = async (token: string, roomId: string, url: string) => {
  const res = await api(token, `/api/rooms/${roomId}/wall-detection?map=${encodeURIComponent(url)}`);
  return { code: res.status, body: (await res.json()) as WallDetectionStatus };
};

const isNotice = (m: ServerMessage): m is Extract<ServerMessage, { type: "wallDetection" }> => m.type === "wallDetection";

describe("automatic wall detection through the queue (FR-GM-11, ADR 0029)", () => {
  it("rejects exclusions from a previous equal-count result across the wire", async () => {
    const queue = new StandInQueue();
    const { room, gm, url } = await roomWithMap(queue);
    const [first] = queue.only();
    const extra = { a: { x: 0, y: 70 }, b: { x: 140, y: 70 } };
    queue.emit({ jobId: first, kind: "completed", returnvalue: { walls: [WALL, extra], preview: PREVIEW } });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "done");
    const endpoint = `/api/rooms/${room.roomId}/wall-detection/walls?map=${encodeURIComponent(url)}`;
    const old = DetectedWallsResponse.parse(await (await api(room.guestToken, endpoint)).json());
    expect((await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection`, { method: "POST" })).status).toBe(202);
    const latest = [...queue.jobs.keys()].at(-1)!;
    queue.emit({ jobId: latest, kind: "completed", returnvalue: { walls: [extra, WALL], preview: PREVIEW } });
    const next = DetectedWallsResponse.parse(await (await api(room.guestToken, endpoint)).json());
    expect(next.walls).toHaveLength(old.walls.length);
    expect(next.resultId).not.toBe(old.resultId);
    expect(await gm.command({ type: "wall.applyDetected", mapUrl: url, exclude: { resultId: old.resultId, indices: [0] } })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.state.walls).toEqual({});
    const applied = await gm.command({ type: "wall.applyDetected", mapUrl: url, exclude: { resultId: next.resultId, indices: [0] } });
    expect(applied).toMatchObject({ type: "ack" });
    await gm.waitForSeq((applied as { seq: number }).seq);
    expect(Object.values(gm.state.walls).map(({ a, b }) => ({ a, b }))).toEqual([WALL]);
  });

  it("refuses remaining save commands when the applied map changes across the wire", async () => {
    const queue = new StandInQueue();
    const { gm, url } = await roomWithMap(queue);
    expect(await gm.command({ type: "wall.add", expectedMapUrl: url, walls: [WALL] })).toMatchObject({ type: "ack" });
    const switched = await gm.command({ type: "scene.setMap", map: { ...MAP, url: "/img/other.png" } });
    expect(switched).toMatchObject({ type: "ack" });
    await gm.waitForSeq((switched as { seq: number }).seq);
    expect(await gm.command({ type: "wall.add", expectedMapUrl: url, walls: [WALL] })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(await gm.command({ type: "fog.add", expectedMapUrl: url, region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.state.walls).toEqual({});
    expect(gm.state.fog).toEqual({});
  });

  it("queues a map upload, hears the worker finish, notifies only the GM, and serves the preview", async () => {
    const queue = new StandInQueue();
    const { room, gm, player, playerCreds, url } = await roomWithMap(queue);
    const [jobId, data] = queue.only();
    // The worker gets the stored bytes, never an address to fetch.
    expect(Buffer.from(queue.imageOf(data)!).equals(PNG)).toBe(true);
    expect(data).toMatchObject({ width: 700, height: 700 });
    expect((await statusOf(room.guestToken, room.roomId, url)).body).toEqual({ status: "queued" });

    queue.emit({ jobId, kind: "active" });
    expect(await gm.waitFor((m) => isNotice(m) && m.status.status === "running")).toMatchObject({ mapUrl: url });
    queue.emit({ jobId, kind: "completed", returnvalue: JSON.stringify({ walls: [WALL], preview: PREVIEW }) });
    const done = await gm.waitFor((m) => isNotice(m) && m.status.status === "done");
    expect(done).toMatchObject({ mapUrl: url, status: { status: "done", wallCount: 1 } });
    expect(queue.removed).toContain(jobId);

    const preview = await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection/preview?map=${encodeURIComponent(url)}`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("image/jpeg");
    expect(Buffer.from(await preview.arrayBuffer()).toString()).toBe("preview-bytes");

    const listed = await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection/walls?map=${encodeURIComponent(url)}`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ resultId: expect.any(String), walls: [WALL] });

    // Players get neither the notice, the status, the preview nor the segments.
    expect((await api(playerCreds.guestToken, `/api/rooms/${room.roomId}/wall-detection/walls?map=${encodeURIComponent(url)}`)).status).toBe(403);
    expect(player.rawLog.join(" ")).not.toContain("wallDetection");
    expect((await statusOf(playerCreds.guestToken, room.roomId, url)).code).toBe(403);
    expect((await api(playerCreds.guestToken, `/api/rooms/${room.roomId}/wall-detection/preview?map=${encodeURIComponent(url)}`)).status).toBe(403);
    // Nothing changed on the table until the GM applies.
    expect(gm.state.walls).toEqual({});
  });

  it("applies detected walls through the room command, hides them from players, and blocks tokens", async () => {
    const queue = new StandInQueue();
    const { room, gm, player, playerCreds, url } = await roomWithMap(queue);
    const [jobId] = queue.only();
    queue.emit({ jobId, kind: "completed", returnvalue: { walls: [WALL], preview: PREVIEW } });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "done");

    const applied = await gm.command({ type: "wall.applyDetected", mapUrl: url });
    expect(applied).toMatchObject({ type: "ack" });
    await gm.waitForSeq((applied as { seq: number }).seq);
    expect(Object.values(gm.state.walls).map(({ a, b }) => ({ a, b }))).toEqual([WALL]);
    await player.waitForSeq((applied as { seq: number }).seq);
    expect(player.state.walls).toEqual({});
    expect(player.rawLog.join(" ")).not.toContain('"WallsAdded"');

    // A player's token can't be dragged through the wall, or dropped on it.
    const created = await gm.command({ type: "token.create", name: "Aria", position: { x: 105, y: 105 }, ownerIds: [playerCreds.participantId] });
    expect(created).toMatchObject({ type: "ack" });
    await player.waitForSeq((created as { seq: number }).seq);
    const tokenId = Object.keys(player.state.tokens)[0]!;
    expect(await player.command({ type: "token.move", tokenId, to: { x: 175, y: 105 } }))
      .toMatchObject({ type: "rejected", code: "invalid", message: "That move is unavailable." });
    expect(await player.command({ type: "token.move", tokenId, to: { x: 140, y: 105 } }))
      .toMatchObject({ type: "rejected", message: "That move is unavailable." });
    expect(await player.command({ type: "token.move", tokenId, to: { x: 105, y: 175 } })).toMatchObject({ type: "ack" });
    // Not for players, and not for another room.
    expect(await player.command({ type: "wall.clear" })).toMatchObject({ type: "rejected", code: "forbidden" });
    const other = await server.createRoom("Other GM");
    expect((await statusOf(other.guestToken, room.roomId, url)).code).toBe(403);
  });

  it("gives the GM the detected walls for the editor's draft, and nobody else (map-editor-drafts)", async () => {
    const queue = new StandInQueue();
    const { room, playerCreds, url } = await roomWithMap(queue);
    const wallsOf = (token: string, map: string) =>
      api(token, `/api/rooms/${room.roomId}/wall-detection/walls?map=${encodeURIComponent(map)}`);
    // No finished result yet.
    expect((await wallsOf(room.guestToken, url)).status).toBe(404);
    const [jobId] = queue.only();
    queue.emit({ jobId, kind: "completed", returnvalue: { walls: [WALL], preview: PREVIEW } });
    await expect.poll(async () => (await wallsOf(room.guestToken, url)).status).toBe(200);
    expect(await (await wallsOf(room.guestToken, url)).json()).toEqual({ resultId: expect.any(String), walls: [WALL] });
    expect((await wallsOf(playerCreds.guestToken, url)).status).toBe(403);
    expect((await wallsOf(room.guestToken, "/uploads/other.png")).status).toBe(404);
  });

  it("passes each wall's confidence to the GM and still applies (wall-review)", async () => {
    const queue = new StandInQueue();
    const { room, gm, url } = await roomWithMap(queue);
    const scored = { ...WALL, confidence: 0.42 };
    const wallsOf = () => api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection/walls?map=${encodeURIComponent(url)}`);
    const [jobId] = queue.only();
    queue.emit({ jobId, kind: "completed", returnvalue: { walls: [scored], preview: PREVIEW } });
    await expect.poll(async () => (await wallsOf()).status).toBe(200);
    expect(await (await wallsOf()).json()).toEqual({ resultId: expect.any(String), walls: [scored] });
    expect(await gm.command({ type: "wall.applyDetected", mapUrl: url })).toMatchObject({ type: "ack" });
  });

  it("fails a result whose confidence is outside 0..1 (wall-review)", async () => {
    const queue = new StandInQueue();
    const { room, gm, url } = await roomWithMap(queue);
    const [jobId] = queue.only();
    queue.emit({ jobId, kind: "completed", returnvalue: { walls: [{ ...WALL, confidence: 1.5 }], preview: PREVIEW } });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "failed");
    expect((await statusOf(room.guestToken, room.roomId, url)).body).toMatchObject({ status: "failed" });
  });

  it("starts detection on demand, refuses a second run while one is pending, and allows a re-run after", async () => {
    const queue = new StandInQueue();
    const { room, gm, url } = await roomWithMap(queue);
    const [first] = queue.only();
    const busy = await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection`, { method: "POST" });
    expect(busy.status).toBe(409);
    queue.emit({ jobId: first, kind: "failed", reason: "Traceback: secret internals" });
    const failed = await gm.waitFor((m) => isNotice(m) && m.status.status === "failed");
    expect(JSON.stringify(failed)).not.toContain("secret internals");
    const again = await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection`, { method: "POST" });
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ status: "queued" });
    expect(queue.jobs.size).toBe(2);
    // A late event from the abandoned job changes nothing.
    queue.emit({ jobId: first, kind: "completed", returnvalue: { walls: [WALL], preview: PREVIEW } });
    expect((await statusOf(room.guestToken, room.roomId, url)).body).toEqual({ status: "queued" });
  });

  it("carries a sampled wall to the worker and refuses one off the map (wall-editing)", async () => {
    const queue = new StandInQueue();
    const { room, gm } = await roomWithMap(queue);
    const [first] = queue.only();
    queue.emit({ jobId: first, kind: "failed", reason: "no walls" });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "failed");
    const post = (body: unknown) => fetch(`${server.base}/api/rooms/${room.roomId}/wall-detection`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    expect((await post({ sample: { x: 900, y: 10 } })).status).toBe(400);
    expect((await post({ sample: { x: 10 } })).status).toBe(400);
    expect((await post({ colour: "#fff" })).status).toBe(400);
    expect((await post({ tolerance: 20 })).status).toBe(400);
    expect((await post({ strictness: 0.9 })).status).toBe(400);
    expect((await post({ minLength: -2 })).status).toBe(400);
    expect((await post({ style: "glass" })).status).toBe(400);
    expect((await post({ sample: { x: 140, y: 350 }, tolerance: 500 })).status).toBe(400);
    expect(queue.jobs.size).toBe(1);
    expect((await post({ sample: { x: 140, y: 350 } })).status).toBe(202);
    const sampled = [...queue.jobs.values()].at(-1)!;
    expect(sampled.sample).toEqual({ x: 140, y: 350 });
    expect(sampled.tolerance).toBeUndefined();
    expect(sampled).toMatchObject({ width: 700, height: 700 });
  });

  it("carries the colour tolerance, strictness and shortest wall to the worker (wall-editing)", async () => {
    const queue = new StandInQueue();
    const { room, gm } = await roomWithMap(queue);
    const [first] = queue.only();
    queue.emit({ jobId: first, kind: "failed", reason: "no walls" });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "failed");
    const res = await fetch(`${server.base}/api/rooms/${room.roomId}/wall-detection`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sample: { x: 140, y: 350 }, tolerance: 18, strictness: 0.5, minLength: 2, style: "dark" }),
    });
    expect(res.status).toBe(202);
    expect([...queue.jobs.values()].at(-1)).toMatchObject({ sample: { x: 140, y: 350 }, tolerance: 18, strictness: 0.5, minLength: 2, style: "dark" });
  });

  it("treats a result outside the map as failed and never applies it", async () => {
    const queue = new StandInQueue();
    const { room, gm, url } = await roomWithMap(queue);
    const [jobId] = queue.only();
    queue.emit({ jobId, kind: "completed", returnvalue: { walls: [{ a: { x: 0, y: 0 }, b: { x: 9000, y: 0 } }], preview: PREVIEW } });
    await gm.waitFor((m) => isNotice(m) && m.status.status === "failed");
    expect((await statusOf(room.guestToken, room.roomId, url)).body).toMatchObject({ status: "failed" });
    expect(await gm.command({ type: "wall.applyDetected", mapUrl: url }))
      .toMatchObject({ type: "rejected", code: "invalid", message: "No detected walls are ready for this map." });
  });

  it("does not queue token art", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    const room = await server.createRoom();
    await upload(room.guestToken, "token");
    expect(queue.jobs.size).toBe(0);
  });

  it("says detection is unavailable without a queue, and uploads still work", async () => {
    const { room } = await roomWithMap(null);
    const res = await api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection`, { method: "POST" });
    expect(res.status).toBe(503);
    const availability = await fetch(`${server.base}/api/wall-detection/availability`);
    expect(await availability.json()).toEqual({ available: false, reason: "Wall detection isn't set up on this server." });
  });

  it("reports detection available only while a worker checks in (map-editor)", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    expect(await (await fetch(`${server.base}/api/wall-detection/availability`)).json()).toEqual({ available: true });
    const down = new StandInQueue();
    down.alive = false;
    await server.close();
    server = await startServer(undefined, { wallQueue: down });
    expect(await (await fetch(`${server.base}/api/wall-detection/availability`)).json())
      .toEqual({ available: false, reason: "The wall detection service isn't running." });
  });
  it("reads a built-in library map from the web app's files, and refuses any other address", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    const room = await server.createRoom();
    const gm = await server.connect(room);
    clients.push(gm);
    const detect = () => api(room.guestToken, `/api/rooms/${room.roomId}/wall-detection`, { method: "POST" });

    // Hollowfrost Keep ships in apps/web/public/img; it has no upload behind it.
    expect(await gm.command({ type: "scene.setMap", map: { url: "/img/map-ice.webp", width: 3269, height: 1882 } })).toMatchObject({ type: "ack" });
    // A sampled detection always uses the vision service, even where stored walls exist.
    const sampled = await fetch(`${server.base}/api/rooms/${room.roomId}/wall-detection`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sample: { x: 10, y: 10 } }),
    });
    expect(sampled.status).toBe(202);
    const [, data] = queue.only();
    const shipped = await readFile(fileURLToPath(new URL("../../web/public/img/map-ice.webp", import.meta.url)));
    expect(Buffer.from(queue.imageOf(data)!).equals(shipped)).toBe(true);
    expect(data).toMatchObject({ width: 3269, height: 1882 });

    // Not a shipped map, and not a path out of the folder: nothing is read or queued.
    for (const url of ["/img/missing.webp", "/img/../../server/package.json", "https://example.com/map.png"]) {
      expect(await gm.command({ type: "scene.setMap", map: { url, width: 700, height: 700 } })).toMatchObject({ type: "ack" });
      expect((await detect()).status).toBe(422);
    }
    expect(queue.jobs.size).toBe(1);
  });
});
