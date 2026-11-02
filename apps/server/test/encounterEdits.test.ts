import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GRID,
  type EncounterEditSession, type EncounterSummary, type GmRoomSummary, type LibraryAsset, type MyRoomsResponse,
  type StartEncounterEditResponse, type Token,
} from "@vtt/shared";
import { TEMPORARY_ROOM_LIFETIME_MS } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
});

const PNG = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#334455" } }).png().toBuffer();

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

async function upload(cookie: string, name: string, { grid = true } = {}) {
  const form = new FormData();
  form.append("kind", "map");
  form.append("name", name);
  form.append("width", "256");
  form.append("height", "256");
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form });
  const map = (await res.json()) as LibraryAsset;
  if (grid) await gmFetch(cookie, `/api/library/${map.id}`, { method: "PATCH", body: { grid: DEFAULT_GRID } });
  return map;
}

async function startEdit(cookie: string | null, from: { templateId: string } | { mapAssetId: string }) {
  const guestToken = server.newGuestToken();
  const res = await gmFetch(cookie, "/api/library/encounter-edits", { method: "POST", body: { ...from, guestToken } });
  return { res, guestToken };
}

/** Starts an editing session and connects to its temporary room as the GM. */
async function editing(cookie: string, from: { templateId: string } | { mapAssetId: string }) {
  const { res, guestToken } = await startEdit(cookie, from);
  expect(res.status).toBe(201);
  const body = (await res.json()) as StartEncounterEditResponse;
  const gm = await server.connect({ roomId: body.roomId, guestToken });
  clients.push(gm);
  return { roomId: body.roomId, gm };
}

const ok = async (p: Promise<unknown>) => expect(await p).toMatchObject({ type: "ack" });
const named = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
const save = (cookie: string, roomId: string, body: { name?: string } = {}) =>
  gmFetch(cookie, `/api/library/encounter-edits/${roomId}/save`, { method: "POST", body });
const session = async (cookie: string, roomId: string) =>
  (await (await gmFetch(cookie, `/api/library/encounter-edits/${roomId}`)).json()) as EncounterEditSession;
const list = async (cookie: string) => (await (await gmFetch(cookie, "/api/library/encounters")).json()) as EncounterSummary[];

describe("edit encounter templates in temporary rooms (encounter-templates, FR-GM-13, ADR 0033)", () => {
  it("builds a new template from a library map, naming it on the first save and updating it after", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const { roomId, gm } = await editing(cookie, { mapAssetId: map.id });
    expect(gm.state.scene.map).toMatchObject({ assetId: map.id, url: map.url });
    expect(gm.state.scene.grid.cellSize).toBe(DEFAULT_GRID.cellSize);
    expect(Object.keys(gm.state.tokens)).toHaveLength(0);
    expect(await session(cookie, roomId)).toEqual({ roomId, templateId: null, templateName: null, mapAssetId: map.id });

    await ok(gm.command({ type: "token.create", name: "Goblin", position: { x: 35, y: 35 } }));
    await ok(gm.command({ type: "token.create", name: "Goblin", position: { x: 105, y: 35 } }));
    await ok(gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } }));
    expect((await save(cookie, roomId)).status).toBe(400);
    const first = await save(cookie, roomId, { name: "Crypt guards" });
    expect(first.status).toBe(201);
    const created = (await first.json()) as EncounterSummary;
    expect(created).toMatchObject({ name: "Crypt guards", mapAssetId: map.id, tokenCount: 2, fogCount: 1 });
    expect(await session(cookie, roomId)).toMatchObject({ templateId: created.id, templateName: "Crypt guards" });

    await ok(gm.command({ type: "token.setHidden", tokenId: named(gm, "Goblin 2")!.id, hidden: true }));
    const again = await save(cookie, roomId, { name: "Ignored" });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: created.id, name: "Crypt guards", tokenCount: 2 });
    expect(await list(cookie)).toHaveLength(1);
  });

  it("rejects a duplicate name from a different edit room without linking it", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const first = await editing(cookie, { mapAssetId: map.id });
    const second = await editing(cookie, { mapAssetId: map.id });
    expect((await save(cookie, first.roomId, { name: "Guards" })).status).toBe(201);
    const duplicate = await save(cookie, second.roomId, { name: " guards " });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: expect.stringContaining("already exists") });
    expect(await session(cookie, second.roomId)).toMatchObject({ templateId: null });
    expect((await save(cookie, second.roomId, { name: "Other guards" })).status).toBe(201);
  });

  it("inherits saved map walls, portals and fog and preserves them through template saves", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Prepared crypt");
    const board = {
      walls: [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 }, portal: { kind: "door", state: "closed" } }],
      fog: [{ shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] }],
    };
    const prepared = await gmFetch(cookie, `/api/library/${map.id}/board`, { method: "PUT", body: board });
    expect(prepared.status).toBe(200);
    const first = await editing(cookie, { mapAssetId: map.id });
    expect(Object.values(first.gm.state.walls)).toEqual([expect.objectContaining(board.walls[0]!)]);
    expect(Object.values(first.gm.state.fog)).toEqual([expect.objectContaining(board.fog[0]!)]);
    const saved = await save(cookie, first.roomId, { name: "Prepared encounter" });
    expect(saved.status).toBe(201);
    const created = await saved.json() as EncounterSummary;
    const reopened = await editing(cookie, { templateId: created.id });
    expect(Object.values(reopened.gm.state.walls)).toEqual([expect.objectContaining(board.walls[0]!)]);
    expect(Object.values(reopened.gm.state.fog)).toEqual([expect.objectContaining(board.fog[0]!)]);
  });

  it("creates one template when first saves overlap, as after a double click or a retry", async () => {
    // A read whose answer arrives later, as over a database connection, so every save reads the
    // room as unlinked before any of them creates a template.
    class SlowReads extends MemoryRoomStore {
      override async findEditSession(roomId: string, ownerGmId: string) {
        const found = await super.findEditSession(roomId, ownerGmId);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return found;
      }
    }
    server = await startServer(new SlowReads());
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const { roomId, gm } = await editing(cookie, { mapAssetId: map.id });
    await ok(gm.command({ type: "token.create", name: "Goblin", position: { x: 35, y: 35 } }));

    const responses = await Promise.all([0, 1, 2].map(() => save(cookie, roomId, { name: "Crypt guards" })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const saved = (await Promise.all(responses.map((r) => r.json()))) as EncounterSummary[];
    expect(new Set(saved.map((s) => s.id)).size).toBe(1);
    expect((await list(cookie)).map((t) => t.id)).toEqual([saved[0]!.id]);
    expect(await session(cookie, roomId)).toMatchObject({ templateId: saved[0]!.id, templateName: "Crypt guards" });
  });

  it("opens a template and saves its walls in place", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Cave");
    const first = await editing(cookie, { mapAssetId: map.id });
    await ok(first.gm.command({ type: "token.create", name: "Orc", position: { x: 35, y: 35 } }));
    const created = (await (await save(cookie, first.roomId, { name: "Orc den" })).json()) as EncounterSummary;

    const { roomId, gm } = await editing(cookie, { templateId: created.id });
    expect(await session(cookie, roomId)).toEqual({ roomId, templateId: created.id, templateName: "Orc den", mapAssetId: map.id });
    const orc = named(gm, "Orc")!;
    await ok(gm.command({ type: "token.move", tokenId: orc.id, to: { x: 105, y: 105 } }));
    await ok(gm.command({ type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }] }));
    const res = await save(cookie, roomId);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: created.id, name: "Orc den", tokenCount: 1, createdAt: created.createdAt });
    const owner = (await server.store.findRoomOwner(roomId))!;
    const stored = (await server.store.findEncounter(created.id, owner))!;
    expect(stored.data.tokens[0]!.position).toEqual({ x: 105, y: 105 });
    expect(stored.data.walls).toEqual([{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }]);
    const reopened = await editing(cookie, { templateId: created.id });
    expect(Object.values(reopened.gm.state.walls)).toEqual([expect.objectContaining(stored.data.walls![0]!)]);
  });

  it("refuses to save over a template once the room's map is different", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Cave");
    const other = await upload(cookie, "Other");
    const first = await editing(cookie, { mapAssetId: map.id });
    const created = (await (await save(cookie, first.roomId, { name: "Den" })).json()) as EncounterSummary;
    const { roomId, gm } = await editing(cookie, { templateId: created.id });
    await ok(gm.command({ type: "scene.setMap", map: { url: other.url, width: other.width, height: other.height, assetId: other.id } }));
    const res = await save(cookie, roomId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringContaining("new template") });
    expect((await list(cookie))[0]).toMatchObject({ mapAssetId: map.id, updatedAt: created.updatedAt });
  });

  it("needs a library map with a grid, the caller's own template, and a signed-in account", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const noGrid = await upload(cookie, "Bare", { grid: false });
    expect((await startEdit(cookie, { mapAssetId: noGrid.id })).res.status).toBe(400);
    const stranger = (await server.signUp()).cookie;
    const theirs = await upload(stranger, "Theirs");
    expect((await startEdit(cookie, { mapAssetId: theirs.id })).res.status).toBe(400);
    expect((await startEdit(cookie, { templateId: crypto.randomUUID() })).res.status).toBe(404);
    expect((await startEdit(null, { mapAssetId: theirs.id })).res.status).toBe(401);
    expect(((await (await gmFetch(cookie, "/api/gm/rooms")).json()) as GmRoomSummary[])).toEqual([]);
  });
});

describe("temporary rooms are private and short-lived (encounter-templates, ADR 0033)", () => {
  it("stays off the dashboard and room lists, refuses joins, and is the GM's alone", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const { roomId } = await editing(cookie, { mapAssetId: map.id });
    const normal = await server.createRoom("GM", { cookie, roomName: "Table" });

    expect(((await (await gmFetch(cookie, "/api/gm/rooms")).json()) as GmRoomSummary[]).map((r) => r.id)).toEqual([normal.roomId]);
    expect(((await (await gmFetch(cookie, "/api/me/rooms")).json()) as MyRoomsResponse).hosting.map((r) => r.id)).toEqual([normal.roomId]);

    const invite = (await (await gmFetch(cookie, `/api/rooms/${roomId}/invite`)).json()) as { inviteCode: string };
    const joined = await server.tryJoin(invite.inviteCode, "Mallory");
    const unknown = await server.tryJoin("nosuchcode", "Mallory");
    expect(joined.status).toBe(404);
    expect(joined.body).toEqual(unknown.body);

    const stranger = (await server.signUp()).cookie;
    expect((await gmFetch(stranger, `/api/library/encounter-edits/${roomId}`)).status).toBe(404);
    expect((await save(stranger, roomId, { name: "Mine" })).status).toBe(404);
    expect((await gmFetch(cookie, `/api/library/encounter-edits/${normal.roomId}`)).status).toBe(404);
    expect((await save(cookie, normal.roomId, { name: "x" })).status).toBe(404);
  });

  it("is deleted when the GM discards it", async () => {
    server = await startServer();
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const { roomId } = await editing(cookie, { mapAssetId: map.id });
    expect((await gmFetch(cookie, `/api/rooms/${roomId}`, { method: "DELETE" })).status).toBe(204);
    expect(await server.store.roomExists(roomId)).toBe(false);
  });

  it("is swept when left behind for a day, keeping younger ones, normal rooms and the template", async () => {
    let clock = Date.now();
    server = await startServer(new MemoryRoomStore(), { now: () => clock });
    const { cookie } = await server.signUp();
    const map = await upload(cookie, "Crypt");
    const old = await editing(cookie, { mapAssetId: map.id });
    const created = (await (await save(cookie, old.roomId, { name: "Kept" })).json()) as EncounterSummary;
    const normal = await server.createRoom("GM", { cookie, roomName: "Table" });

    // Just under a day old: kept.
    clock += TEMPORARY_ROOM_LIFETIME_MS - 60_000;
    await server.app.sweepTemporaryRooms();
    expect(await server.store.roomExists(old.roomId)).toBe(true);

    clock += 2 * 60_000;
    await server.app.sweepTemporaryRooms();
    expect(await server.store.roomExists(old.roomId)).toBe(false);
    expect(await server.store.roomExists(normal.roomId)).toBe(true);
    expect((await list(cookie)).map((t) => t.id)).toEqual([created.id]);
  });
});
