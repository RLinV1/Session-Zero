import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { DETECTION_VERSION, DETECTION_STALE_MS, detectionJob, type DetectionJob } from "../src/store/gridDetectionStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";

const postgres = process.env.DATABASE_URL ? await PostgresRoomStore.connect(process.env.DATABASE_URL) : null;
afterAll(async () => { await postgres?.close(); });
const identity = { sourceHash: "a".repeat(64), detectionSourceHash: "a".repeat(64), detectionVersion: DETECTION_VERSION };

for (const [name, store] of [["memory", new MemoryRoomStore()], ["postgres", postgres]] as [string, RoomStore | null][]) {
  describe.skipIf(!store)(`grid detection store: ${name} (FR-GM-03)`, () => {
    const s = () => store!;
    const candidate = { cellSize: 48.125, offsetX: 11.75, offsetY: 17.3333333333333 };
    const asset = async (overrides: object = {}) => {
      const ownerGmId = await s().registerGm(randomUUID());
      const id = randomUUID();
      await s().createAsset({ id, ownerGmId, kind: "map", objectKey: `${id}.png`, url: `/uploads/${id}.png`,
        name: "Map", width: 768, height: 648, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
        detectionStatus: "queued", detectionAttempt: 1, ...identity, ...overrides });
      return { ownerGmId, id, target: { scope: "library" as const, id } };
    };
    const job = async (target: DetectionJob["target"]) => detectionJob((await s().findDetection(target))!);

    it("claims once, persists fractional suggestions separately from saved grids, and rejects mismatched completions", async () => {
      const a = await asset();
      const queued = await job(a.target);
      expect((await Promise.all([s().markDetectionRunning(queued), s().markDetectionRunning(queued)])).filter(Boolean)).toHaveLength(1);
      for (const wrong of [{ ...queued, attempt: 2 }, { ...queued, sourceHash: "b".repeat(64) }, { ...queued, configVersion: "obsolete" }]) {
        expect(await s().finishDetection(wrong, { status: "no_grid" })).toBe(false);
      }
      expect(await s().finishDetection(queued, { status: "suggested", candidate })).toBe(true);
      expect((await s().findDetection(a.target))?.candidate).toEqual(candidate);
      expect(await s().retryDetection(a.target)).toBeNull();
      expect((await s().findAsset(a.id, a.ownerGmId))?.grid).toEqual(DEFAULT_GRID);
      expect((await s().recoverDetections()).some((j) => JSON.stringify(j.target) === JSON.stringify(a.target))).toBe(false);
      await s().deleteAsset(a.id, a.ownerGmId);
      expect(await s().findDetection(a.target)).toBeNull();
      expect(await s().finishDetection(queued, { status: "no_grid" })).toBe(false);
    });

    it("keeps duplicate uploads independent, including persisted no_grid", async () => {
      const a = await asset();
      const b = await asset();
      for (const entry of [a, b]) {
        const current = await job(entry.target);
        expect(await s().markDetectionRunning(current)).toBe(true);
        await s().finishDetection(current, { status: "no_grid" });
        expect((await s().findDetection(entry.target))?.status).toBe("no_grid");
      }
      await s().deleteAsset(a.id, a.ownerGmId);
      expect((await s().findDetection(b.target))?.status).toBe("no_grid");
      await s().deleteAsset(b.id, b.ownerGmId);
    });

    it("hides legacy, obsolete and mismatched-source rows without recovering them", async () => {
      for (const overrides of [
        { sourceHash: null, detectionSourceHash: null, detectionVersion: null },
        { detectionVersion: "old-detector" }, { detectionSourceHash: "b".repeat(64) },
      ]) {
        const a = await asset(overrides);
        expect(await s().findDetection(a.target)).toBeNull();
        const old = { target: a.target, attempt: 1, sourceHash: identity.sourceHash, configVersion: "old-detector" };
        expect(await s().markDetectionRunning(old)).toBe(false);
        expect((await s().recoverDetections()).some((j) => JSON.stringify(j.target) === JSON.stringify(a.target))).toBe(false);
        await s().deleteAsset(a.id, a.ownerGmId);
      }
    });

    it("defers busy without consuming attempts, bounds transient retries and excludes terminal errors", async () => {
      const a = await asset();
      const first = await job(a.target);
      await s().markDetectionRunning(first);
      expect(await s().deferDetection(first, false)).toBe(true);
      expect((await job(a.target)).attempt).toBe(1);
      for (let attempt = 1; attempt <= 3; attempt++) {
        const current = await job(a.target);
        expect(current.attempt).toBe(attempt);
        await s().markDetectionRunning(current);
        await s().deferDetection(current, true);
        expect(await s().finishDetection(current, { status: "no_grid" })).toBe(false);
      }
      expect((await s().findDetection(a.target))?.status).toBe("error");
      expect(await s().retryDetection(a.target)).toBeNull();
      await s().deleteAsset(a.id, a.ownerGmId);
      const oversized = await asset({ detectionStatus: "error", detectionError: "oversized" });
      expect(await s().retryDetection(oversized.target)).toBeNull();
      await s().deleteAsset(oversized.id, oversized.ownerGmId);
    });

    it("recovers only stale running jobs and exhausts stale claims at attempt three", async () => {
      const a = await asset({ detectionStatus: "running", detectionUpdatedAt: new Date(Date.now()-DETECTION_STALE_MS-1000).toISOString() });
      const first = await job(a.target);
      expect(await s().recoverDetections()).toContainEqual({ ...first, attempt: 2 });
      expect(await s().finishDetection(first, { status: "no_grid" })).toBe(false);
      await s().markDetectionRunning({ ...first, attempt: 2 });
      expect((await s().recoverDetections()).some((j) => JSON.stringify(j.target) === JSON.stringify(a.target))).toBe(false);
      await s().deleteAsset(a.id, a.ownerGmId);
      const exhausted = await asset({ detectionStatus: "running", detectionAttempt: 3, detectionUpdatedAt: new Date(Date.now()-DETECTION_STALE_MS-1000).toISOString() });
      await s().recoverDetections();
      expect((await s().findDetection(exhausted.target))?.status).toBe("error");
      expect((await s().findDetection(exhausted.target))?.attempt).toBe(3);
      await s().deleteAsset(exhausted.id, exhausted.ownerGmId);
    });

    it("retains room cache identity and removes it with the room; tokens and UVTT have none", async () => {
      const roomId = randomUUID();
      await s().createRoom(roomId, randomUUID().slice(0,10));
      const objectKey = `${randomUUID()}.png`;
      const target = { scope: "room" as const, roomId, objectKey };
      await s().recordRoomUpload(roomId, objectKey, "map", 768, 648, identity);
      const current = await job(target);
      await s().markDetectionRunning(current);
      await s().finishDetection(current, { status: "no_grid" });
      expect((await s().findDetection(target))?.status).toBe("no_grid");
      for (const purpose of ["token", "map"] as const) {
        const key = `${randomUUID()}.png`;
        await s().recordRoomUpload(roomId, key, purpose, 768, 648);
        expect(await s().findDetection({ scope: "room", roomId, objectKey: key })).toBeNull();
      }
      await s().deleteRoom(roomId);
      expect(await s().findDetection(target)).toBeNull();
      expect(await s().finishDetection(current, { status: "no_grid" })).toBe(false);
    });
  });
}

describe.skipIf(!postgres)("persistent grid cache across store restart (FR-GM-03)", () => {
  it("reuses candidates and no_grid while invalidating obsolete versions", async () => {
    const ownerGmId = await postgres!.registerGm(randomUUID());
    const targets: { scope: "library"; id: string }[] = [];
    for (const status of ["suggested", "no_grid"] as const) {
      const id = randomUUID();
      const target = { scope: "library" as const, id }; targets.push(target);
      await postgres!.createAsset({ id, ownerGmId, kind: "map", objectKey: `${id}.png`, url: `/uploads/${id}.png`,
        name: status, width: 768, height: 648, grid: null, createdAt: new Date().toISOString(),
        ...identity, detectionStatus: status, detectionAttempt: 1,
        detectionResult: status === "suggested" ? { cellSize: 64.25, offsetX: 7.125, offsetY: 12.875 } : null });
    }
    const reopened = await PostgresRoomStore.connect(process.env.DATABASE_URL!);
    try {
      expect((await reopened.findDetection(targets[0]!))?.candidate).toEqual({ cellSize: 64.25, offsetX: 7.125, offsetY: 12.875 });
      expect((await reopened.findDetection(targets[1]!))?.status).toBe("no_grid");
      expect((await reopened.recoverDetections()).filter((j) => targets.some((t) => JSON.stringify(t) === JSON.stringify(j.target)))).toEqual([]);
      const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
      try { await db.libraryAsset.updateMany({ where: { ownerGmId }, data: { detectionVersion: "obsolete" } }); }
      finally { await db.$disconnect(); }
      expect(await reopened.findDetection(targets[0]!)).toBeNull();
      expect(await reopened.findDetection(targets[1]!)).toBeNull();
    } finally {
      await reopened.close();
      for (const target of targets) await postgres!.deleteAsset(target.id, ownerGmId);
    }
  });
});
