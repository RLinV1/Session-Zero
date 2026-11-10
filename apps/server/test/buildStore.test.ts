import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GameProfile } from "@vtt/shared";
import {
  BuildChoiceOffError,
  BuildClosedError,
  BuildItemChangedError,
  BuildItemLockedError,
  BuildLimitError,
  type BuildFileRecord,
  type NewBuildItem,
} from "../src/store/buildStore";
import type { RoomStore } from "../src/store/roomStore";
import { storeCases } from "./storeHarness";

const limits = { files: 3, maps: 2, bytes: 1000 };

async function newOwner(store: RoomStore, displayName = "Sam") {
  const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName, passwordHash: "x" });
  return user.ownerId;
}

const file = (buildId: string, over: Partial<BuildFileRecord> = {}): BuildFileRecord => {
  const id = randomUUID();
  return {
    id, buildId, kind: "token", objectKey: `${id}.webp`, url: `/uploads/${id}.webp`, originalName: "goblin.png", width: 64, height: 64, sizeBytes: 100,
    grid: null, board: null, sourceHash: null, detectionSourceHash: null, detectionVersion: null, detectionError: null, detectionStatus: null,
    detectionAttempt: 0, detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date().toISOString(), ...over,
  };
};

const item = (buildId: string, over: Partial<NewBuildItem> = {}): NewBuildItem => ({
  buildId, kind: "creature", key: "goblin", data: { name: "Goblin" }, flags: [], notCarriedOver: "", ...over,
});

describe.each(storeCases)("build store on %s (FR-GM-26)", (_name, makeStore) => {
  async function newBuild(store: RoomStore, owner?: string) {
    const ownerGmId = owner ?? await newOwner(store);
    return store.createBuild({ id: randomUUID(), ownerGmId, name: "Hollow Coast" }, 3);
  }

  it("creates an open build with no pass", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    expect(build).toMatchObject({ name: "Hollow Coast", status: "open", passHash: null, passExpiresAt: null, gameProfile: null });
    expect(await store.findBuild(build.id, build.ownerGmId)).toEqual(build);
  });

  it("starts with both of the owner's choices off, unless they were ticked (ADR 0053)", async () => {
    const store = makeStore();
    expect(await newBuild(store)).toMatchObject({ aiGrid: false, aiWalls: false });
    const ticked = await store.createBuild({ id: randomUUID(), ownerGmId: await newOwner(store), name: "Lanternfall", aiGrid: true, aiWalls: true }, 3);
    expect(await store.findBuild(ticked.id, ticked.ownerGmId)).toMatchObject({ aiGrid: true, aiWalls: true });
  });

  it("checks a write's guard inside the write: walls still allowed, and the version read (ADR 0053)", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const map = item(build.id, { kind: "map", key: "shop", data: { name: "Shop" } });
    // Turned off between the AI's read and its write: refused, and nothing written.
    await expect(store.saveBuildItem(map, 20, { requireAiWalls: true })).rejects.toBeInstanceOf(BuildChoiceOffError);
    expect(await store.findBuildItem(build.id, "map", "shop")).toBeNull();
    await store.setBuildChoices(build.id, build.ownerGmId, { aiGrid: false, aiWalls: true });
    // A new item is expected not to exist yet.
    const first = await store.saveBuildItem(map, 20, { requireAiWalls: true, expectedUpdatedAt: null });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await store.saveBuildItem({ ...map, data: { name: "Shop 2" } }, 20, { expectedUpdatedAt: first.updatedAt });
    // A save made from the first version, after the second landed, is refused rather than undoing it.
    await expect(store.saveBuildItem({ ...map, data: { name: "Stale" } }, 20, { expectedUpdatedAt: first.updatedAt })).rejects.toBeInstanceOf(BuildItemChangedError);
    await expect(store.editBuildItem({ ...map, data: { name: "Stale owner" } }, { expectedUpdatedAt: first.updatedAt })).rejects.toBeInstanceOf(BuildItemChangedError);
    expect((await store.findBuildItem(build.id, "map", "shop"))?.data).toEqual({ name: "Shop 2" });
    await expect(store.editBuildItem({ ...map, data: { name: "Owner" } }, { expectedUpdatedAt: second.updatedAt })).resolves.toMatchObject({ editedByUser: true });
  });

  it("changes the choices only for the owner of an open build", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    expect(await store.setBuildChoices(build.id, await newOwner(store), { aiGrid: true, aiWalls: true })).toBeNull();
    expect(await store.setBuildChoices(build.id, build.ownerGmId, { aiGrid: false, aiWalls: true })).toMatchObject({ aiGrid: false, aiWalls: true });
    await store.closeBuild(build.id, build.ownerGmId);
    expect(await store.setBuildChoices(build.id, build.ownerGmId, { aiGrid: true, aiWalls: true })).toBeNull();
    expect(await store.findBuild(build.id, build.ownerGmId)).toMatchObject({ aiGrid: false, aiWalls: true });
  });

  it("allows only so many open builds per owner", async () => {
    const store = makeStore();
    const owner = await newOwner(store);
    for (let i = 0; i < 3; i++) await newBuild(store, owner);
    await expect(newBuild(store, owner)).rejects.toBeInstanceOf(BuildLimitError);
    await expect(newBuild(store)).resolves.toBeDefined();
  });

  it("can't pass the open-build limit with requests at the same moment", async () => {
    const store = makeStore();
    const owner = await newOwner(store);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => newBuild(store, owner)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("reads another owner's build as missing", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    expect(await store.findBuild(build.id, await newOwner(store))).toBeNull();
  });

  it("names the account a build belongs to", async () => {
    const store = makeStore();
    const owner = await newOwner(store, "Vincent");
    expect(await store.findBuildOwnerName(owner)).toBe("Vincent");
  });

  it("finds a build by its pass hash, and a new pass ends the old one", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const at = new Date(Date.now() + 1000).toISOString();
    expect(await store.setBuildPass(build.id, build.ownerGmId, `first-${build.id}`, at)).toBe(true);
    expect((await store.findBuildByPassHash(`first-${build.id}`))?.id).toBe(build.id);
    await store.setBuildPass(build.id, build.ownerGmId, `second-${build.id}`, at);
    expect(await store.findBuildByPassHash(`first-${build.id}`)).toBeNull();
    expect((await store.findBuildByPassHash(`second-${build.id}`))?.id).toBe(build.id);
  });

  it("only the owner can set or clear a pass", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const other = await newOwner(store);
    expect(await store.setBuildPass(build.id, other, `x-${build.id}`, new Date().toISOString())).toBe(false);
    expect(await store.clearBuildPass(build.id, other)).toBe(false);
  });

  it("cancels one pass, or every pass on the account", async () => {
    const store = makeStore();
    const owner = await newOwner(store);
    const [a, b] = [await newBuild(store, owner), await newBuild(store, owner)];
    const at = new Date().toISOString();
    await store.setBuildPass(a.id, owner, `a-${a.id}`, at);
    await store.setBuildPass(b.id, owner, `b-${b.id}`, at);
    await store.clearBuildPass(a.id, owner);
    expect(await store.findBuildByPassHash(`a-${a.id}`)).toBeNull();
    expect(await store.findBuildByPassHash(`b-${b.id}`)).not.toBeNull();
    await store.endBuildPasses(owner);
    expect(await store.findBuildByPassHash(`b-${b.id}`)).toBeNull();
  });

  it("keeps a game profile", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const profile = GameProfile.parse({ name: "Lanternfall", unitsPerCell: 2, unitLabel: "m" });
    await store.saveGameProfile(build.id, profile);
    expect((await store.findBuild(build.id, build.ownerGmId))?.gameProfile).toEqual(profile);
  });

  it("stores files and reports usage", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const map = file(build.id, { kind: "map", sizeBytes: 300 });
    await store.addBuildFile(map, limits);
    await store.addBuildFile(file(build.id), limits);
    expect(await store.buildFileUsage(build.id)).toEqual({ files: 2, maps: 1, bytes: 400 });
    expect((await store.findBuildFile(build.id, map.id))?.originalName).toBe("goblin.png");
    expect(await store.listBuildFiles(build.id)).toHaveLength(2);
  });

  it("reads another build's file as missing", async () => {
    const store = makeStore();
    const [a, b] = [await newBuild(store), await newBuild(store)];
    const f = file(a.id);
    await store.addBuildFile(f, limits);
    expect(await store.findBuildFile(b.id, f.id)).toBeNull();
  });

  it("enforces the file, map and storage limits", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.addBuildFile(file(build.id, { kind: "map" }), limits);
    await store.addBuildFile(file(build.id, { kind: "map" }), limits);
    await expect(store.addBuildFile(file(build.id, { kind: "map" }), limits)).rejects.toBeInstanceOf(BuildLimitError);
    await expect(store.addBuildFile(file(build.id, { sizeBytes: 900 }), limits)).rejects.toBeInstanceOf(BuildLimitError);
    await store.addBuildFile(file(build.id), limits);
    await expect(store.addBuildFile(file(build.id), limits)).rejects.toBeInstanceOf(BuildLimitError);
  });

  it("can't pass the file limit with uploads at the same moment", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => store.addBuildFile(file(build.id), limits)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await store.buildFileUsage(build.id)).files).toBe(3);
  });

  it("refuses a file for a build that doesn't exist", async () => {
    const store = makeStore();
    await expect(store.addBuildFile(file(randomUUID()), limits)).rejects.toBeInstanceOf(BuildClosedError);
  });

  it("saves an item by key, and a repeat updates it", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id), 200);
    await store.saveBuildItem(item(build.id, { data: { name: "Hobgoblin" }, flags: [{ field: "hp", message: "not given" }], notCarriedOver: "spells" }), 200);
    const items = await store.listBuildItems(build.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "goblin", data: { name: "Hobgoblin" }, flags: [{ field: "hp" }], notCarriedOver: "spells", editedByUser: false, publishedId: null });
  });

  it("keeps kinds apart under one key", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id, { key: "x" }), 200);
    await store.saveBuildItem(item(build.id, { key: "x", kind: "map" }), 20);
    expect(await store.findBuildItem(build.id, "map", "x")).not.toBeNull();
    expect(await store.listBuildItems(build.id)).toHaveLength(2);
  });

  it("caps new items but still lets an existing one be saved", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id, { key: "a" }), 1);
    await store.saveBuildItem(item(build.id, { key: "a", data: { name: "Again" } }), 1);
    await expect(store.saveBuildItem(item(build.id, { key: "b" }), 1)).rejects.toBeInstanceOf(BuildLimitError);
  });

  it("refuses to change an item the user edited", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id), 200);
    await store.markBuildItem(build.id, "creature", "goblin", { editedByUser: true });
    await expect(store.saveBuildItem(item(build.id, { data: { name: "Overwrite" } }), 200)).rejects.toMatchObject({ reason: "edited" });
    await expect(store.removeBuildItem(build.id, "creature", "goblin")).rejects.toBeInstanceOf(BuildItemLockedError);
    expect((await store.findBuildItem(build.id, "creature", "goblin"))?.data).toEqual({ name: "Goblin" });
  });

  it("refuses to change an item already published", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id), 200);
    await store.markBuildItem(build.id, "creature", "goblin", { publishedId: randomUUID() });
    await expect(store.saveBuildItem(item(build.id), 200)).rejects.toMatchObject({ reason: "published" });
    await expect(store.removeBuildItem(build.id, "creature", "goblin")).rejects.toMatchObject({ reason: "published" });
  });

  it("removes a draft item, and reports one that isn't there", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id), 200);
    expect(await store.removeBuildItem(build.id, "creature", "goblin")).toBe(true);
    expect(await store.removeBuildItem(build.id, "creature", "goblin")).toBe(false);
  });

  it("takes a key named like an object's built-in property", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await store.saveBuildItem(item(build.id, { key: "__proto__" }), 200);
    expect((await store.findBuildItem(build.id, "creature", "__proto__"))?.key).toBe("__proto__");
  });

  it("moves the build's last-changed time on a save", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.saveBuildItem(item(build.id), 200);
    const after = await store.findBuild(build.id, build.ownerGmId);
    expect(Date.parse(after!.updatedAt)).toBeGreaterThan(Date.parse(build.updatedAt));
  });

  it("deleting the account erases builds and returns unpublished file objects (ADR 0050)", async () => {
    const store = makeStore();
    const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
    const build = await store.createBuild({ id: randomUUID(), ownerGmId: user.ownerId, name: "B" }, 3);
    const draft = file(build.id);
    const published = file(build.id, { publishedAssetId: randomUUID() });
    await store.addBuildFile(draft, limits);
    await store.addBuildFile(published, limits);
    await store.saveBuildItem(item(build.id), 200);
    await store.setBuildPass(build.id, user.ownerId, `del-${build.id}`, new Date().toISOString());
    const deleted = await store.deleteUser(user.id);
    expect(deleted?.objectKeys).toContain(draft.objectKey);
    expect(deleted?.objectKeys).not.toContain(published.objectKey);
    expect(await store.findBuild(build.id, user.ownerId)).toBeNull();
    expect(await store.findBuildByPassHash(`del-${build.id}`)).toBeNull();
    expect(await store.listBuildFiles(build.id)).toEqual([]);
    expect(await store.listBuildItems(build.id)).toEqual([]);
  });

  it("tracks grid detection for a build's map (scope build)", async () => {
    const store = makeStore();
    const build = await newBuild(store);
    const { DETECTION_VERSION } = await import("../src/store/gridDetectionStore");
    const map = file(build.id, {
      kind: "map", sourceHash: "abc", detectionSourceHash: "abc", detectionVersion: DETECTION_VERSION, detectionStatus: "queued", detectionAttempt: 1,
    });
    await store.addBuildFile(map, limits);
    const target = { scope: "build" as const, fileId: map.id };
    const row = await store.findDetection(target);
    expect(row).toMatchObject({ status: "queued", attempt: 1, objectKey: map.objectKey });
    const job = { target, attempt: 1, sourceHash: "abc", configVersion: DETECTION_VERSION };
    expect(await store.markDetectionRunning(job)).toBe(true);
    const candidate = { cellSize: 70, offsetX: 0, offsetY: 0, confidence: 0.9 };
    expect(await store.finishDetection(job, { status: "suggested", candidate: candidate as never })).toBe(true);
    expect((await store.findBuildFile(build.id, map.id))?.detectionResult).toMatchObject({ cellSize: 70 });
  });
});
