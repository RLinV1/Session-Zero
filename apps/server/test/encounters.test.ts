import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  tableOf, type EncounterSummary, type GmRoomSummary, type LibraryAsset, type LibraryUsageResponse, type Token,
} from "@vtt/shared";
import { startServer, viewFor, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const PNG = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#334455" } }).png().toBuffer();

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

async function upload(cookie: string, kind: "map" | "token", name: string) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("name", name);
  form.append("width", "256");
  form.append("height", "256");
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form });
  return (await res.json()) as LibraryAsset;
}

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

const named = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
const ok = async (p: Promise<unknown>) => expect(await p).toMatchObject({ type: "ack" });

/** A signed-in GM whose room has a library map, a goblin, a hidden orc owned by nobody, a player's rogue and fog. */
async function prepared() {
  const cookie = (await server.signUp()).cookie;
  const map = await upload(cookie, "map", "Cave");
  const creds = await server.createRoom("GM", { cookie, roomName: "Prep" });
  const gm = await connect(creds);
  const alice = await connect(await server.join(creds.inviteCode, "Alice"));
  await ok(gm.command({ type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id } }));
  await ok(gm.command({ type: "token.create", name: "Goblin", position: { x: 105, y: 105 } }));
  await ok(gm.command({ type: "token.create", name: "Orc", position: { x: 175, y: 105 }, hidden: true }));
  await ok(gm.command({ type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] }));
  await ok(gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 100, y: 100 }, to: { x: 200, y: 200 } } }));
  await ok(gm.command({ type: "initiative.start", entries: [{ tokenId: named(gm, "Goblin")!.id, score: 12 }] }));
  await alice.waitForSeq(gm.seq);
  return { cookie, map, creds, gm, alice };
}

/** The library owner id behind a signed-in cookie, for reading templates straight from the store. */
async function ownerOf(cookie: string) {
  const me = (await (await gmFetch(cookie, "/api/auth/me")).json()) as { account: { id: string } };
  return (await server.store.findUserById(me.account.id))!.ownerId;
}

const save = (cookie: string, roomId: string, name = "Goblin ambush") =>
  gmFetch(cookie, "/api/library/encounters", { method: "POST", body: { roomId, name } });
const library = async (cookie: string) => (await (await gmFetch(cookie, "/api/library")).json()) as LibraryAsset[];
const list = async (cookie: string) => (await (await gmFetch(cookie, "/api/library/encounters")).json()) as EncounterSummary[];

describe("save a room's board as a template (FR-GM-13)", () => {
  it("saves, lists, renames and deletes a template, keeping board data on the server", async () => {
    const { cookie, map, creds } = await prepared();
    const res = await save(cookie, creds.roomId, "  Goblin ambush ");
    expect(res.status).toBe(201);
    const saved = (await res.json()) as EncounterSummary;
    expect(saved).toMatchObject({ name: "Goblin ambush", mapName: map.name, tokenCount: 3, fogCount: 1 });
    expect(JSON.stringify(saved)).not.toMatch(/ownerGmId|Orc|"data"/);
    expect(saved.mapAssetId).toBe(map.id);
    expect(await list(cookie)).toEqual([saved]);

    const renamed = await gmFetch(cookie, `/api/library/encounters/${saved.id}`, { method: "PATCH", body: { name: "Ambush v2" } });
    expect(await renamed.json()).toMatchObject({ id: saved.id, name: "Ambush v2" });
    expect((await gmFetch(cookie, `/api/library/encounters/${saved.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await list(cookie)).toEqual([]);
    expect((await gmFetch(cookie, `/api/library/encounters/${saved.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejects duplicate names on create and rename, scoped to each owner", async () => {
    const { cookie, creds } = await prepared();
    const first = await save(cookie, creds.roomId, "Ambush");
    expect(first.status).toBe(201);
    const saved = await first.json() as EncounterSummary;
    const duplicates = await Promise.all([save(cookie, creds.roomId, " ambush "), save(cookie, creds.roomId, "AMBUSH")]);
    expect(duplicates.map((response) => response.status)).toEqual([409, 409]);
    const second = await (await save(cookie, creds.roomId, "Other")).json() as EncounterSummary;
    expect((await gmFetch(cookie, `/api/library/encounters/${second.id}`, { method: "PATCH", body: { name: "ambush" } })).status).toBe(409);
    expect((await gmFetch(cookie, `/api/library/encounters/${saved.id}`, { method: "PATCH", body: { name: "AMBUSH" } })).status).toBe(200);
    const other = await prepared();
    expect((await save(other.cookie, other.creds.roomId, "Ambush")).status).toBe(201);
    await gmFetch(cookie, `/api/library/encounters/${saved.id}`, { method: "DELETE" });
    expect((await save(cookie, creds.roomId, "Ambush")).status).toBe(201);
  });

  it("saves the library map's own size, not the size the room's client claimed", async () => {
    const { cookie, map, creds, gm } = await prepared();
    await ok(gm.command({ type: "scene.setMap", map: { url: map.url, width: map.width * 3, height: map.height * 3, assetId: map.id } }));
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    expect((await server.store.findEncounter(saved.id, await ownerOf(cookie)))!.data.map).toMatchObject({ width: map.width, height: map.height });
  });

  it("refuses a room the caller does not own, and anyone signed out", async () => {
    const { creds } = await prepared();
    const stranger = (await server.signUp()).cookie;
    expect((await save(stranger, creds.roomId)).status).toBe(404);
    expect((await gmFetch(null, "/api/library/encounters")).status).toBe(401);
    expect((await gmFetch(null, "/api/library/encounters", { method: "POST", body: { roomId: creds.roomId, name: "x" } })).status).toBe(401);
    expect(await list(stranger)).toEqual([]);
  });

  it("needs a library map, a name, and stays under 50 templates", async () => {
    const { cookie, creds, gm } = await prepared();
    expect((await save(cookie, creds.roomId, "   ")).status).toBe(400);
    expect((await save(cookie, creds.roomId, "x".repeat(61))).status).toBe(400);

    await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/direct.png", width: 500, height: 500 } }));
    const direct = await save(cookie, creds.roomId);
    expect(direct.status).toBe(400);
    expect(await direct.json()).toEqual({ error: expect.stringContaining("library") });

    await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/other.png", width: 500, height: 500, assetId: "11111111-1111-4111-8111-111111111111" } }));
    expect((await save(cookie, creds.roomId)).status).toBe(400);
    expect(await list(cookie)).toEqual([]);

    const fresh = await prepared();
    for (let i = 0; i < 50; i++) expect((await save(fresh.cookie, fresh.creds.roomId, `T${i}`)).status).toBe(201);
    expect((await save(fresh.cookie, fresh.creds.roomId, "one too many")).status).toBe(400);
    expect(await list(fresh.cookie)).toHaveLength(50);
  });

  it("saves from a room on a shipped map placed by URL, using the owner's seeded row (seed-shipped-maps)", async () => {
    const { cookie, creds, gm } = await prepared();
    await ok(gm.command({ type: "scene.setMap", map: { url: "/img/map-ice.webp", width: 3269, height: 1882 } }));
    const res = await save(cookie, creds.roomId);
    expect(res.status).toBe(201);
    const saved = (await res.json()) as EncounterSummary;
    expect(saved.mapName).toBe("Hollowfrost Keep");
    const rows = await library(cookie);
    expect(saved.mapAssetId).toBe(rows.find((a) => a.url === "/img/map-ice.webp")?.id);
  });

  it("refuses a shipped map URL once the owner deleted that library row (seed-shipped-maps)", async () => {
    const { cookie, creds, gm } = await prepared();
    const ice = (await library(cookie)).find((a) => a.url === "/img/map-ice.webp")!;
    expect((await gmFetch(cookie, `/api/library/${ice.id}`, { method: "DELETE" })).status).toBe(204);
    await ok(gm.command({ type: "scene.setMap", map: { url: ice.url, width: ice.width, height: ice.height } }));
    const res = await save(cookie, creds.roomId);
    expect(res.status).toBe(400);
    expect((await library(cookie)).some((a) => a.url === ice.url)).toBe(false);
  });

  it("keeps templates private to their GM", async () => {
    const { cookie, creds } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const stranger = (await server.signUp()).cookie;
    expect((await gmFetch(stranger, `/api/library/encounters/${saved.id}`, { method: "PATCH", body: { name: "Mine" } })).status).toBe(404);
    expect((await gmFetch(stranger, `/api/library/encounters/${saved.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await gmFetch(stranger, `/api/library/encounters/${crypto.randomUUID()}`, { method: "DELETE" })).status).toBe(404);
    expect(await list(cookie)).toHaveLength(1);
  });

  it("lists the template in its map's usage warning", async () => {
    const { cookie, map, creds } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const usage = (await (await gmFetch(cookie, `/api/library/${map.id}/usage`)).json()) as LibraryUsageResponse;
    expect(usage.encounters).toEqual([{ id: saved.id, name: "Goblin ambush" }]);
  });
});

describe("start a room from a template (FR-GM-13)", () => {
  async function templateRoom(cookie: string, templateId: string, roomName = "Next session") {
    return gmFetch(cookie, "/api/rooms", { method: "POST", body: { roomName, displayName: "GM", guestToken: server.newGuestToken(), templateId } });
  }

  it("opens with the saved board, fresh token ids and no owners", async () => {
    const { cookie, creds, map, gm } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const res = await templateRoom(cookie, saved.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { roomId: string; inviteCode: string; participantId: string };

    const rooms = (await (await gmFetch(cookie, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.id)).toContain(body.roomId);
    const events = await server.store.loadEvents(body.roomId);
    const applied = events.find((e) => e.event.type === "EncounterApplied")!.event as Extract<typeof events[number]["event"], { type: "EncounterApplied" }>;
    expect(applied.applied.scene.map).toMatchObject({ url: map.url, assetId: map.id });
    const tokens = Object.values(applied.applied.tokens);
    expect(tokens.map((t) => t.name).sort()).toEqual(["Goblin", "Orc", "Rogue"]);
    expect(tokens.every((t) => t.ownerIds.length === 0)).toBe(true);
    expect(tokens.map((t) => t.id)).not.toEqual(expect.arrayContaining(Object.keys(gm.state.tokens)));
    expect(applied.applied.initiative).toBeNull();
    expect(Object.keys(applied.applied.fog)).toHaveLength(1);
  });

  it("makes no room when the template is missing, foreign or its map was deleted", async () => {
    const { cookie, creds, map } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const before = ((await (await gmFetch(cookie, "/api/gm/rooms")).json()) as GmRoomSummary[]).length;

    const stranger = (await server.signUp()).cookie;
    expect((await templateRoom(stranger, saved.id)).status).toBe(404);
    expect((await templateRoom(cookie, crypto.randomUUID())).status).toBe(404);

    expect((await gmFetch(cookie, `/api/library/${map.id}`, { method: "DELETE" })).status).toBe(204);
    const gone = await templateRoom(cookie, saved.id);
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: expect.stringContaining("deleted") });
    expect(((await (await gmFetch(cookie, "/api/gm/rooms")).json()) as GmRoomSummary[]).length).toBe(before);
    expect(await list(cookie)).toEqual([expect.objectContaining({ id: saved.id, mapName: null })]);
  });
});

describe("encounter templates over the wire (FR-GM-13)", () => {
  async function twoRooms() {
    const prep = await prepared();
    const saved = (await (await save(prep.cookie, prep.creds.roomId)).json()) as EncounterSummary;
    const target = await server.createRoom("GM", { cookie: prep.cookie, roomName: "Table" });
    const gm = await connect(target);
    const bob = await connect(await server.join(target.inviteCode, "Bob"));
    await ok(gm.command({ type: "token.create", name: "Hero", position: { x: 35, y: 35 }, ownerIds: [bob.participantId] }));
    await ok(gm.command({ type: "chat.send", text: "ready" }));
    await bob.waitForSeq(gm.seq);
    return { ...prep, saved, target, gm, bob };
  }

  it("replaces the board for everyone, filtered per viewer, and undoes it", async () => {
    const { saved, gm, bob } = await twoRooms();
    const before = tableOf(gm.state);
    const chat = gm.state.chat;

    await ok(gm.command({ type: "encounter.apply", templateId: saved.id }));
    await bob.waitForSeq(gm.seq);
    expect(Object.values(gm.state.tokens).map((t) => t.name).sort()).toEqual(["Goblin", "Orc", "Rogue"]);
    expect(gm.state.chat).toEqual(chat);
    expect(bob.state).toEqual(viewFor(gm.state, bob));
    expect(named(bob, "Orc")).toBeUndefined();
    expect(named(bob, "Goblin")).toBeUndefined(); // under the template's fog
    expect(named(bob, "Rogue")).toBeDefined();
    const seenByBob = bob.rawLog.join("\n");
    expect(seenByBob).not.toContain("EncounterApplied");
    // Neither the hidden token, the one under fog, nor the template's id travelled to the player.
    for (const secret of ["Orc", "Goblin", saved.id]) expect(seenByBob).not.toContain(secret);

    const applied = [...gm.state.undo].reverse().find((e) => e.events[0]?.type === "EncounterApplied")!;
    await ok(gm.command({ type: "history.undo", commandId: applied.commandId }));
    await bob.waitForSeq(gm.seq);
    expect(tableOf(gm.state)).toEqual(before);
    expect(named(gm, "Hero")!.ownerIds).toEqual([bob.participantId]);
    expect(bob.state).toEqual(viewFor(gm.state, bob));
  });

  it("refuses players, and a template that is not the GM's, with the same message", async () => {
    const { saved, gm, bob } = await twoRooms();
    expect(await bob.command({ type: "encounter.apply", templateId: saved.id })).toMatchObject({ type: "rejected", code: "forbidden" });

    const other = await server.createRoom("Other GM");
    const otherGm = await connect(other);
    const foreign = await otherGm.command({ type: "encounter.apply", templateId: saved.id });
    const missing = await gm.command({ type: "encounter.apply", templateId: crypto.randomUUID() });
    expect(foreign).toMatchObject({ type: "rejected", code: "invalid" });
    expect(foreign).toMatchObject({ message: (missing as { message: string }).message });
    expect(Object.keys(otherGm.state.tokens)).toHaveLength(0);
  });

  it("rejects a template saved in a format this server does not know, and changes nothing", async () => {
    const { cookie, saved, gm } = await twoRooms();
    const me = (await (await gmFetch(cookie, "/api/auth/me")).json()) as { account: { id: string } };
    const owner = (await server.store.findUserById(me.account.id))!.ownerId;
    const record = (await server.store.findEncounter(saved.id, owner))!;
    await server.store.createEncounter({ ...record, id: crypto.randomUUID(), name: "Future template", version: 99 }, 50);
    const future = (await server.store.listEncounters(owner)).find((e) => e.version === 99)!;
    const before = tableOf(gm.state);
    expect(await gm.command({ type: "encounter.apply", templateId: future.id })).toMatchObject({
      type: "rejected", code: "invalid", message: expect.stringContaining("format"),
    });
    expect(tableOf(gm.state)).toEqual(before);
  });

  it("rejects an apply that names something that is not a template id, as a rejection and not a server error", async () => {
    const { gm } = await twoRooms();
    const before = tableOf(gm.state);
    expect(await gm.command({ type: "encounter.apply", templateId: "not-a-uuid" })).toMatchObject({
      type: "rejected", code: "invalid", message: expect.stringContaining("isn't available"),
    });
    expect(tableOf(gm.state)).toEqual(before);
  });

  it("rejects an apply whose map was deleted, and changes nothing", async () => {
    const { cookie, map, saved, gm } = await twoRooms();
    await gmFetch(cookie, `/api/library/${map.id}`, { method: "DELETE" });
    const before = tableOf(gm.state);
    expect(await gm.command({ type: "encounter.apply", templateId: saved.id })).toMatchObject({
      type: "rejected", code: "invalid", message: expect.stringContaining("deleted"),
    });
    expect(tableOf(gm.state)).toEqual(before);
  });
});

describe("replace a template from a room (FR-GM-13, ADR 0033)", () => {
  const replace = (cookie: string, id: string, roomId: string) =>
    gmFetch(cookie, `/api/library/encounters/${id}/from-room`, { method: "PUT", body: { roomId } });

  it("rebuilds the template from the room, keeping its id and name, and preserves walls", async () => {
    const { cookie, creds, gm } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    await ok(gm.command({ type: "token.create", name: "Ogre", position: { x: 245, y: 105 } }));
    await ok(gm.command({ type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }] }));
    const res = await replace(cookie, saved.id, creds.roomId);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: saved.id, name: "Goblin ambush", tokenCount: 4, createdAt: saved.createdAt });
    expect(await list(cookie)).toHaveLength(1);
    const read = (await server.store.findEncounter(saved.id, await ownerOf(cookie)))!;
    expect(read.data.tokens.map((t) => t.name).sort()).toEqual(["Goblin", "Ogre", "Orc", "Rogue"]);
    expect(JSON.stringify(read.data)).not.toMatch(/ownerIds/);
    expect(read.data.walls).toHaveLength(1);
  });

  it("refuses a room on a different map with 409 and changes nothing", async () => {
    const { cookie, creds, gm } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const other = await upload(cookie, "map", "Other");
    await ok(gm.command({ type: "scene.setMap", map: { url: other.url, width: other.width, height: other.height, assetId: other.id } }));
    const res = await replace(cookie, saved.id, creds.roomId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringContaining("new template") });
    expect((await list(cookie))[0]).toMatchObject({ tokenCount: 3, updatedAt: saved.updatedAt });
  });

  it("answers 404 for another GM's template or room", async () => {
    const { cookie, creds } = await prepared();
    const saved = (await (await save(cookie, creds.roomId)).json()) as EncounterSummary;
    const stranger = await prepared();
    expect((await replace(stranger.cookie, saved.id, stranger.creds.roomId)).status).toBe(404);
    expect((await replace(cookie, saved.id, stranger.creds.roomId)).status).toBe(404);
    expect((await replace(cookie, crypto.randomUUID(), creds.roomId)).status).toBe(404);
  });
});
