import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Queue } from "bullmq";
import { createGridDetectionDispatcher, VisionBusyError, VisionInputError, type Detector } from "../src/domain/gridDetection";
import { DETECTION_VERSION, detectionJob, type DetectionJob } from "../src/store/gridDetectionStore";
import type { AssetStore } from "../src/store/assetStore";
import type { RoomStore } from "../src/store/roomStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";

const bytes = Buffer.from("stored-map-fixture");
const sourceHash = createHash("sha256").update(bytes).digest("hex");
const assets: AssetStore = { put: async () => "/uploads/test", delete: async () => {}, readPrivate: async () => bytes };
async function row(store: RoomStore) {
  const ownerGmId = await store.registerGm(randomUUID());
  const id = randomUUID();
  await store.createAsset({ id, ownerGmId, kind: "map", objectKey: `${id}.png`, url: `/uploads/${id}.png`,
    name: "Scheduling test", width: 768, height: 648, grid: null, createdAt: new Date().toISOString(),
    sourceHash, detectionSourceHash: sourceHash, detectionVersion: DETECTION_VERSION, detectionStatus: "queued", detectionAttempt: 1 });
  return { ownerGmId, id, job: detectionJob((await store.findDetection({ scope: "library", id }))!) };
}
async function until(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("Scheduling did not finish");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("bounded local grid scheduling (FR-GM-03)", () => {
  it("runs one analysis, bounds pending claims, recovers overflow, and deduplicates jobs", async () => {
    const store = new MemoryRoomStore();
    const rows = await Promise.all(Array.from({ length: 12 }, () => row(store)));
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let active = 0, maximum = 0;
    const run = vi.fn<Detector>(async () => {
      active++; maximum = Math.max(maximum, active);
      await hold;
      active--;
      return { status: "no_grid" };
    });
    const dispatcher = await createGridDetectionDispatcher(store, assets, { detector: run, pendingLimit: 2, recoveryIntervalMs: 20 });
    try {
      await Promise.all(rows.flatMap((r) => [dispatcher.enqueue(r.job), dispatcher.enqueue(r.job)]));
      await until(async () => run.mock.calls.length === 1);
      const states = await Promise.all(rows.map((r) => store.findDetection(r.job.target)));
      expect(states.filter((r) => r?.status === "running")).toHaveLength(1);
      expect(states.filter((r) => r?.status === "queued")).toHaveLength(11);
      release();
      await until(async () => (await Promise.all(rows.map((r) => store.findDetection(r.job.target)))).every((r) => r?.status === "no_grid"));
      expect(run).toHaveBeenCalledTimes(12);
      expect(maximum).toBe(1);
    } finally { release(); await dispatcher.close(); }
  });

  it("defers busy work with attempt one, retries execution at most three times, and treats input errors as terminal", async () => {
    for (const failure of ["busy", "execution", "input"] as const) {
      const store = new MemoryRoomStore();
      const r = await row(store);
      let calls = 0;
      const run = vi.fn<Detector>(async () => {
        calls++;
        if (failure === "busy" && calls <= 3) throw new VisionBusyError();
        if (failure === "execution") throw new Error("service down");
        if (failure === "input") throw new VisionInputError();
        return { status: "no_grid" };
      });
      const dispatcher = await createGridDetectionDispatcher(store, assets, { detector: run, recoveryIntervalMs: 20 });
      try {
        await until(async () => ["no_grid", "error"].includes((await store.findDetection(r.job.target))!.status));
        const result = await store.findDetection(r.job.target);
        expect(result?.attempt).toBe(failure === "execution" ? 3 : 1);
        expect(run).toHaveBeenCalledTimes(failure === "busy" ? 4 : failure === "execution" ? 3 : 1);
        expect(result?.status).toBe(failure === "busy" ? "no_grid" : "error");
      } finally { await dispatcher.close(); }
    }
  });

  it("rejects changed source bytes before invoking the detector", async () => {
    const store = new MemoryRoomStore();
    const r = await row(store);
    const run = vi.fn<Detector>(async () => ({ status: "no_grid" }));
    const dispatcher = await createGridDetectionDispatcher(store, { ...assets, readPrivate: async () => Buffer.from("changed") }, { detector: run });
    try {
      await until(async () => (await store.findDetection(r.job.target))?.status === "error");
      expect((await store.findDetection(r.job.target))?.error).toBe("source_changed");
      expect(run).not.toHaveBeenCalled();
    } finally { await dispatcher.close(); }
  });

  it("rejects an obsolete job before claiming a queued row with matching bytes", async () => {
    const store = new MemoryRoomStore();
    const run = vi.fn<Detector>(async () => ({ status: "no_grid" }));
    const dispatcher = await createGridDetectionDispatcher(store, assets, { detector: run, recoveryIntervalMs: 60_000 });
    try {
      // Create after startup recovery so only this obsolete job can claim the row.
      const r = await row(store);
      await dispatcher.enqueue({ ...r.job, configVersion: "obsolete" });
      await dispatcher.close();
      expect((await store.findDetection(r.job.target))?.status).toBe("queued");
      expect(run).not.toHaveBeenCalled();
    } finally { await dispatcher.close(); }
  });
});

const postgres = process.env.DATABASE_URL && process.env.REDIS_URL ? await PostgresRoomStore.connect(process.env.DATABASE_URL) : null;
afterAll(async () => { await postgres?.close(); });
describe.skipIf(!postgres)("BullMQ global grid admission (FR-GM-03)", () => {
  it("limits two dispatchers globally to one active analysis and rejects duplicate job claims", async () => {
    const store = postgres!;
    const rows = await Promise.all(Array.from({ length: 6 }, () => row(store)));
    let active = 0, maximum = 0;
    const counts = new Map<string, number>();
    const run = vi.fn<Detector>(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      return { status: "no_grid" };
    });
    const original = store.markDetectionRunning.bind(store);
    const claim = vi.spyOn(store, "markDetectionRunning").mockImplementation(async (job: DetectionJob) => {
      const ok = await original(job);
      if (ok) counts.set(JSON.stringify(job.target), (counts.get(JSON.stringify(job.target)) ?? 0) + 1);
      return ok;
    });
    const queueName = `grid-detection-test-${randomUUID()}`;
    const options = { detector: run, redisUrl: process.env.REDIS_URL!, recoveryIntervalMs: 20, queueName };
    const first = await createGridDetectionDispatcher(store, assets, options);
    const second = await createGridDetectionDispatcher(store, assets, options);
    const url = new URL(process.env.REDIS_URL!);
    const queue = new Queue(queueName, { connection: { host: url.hostname, port: Number(url.port), db: Number(url.pathname.slice(1) || 0) } });
    try {
      await Promise.all(rows.flatMap((r) => [first.enqueue(r.job), second.enqueue(r.job)]));
      await until(async () => (await Promise.all(rows.map((r) => store.findDetection(r.job.target)))).every((r) => r?.status === "no_grid"));
      expect(await queue.getGlobalConcurrency()).toBe(1);
      expect(maximum).toBe(1);
      expect(run).toHaveBeenCalledTimes(6);
      expect([...counts.values()]).toEqual(Array(6).fill(1));
    } finally {
      await first.close(); await second.close(); await queue.close(); claim.mockRestore();
      for (const r of rows) await store.deleteAsset(r.id, r.ownerGmId);
    }
  });
});
