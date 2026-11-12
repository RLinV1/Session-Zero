import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENCOUNTER_TEMPLATE_VERSION, MAX_ENCOUNTER_TEMPLATES, type CreateRoomResponse, type EncounterTemplateData, type LibraryAsset, type LibraryCreature } from "@vtt/shared";
import type { MemoryRoomStore } from "../src/store/memoryRoomStore";
import type { RoomStore } from "../src/store/roomStore";
import { startServer, type HttpAccount, newGuestToken } from "./helpers";
import { storeCases } from "./storeHarness";

const GRID = { cellSize: 70, offsetX: 0, offsetY: 0 };

describe.each(storeCases)("publishing a build on %s (FR-GM-27)", (_name, makeStore) => {
  let store: RoomStore;
  let server: Awaited<ReturnType<typeof startServer>>;
  let clock: number;

  beforeEach(async () => {
    store = makeStore();
    clock = Date.now();
    server = await startServer(store as MemoryRoomStore, { now: () => clock });
  });
  afterEach(() => server.close());

  const withPass = (pass: string, method: string, url: string, body?: unknown) => fetch(server.base + url, {
    method,
    headers: { authorization: `Bearer ${pass}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#884422" } }).png().toBuffer();

  async function upload(pass: string, kind: string, name: string, data: Uint8Array | string) {
    const body = new FormData();
    body.append("file", new Blob([typeof data === "string" ? data : Buffer.from(data)], { type: "image/png" }), name);
    const res = await fetch(`${server.base}/api/build/current/files?kind=${kind}`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body });
    expect(res.status).toBe(201);
    return (await res.json() as { file: { id: string } }).file.id;
  }

  async function startBuild(account?: HttpAccount) {
    const owner = account ?? await server.signUp();
    const { build, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Hollow Coast" });
    return { account: owner, id: build.id, pass, ownerId: (await store.findUserById(owner.view!.id))!.ownerId };
  }

  const goblin = (over: Record<string, unknown> = {}) => ({ key: "goblin", name: "Goblin", isPlayerCharacter: false, hp: 7, maxHp: 7, ac: 13, ...over });
  const saveCreatures = (pass: string, creatures: unknown[]) => withPass(pass, "POST", "/api/build/current/creatures", { creatures });
  const saveEncounter = (pass: string, over: Record<string, unknown> = {}) => withPass(pass, "POST", "/api/build/current/encounters", {
    key: "ambush", name: "Bridge ambush", mapKey: "cave", tokens: [{ creatureKey: "goblin", square: { column: 2, row: 3 }, hidden: true }], ...over,
  });

  /** A build with art, a map whose grid the owner confirmed, a creature and an encounter. */
  async function readyBuild(account?: HttpAccount) {
    const build = await startBuild(account);
    const { pass, id } = build;
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    const artId = await upload(pass, "token", "goblin.png", await png(64, 64));
    await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: GRID });
    await saveCreatures(pass, [goblin({ imageFileId: artId })]);
    await saveEncounter(pass);
    expect((await build.account.request("POST", `/api/builds/${id}/maps/cave/grid`, GRID)).status).toBe(200);
    return { ...build, fileId, artId };
  }

  /** What the page sends: the version of every draft item the person is looking at (ADR 0053). */
  const reviewedNow = async (account: HttpAccount, id: string) =>
    Object.fromEntries((await account.json<{ items: { kind: string; key: string; updatedAt: string }[] }>("GET", `/api/builds/${id}`)).items.map((i) => [`${i.kind}/${i.key}`, i.updatedAt]));
  const publish = async (account: HttpAccount, id: string, body: Record<string, unknown>) =>
    account.request("POST", `/api/builds/${id}/publish`, { ...body, reviewed: await reviewedNow(account, id) });
  const library = (account: HttpAccount) => account.json<LibraryAsset[]>("GET", "/api/library");
  const uploaded = async (account: HttpAccount) => (await library(account)).filter((a) => !a.url.startsWith("/img/"));
  const creatures = (account: HttpAccount) => account.json<LibraryCreature[]>("GET", "/api/library/creatures");
  const encounters = (account: HttpAccount) => account.json<{ id: string; name: string; mapAssetId: string }[]>("GET", "/api/library/encounters");
  const storedFiles = async () => (await readdir(server.uploadDir).catch(() => [])).length;

  async function startRoom(account: HttpAccount, templateId: string) {
    const res = await account.request("POST", "/api/rooms", { roomName: "From build", displayName: "GM", guestToken: newGuestToken(), templateId });
    expect(res.ok).toBe(true);
    return await res.json() as CreateRoomResponse;
  }

  it("publishes an encounter with the map, creatures and art it needs, as ordinary library items", async () => {
    const { account, id } = await readyBuild();
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ published: { assets: 2, creatures: [{ key: "goblin" }], maps: [{ key: "cave" }], encounters: [{ key: "ambush", name: "Bridge ambush" }] } });
    expect((await uploaded(account)).map((a) => [a.kind, a.name]).sort()).toEqual([["map", "Cave"], ["token", "Goblin"]]);
    expect(await creatures(account)).toMatchObject([{ name: "Goblin", hp: 7, maxHp: 7, ac: 13, imageUrl: expect.stringMatching(/^\/uploads\//) }]);
    expect(await encounters(account)).toMatchObject([{ name: "Bridge ambush" }]);
  });

  it("points at the stored file rather than copying it", async () => {
    const { account, id } = await readyBuild();
    const before = await storedFiles();
    await publish(account, id, { encounters: ["ambush"] });
    expect(await storedFiles()).toBe(before);
  });

  it("builds the template on the server, at the board positions of the squares, with no owners", async () => {
    const { account, id, ownerId } = await readyBuild();
    await publish(account, id, { encounters: ["ambush"] });
    const [row] = await store.listEncounters(ownerId);
    expect(row!.version).toBe(ENCOUNTER_TEMPLATE_VERSION);
    const data = row!.data as EncounterTemplateData;
    expect(data.grid).toMatchObject({ cellSize: 70 });
    expect(data.tokens).toHaveLength(1);
    expect(data.tokens[0]).toMatchObject({ name: "Goblin", position: { x: 175, y: 245 }, hidden: true, stats: { hp: 7, maxHp: 7, ac: 13 } });
    expect(data.tokens[0]).not.toHaveProperty("ownerIds");
    expect(data.tokens[0]).not.toHaveProperty("initiative");
  });

  it("uses the corrected grid for token positions", async () => {
    const { account, id, ownerId } = await readyBuild();
    await account.request("POST", `/api/builds/${id}/maps/cave/grid`, { cellSize: 50, offsetX: 10, offsetY: 0 });
    await publish(account, id, { encounters: ["ambush"] });
    expect(((await store.listEncounters(ownerId))[0]!.data as EncounterTemplateData).tokens[0]!.position).toEqual({ x: 135, y: 175 });
  });

  it("opens a room from a published encounter, with the owner as GM and hidden tokens withheld", async () => {
    const { account, id } = await readyBuild();
    const res = await publish(account, id, { encounters: ["ambush"] });
    const { published } = await res.json() as { published: { encounters: { id: string }[] } };
    const created = await startRoom(account, published.encounters[0]!.id);
    expect(created.participantId).toBeTruthy();
    const player = await server.join(created.inviteCode, "Pat");
    const client = await server.connect({ roomId: created.roomId, guestToken: player.guestToken });
    expect(Object.values(client.state.tokens)).toEqual([]);
    expect(client.rawLog.join("")).not.toContain("Goblin");
    client.close();
  });

  describe("publishing only what the person looked at (ADR 0053)", () => {
    const rawPublish = (account: HttpAccount, id: string, body: unknown) => account.request("POST", `/api/builds/${id}/publish`, body);

    it("refuses when the AI changed an item after the person looked, and publishes nothing", async () => {
      const { account, id, pass } = await readyBuild();
      const reviewed = await reviewedNow(account, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveCreatures(pass, [goblin({ name: "Changed behind your back" })]);
      const res = await rawPublish(account, id, { creatures: ["goblin"], reviewed });
      expect(res.status).toBe(409);
      expect(await res.text()).toMatch(/changed since you looked/i);
      expect(await creatures(account)).toEqual([]);
    });

    it("covers what an encounter brings with it", async () => {
      const { account, id, pass } = await readyBuild();
      const reviewed = await reviewedNow(account, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveCreatures(pass, [goblin({ hp: 99, maxHp: 99 })]);
      expect((await rawPublish(account, id, { encounters: ["ambush"], reviewed })).status).toBe(409);
      expect(await encounters(account)).toEqual([]);
    });

    it("refuses a hidden token made visible after the person looked", async () => {
      const { account, id, pass } = await readyBuild();
      const reviewed = await reviewedNow(account, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveEncounter(pass, { tokens: [{ creatureKey: "goblin", square: { column: 2, row: 3 }, hidden: false }] });
      expect((await rawPublish(account, id, { encounters: ["ambush"], reviewed })).status).toBe(409);
      expect(await encounters(account)).toEqual([]);
    });

    it("refuses an item the person never saw, added as a dependency", async () => {
      const { account, id, pass } = await readyBuild();
      const reviewed = await reviewedNow(account, id);
      await saveCreatures(pass, [goblin({ key: "boss", name: "Boss" })]);
      await saveEncounter(pass, { key: "second", name: "Second", tokens: [{ creatureKey: "boss", square: { column: 0, row: 0 }, hidden: true }] });
      const stale = { ...reviewed, "encounter/second": (await reviewedNow(account, id))["encounter/second"]! };
      expect((await rawPublish(account, id, { encounters: ["second"], reviewed: stale })).status).toBe(409);
      expect((await creatures(account)).some((c) => c.name === "Boss")).toBe(false);
    });

    it("needs the versions to be sent at all", async () => {
      const { account, id } = await readyBuild();
      expect((await rawPublish(account, id, { creatures: ["goblin"] })).status).toBe(400);
      expect(await creatures(account)).toEqual([]);
    });

    it("the store itself refuses if an item changed after the plan was made", async () => {
      const { account, id, pass, ownerId } = await readyBuild();
      const { planPublish } = await import("../src/domain/buildPublish");
      const { UPLOAD_ALLOWANCE } = await import("../src/store/libraryStore");
      const build = (await store.findBuild(id, ownerId))!;
      const planned = await planPublish(store, build, { creatures: ["goblin"], maps: [], encounters: [], reviewed: await reviewedNow(account, id) }, new Date().toISOString());
      if (!planned.ok) throw new Error(JSON.stringify(planned.problems));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveCreatures(pass, [goblin({ name: "Sneaked in" })]);
      await expect(store.publishBuild(planned.plan, UPLOAD_ALLOWANCE, MAX_ENCOUNTER_TEMPLATES)).rejects.toThrow(/changed/i);
      expect(await creatures(account)).toEqual([]);
    });
  });

  it("recovers grid detection for a map published while it was running", async () => {
    const { pass, id, account, ownerId } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId });
    expect((await publish(account, id, { maps: ["cave"] })).status).toBe(200);
    const [asset] = await store.listAssets(ownerId).then((all) => all.filter((a) => a.name === "Cave"));
    const jobs = await store.recoverDetections(1000);
    const status = (await store.findDetection({ scope: "library", id: asset!.id }))?.status;
    if (status === "queued") expect(jobs.some((j) => j.target.scope === "library" && j.target.id === asset!.id)).toBe(true);
  });

  it("won't let two draft maps share one file", async () => {
    const { pass } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "a", name: "A", fileId })).status).toBe(200);
    const second = await withPass(pass, "POST", "/api/build/current/maps", { key: "b", name: "B", fileId });
    expect(second.status).toBe(422);
    expect((await second.json() as { error: string }).error).toContain('"a"');
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "a", name: "Renamed", fileId })).status).toBe(200);
  });

  it("publishes part of a build, and the rest stays in the draft", async () => {
    const { pass, id, account } = await startBuild();
    await saveCreatures(pass, ["a", "b", "c", "d"].map((key) => goblin({ key, name: key })));
    expect((await publish(account, id, { creatures: ["a", "b", "c"] })).status).toBe(200);
    expect((await creatures(account)).map((c) => c.name).sort()).toEqual(["a", "b", "c"]);
    const read = await account.json<{ items: { key: string; published: boolean }[] }>("GET", `/api/builds/${id}`);
    expect(read.items.find((i) => i.key === "d")?.published).toBe(false);
  });

  it("can publish again without adding anything twice", async () => {
    const { account, id } = await readyBuild();
    await publish(account, id, { creatures: ["goblin"] });
    await publish(account, id, { encounters: ["ambush"] });
    await publish(account, id, { encounters: ["ambush"], creatures: ["goblin"], maps: ["cave"] });
    expect(await creatures(account)).toHaveLength(1);
    expect(await encounters(account)).toHaveLength(1);
    expect(await uploaded(account)).toHaveLength(2);
  });

  it("uses what's in the library now for something already published", async () => {
    const { account, id, ownerId } = await readyBuild();
    await publish(account, id, { creatures: ["goblin"] });
    const [creature] = await creatures(account);
    await account.json("PATCH", `/api/library/creatures/${creature!.id}`, { hp: 40, maxHp: 40 });
    await publish(account, id, { encounters: ["ambush"] });
    expect(((await store.listEncounters(ownerId))[0]!.data as EncounterTemplateData).tokens[0]!.stats).toMatchObject({ hp: 40, maxHp: 40 });
  });

  it("says why something can't be published when a dependency was deleted", async () => {
    const { account, id } = await readyBuild();
    await publish(account, id, { creatures: ["goblin"] });
    const [creature] = await creatures(account);
    await account.request("DELETE", `/api/library/creatures/${creature!.id}`);
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("deleted from the library");
  });

  it("won't publish an encounter whose map has no confirmed grid, and says why", async () => {
    const { pass, id, account } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: GRID });
    await saveCreatures(pass, [goblin()]);
    await saveEncounter(pass);
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ problems: [{ item: "encounter ambush", message: expect.stringContaining("confirmed grid") }] });
    expect(await creatures(account)).toEqual([]);
    expect(await uploaded(account)).toEqual([]);
  });

  it("publishes a map alone with no grid, to set up in the editor", async () => {
    const { pass, id, account } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
    await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId });
    expect((await publish(account, id, { maps: ["cave"] })).status).toBe(200);
    expect(await uploaded(account)).toMatchObject([{ kind: "map", name: "Cave", grid: null }]);
  });

  it("keeps a UVTT map's grid and walls, and refuses a token across a wall", async () => {
    const { pass, id, account, ownerId } = await startBuild();
    const file = JSON.stringify({
      format: 0.3, image: (await png(400, 300)).toString("base64"),
      resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
      line_of_sight: [[{ x: 1.5, y: 0 }, { x: 1.5, y: 6 }]], portals: [],
    });
    const fileId = await upload(pass, "uvtt", "crypt.uvtt", file);
    await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Crypt", fileId });
    await saveCreatures(pass, [goblin({ size: 2 })]);
    await saveEncounter(pass, { tokens: [{ creatureKey: "goblin", square: { column: 0, row: 0 }, hidden: false }] });
    const refused = await publish(account, id, { encounters: ["ambush"] });
    expect(refused.status).toBe(422);
    expect(await refused.text()).toContain("wall");

    await saveEncounter(pass, { tokens: [{ creatureKey: "goblin", square: { column: 3, row: 0 }, hidden: false }] });
    expect((await publish(account, id, { encounters: ["ambush"] })).status).toBe(200);
    const [row] = await store.listEncounters(ownerId);
    expect((row!.data as EncounterTemplateData).walls).toHaveLength(1);
    const [asset] = await uploaded(account);
    expect(asset).toMatchObject({ grid: { cellSize: 50 } });
    const board = await account.json<{ walls: unknown[] }>("GET", `/api/library/${asset!.id}/board`);
    expect(board.walls).toHaveLength(1);
  });

  it("won't publish a token with no square", async () => {
    const { pass, id, account } = await readyBuild();
    await saveEncounter(pass, { tokens: [{ creatureKey: "goblin", square: null, hidden: false }] });
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("no square");
  });

  it("refuses a pass with 401 and publishes nothing", async () => {
    const { pass, id, account } = await readyBuild();
    expect((await withPass(pass, "POST", `/api/builds/${id}/publish`, { encounters: ["ambush"] })).status).toBe(401);
    expect(await creatures(account)).toEqual([]);
  });

  it("refuses a request from another site", async () => {
    const { id, account } = await readyBuild();
    const res = await account.request("POST", `/api/builds/${id}/publish`, { encounters: ["ambush"] }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await creatures(account)).toEqual([]);
  });

  it("gives another account a 404", async () => {
    const { id } = await readyBuild();
    const other = await server.signUp();
    expect((await other.request("POST", `/api/builds/${id}/publish`, { encounters: ["ambush"], reviewed: {} })).status).toBe(404);
  });

  it("needs something chosen", async () => {
    const { id, account } = await readyBuild();
    expect((await publish(account, id, {})).status).toBe(400);
  });

  async function fillTemplates(ownerId: string, count: number, mapAssetId: string | null = null) {
    for (let i = 0; i < count; i++) {
      const at = new Date().toISOString();
      await store.createEncounter({
        id: randomUUID(), ownerGmId: ownerId, name: `Filler ${i}`, version: ENCOUNTER_TEMPLATE_VERSION, mapAssetId, createdAt: at, updatedAt: at,
        data: { map: { assetId: randomUUID(), width: 10, height: 10 }, grid: { ...GRID, unitsPerCell: 5, unitLabel: "ft" }, tokens: [], fog: [] },
      }, MAX_ENCOUNTER_TEMPLATES);
    }
  }

  it("changes nothing when the last item fails", async () => {
    const { account, id, pass, ownerId } = await readyBuild();
    await saveEncounter(pass, { key: "second", name: "Second" });
    await fillTemplates(ownerId, MAX_ENCOUNTER_TEMPLATES - 1);
    const res = await publish(account, id, { encounters: ["ambush", "second"] });
    expect(res.status).toBe(409);
    expect(await creatures(account)).toEqual([]);
    expect(await uploaded(account)).toEqual([]);
    expect((await encounters(account)).filter((e) => !e.name.startsWith("Filler"))).toEqual([]);
    const read = await account.json<{ items: { published: boolean }[]; files: { published: boolean }[] }>("GET", `/api/builds/${id}`);
    expect(read.items.every((i) => !i.published)).toBe(true);
    expect(read.files.every((f) => !f.published)).toBe(true);
  });

  it("says so at the 50-template limit", async () => {
    const { account, id, ownerId } = await readyBuild();
    await fillTemplates(ownerId, MAX_ENCOUNTER_TEMPLATES);
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("50");
  });

  it("numbers a name that's already used, and leaves the old one alone", async () => {
    const first = await readyBuild();
    await publish(first.account, first.id, { encounters: ["ambush"] });
    const original = await encounters(first.account);
    const second = await readyBuild(first.account);
    const res = await publish(first.account, second.id, { encounters: ["ambush"] });
    expect(await res.json()).toMatchObject({ published: { encounters: [{ name: "Bridge ambush (2)" }] } });
    const after = await encounters(first.account);
    expect(after.map((e) => e.name).sort()).toEqual(["Bridge ambush", "Bridge ambush (2)"]);
    expect(after.find((e) => e.id === original[0]!.id)?.name).toBe("Bridge ambush");
  });

  it("counts toward the account's upload allowance, and changes nothing if it doesn't fit", async () => {
    const { account, id, ownerId } = await readyBuild();
    await store.createAsset({
      id: randomUUID(), ownerGmId: ownerId, kind: "token", objectKey: "filler.webp", url: "/uploads/filler.webp", name: "Filler", width: 1, height: 1,
      byteSize: 2 * 1024 ** 3 - 10, grid: null, createdAt: new Date().toISOString(),
    }, { maxItems: 1000, maxBytes: 2 * 1024 ** 3 });
    const res = await publish(account, id, { encounters: ["ambush"] });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("2 GB");
    expect(await creatures(account)).toEqual([]);
  });

  it("publishes once when two requests arrive together", async () => {
    const { account, id } = await readyBuild();
    await Promise.all([publish(account, id, { encounters: ["ambush"] }), publish(account, id, { encounters: ["ambush"] })]);
    expect(await creatures(account)).toHaveLength(1);
    expect(await encounters(account)).toHaveLength(1);
    expect(await uploaded(account)).toHaveLength(2);
  });

  it("locks a published item against the AI", async () => {
    const { account, id, pass } = await readyBuild();
    await publish(account, id, { creatures: ["goblin"] });
    const { results } = await (await saveCreatures(pass, [goblin({ hp: 1, maxHp: 1 })])).json() as { results: { saved: boolean; error: string }[] };
    expect(results[0]).toMatchObject({ saved: false, error: expect.stringMatching(/published/) });
  });

  describe("the owner's edits", () => {
    it("fills in a value, clears its flag and marks the item edited", async () => {
      const { pass, id, account } = await startBuild();
      await saveCreatures(pass, [goblin({ hp: null, flags: [{ field: "hp", message: "HP ??" }, { field: "ac", message: "unclear" }] })]);
      const res = await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { hp: 7 });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ item: { data: { hp: 7 }, flags: [{ field: "ac" }], editedByUser: true } });
      const { results } = await (await saveCreatures(pass, [goblin({ hp: 1, maxHp: 1 })])).json() as { results: { error: string }[] };
      expect(results[0]?.error).toMatch(/user changed/i);
    });

    it("applies the same limits as the AI", async () => {
      const { pass, id, account } = await startBuild();
      await saveCreatures(pass, [goblin()]);
      expect((await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { maxHp: 20000 })).status).toBe(422);
      expect((await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { ownerIds: [] })).status).toBe(422);
      expect((await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { key: "renamed" })).status).toBe(200);
      expect((await account.json<{ items: { key: string }[] }>("GET", `/api/builds/${id}`)).items.map((i) => i.key)).toEqual(["goblin"]);
    });

    it("keeps blank as blank without clearing its flag", async () => {
      const { pass, id, account } = await startBuild();
      await saveCreatures(pass, [goblin({ ac: null, flags: [{ field: "ac", message: "unclear" }] })]);
      const res = await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { ac: null, name: "Gob" });
      expect(await res.json()).toMatchObject({ item: { data: { ac: null, name: "Gob" }, flags: [{ field: "ac" }] } });
    });

    it("only a person confirms a grid, and a square size must fit", async () => {
      const { pass, id, account } = await startBuild();
      const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
      await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: GRID });
      expect((await withPass(pass, "POST", `/api/builds/${id}/maps/cave/grid`, GRID)).status).toBe(401);
      expect((await account.request("POST", `/api/builds/${id}/maps/cave/grid`, { cellSize: 800, offsetX: 0, offsetY: 0 })).status).toBe(422);
      const res = await account.request("POST", `/api/builds/${id}/maps/cave/grid`, GRID);
      expect(await res.json()).toMatchObject({ item: { data: { gridStatus: "confirmed", grid: { cellSize: 70, unitsPerCell: 5, unitLabel: "ft" } } } });
    });

    it("takes the distance per square from the game profile", async () => {
      const { pass, id, account } = await startBuild();
      await withPass(pass, "PUT", "/api/build/current/profile", { name: "G", unitsPerCell: 2, unitLabel: "m" });
      const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
      await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId });
      const res = await account.request("POST", `/api/builds/${id}/maps/cave/grid`, GRID);
      expect(await res.json()).toMatchObject({ item: { data: { grid: { unitsPerCell: 2, unitLabel: "m" } } } });
    });

    it("moves a token, and refuses a square off the map", async () => {
      const { id, account } = await readyBuild();
      const tokens = (column: number) => ({ tokens: [{ creatureKey: "goblin", square: { column, row: 0 }, hidden: false }] });
      expect((await account.request("PATCH", `/api/builds/${id}/encounters/ambush`, tokens(4))).status).toBe(200);
      expect((await account.request("PATCH", `/api/builds/${id}/encounters/ambush`, tokens(40))).status).toBe(422);
    });

    it("renames a map", async () => {
      const { id, account } = await readyBuild();
      expect(await (await account.request("PATCH", `/api/builds/${id}/maps/cave`, { name: "Grotto" })).json()).toMatchObject({ item: { data: { name: "Grotto" } } });
    });

    it("can remove what it edited, but not what was published", async () => {
      const { pass, id, account } = await startBuild();
      await saveCreatures(pass, [goblin(), goblin({ key: "b" })]);
      await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { hp: 1 });
      expect((await account.request("DELETE", `/api/builds/${id}/items/creature/goblin`)).status).toBe(204);
      await publish(account, id, { creatures: ["b"] });
      expect((await account.request("DELETE", `/api/builds/${id}/items/creature/b`)).status).toBe(409);
    });

    it("gives another account a 404", async () => {
      const { pass, id } = await startBuild();
      await saveCreatures(pass, [goblin()]);
      expect((await (await server.signUp()).request("PATCH", `/api/builds/${id}/creatures/goblin`, { hp: 1 })).status).toBe(404);
    });
  });

  describe("discarding and removing (FR-GM-27)", () => {
    const published = (account: HttpAccount, id: string) => account.json<{ published: { type: string; id: string; name: string; rooms: { id: string }[] }[] }>("GET", `/api/builds/${id}/published`);
    const remove = (account: HttpAccount, id: string, body: unknown = {}) => account.request("POST", `/api/builds/${id}/remove-published`, body);

    it("discarding deletes the draft, its other files and its pass, and keeps what was published", async () => {
      const { pass, id, account } = await startBuild();
      const art = await upload(pass, "token", "kept.png", await png(64, 64));
      await upload(pass, "token", "unused.png", await png(64, 64));
      await saveCreatures(pass, [goblin({ imageFileId: art }), goblin({ key: "draft" })]);
      await publish(account, id, { creatures: ["goblin"] });
      expect(await storedFiles()).toBe(2);
      expect((await account.request("DELETE", `/api/builds/${id}`)).status).toBe(204);
      expect(await storedFiles()).toBe(1);
      expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(401);
      expect(await creatures(account)).toMatchObject([{ name: "Goblin" }]);
      const read = await account.json<{ build: { status: string }; items: { key: string }[]; files: unknown[] }>("GET", `/api/builds/${id}`);
      expect(read.build.status).toBe("closed");
      expect(read.items.map((i) => i.key)).toEqual(["goblin"]);
      expect(read.files).toHaveLength(1);
    });

    it("a discarded build can't be published or added to", async () => {
      const { id, account } = await readyBuild();
      await account.request("DELETE", `/api/builds/${id}`);
      expect((await publish(account, id, { creatures: ["goblin"] })).status).toBe(409);
      expect((await account.request("POST", `/api/builds/${id}/pass`)).status).toBe(409);
    });

    it("still lists and removes what a discarded build published", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { encounters: ["ambush"] });
      await account.request("DELETE", `/api/builds/${id}`);
      expect((await published(account, id)).published.map((p) => p.type).sort()).toEqual(["asset", "asset", "creature", "encounter"]);
      expect(await (await remove(account, id)).json()).toEqual({ removed: 4 });
      expect(await creatures(account)).toEqual([]);
      expect(await encounters(account)).toEqual([]);
      expect(await uploaded(account)).toEqual([]);
      expect(await storedFiles()).toBe(0);
      expect((await published(account, id)).published).toEqual([]);
    });

    it("removes only what this build made", async () => {
      const first = await readyBuild();
      await publish(first.account, first.id, { encounters: ["ambush"] });
      const second = await readyBuild(first.account);
      await publish(first.account, second.id, { encounters: ["ambush"] });
      const mine = await first.account.json<LibraryCreature>("POST", "/api/library/creatures", { name: "My own" });
      await remove(first.account, first.id);
      expect((await creatures(first.account)).map((c) => c.name).sort()).toEqual(["Goblin", "My own"]);
      expect((await creatures(first.account)).some((c) => c.id === mine.id)).toBe(true);
      expect(await encounters(first.account)).toHaveLength(1);
      expect(await uploaded(first.account)).toHaveLength(2);
    });

    it("won't remove a library item the build didn't make, even if named", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { creatures: ["goblin"] });
      const mine = await account.json<LibraryCreature>("POST", "/api/library/creatures", { name: "My own" });
      expect(await (await remove(account, id, { ids: [mine.id] })).json()).toEqual({ removed: 0 });
      expect((await creatures(account)).some((c) => c.id === mine.id)).toBe(true);
    });

    it("can remove some of what it published", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { encounters: ["ambush"] });
      const list = (await published(account, id)).published;
      const encounter = list.find((p) => p.type === "encounter")!;
      await remove(account, id, { ids: [encounter.id] });
      expect(await encounters(account)).toEqual([]);
      expect(await creatures(account)).toHaveLength(1);
    });

    it("skips what was already deleted by hand", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { creatures: ["goblin"], maps: ["cave"] });
      const [creature] = await creatures(account);
      await account.request("DELETE", `/api/library/creatures/${creature!.id}`);
      expect(await (await remove(account, id)).json()).toEqual({ removed: 2 });
    });

    it("lists a room using a published map, and leaves the room standing", async () => {
      const { id, account, ownerId } = await readyBuild();
      const res = await publish(account, id, { encounters: ["ambush"] });
      const { published: done } = await res.json() as { published: { encounters: { id: string }[]; maps: { id: string }[] } };
      const room = await startRoom(account, done.encounters[0]!.id);
      await store.setAssetRefs(room.roomId, [done.maps[0]!.id]);
      const list = (await published(account, id)).published;
      expect(list.find((p) => p.id === done.maps[0]!.id)?.rooms).toMatchObject([{ id: room.roomId }]);
      await remove(account, id);
      expect(await store.roomExists(room.roomId)).toBe(true);
      expect(await store.findRoomOwner(room.roomId)).toBe(ownerId);
    });

    it("returns items of an open build to draft", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { creatures: ["goblin"] });
      await remove(account, id);
      const read = await account.json<{ items: { key: string; published: boolean }[] }>("GET", `/api/builds/${id}`);
      expect(read.items.find((i) => i.key === "goblin")?.published).toBe(false);
    });

    it("another account can't see or remove what it published", async () => {
      const { id, account } = await readyBuild();
      await publish(account, id, { creatures: ["goblin"] });
      const other = await server.signUp();
      expect((await other.request("GET", `/api/builds/${id}/published`)).status).toBe(404);
      expect((await remove(other, id)).status).toBe(404);
      expect((await other.request("DELETE", `/api/builds/${id}`)).status).toBe(404);
      expect(await creatures(account)).toHaveLength(1);
    });

    it("the sweep closes a build left for 14 days, and keeps what it published", async () => {
      const { id, account, pass } = await readyBuild();
      await publish(account, id, { creatures: ["goblin"] });
      await server.app.sweepAbandonedBuilds();
      expect((await account.json<{ build: { status: string } }>("GET", `/api/builds/${id}`)).build.status).toBe("open");
      clock += 15 * 24 * 60 * 60_000;
      await server.app.sweepAbandonedBuilds();
      const read = await account.json<{ build: { status: string }; items: { key: string }[] }>("GET", `/api/builds/${id}`);
      expect(read.build.status).toBe("closed");
      expect(read.items.map((i) => i.key)).toEqual(["goblin"]);
      expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(401);
      expect(await creatures(account)).toHaveLength(1);
    });

    it("says when a build will be closed", async () => {
      const { id, account } = await readyBuild();
      const { build } = await account.json<{ build: { updatedAt: string; closesAt: string } }>("GET", `/api/builds/${id}`);
      expect(Date.parse(build.closesAt) - Date.parse(build.updatedAt)).toBe(14 * 24 * 60 * 60_000);
    });

    it("account deletion removes each stored file once, published or not", async () => {
      const account = await server.signUp({ password: "correct horse battery" });
      const { id, pass } = await readyBuild(account);
      await upload(pass, "token", "unused.png", await png(64, 64));
      await publish(account, id, { encounters: ["ambush"] });
      expect((await account.request("DELETE", "/api/auth/account", { password: "correct horse battery" })).status).toBe(204);
      expect(await storedFiles()).toBe(0);
    });
  });

  describe("walls, doors and windows the AI set (FR-GM-27, ADR 0053)", () => {
    // 8 by 6 squares of 50 pixels. One wall along row line 2 with a closed door-sized opening in it,
    // and a second opening standing alone at x = 300.
    const uvttWithOpening = async () => JSON.stringify({
      format: 0.3,
      image: (await png(400, 300)).toString("base64"),
      resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
      line_of_sight: [[{ x: 0, y: 2 }, { x: 8, y: 2 }]],
      portals: [
        { bounds: [{ x: 3, y: 2 }, { x: 4, y: 2 }], position: { x: 3.5, y: 2 }, rotation: 0, closed: true, freestanding: false },
        { bounds: [{ x: 6, y: 4 }, { x: 6, y: 5 }], position: { x: 6, y: 4.5 }, rotation: 0, closed: true, freestanding: true },
      ],
    });

    async function wallsBuild(choices: { aiGrid?: boolean; aiWalls?: boolean }) {
      const owner = await server.signUp();
      const { build, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Lanternfall", ...choices });
      return { account: owner, id: build.id, pass, ownerId: (await store.findUserById(owner.view!.id))!.ownerId };
    }

    it("puts them in the library map and in the encounter's template", async () => {
      const { account, id, pass, ownerId } = await wallsBuild({ aiWalls: true });
      const fileId = await upload(pass, "uvtt", "chandlery.uvtt", await uvttWithOpening());
      await withPass(pass, "POST", "/api/build/current/maps", { key: "shop", name: "Chandlery", fileId });
      const setup = await withPass(pass, "PUT", "/api/build/current/maps/shop/setup", {
        openings: [{ number: 1, kind: "door", state: "locked" }],
        lines: [{ from: { column: 5, row: 2 }, to: { column: 6, row: 2 }, kind: "window", state: "closed" }],
      });
      expect(setup.status).toBe(200);
      await saveCreatures(pass, [goblin()]);
      await saveEncounter(pass, { mapKey: "shop", tokens: [{ creatureKey: "goblin", square: { column: 1, row: 0 }, hidden: false }] });
      expect((await publish(account, id, { encounters: ["ambush"] })).status).toBe(200);

      const door = { a: { x: 150, y: 100 }, b: { x: 200, y: 100 }, portal: { kind: "door", state: "locked" } };
      const window = { a: { x: 250, y: 100 }, b: { x: 300, y: 100 }, portal: { kind: "window", state: "closed" } };
      const map = (await uploaded(account)).find((a) => a.kind === "map")!;
      const board = await store.findAssetBoard(map.id, ownerId);
      expect(board?.walls).toContainEqual(expect.objectContaining(door));
      expect(board?.walls).toContainEqual(window);
      // The window cut the wall under it, so only the pieces either side are left.
      expect(board?.walls).toContainEqual(expect.objectContaining({ a: { x: 200, y: 100 }, b: { x: 250, y: 100 } }));
      expect(board?.walls).toContainEqual(expect.objectContaining({ a: { x: 300, y: 100 }, b: { x: 400, y: 100 } }));
      expect(board?.walls).not.toContainEqual(expect.objectContaining({ a: { x: 200, y: 100 }, b: { x: 400, y: 100 } }));
      const template = (await store.listEncounters(ownerId))[0]!.data as EncounterTemplateData;
      expect(template.walls).toEqual(board?.walls);
    });

    it("gives a player only the AI's door when the map is placed in a room, nothing GM-only", async () => {
      const { account, id, pass } = await wallsBuild({ aiWalls: true });
      const fileId = await upload(pass, "uvtt", "chandlery.uvtt", await uvttWithOpening());
      await withPass(pass, "POST", "/api/build/current/maps", { key: "shop", name: "Chandlery", fileId });
      const setup = await withPass(pass, "PUT", "/api/build/current/maps/shop/setup", {
        openings: [{ number: 1, kind: "door", state: "closed" }, { number: 2, kind: "leave", reason: "Could be an archway." }],
      });
      expect(setup.status).toBe(200);
      expect((await publish(account, id, { maps: ["shop"] })).status).toBe(200);
      const asset = (await uploaded(account)).find((a) => a.kind === "map")!;

      const creds = await server.createRoom("GM", { cookie: account.cookie });
      const gm = await server.connect(creds);
      const player = await server.connect(await server.join(creds.inviteCode, "Alice"));
      try {
        const offset = player.rawLog.length;
        const placed = await gm.command({ type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: asset.grid!, includeLibraryBoard: true });
        expect(placed.type).toBe("ack");
        expect(Object.values(gm.state.walls ?? {})).toHaveLength(4);
        await player.waitForSeq(gm.seq);
        // The only portal is the AI's door; plain walls in view arrive as bare pieces, and the
        // opening left for the GM keeps its metadata and real id with the GM (ADR 0056).
        const playerWalls = Object.values(player.state.walls ?? {});
        expect(playerWalls.filter((w) => w.portal)).toEqual([expect.objectContaining({ a: { x: 150, y: 100 }, b: { x: 200, y: 100 }, portal: { kind: "door", state: "closed" } })]);
        expect(playerWalls.filter((w) => !w.portal).every((w) => /^seen:\d+$/.test(w.id) && Object.keys(w).sort().join() === "a,b,id")).toBe(true);
        const messages = player.rawLog.slice(offset).join("\n");
        for (const secret of ["uvttPortal", "line_of_sight", "archway"]) expect(messages).not.toContain(secret);
        for (const w of Object.values(gm.state.walls ?? {}).filter((w) => !w.portal)) expect(messages).not.toContain(w.id);
      } finally {
        gm.close();
        player.close();
      }
    });

    it("won't publish lines drawn on a grid nobody confirmed", async () => {
      const { account, id, pass } = await wallsBuild({ aiWalls: true });
      const fileId = await upload(pass, "map", "cave.png", await png(700, 700));
      await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId, proposedGrid: GRID });
      const drawn = await withPass(pass, "PUT", "/api/build/current/maps/cave/setup", { lines: [{ from: { column: 1, row: 1 }, to: { column: 4, row: 1 }, kind: "wall" }] });
      expect(drawn.status).toBe(200);
      const refused = await publish(account, id, { maps: ["cave"] });
      expect(refused.status).toBe(422);
      expect(await refused.text()).toMatch(/drawn walls need a confirmed grid/);
      expect(await uploaded(account)).toEqual([]);
    });
  });
});
