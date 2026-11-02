import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { DETECTION_VERSION } from "../src/store/gridDetectionStore";
import { buildApp } from "../src/app";
import { createGridDetectionDispatcher, visionDetector } from "../src/domain/gridDetection";
import { LocalDiskAssetStore } from "../src/store/assetStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("grid detection vision boundary (FR-GM-03)", () => {
  it("accepts a small result and rejects an oversized streaming response before it finishes", async () => {
    let calls = 0;
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "x-grid-version": DETECTION_VERSION });
      if (++calls === 1) res.end('{"kind":"no_grid"}');
      else res.write("x".repeat(5000)); // Deliberately keep the connection open.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const detect = visionDetector(`http://127.0.0.1:${port}`);
      expect(await detect(PNG, { width: 1, height: 1 })).toEqual({ status: "no_grid" });
      await expect(detect(PNG, { width: 1, height: 1 })).rejects.toThrow("Vision response too large");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keeps an in-memory store's jobs local even when Redis is configured", async () => {
    const store = new MemoryRoomStore();
    const dir = await mkdtemp(join(tmpdir(), "kan09-memory-worker-"));
    const id = randomUUID();
    const objectKey = `${id}.png`;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      await writeFile(join(dir, objectKey), PNG);
      const ownerGmId = await store.registerGm(randomUUID());
      await store.createAsset({
        id, ownerGmId, kind: "map", objectKey, url: `/uploads/${objectKey}`,
        name: "Local map", width: 1, height: 1, grid: DEFAULT_GRID,
        createdAt: new Date().toISOString(), detectionStatus: "queued", detectionAttempt: 1,
        sourceHash: createHash("sha256").update(PNG).digest("hex"), detectionSourceHash: createHash("sha256").update(PNG).digest("hex"), detectionVersion: DETECTION_VERSION,
      });
      const detector = vi.fn(async () => ({ status: "no_grid" as const }));
      app = await buildApp({ store, uploadDir: dir, detector, redisUrl: "redis://127.0.0.1:1" });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const deadline = Date.now() + 1000;
      while ((await store.findDetection({ scope: "library", id }))?.status !== "no_grid") {
        if (Date.now() > deadline) throw new Error("Local worker did not finish queued detection");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(detector).toHaveBeenCalledOnce();
    } finally {
      await app?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)("grid detection BullMQ worker (FR-GM-03)", () => {
  it("processes a queued Postgres map through Redis and stores the private result", async () => {
    const store = await PostgresRoomStore.connect(process.env.DATABASE_URL!);
    const dir = await mkdtemp(join(tmpdir(), "kan09-worker-"));
    const id = randomUUID();
    const objectKey = `${id}.png`;
    const target = { scope: "library" as const, id };
    let dispatcher: Awaited<ReturnType<typeof createGridDetectionDispatcher>> | undefined;
    try {
      await writeFile(join(dir, objectKey), PNG);
      const ownerGmId = await store.registerGm(randomUUID());
      await store.createAsset({
        id, ownerGmId, kind: "map", objectKey, url: `/uploads/${objectKey}`,
        name: "Redis map", width: 1, height: 1, grid: DEFAULT_GRID,
        createdAt: new Date().toISOString(), detectionStatus: "queued", detectionAttempt: 1,
        sourceHash: createHash("sha256").update(PNG).digest("hex"), detectionSourceHash: createHash("sha256").update(PNG).digest("hex"), detectionVersion: DETECTION_VERSION,
      });
      const detector = vi.fn(async (bytes: Uint8Array, size: { width: number; height: number }) => {
        expect(Buffer.from(bytes)).toEqual(PNG);
        expect(size).toEqual({ width: 1, height: 1 });
        return { status: "no_grid" as const };
      });
      dispatcher = await createGridDetectionDispatcher(store, new LocalDiskAssetStore(dir), {
        redisUrl: process.env.REDIS_URL, detector,
      });
      const deadline = Date.now() + 5000;
      while ((await store.findDetection(target))?.status !== "no_grid") {
        if (Date.now() > deadline) throw new Error("Redis worker did not finish queued detection");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(detector).toHaveBeenCalledOnce();
      expect((await store.findDetection(target))?.attempt).toBe(1);
      await store.deleteAsset(id, ownerGmId);
      expect(await store.findDetection(target)).toBeNull();
    } finally {
      await dispatcher?.close();
      await store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
