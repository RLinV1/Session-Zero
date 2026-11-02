import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID, GM_TOKEN_HEADER, SHIPPED_MAPS, type GmRoomSummary, type LibraryAsset, type LibraryUsageResponse } from "@vtt/shared";
import { newGuestToken, startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

/** Token/failure fixture; successful map uploads below use matching decoded dimensions. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A signed-in GM: the value tests pass around is the account's session cookie. */
async function newGm() {
  return (await server.signUp()).cookie;
}

const gmFetch = (cookie: string | null, url: string, init: RequestInit = {}) =>
  fetch(server.base + url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) },
  });

async function upload(
  gmToken: string,
  fields: { kind: string; name: string; width?: number; height?: number },
  file: { bytes: Uint8Array; type: string; filename: string } = { bytes: PNG, type: "image/png", filename: "map.png" },
) {
  if (fields.kind === "map" && file.bytes === PNG && (fields.width ?? 2048) > 0 && (fields.height ?? 1536) > 0) {
    file = { ...file, bytes: await sharp({ create: { width: fields.width ?? 2048, height: fields.height ?? 1536,
      channels: 3, background: "#334455" } }).png().toBuffer() };
  }
  const form = new FormData();
  form.append("kind", fields.kind);
  form.append("name", fields.name);
  form.append("width", String(fields.width ?? 2048));
  form.append("height", String(fields.height ?? 1536));
  form.append("file", new Blob([file.bytes], { type: file.type }), file.filename);
  return gmFetch(gmToken, "/api/library", { method: "POST", body: form });
}

async function uploadOk(gmToken: string, fields: Parameters<typeof upload>[1], file?: Parameters<typeof upload>[2]) {
  const res = await upload(gmToken, fields, file);
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}

/** The caller's uploads: every account's library also holds the seeded shipped maps (ADR 0036). */
const uploadsOnly = (list: LibraryAsset[]) => list.filter((a) => !a.url.startsWith("/img/"));

const usage = async (gmToken: string, id: string) =>
  ((await (await gmFetch(gmToken, `/api/library/${id}/usage`)).json()) as LibraryUsageResponse).rooms;

describe("shipped maps in every library (builtin-library-assets, ADR 0036)", () => {
  it("seeds the shipped maps once with their own grids, and a deleted one stays deleted", async () => {
    const gm = await newGm();
    const first = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(first.filter((a) => a.kind === "map").map((a) => a.name).sort()).toEqual(
      SHIPPED_MAPS.map((m) => m.name).sort(),
    );
    expect(first.find((a) => a.name === "Hollowfrost Keep")).toMatchObject({
      url: "/img/map-ice.webp", width: 3269, height: 1882, grid: { cellSize: 70, offsetX: 47, offsetY: 46 },
    });
    expect(JSON.stringify(first)).not.toContain("objectKey");

    expect(((await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[])).toHaveLength(SHIPPED_MAPS.length);
    const frost = first.find((a) => a.name === "Hollowfrost Keep")!;
    expect((await gmFetch(gm, `/api/library/${frost.id}`, { method: "DELETE" })).status).toBe(204);
    const after = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(after.map((a) => a.name)).not.toContain("Hollowfrost Keep");
    expect(after).toHaveLength(SHIPPED_MAPS.length - 1);
  });

  it("deletes only the row of a seeded map; the shipped image URL is not a stored object", async () => {
    const gm = await newGm();
    const [row] = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(row!.url.startsWith("/img/")).toBe(true);
    expect((await gmFetch(gm, `/api/library/${row!.id}`, { method: "DELETE" })).status).toBe(204);
    expect(((await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[]).some((a) => a.id === row!.id)).toBe(false);
  });
});

describe("owners: accounts, and legacy device identities (gm-home, ADR 0017)", () => {
  it("rejects GM endpoints with no session and no known device token", async () => {
    expect((await gmFetch(null, "/api/gm/rooms")).status).toBe(401);
    const unknown = await fetch(`${server.base}/api/library`, { headers: { [GM_TOKEN_HEADER]: newGuestToken() } });
    expect(unknown.status).toBe(401);
  });

  it("no longer registers device identities", async () => {
    const res = await fetch(`${server.base}/api/gm/identify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gmToken: newGuestToken() }),
    });
    expect(res.status).toBe(410);
  });

  it("rejects a room guest credential on library endpoints", async () => {
    const room = await server.createRoom();
    const res = await fetch(`${server.base}/api/library`, { headers: { authorization: `Bearer ${room.guestToken}` } });
    expect(res.status).toBe(401);
  });
});

describe("GM dashboard (gm-home)", () => {
  it("lists only the caller's rooms, most recently active first", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    await server.createRoom("GM", { cookie: gmA, roomName: "Older" });
    await new Promise((r) => setTimeout(r, 5));
    await server.createRoom("GM", { cookie: gmA, roomName: "Newer" });
    await server.createRoom("GM", { cookie: gmB, roomName: "Not yours" });
    await server.createRoom("GM", { roomName: "Unowned" });

    const rooms = (await (await gmFetch(gmA, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.name)).toEqual(["Newer", "Older"]);
    expect(JSON.stringify(rooms)).not.toContain("Not yours");
  });
});

describe("library upload and management (asset-library)", () => {
  it("uploads unconfigured maps and token art without grid metadata (KAN-09)", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Goblin Cave" });
    expect(map).toMatchObject({ kind: "map", name: "Goblin Cave", width: 2048, height: 1536 });
    expect(map.grid).toBeNull();
    const token = await uploadOk(gm, { kind: "token", name: "Goblin", width: 256, height: 256 });
    expect(token.grid).toBeNull();

    const list = uploadsOnly((await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[]);
    expect(list.map((a) => a.name).sort()).toEqual(["Goblin", "Goblin Cave"]);
    expect(JSON.stringify(list)).not.toContain("objectKey");
  });

  it("never puts the name or filename in the image URL", async () => {
    const gm = await newGm();
    const a = await uploadOk(gm, { kind: "token", name: "Beholder" }, { bytes: PNG, type: "image/png", filename: "beholder.png" });
    expect(a.url.toLowerCase()).not.toContain("beholder");
  });

  it("rejects GIFs and files over 25 MB, adding nothing", async () => {
    const gm = await newGm();
    const gif = await upload(gm, { kind: "map", name: "Anim" }, { bytes: PNG, type: "image/gif", filename: "a.gif" });
    expect(gif.status).toBe(415);
    const huge = await upload(gm, { kind: "map", name: "Huge" }, {
      bytes: new Uint8Array(25 * 1024 * 1024 + 1), type: "image/png", filename: "huge.png",
    });
    expect(huge.status).toBe(413);
    expect(uploadsOnly((await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[])).toEqual([]);
  });

  it("rejects bad metadata", async () => {
    const gm = await newGm();
    expect((await upload(gm, { kind: "monster", name: "x" })).status).toBe(400);
    expect((await upload(gm, { kind: "map", name: "x", width: 0 })).status).toBe(400);
  });

  it("renames, re-grids maps, and refuses a grid on a token", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Cave" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft" };
    const res = await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Crypt", grid }),
    });
    expect(await res.json()).toMatchObject({ name: "Crypt", grid });

    const token = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const bad = await gmFetch(gm, `/api/library/${token.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grid }),
    });
    expect(bad.status).toBe(400);
  });

  it("answers 404 to another GM for every per-asset route", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const a = await uploadOk(gmA, { kind: "map", name: "Mine" });
    const json = { "content-type": "application/json" };
    expect((await gmFetch(gmB, `/api/library/${a.id}`, { method: "PATCH", headers: json, body: '{"name":"x"}' })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/${a.id}/usage`)).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/${a.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/not-a-uuid`, { method: "DELETE" })).status).toBe(404);
    expect(uploadsOnly((await (await gmFetch(gmB, "/api/library")).json()) as LibraryAsset[])).toEqual([]);
    expect(uploadsOnly((await (await gmFetch(gmA, "/api/library")).json()) as LibraryAsset[])[0]?.name).toBe("Mine");
  });

  it("deletes the stored image so its URL answers 404 (board-asset-fallback)", async () => {
    const gm = await newGm();
    const a = await uploadOk(gm, { kind: "token", name: "Goblin" });
    expect((await fetch(server.base + a.url)).status).toBe(200);
    expect((await gmFetch(gm, `/api/library/${a.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(server.base + a.url)).status).toBe(404);
    expect(uploadsOnly((await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[])).toEqual([]);
  });
});

describe("editing a map's grid in the library (asset-library, FR-GM-04)", () => {
  const patchGrid = (gm: string, id: string, grid: object) =>
    gmFetch(gm, `/api/library/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grid }),
    });

  it("saves an explicit default grid while preserving original map dimensions (KAN-09)", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Cave", width: 1025, height: 769 });
    expect(map.grid).toBeNull();
    const res = await patchGrid(gm, map.id, DEFAULT_GRID);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: map.id, width: 1025, height: 769, grid: DEFAULT_GRID });
    const list = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(list.find((a) => a.id === map.id)?.grid).toEqual(DEFAULT_GRID);
  });

  it("rejects a grid too fine to draw on the map's stored size and keeps the saved grid", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Vast", width: 4000, height: 3000 });
    const res = await patchGrid(gm, map.id, { cellSize: 0.1, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" });
    expect(res.status).toBe(400);
    const list = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(list.find((a) => a.id === map.id)?.grid).toEqual(map.grid);
  });

  it("saves a drawable grid on the same map", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Vast", width: 4000, height: 3000 });
    const grid = { cellSize: 0.2, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
    const res = await patchGrid(gm, map.id, grid);
    expect(res.status).toBe(200);
    expect(((await res.json()) as LibraryAsset).grid).toEqual(grid);
  });
});

describe("in-use tracking (asset-library: Warn before deleting an asset in use)", () => {
  async function gmInRoom(roomName: string, gmToken: string) {
    const creds = await server.createRoom("GM", { cookie: gmToken, roomName });
    const client = await server.connect(creds);
    clients.push(client);
    return { client, creds };
  }

  it("follows the room's current state: tokens (hidden included) and the map", async () => {
    const gm = await newGm();
    const tokenAsset = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const mapAsset = await uploadOk(gm, { kind: "map", name: "Cave" });
    const { client } = await gmInRoom("Goblin Cave", gm);
    expect(await usage(gm, tokenAsset.id)).toEqual([]);

    const created = await client.command({
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 },
      imageUrl: tokenAsset.url, assetId: tokenAsset.id, hidden: true,
    });
    expect(created.type).toBe("ack");
    expect((await usage(gm, tokenAsset.id)).map((r) => r.name)).toEqual(["Goblin Cave"]);

    await client.command({
      type: "scene.setMap",
      map: { url: mapAsset.url, width: mapAsset.width, height: mapAsset.height, assetId: mapAsset.id },
      grid: mapAsset.grid ?? undefined,
    });
    expect((await usage(gm, mapAsset.id)).map((r) => r.name)).toEqual(["Goblin Cave"]);

    await client.waitForSeq((created as { seq: number }).seq);
    const tokenId = Object.keys(client.state.tokens)[0]!;
    await client.command({ type: "token.delete", tokenId });
    expect(await usage(gm, tokenAsset.id)).toEqual([]);
  });

  it("ignores references from rooms owned by another GM", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const a = await uploadOk(gmA, { kind: "token", name: "Mine" });
    const { client } = await gmInRoom("Intruder", gmB);
    await client.command({ type: "token.create", name: "x", position: { x: 0, y: 0 }, imageUrl: a.url, assetId: a.id });
    expect(await usage(gmA, a.id)).toEqual([]);
  });

  it("never sends a player a hidden library token's image, asset id, or any library name", async () => {
    const gm = await newGm();
    const secret = await uploadOk(gm, { kind: "token", name: "Beholder Ambush" });
    const map = await uploadOk(gm, { kind: "map", name: "Secret Lair" });
    const { client, creds } = await gmInRoom("Cave", gm);
    const aliceCreds = await server.join(creds.inviteCode, "Alice");
    const alice = await server.connect(aliceCreds);
    clients.push(alice);

    await client.command({
      type: "token.create", name: "Rock", position: { x: 0, y: 0 },
      imageUrl: secret.url, assetId: secret.id, hidden: true,
    });
    const placed = await client.command({
      type: "scene.setMap",
      map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
      grid: map.grid ?? undefined,
    });
    await alice.waitForSeq((placed as { seq: number }).seq);

    const raw = alice.rawLog.join("\n");
    expect(raw).not.toContain(secret.id);
    expect(raw).not.toContain(secret.url);
    expect(raw).not.toContain("Beholder Ambush");
    expect(raw).not.toContain("Secret Lair");
  });

  it("converges GM and player on a library map with its grid and a visible library token", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Cave" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft" };
    await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ grid }),
    });
    const token = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const { client, creds } = await gmInRoom("Cave", gm);
    const alice = await server.connect(await server.join(creds.inviteCode, "Alice"));
    clients.push(alice);

    await client.command({
      type: "scene.setMap",
      map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
      grid,
    });
    const created = await client.command({
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 }, imageUrl: token.url, assetId: token.id,
    });
    const seq = (created as { seq: number }).seq;
    await Promise.all([client.waitForSeq(seq), alice.waitForSeq(seq)]);

    expect(alice.state.scene).toEqual(client.state.scene);
    expect(alice.state.scene.grid).toEqual(grid);
    expect(alice.state.scene.map?.assetId).toBe(map.id);
    expect(alice.state.tokens).toEqual(client.state.tokens);
  });

  it("saves a styled grid to the library and brings the style back on placement (grid-line-style)", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Glacier" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft", lineColor: "#ffffff", lineWidth: 4, lineOpacity: 0.8 };
    const saved = await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ grid }),
    });
    expect(await saved.json()).toMatchObject({ grid });
    const listed = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    const stored = listed.find((a) => a.id === map.id)!;
    expect(stored.grid).toEqual(grid);

    const { client, creds } = await gmInRoom("Glacier", gm);
    const alice = await server.connect(await server.join(creds.inviteCode, "Alice"));
    clients.push(alice);
    const placed = await client.command({
      type: "scene.setMap",
      map: { url: stored.url, width: stored.width, height: stored.height, assetId: stored.id },
      grid: stored.grid!,
    });
    await alice.waitForSeq((placed as { seq: number }).seq);
    expect(alice.state.scene.grid).toEqual(grid);
  });
});
