import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioSnapshot, footprintCenter, DEFAULT_GRID, type StudioContext } from "@vtt/shared";
import type { RoomStore } from "../src/store/roomStore";
import type { BuildFileRecord } from "../src/store/buildStore";
import { StudioContextConflictError } from "../src/store/studioPreparation";
import { studioPreparationSnapshot } from "../src/domain/studioPreparation";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { storeCases } from "./storeHarness";
import { startServer } from "./helpers";
import { TEST_ORIGIN, bearer, connectStudio } from "./studioFlow";

const file = (buildId: string, over: Partial<BuildFileRecord> = {}): BuildFileRecord => {
  const id = randomUUID();
  return { id, buildId, kind: "map", objectKey: `${id}.webp`, url: `/uploads/${id}.webp`, originalName: "Synthetic map", width: 525, height: 400, sizeBytes: 1,
    grid: null, board: null, sourceHash: null, detectionSourceHash: null, detectionVersion: null, detectionError: null, detectionStatus: null,
    detectionAttempt: 0, detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date().toISOString(), ...over };
};
const fileLimits = { files: 100, maps: 20, bytes: 100000 };
const mapData = (fileId: string) => ({ name: "Synthetic map", fileId, proposedGrid: { cellSize: 50, offsetX: 25, offsetY: 0 }, gridStatus: "proposed", grid: null });
async function fixture(store: RoomStore) {
  const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.invalid`, displayName: "Synthetic GM", passwordHash: "x" });
  const build = await store.createBuild({ id: randomUUID(), ownerGmId: user.ownerId, name: "M2 synthetic" }, 3);
  const first = file(build.id), second = file(build.id);
  await store.addBuildFile(first, fileLimits); await store.addBuildFile(second, fileLimits);
  for (const [key, source] of [["first", first], ["second", second]] as const) {
    await store.saveBuildItem({ buildId: build.id, kind: "map", key, data: mapData(source.id), flags: [], notCarriedOver: "" }, 20);
    await store.saveBuildItem({ buildId: build.id, kind: "encounter", key: `${key}-encounter`, data: { name: key, mapKey: key, tokens: [] }, flags: [], notCarriedOver: "" }, 20);
  }
  const access = { ownerGmId: user.ownerId };
  return { build, first, second, access, user };
}

describe.each(storeCases)("saved Studio display context on %s (FR-GM-26, FR-GM-27)", (_name, makeStore) => {
  it("atomically refuses foreign/mismatched tuples without changing items or retention", async () => {
    const store = makeStore(), f = await fixture(store);
    const context = { sourceFileId: f.first.id, mapKey: "first", encounterKey: "first-encounter" };
    const before = await store.readStudioPreparation(f.build.id, f.access);
    await store.setStudioContext(f.build.id, context, f.access);
    for (const invalid of [{ ...context, sourceFileId: f.second.id }, { ...context, encounterKey: "second-encounter" }, { ...context, sourceFileId: randomUUID() }, { ...context, mapKey: null }]) {
      await expect(store.setStudioContext(f.build.id, invalid, f.access)).rejects.toBeInstanceOf(StudioContextConflictError);
    }
    await expect(store.setStudioContext(f.build.id, context, { ownerGmId: randomUUID() })).rejects.toBeInstanceOf(StudioContextConflictError);
    const after = await store.readStudioPreparation(f.build.id, f.access);
    expect(after.build.studioContext).toEqual(context); expect(after.build.updatedAt).toBe(before.build.updatedAt); expect(after.items).toEqual(before.items);
    const snapshot = studioPreparationSnapshot(after, "Synthetic GM");
    expect(snapshot.context).toEqual(context); expect(snapshot.scene.source?.id).toBe(f.first.id); expect(snapshot.scene.encounterName).toBe("first");
  });

  it("retains only twenty real sanitized receipts without extending retention, and closes metadata with the build", async () => {
    const store = makeStore(), f = await fixture(store);
    const at = (await store.findBuild(f.build.id, f.access.ownerGmId))!.updatedAt;
    for (let i = 0; i < 25; i++) await store.recordStudioPreparation(f.build.id, [{ id: randomUUID(), at: String(i), operation: "setup", targetKey: "first", status: "refused", code: "permission" }], f.access);
    const records = await store.readStudioPreparation(f.build.id, f.access);
    expect(records.build.studioOutcomes).toHaveLength(20); expect(records.build.studioOutcomes![0]!.at).toBe("5"); expect(records.build.updatedAt).toBe(at);
    await store.setStudioContext(f.build.id, { sourceFileId: f.first.id, mapKey: "first", encounterKey: null }, f.access);
    await store.closeBuild(f.build.id, f.access.ownerGmId);
    const closed = await store.findBuild(f.build.id, f.access.ownerGmId);
    expect(closed!.studioContext).toBeNull(); expect(closed!.studioOutcomes).toEqual([]);
    await expect(store.readStudioPreparation(f.build.id, f.access)).rejects.toThrow();
  });

  it("supports raw-source context and never automatically selects a prepared map or another encounter", async () => {
    const store = makeStore(), f = await fixture(store);
    await store.setStudioContext(f.build.id, { sourceFileId: f.second.id, mapKey: null, encounterKey: null }, f.access);
    const snapshot = studioPreparationSnapshot(await store.readStudioPreparation(f.build.id, f.access), null);
    expect(snapshot.context).toEqual({ sourceFileId: f.second.id, mapKey: null, encounterKey: null });
    expect(snapshot.scene.mapName).toBeNull(); expect(snapshot.scene.tokens).toEqual([]); expect(snapshot.maps).toHaveLength(2);
    await store.deleteUser(f.user.id);
    expect(await store.findBuild(f.build.id, f.access.ownerGmId)).toBeNull();
  });
});

let server: Awaited<ReturnType<typeof startServer>> | undefined;
afterEach(async () => { await server?.close(); server = undefined; });
describe("actual saved preparation writes and both adapters (FR-GM-26, FR-GM-27)", () => {
  it("reports native owner locks and per-creature quota failures with their actual recovery codes", async () => {
    const store = new MemoryRoomStore();
    server = await startServer(store, { studio: { publicOrigin: TEST_ORIGIN }, dispatcher: { enqueue: async () => {}, close: async () => {} } });
    const owner = await server.signUp();
    const { build } = await owner.json<{ build: { id: string } }>("POST", "/api/builds", { name: "Protected outcomes" });
    const source = file(build.id); await store.addBuildFile(source, fileLimits);
    const map = { buildId: build.id, kind: "map" as const, key: "owned-map", data: mapData(source.id), flags: [], notCarriedOver: "" };
    await store.saveBuildItem(map, 20); await store.editBuildItem(map);
    for (let index = 0; index < 200; index++) {
      const creature = { buildId: build.id, kind: "creature" as const, key: index === 0 ? "owned" : `creature-${index}`, data: { name: "Synthetic", isPlayerCharacter: false, size: 1 }, flags: [], notCarriedOver: "" };
      await store.saveBuildItem(creature, 200); if (index === 0) await store.editBuildItem(creature);
    }
    const { tokens } = await connectStudio(server.base, owner, [build.id]);
    const send = (method: string, suffix: string, body?: unknown) => fetch(`${server!.base}/api/studio/builds/${build.id}${suffix}`, { method, headers: bearer(tokens.access_token, { "content-type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await send("POST", "/maps", { key: "owned-map", name: "Changed", fileId: source.id })).status).toBe(409);
    let saved = StudioSnapshot.parse(await (await send("GET", "/studio")).json());
    expect(saved.outcomes.at(-1)).toMatchObject({ status: "refused", code: "locked" });
    const record = vi.spyOn(store, "recordStudioPreparation");
    expect((await send("POST", "/creatures", { creatures: [{ key: "owned", name: "Changed", isPlayerCharacter: false }, { key: "limited", name: "New", isPlayerCharacter: false }] })).status).toBe(200);
    // Every row of one request is one receipt write.
    expect(record).toHaveBeenCalledTimes(1); expect(record.mock.calls[0]![1]).toHaveLength(2);
    saved = StudioSnapshot.parse(await (await send("GET", "/studio")).json());
    expect(saved.outcomes.slice(-2).map(({ targetKey, code }) => ({ targetKey, code }))).toEqual([{ targetKey: "owned", code: "locked" }, { targetKey: "limited", code: "limit" }]);
    expect((await store.findBuildItem(build.id, "map", "owned-map"))!.data.name).toBe("Synthetic map");
  });
  it("projects portal cuts, cropped terrain, small hidden art tokens and rejected writes into an already-readable snapshot", async () => {
    const store = new MemoryRoomStore();
    server = await startServer(store, { studio: { publicOrigin: TEST_ORIGIN }, dispatcher: { enqueue: async () => {}, close: async () => {} } });
    const owner = await server.signUp();
    const started = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Synthetic M2" });
    const id = started.build.id;
    const source = file(id, { grid: { ...DEFAULT_GRID, cellSize: 50, offsetX: 25, offsetY: 0 } }), art = file(id, { kind: "token" });
    await store.addBuildFile(source, fileLimits); await store.addBuildFile(art, fileLimits);
    const account = (await store.findUserById(owner.view!.id))!;
    await store.setBuildChoices(id, account.ownerId, { aiGrid: true, aiWalls: true, aiTerrain: true });
    const { tokens } = await connectStudio(server.base, owner, [id]);
    const send = (method: string, path: string, body?: unknown) => fetch(`${server!.base}/api/studio/builds/${id}${path}`, { method, headers: bearer(tokens.access_token, { "content-type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await send("POST", "/maps", { key: "chapel", name: "Chapel", fileId: source.id, proposedGrid: null })).status).toBe(200);
    expect((await send("POST", "/creatures", { creatures: [{ key: "sentry", name: "Sentry", isPlayerCharacter: false, size: 0.5, imageFileId: art.id }] })).status).toBe(200);
    expect((await send("POST", "/encounters", { key: "night", name: "Night", mapKey: "chapel", tokens: [{ creatureKey: "sentry", square: { column: 2, row: 2 }, hidden: true }] })).status).toBe(200);
    const context: StudioContext = { sourceFileId: source.id, mapKey: "chapel", encounterKey: "night" };
    expect((await send("POST", "/studio/context", context)).status).toBe(200);
    const setup = { lines: [{ kind: "wall", from: { column: 1, row: 1 }, to: { column: 5, row: 1 } }, { kind: "door", state: "open", from: { column: 2, row: 1 }, to: { column: 3, row: 1 } }], terrain: [{ row: 0, start: -1, end: -1, kind: "difficult" }] };
    expect((await send("PUT", "/maps/chapel/setup", setup)).status).toBe(200);
    const saved = StudioSnapshot.parse(await (await send("GET", "/studio")).json());
    const website = StudioSnapshot.parse(await owner.json("GET", `/api/builds/${id}/studio`));
    expect(website).toEqual(saved); expect(saved.scene.walls).toHaveLength(3); expect(saved.scene.walls.filter((w) => w.portal?.kind === "door")).toHaveLength(1);
    expect(saved.scene.terrain).toEqual(setup.terrain); expect(saved.scene.terrainState).toBe("ready");
    expect(saved.scene.tokens[0]).toMatchObject({ hidden: true, imageFileId: art.id, center: footprintCenter({ column: 2, row: 2 }, 0.5, source.grid!, source) });
    // A setup for a map the build doesn't have is a refused write the open Studio shows (FR-GM-27).
    expect((await send("PUT", "/maps/chapl/setup", setup)).status).toBe(404);
    const missing = StudioSnapshot.parse(await (await send("GET", "/studio")).json());
    expect(missing.outcomes.at(-1)).toMatchObject({ operation: "setup", targetKey: "chapl", status: "refused", code: "invalid" });
    expect(missing.scene.walls).toEqual(saved.scene.walls);
    await store.setBuildChoices(id, account.ownerId, { aiGrid: true, aiWalls: false, aiTerrain: true });
    expect((await send("PUT", "/maps/chapel/setup", { lines: [], terrain: [] })).status).toBe(403);
    const refused = StudioSnapshot.parse(await (await send("GET", "/studio")).json());
    expect(refused.scene.walls).toEqual(saved.scene.walls); expect(refused.scene.terrain).toEqual(saved.scene.terrain);
    expect(refused.outcomes.at(-1)).toMatchObject({ operation: "setup", targetKey: "chapel", status: "refused", code: "permission" });
    expect(refused.allowed.walls).toBe(false);
    expect((await send("POST", "/studio/context", { ...context, encounterKey: "foreign" })).status).toBe(409);
    const outsider = await server.signUp(); expect((await outsider.request("GET", `/api/builds/${id}/studio`)).status).toBe(404);
    const grants = await store.listStudioGrants(account.ownerId, new Date().toISOString());
    await store.revokeStudioGrant(grants[0]!.id, new Date().toISOString());
    expect((await send("POST", "/studio/context", context)).status).toBe(401);
    expect((await store.findBuild(id, account.ownerId))!.studioContext).toEqual(context);
  });
});
