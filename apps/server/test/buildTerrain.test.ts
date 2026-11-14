import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateRoomResponse, EncounterTemplateData, LibraryAsset, TerrainRun } from "@vtt/shared";
import { BuildChoiceOffError, type NewBuildItem } from "../src/store/buildStore";
import type { MemoryRoomStore } from "../src/store/memoryRoomStore";
import type { RoomStore } from "../src/store/roomStore";
import { newGuestToken, startServer, type HttpAccount } from "./helpers";
import { storeCases } from "./storeHarness";

/**
 * AI-proposed permanent terrain in the game builder (FR-GM-26, FR-GM-27, ADR 0071): the owner's
 * terrain choice, the setup tools' terrain, the owner's review, and publication into the library
 * map, the encounter and the room. HTTP flows run on every store the harness has.
 */

const GRID = { cellSize: 70, offsetX: 0, offsetY: 0 };
const run = (row: number, start: number, end: number, kind: TerrainRun["kind"] = "difficult"): TerrainRun => ({ row, start, end, kind });
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#335544" } }).png().toBuffer();

// 8 by 6 squares of 50 pixels, with its grid from the file, a wall along row line 2 and one opening in it.
const uvtt = async () => JSON.stringify({
  format: 0.3,
  image: (await png(400, 300)).toString("base64"),
  resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
  line_of_sight: [[{ x: 0, y: 2 }, { x: 8, y: 2 }]],
  portals: [{ bounds: [{ x: 3, y: 2 }, { x: 4, y: 2 }], position: { x: 3.5, y: 2 }, rotation: 0, closed: true, freestanding: false }],
});

describe.each(storeCases)("AI terrain in a build on %s (FR-GM-26, ADR 0071)", (_name, makeStore) => {
  let store: RoomStore;
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    store = makeStore();
    server = await startServer(store as MemoryRoomStore);
  });
  afterEach(() => server.close());

  const withPass = (pass: string, method: string, url: string, body?: unknown) => fetch(server.base + url, {
    method,
    headers: { authorization: `Bearer ${pass}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  async function upload(pass: string, kind: "map" | "uvtt" | "token", name: string, data: Uint8Array | string) {
    const body = new FormData();
    body.append("file", new Blob([typeof data === "string" ? data : Buffer.from(data)], { type: kind === "uvtt" ? "application/json" : "image/png" }), name);
    const res = await fetch(`${server.base}/api/build/current/files?kind=${kind}`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body });
    expect(res.status).toBe(201);
    return (await res.json() as { file: { id: string } }).file.id;
  }

  async function startWith(choices: { aiGrid?: boolean; aiWalls?: boolean; aiTerrain?: boolean } = {}) {
    const account = await server.signUp({ displayName: "Vincent" });
    const res = await account.request("POST", "/api/builds", { name: "Lanternfall", ...choices });
    expect(res.status).toBe(201);
    const body = await res.json() as { build: { id: string; choices: unknown }; pass: string };
    return { account, id: body.build.id, pass: body.pass, choices: body.build.choices, ownerId: (await store.findUserById(account.view!.id))!.ownerId };
  }

  /** A UVTT map, whose grid is the file's own, so the AI can keep working on it. */
  async function uvttMap(pass: string, key = "shop") {
    const fileId = await upload(pass, "uvtt", "chandlery.uvtt", await uvtt());
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key, name: "Chandlery", fileId })).status).toBe(200);
    return fileId;
  }

  /** A plain map with the AI's proposed grid, which the owner hasn't confirmed. */
  async function imageMap(pass: string, grid: unknown = GRID) {
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: grid })).status).toBe(200);
    return fileId;
  }

  /** What get_map_setup returns, as far as these tests read it. */
  type SetupView = Record<string, unknown> & { terrain: { runs: TerrainRun[]; state: string }; terrainSquares: unknown; problems: string[] };
  /** A draft map as the owner's page reads it. */
  type MapData = Record<string, unknown> & { fileId: string; setup: Record<string, unknown> & { terrain?: TerrainRun[] } };
  const saveSetup = (pass: string, body: unknown, key = "shop") => withPass(pass, "PUT", `/api/build/current/maps/${key}/setup`, body);
  const readSetup = async (pass: string, key = "shop") => (await withPass(pass, "GET", `/api/build/current/maps/${key}/setup`)).json() as Promise<SetupView>;
  const mapItem = async (account: HttpAccount, id: string, key = "shop") =>
    (await account.json<{ items: { kind: string; key: string; updatedAt: string; editedByUser: boolean; data: MapData }[] }>("GET", `/api/builds/${id}`)).items.find((i) => i.kind === "map" && i.key === key)!;
  const reviewedNow = async (account: HttpAccount, id: string) =>
    Object.fromEntries((await account.json<{ items: { kind: string; key: string; updatedAt: string }[] }>("GET", `/api/builds/${id}`)).items.map((i) => [`${i.kind}/${i.key}`, i.updatedAt]));
  const publish = async (account: HttpAccount, id: string, body: Record<string, unknown>) =>
    account.request("POST", `/api/builds/${id}/publish`, { ...body, reviewed: await reviewedNow(account, id) });
  const uploaded = async (account: HttpAccount) => (await account.json<LibraryAsset[]>("GET", "/api/library")).filter((a) => !a.url.startsWith("/img/"));
  const ownerSetup = (account: HttpAccount, id: string, setup: unknown, updatedAt: string, key = "shop") =>
    account.request("PUT", `/api/builds/${id}/maps/${key}/setup`, { setup, updatedAt });

  describe("the owner's terrain choice", () => {
    it("is off for a new build, and shown to the owner and the AI", async () => {
      const { pass, choices } = await startWith({ aiGrid: true, aiWalls: true });
      expect(choices).toEqual({ aiGrid: true, aiWalls: true, aiTerrain: false });
      expect((await (await withPass(pass, "GET", "/api/build/current")).json() as { allowed: unknown }).allowed).toEqual({ grids: true, walls: true, terrain: false });
    });

    it("is kept when a page from before it changes the other two, and turned off when sent", async () => {
      const { account, id } = await startWith({ aiTerrain: true });
      const older = await account.json<{ build: { choices: unknown } }>("PUT", `/api/builds/${id}/choices`, { aiGrid: true, aiWalls: false });
      expect(older.build.choices).toEqual({ aiGrid: true, aiWalls: false, aiTerrain: true });
      const off = await account.json<{ build: { choices: unknown } }>("PUT", `/api/builds/${id}/choices`, { aiGrid: true, aiWalls: false, aiTerrain: false });
      expect(off.build.choices).toEqual({ aiGrid: true, aiWalls: false, aiTerrain: false });
    });

    it("can't be turned on with a pass", async () => {
      const { account, id, pass } = await startWith();
      expect((await withPass(pass, "PUT", `/api/builds/${id}/choices`, { aiGrid: false, aiWalls: false, aiTerrain: true })).status).toBe(401);
      expect((await account.json<{ build: { choices: { aiTerrain: boolean } } }>("GET", `/api/builds/${id}`)).build.choices.aiTerrain).toBe(false);
    });
  });

  describe("get_map_setup and save_map_setup", () => {
    it("saves terrain alone with walls off, and reads it back with the squares it can cover", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      const saved = await saveSetup(pass, { terrain: [run(0, 0, 1), run(0, 2, 3), run(4, 6, 6, "blocked")] });
      expect(saved.status).toBe(200);
      expect(await readSetup(pass)).toMatchObject({
        allowed: { walls: false, terrain: true },
        columns: 8, rows: 6,
        terrainSquares: { columns: { from: 0, to: 7 }, rows: { from: 0, to: 5 } },
        // Next-door runs of one kind are joined.
        terrain: { runs: [run(0, 0, 3), run(4, 6, 6, "blocked")], squares: { difficult: 4, blocked: 1 }, proposedOn: { cellSize: 50, offsetX: 0, offsetY: 0 }, state: "ready" },
        problems: [],
      });
    });

    it("refuses terrain while the owner doesn't allow it, saying where to turn it on, but still lets the AI look", async () => {
      const { pass } = await startWith({ aiWalls: true });
      await uvttMap(pass);
      const refused = await saveSetup(pass, { terrain: [run(1, 1, 1)] });
      expect(refused.status).toBe(403);
      expect(await refused.text()).toMatch(/Let my AI propose terrain/);
      expect((await readSetup(pass)).terrain).toMatchObject({ runs: [], state: "none" });
    });

    it("refuses walls with terrain alone allowed", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      const refused = await saveSetup(pass, { openings: [{ number: 1, kind: "door", state: "closed" }] });
      expect(refused.status).toBe(403);
      expect(await refused.text()).toMatch(/Let my AI set walls, doors and windows/);
    });

    it.each([
      ["walls", { aiTerrain: true }, /Let my AI set walls[\s\S]*Nothing was saved/],
      ["terrain", { aiWalls: true }, /Let my AI propose terrain[\s\S]*Nothing was saved/],
    ])("refuses a mixed save with %s not allowed, and writes nothing of it", async (_part, choices, message) => {
      const { account, id, pass } = await startWith(choices);
      await uvttMap(pass);
      const before = await mapItem(account, id);
      const refused = await saveSetup(pass, { openings: [{ number: 1, kind: "door", state: "locked" }], terrain: [run(1, 1, 1, "blocked")] });
      expect(refused.status).toBe(403);
      expect(await refused.text()).toMatch(message);
      expect(await mapItem(account, id)).toEqual(before);
    });

    it("keeps terrain left out, replaces it when sent, and clears it with an empty list", async () => {
      const { pass } = await startWith({ aiWalls: true, aiTerrain: true });
      await uvttMap(pass);
      expect((await saveSetup(pass, { terrain: [run(1, 1, 2)] })).status).toBe(200);
      expect((await saveSetup(pass, { openings: [{ number: 1, kind: "door", state: "closed" }], marks: [{ square: { column: 5, row: 5 }, reason: "A pool, maybe deep." }] })).status).toBe(200);
      expect(await readSetup(pass)).toMatchObject({ terrain: { runs: [run(1, 1, 2)] }, openings: [{ number: 1, now: { kind: "door" } }], marks: [{ reason: "A pool, maybe deep." }] });
      expect((await saveSetup(pass, { terrain: [run(3, 0, 0, "blocked")] })).status).toBe(200);
      expect((await readSetup(pass)).terrain.runs).toEqual([run(3, 0, 0, "blocked")]);
      const cleared = await saveSetup(pass, { terrain: [] });
      expect(cleared.status).toBe(200);
      // Clearing terrain leaves the walls, doors and marks.
      expect(await readSetup(pass)).toMatchObject({ terrain: { runs: [], state: "none", proposedOn: null }, openings: [{ now: { kind: "door" } }], marks: [{ reason: "A pool, maybe deep." }] });
    });

    it("keeps terrain when the map is saved again on its file", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      const fileId = await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 2)] });
      await withPass(pass, "POST", "/api/build/current/maps", { key: "shop", name: "The Guild Chandlery", fileId });
      expect((await readSetup(pass)).terrain.runs).toEqual([run(1, 1, 2)]);
    });

    it.each([
      ["out of order", [run(2, 0, 0), run(1, 0, 0)], /ordered and non-overlapping/],
      ["overlapping", [run(1, 0, 3), run(1, 2, 4, "blocked")], /ordered and non-overlapping/],
      ["of an unknown kind", [{ row: 1, start: 0, end: 0, kind: "normal" }], /terrain/],
      ["past the cell limit", [run(0, 0, 10_000)], /Too many terrain cells/],
      ["off the map", [run(1, 7, 9)], /Terrain run 1 \(difficult, row 1, columns 7 to 9\) has a square off the map/],
    ])("refuses runs %s, and changes nothing", async (_case, terrain, message) => {
      const { pass } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(5, 0, 0)] });
      const res = await saveSetup(pass, { terrain });
      expect(res.status).toBe(422);
      expect(await res.text()).toMatch(message);
      expect((await readSetup(pass)).terrain.runs).toEqual([run(5, 0, 0)]);
    });

    it("needs a grid first", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      await imageMap(pass, null);
      const res = await saveSetup(pass, { terrain: [run(1, 1, 1)] }, "cave");
      expect(res.status).toBe(422);
      expect(await res.text()).toMatch(/Terrain needs a grid first/);
    });

    it("counts the squares a grid offset crops at the map's edges", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      await imageMap(pass, { cellSize: 70, offsetX: 20, offsetY: 30 });
      expect((await readSetup(pass, "cave")).terrainSquares).toEqual({ columns: { from: -1, to: 9 }, rows: { from: -1, to: 9 } });
      expect((await saveSetup(pass, { terrain: [run(-1, -1, 9, "blocked"), run(9, 9, 9)] }, "cave")).status).toBe(200);
      expect((await saveSetup(pass, { terrain: [run(0, 10, 10)] }, "cave")).status).toBe(422);
    });

    it("checks terrain only when it is sent, so walls a grid change put off the map don't hold it back", async () => {
      const { pass } = await startWith({ aiWalls: true, aiTerrain: true });
      await imageMap(pass);
      expect((await saveSetup(pass, { lines: [{ from: { column: 9, row: 1 }, to: { column: 10, row: 1 }, kind: "wall" }] }, "cave")).status).toBe(200);
      // A smaller grid puts that line's corner off the map; terrain alone still saves.
      await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId: (await mapItemByPass(pass, "cave")).fileId, proposedGrid: { cellSize: 70, offsetX: 50, offsetY: 0 } });
      expect((await saveSetup(pass, { terrain: [run(1, 1, 1)] }, "cave")).status).toBe(200);
    });

    it("says terrain proposed before a grid change sits on another grid", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      const fileId = await imageMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 1)] }, "cave");
      await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: { cellSize: 50, offsetX: 0, offsetY: 0 } });
      const view = await readSetup(pass, "cave");
      expect(view.terrain.state).toBe("otherGrid");
      expect(view.problems).toEqual([expect.stringMatching(/proposed on 70-pixel squares at offset \(0, 0\), not on the grid the map has now/)]);
      const issues = (await (await withPass(pass, "GET", "/api/build/current/check")).json() as { issues: { message: string }[] }).issues;
      expect(issues.map((i) => i.message)).toContainEqual(expect.stringMatching(/Its terrain was proposed on 70-pixel squares/));
    });

    it("won't let the AI change terrain the owner has edited, or a published map", async () => {
      const edited = await startWith({ aiTerrain: true });
      await imageMap(edited.pass);
      await saveSetup(edited.pass, { terrain: [run(1, 1, 1)] }, "cave");
      expect((await edited.account.request("POST", `/api/builds/${edited.id}/maps/cave/grid`, GRID)).status).toBe(200);
      const refused = await saveSetup(edited.pass, { terrain: [] }, "cave");
      expect(refused.status).toBe(409);
      expect(await refused.text()).toMatch(/The user changed this item/);

      const published = await startWith({ aiTerrain: true });
      await uvttMap(published.pass);
      expect((await publish(published.account, published.id, { maps: ["shop"] })).status).toBe(200);
      expect((await saveSetup(published.pass, { terrain: [run(1, 1, 1)] })).status).toBe(409);
    });

    it("rechecks the choice inside the write, so turning terrain off while a save is under way wins", async () => {
      const { account, id, pass, ownerId } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 1)] });
      // The owner turns terrain off after the route read the build and before the store writes.
      const findFile = store.findBuildFile.bind(store);
      const spy = vi.spyOn(store, "findBuildFile").mockImplementationOnce(async (...args) => {
        await store.setBuildChoices(id, ownerId, { aiGrid: false, aiWalls: false, aiTerrain: false });
        return findFile(...args);
      });
      const refused = await saveSetup(pass, { terrain: [run(2, 2, 2, "blocked")] });
      spy.mockRestore();
      expect(refused.status).toBe(403);
      expect(await refused.text()).toMatch(/Let my AI propose terrain/);
      // What was proposed before stays for the owner to review.
      expect((await mapItem(account, id)).data.setup.terrain).toEqual([run(1, 1, 1)]);
    });

    it("draws the terrain on view_file's picture", async () => {
      const { pass } = await startWith({ aiTerrain: true });
      const fileId = await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(0, 0, 7, "blocked")] });
      const res = await withPass(pass, "GET", `/api/build/current/files/${fileId}/preview?overlay=1&fromColumn=0&toColumn=1&fromRow=0&toRow=0`);
      expect(res.status).toBe(200);
      const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
      // The map is a flat dark green; a Blocked square is drawn over it, so its middle changed.
      const middle = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 4)) * info.channels;
      expect([data[middle], data[middle + 1], data[middle + 2]]).not.toEqual([0x33, 0x55, 0x44]);
    });
  });

  const mapItemByPass = async (pass: string, key: string) =>
    ((await (await withPass(pass, "GET", "/api/build/current")).json()) as { items: { kind: string; key: string; data: { fileId: string } }[] }).items.find((i) => i.kind === "map" && i.key === key)!.data;

  describe("the owner's review", () => {
    it("clears all terrain, keeping walls, and marks the map edited", async () => {
      const { account, id, pass } = await startWith({ aiWalls: true, aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { openings: [{ number: 1, kind: "door", state: "locked" }], terrain: [run(1, 1, 2)] });
      const item = await mapItem(account, id);
      const cleared = await ownerSetup(account, id, { ...item.data.setup, terrain: [] }, item.updatedAt);
      expect(cleared.status).toBe(200);
      const after = await mapItem(account, id);
      expect(after.editedByUser).toBe(true);
      expect(after.data.setup).toEqual({ openings: [{ number: 1, kind: "door", state: "locked" }], lines: [], marks: [] });
    });

    it("keeps terrain when the page sends it back unchanged or leaves it out, and never takes the page's grid", async () => {
      const { account, id, pass } = await startWith({ aiWalls: true, aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 2)] });
      let item = await mapItem(account, id);
      const roundTrip = { ...item.data.setup, openings: [{ number: 1, kind: "window", state: "open" }], terrainGrid: { cellSize: 10, offsetX: 0, offsetY: 0 } };
      expect((await ownerSetup(account, id, roundTrip, item.updatedAt)).status).toBe(200);
      item = await mapItem(account, id);
      expect(item.data.setup).toMatchObject({ terrain: [run(1, 1, 2)], terrainGrid: { cellSize: 50, offsetX: 0, offsetY: 0 } });
      expect((await ownerSetup(account, id, { openings: [], lines: [], marks: [] }, item.updatedAt)).status).toBe(200);
      expect((await mapItem(account, id)).data.setup.terrain).toEqual([run(1, 1, 2)]);
    });

    it("can't paint terrain from the build page", async () => {
      const { account, id, pass } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 2)] });
      const item = await mapItem(account, id);
      const painted = await ownerSetup(account, id, { ...item.data.setup, terrain: [run(1, 1, 3)] }, item.updatedAt);
      expect(painted.status).toBe(422);
      expect(await painted.text()).toMatch(/only clear the terrain/);
    });

    it("clears terrain on a version the AI hasn't changed since, and not otherwise", async () => {
      const { account, id, pass } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 2)] });
      const seen = await mapItem(account, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveSetup(pass, { terrain: [run(2, 1, 2, "blocked")] });
      const stale = await ownerSetup(account, id, { ...seen.data.setup, terrain: [] }, seen.updatedAt);
      expect(stale.status).toBe(409);
      expect((await mapItem(account, id)).data.setup.terrain).toEqual([run(2, 1, 2, "blocked")]);
    });

    it("clears terrain even when a grid correction has put the AI's lines off the map", async () => {
      const { account, id, pass } = await startWith({ aiWalls: true, aiTerrain: true });
      await imageMap(pass);
      await saveSetup(pass, { lines: [{ from: { column: 9, row: 1 }, to: { column: 10, row: 1 }, kind: "wall" }], terrain: [run(1, 1, 1)] }, "cave");
      expect((await account.request("POST", `/api/builds/${id}/maps/cave/grid`, { cellSize: 70, offsetX: 50, offsetY: 0 })).status).toBe(200);
      const item = await mapItem(account, id, "cave");
      expect((await ownerSetup(account, id, { ...item.data.setup, terrain: [] }, item.updatedAt, "cave")).status).toBe(200);
      expect((await mapItem(account, id, "cave")).data.setup.terrain).toBeUndefined();
    });
  });

  describe("publishing terrain", () => {
    async function terrainEncounter(terrain: TerrainRun[], square = { column: 1, row: 4 }) {
      const build = await startWith({ aiWalls: true, aiTerrain: true });
      await uvttMap(build.pass);
      expect((await saveSetup(build.pass, { openings: [{ number: 1, kind: "door", state: "closed" }], terrain })).status).toBe(200);
      await withPass(build.pass, "POST", "/api/build/current/creatures", { creatures: [{ key: "goblin", name: "Goblin", isPlayerCharacter: false, hp: 7, maxHp: 7, ac: 13 }] });
      expect((await withPass(build.pass, "POST", "/api/build/current/encounters", { key: "ambush", name: "Ambush", mapKey: "shop", tokens: [{ creatureKey: "goblin", square, hidden: false }] })).status).toBe(200);
      return build;
    }
    const terrain = [run(0, 0, 2), run(3, 5, 6, "blocked"), run(4, 1, 1)];

    it("puts the terrain in the library map and the encounter, keeping walls, and a room starts with it", async () => {
      const { account, id, ownerId } = await terrainEncounter(terrain);
      expect((await publish(account, id, { encounters: ["ambush"] })).status).toBe(200);
      const map = (await uploaded(account)).find((a) => a.kind === "map")!;
      const board = await store.findAssetBoard(map.id, ownerId);
      expect(board?.terrain).toEqual(terrain);
      expect(board?.walls).toContainEqual(expect.objectContaining({ portal: { kind: "door", state: "closed" } }));
      expect(board?.walls.length).toBe(3);
      const [encounter] = await store.listEncounters(ownerId);
      const data = encounter!.data as EncounterTemplateData;
      expect(data.terrain).toEqual(terrain);
      expect(data.walls).toEqual(board?.walls);
      // The token stands on Difficult ground, which is allowed.
      expect(data.tokens[0]).toMatchObject({ position: { x: 75, y: 225 } });

      const guestToken = newGuestToken();
      const res = await account.request("POST", "/api/rooms", { roomName: "From build", displayName: "GM", guestToken, templateId: encounter!.id });
      expect(res.ok).toBe(true);
      const created = await res.json() as CreateRoomResponse;
      const gm = await server.connect({ roomId: created.roomId, guestToken });
      try {
        expect(gm.state.terrain).toEqual({ base: terrain, effects: [] });
        expect(Object.values(gm.state.walls ?? {})).toHaveLength(3);
      } finally {
        gm.close();
      }
    });

    it("sends a player only the terrain they can see, never the room's raw terrain (ADR 0069)", async () => {
      const { account, id, ownerId } = await terrainEncounter(terrain);
      expect((await publish(account, id, { encounters: ["ambush"] })).status).toBe(200);
      const [encounter] = await store.listEncounters(ownerId);
      const guestToken = newGuestToken();
      const created = await (await account.request("POST", "/api/rooms", { roomName: "From build", displayName: "GM", guestToken, templateId: encounter!.id })).json() as CreateRoomResponse;
      const gm = await server.connect({ roomId: created.roomId, guestToken });
      // Fog over the Blocked run at row 3, columns 5 to 6 (x 250 to 350, y 150 to 200), before the player arrives.
      expect(await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 240, y: 140 }, to: { x: 360, y: 210 } } })).toMatchObject({ type: "ack" });
      const player = await server.connect(await server.join(created.inviteCode, "Pat"));
      try {
        await player.waitForSeq(gm.seq);
        expect(player.state.terrain).toBeUndefined();
        expect(player.state.terrainView?.runs).toEqual([run(0, 0, 2), run(4, 1, 1)]);
        const payloads = player.rawLog.join("\n");
        expect(payloads).not.toContain('"blocked"');
        expect(payloads).not.toContain('"base"');
      } finally {
        gm.close();
        player.close();
      }
    });

    it("places a published map's terrain in a room through the library board", async () => {
      const { account, id } = await terrainEncounter(terrain);
      expect((await publish(account, id, { maps: ["shop"] })).status).toBe(200);
      const asset = (await uploaded(account)).find((a) => a.kind === "map")!;
      const creds = await server.createRoom("GM", { cookie: account.cookie });
      const gm = await server.connect(creds);
      try {
        const placed = await gm.command({ type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: asset.grid!, includeLibraryBoard: true });
        expect(placed.type).toBe("ack");
        expect(gm.state.terrain?.base).toEqual(terrain);
      } finally {
        gm.close();
      }
    });

    it("publishes a map without terrain as before", async () => {
      const { account, id, pass, ownerId } = await startWith({ aiTerrain: true });
      await uvttMap(pass);
      expect((await publish(account, id, { maps: ["shop"] })).status).toBe(200);
      const board = await store.findAssetBoard((await uploaded(account)).find((a) => a.kind === "map")!.id, ownerId);
      expect(board).not.toHaveProperty("terrain");
    });

    it("refuses an encounter with a token on Blocked terrain, and publishes nothing", async () => {
      const { account, id } = await terrainEncounter(terrain, { column: 5, row: 3 });
      const refused = await publish(account, id, { encounters: ["ambush"] });
      expect(refused.status).toBe(422);
      expect(await refused.text()).toMatch(/encounter ambush: Goblin: It would stand on Blocked terrain/);
      expect(await uploaded(account)).toEqual([]);
      expect(await account.json<unknown[]>("GET", "/api/library/creatures")).toEqual([]);
      expect(await account.json<unknown[]>("GET", "/api/library/encounters")).toEqual([]);
    });

    it("needs a confirmed grid, and publishes nothing without one", async () => {
      const { account, id, pass } = await startWith({ aiTerrain: true });
      await imageMap(pass);
      expect((await saveSetup(pass, { terrain: [run(1, 1, 1)] }, "cave")).status).toBe(200);
      const refused = await publish(account, id, { maps: ["cave"] });
      expect(refused.status).toBe(422);
      expect(await refused.text()).toMatch(/map cave: Its terrain needs a confirmed grid first/);
      expect(await uploaded(account)).toEqual([]);
    });

    it("publishes terrain on the grid the owner confirmed it on", async () => {
      const { account, id, pass, ownerId } = await startWith({ aiTerrain: true });
      await imageMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 1, "blocked")] }, "cave");
      expect((await account.request("POST", `/api/builds/${id}/maps/cave/grid`, GRID)).status).toBe(200);
      expect((await publish(account, id, { maps: ["cave"] })).status).toBe(200);
      const asset = (await uploaded(account)).find((a) => a.kind === "map")!;
      expect(asset.grid).toMatchObject(GRID);
      expect((await store.findAssetBoard(asset.id, ownerId))?.terrain).toEqual([run(1, 1, 1, "blocked")]);
    });

    it("won't publish terrain after the owner corrects the grid under it, until it is cleared", async () => {
      const { account, id, pass, ownerId } = await startWith({ aiTerrain: true });
      await imageMap(pass);
      await saveSetup(pass, { terrain: [run(1, 1, 1, "blocked")] }, "cave");
      expect((await account.request("POST", `/api/builds/${id}/maps/cave/grid`, { cellSize: 50, offsetX: 0, offsetY: 0 })).status).toBe(200);
      const refused = await publish(account, id, { maps: ["cave"] });
      expect(refused.status).toBe(422);
      expect(await refused.text()).toMatch(/terrain was proposed on a different grid/);
      expect(await uploaded(account)).toEqual([]);
      const item = await mapItem(account, id, "cave");
      expect((await ownerSetup(account, id, { ...item.data.setup, terrain: [] }, item.updatedAt, "cave")).status).toBe(200);
      expect((await publish(account, id, { maps: ["cave"] })).status).toBe(200);
      expect(await store.findAssetBoard((await uploaded(account))[0]!.id, ownerId)).not.toHaveProperty("terrain");
    });
  });
});

describe.each(storeCases)("the build store's terrain choice on %s (ADR 0071)", (_name, makeStore) => {
  async function newBuild(store: RoomStore, choices: { aiWalls?: boolean; aiTerrain?: boolean } = {}) {
    const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
    return store.createBuild({ id: randomUUID(), ownerGmId: user.ownerId, name: "Hollow Coast", ...choices }, 3);
  }
  const map = (buildId: string, over: Partial<NewBuildItem> = {}): NewBuildItem => ({ buildId, kind: "map", key: "cave", data: { name: "Cave" }, flags: [], notCarriedOver: "", ...over });

  it("starts off, unless ticked, and is saved with the other two", async () => {
    const store = makeStore();
    expect(await newBuild(store)).toMatchObject({ aiTerrain: false });
    const ticked = await newBuild(store, { aiTerrain: true });
    expect(await store.findBuild(ticked.id, ticked.ownerGmId)).toMatchObject({ aiGrid: false, aiWalls: false, aiTerrain: true });
    // Left out, it keeps what is stored, so an older page can't undo a change made at the same moment.
    expect(await store.setBuildChoices(ticked.id, ticked.ownerGmId, { aiGrid: true, aiWalls: true })).toMatchObject({ aiGrid: true, aiWalls: true, aiTerrain: true });
    expect(await store.setBuildChoices(ticked.id, ticked.ownerGmId, { aiGrid: true, aiWalls: true, aiTerrain: false })).toMatchObject({ aiGrid: true, aiWalls: true, aiTerrain: false });
  });

  it("checks each choice a write needs inside the write, independently", async () => {
    const store = makeStore();
    const build = await newBuild(store, { aiWalls: true });
    await expect(store.saveBuildItem(map(build.id), 20, { requireAiTerrain: true })).rejects.toBeInstanceOf(BuildChoiceOffError);
    await expect(store.saveBuildItem(map(build.id), 20, { requireAiWalls: true, requireAiTerrain: true })).rejects.toBeInstanceOf(BuildChoiceOffError);
    expect(await store.findBuildItem(build.id, "map", "cave")).toBeNull();
    await expect(store.saveBuildItem(map(build.id), 20, { requireAiWalls: true })).resolves.toMatchObject({ key: "cave" });
    await store.setBuildChoices(build.id, build.ownerGmId, { aiGrid: false, aiWalls: false, aiTerrain: true });
    await expect(store.saveBuildItem(map(build.id, { data: { name: "Walls" } }), 20, { requireAiWalls: true })).rejects.toBeInstanceOf(BuildChoiceOffError);
    await expect(store.saveBuildItem(map(build.id, { data: { name: "Terrain" } }), 20, { requireAiTerrain: true })).resolves.toMatchObject({ data: { name: "Terrain" } });
  });

  it("keeps a draft map's terrain as saved", async () => {
    const store = makeStore();
    const build = await newBuild(store, { aiTerrain: true });
    const setup = { openings: [], lines: [], marks: [], terrain: [run(1, 0, 3), run(2, 4, 4, "blocked")], terrainGrid: GRID };
    await store.saveBuildItem(map(build.id, { data: { name: "Cave", setup } }), 20, { requireAiTerrain: true });
    expect((await store.findBuildItem(build.id, "map", "cave"))?.data).toEqual({ name: "Cave", setup });
  });
});
