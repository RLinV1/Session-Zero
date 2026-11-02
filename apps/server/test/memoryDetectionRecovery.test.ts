import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DETECTION_STALE_MS, DETECTION_VERSION, detectionJob, type DetectionTarget } from "../src/store/gridDetectionStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const identity = { sourceHash: "a".repeat(64), detectionSourceHash: "a".repeat(64), detectionVersion: DETECTION_VERSION };
let store: MemoryRoomStore;
let ownerGmId: string;
let roomId: string;

beforeEach(async () => {
  store = new MemoryRoomStore();
  ownerGmId = await store.registerGm(randomUUID());
  roomId = randomUUID();
  await store.createRoom(roomId, randomUUID());
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function upload(scope: DetectionTarget["scope"]) {
  const id = randomUUID();
  let target: DetectionTarget;
  if (scope === "library") {
    target = { scope, id };
    await store.createAsset({ id, ownerGmId, kind: "map", objectKey: `${id}.png`, url: `/uploads/${id}.png`,
      name: "Recovery", width: 768, height: 648, grid: null, createdAt: new Date().toISOString(),
      ...identity, detectionStatus: "queued", detectionAttempt: 1 });
  } else {
    target = { scope, roomId, objectKey: `${id}.png` };
    await store.recordRoomUpload(roomId, target.objectKey, "map", 768, 648, identity);
  }
  return detectionJob((await store.findDetection(target))!);
}

describe("in-memory grid recovery (FR-GM-03)", () => {
  it.each(["room", "library"] as const)("does not copy terminal caches while recovering queued work and a fresh running %s upload", async (scope) => {
    for (let i = 0; i < 30; i++) {
      const job = await upload(i % 2 ? "room" : "library");
      await store.markDetectionRunning(job);
      await store.finishDetection(job, i % 3 === 0 ? { status: "error", error: "execution_failed" }
        : i % 3 === 1 ? { status: "no_grid" }
        : { status: "suggested", candidate: { cellSize: 64, offsetX: 7, offsetY: 13 } });
    }
    const room = await upload("room");
    const library = await upload("library");
    const running = await upload(scope);
    await store.markDetectionRunning(running);

    // Recovery's copy cost must depend on unfinished work, not retained upload history.
    const clone = vi.spyOn(globalThis, "structuredClone");
    const recovered = await store.recoverDetections();
    expect(recovered).toHaveLength(2);
    expect(recovered).toEqual(expect.arrayContaining([room, library]));
    expect(clone.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("keeps deferred, retried, and stale work recoverable while removing finished and deleted uploads", async () => {
    vi.useFakeTimers();
    const library = await upload("library");
    const room = await upload("room");
    await store.markDetectionRunning(library);
    await store.markDetectionRunning(room);
    await store.deferDetection(library, false);
    expect(await store.recoverDetections()).toEqual([library]);
    await store.markDetectionRunning(library);
    await store.finishDetection(library, { status: "error", error: "execution_failed" });
    expect(await store.recoverDetections()).toEqual([]);

    expect(await store.retryDetection(library.target)).toBe(2);
    const retried = { ...library, attempt: 2 };
    expect(await store.recoverDetections()).toEqual([retried]);
    await store.markDetectionRunning(retried);
    vi.setSystemTime(Date.now() + DETECTION_STALE_MS + 1);
    const recovered = await store.recoverDetections();
    expect(recovered).toHaveLength(2);
    expect(recovered).toEqual(expect.arrayContaining([{ ...library, attempt: 3 }, { ...room, attempt: 2 }]));
    expect(await store.finishDetection(library, { status: "no_grid" })).toBe(false);
    for (const job of recovered) {
      await store.markDetectionRunning(job);
      await store.finishDetection(job, { status: "no_grid" });
    }
    expect(await store.recoverDetections()).toEqual([]);

    const deleted = await upload("library");
    await upload("room");
    if (deleted.target.scope !== "library") throw new Error("Expected library upload");
    await store.deleteAsset(deleted.target.id, ownerGmId);
    await store.deleteRoom(roomId);
    const clone = vi.spyOn(globalThis, "structuredClone");
    expect(await store.recoverDetections()).toEqual([]);
    expect(clone).not.toHaveBeenCalled();
  });
});
