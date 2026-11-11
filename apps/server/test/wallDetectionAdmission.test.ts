import { describe, expect, it, vi } from "vitest";
import { MAX_PENDING_JOBS, WallDetections, type WallJobData, type WallJobEvent, type WallJobQueue } from "../src/domain/wallDetection";
import type { AssetStore } from "../src/store/assetStore";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const images = new Map<string, Uint8Array>();
  const jobs = new Map<string, WallJobData>();
  let event: (notice: WallJobEvent) => void = () => {};
  const queue = {
    add: vi.fn(async (id: string, data: WallJobData) => { jobs.set(id, data); }),
    remove: vi.fn(async (id: string) => { jobs.delete(id); }),
    putImage: vi.fn(async (key: string, bytes: Uint8Array) => { images.set(key, bytes); }),
    extendImage: vi.fn(async () => {}),
    dropImage: vi.fn(async (key: string) => { images.delete(key); }),
    workerAlive: vi.fn(async () => true),
    onEvent: (handler: (notice: WallJobEvent) => void) => { event = handler; },
    close: vi.fn(async () => {}),
  } satisfies WallJobQueue;
  const assets = {
    readPrivate: vi.fn(async () => new Uint8Array([1, 2, 3])),
    sizeOf: vi.fn(async () => 3),
    put: vi.fn(async () => "/uploads/map.png"),
    delete: vi.fn(async () => {}),
  } satisfies AssetStore;
  const notify = vi.fn();
  const detection = new WallDetections(assets, queue, notify);
  const map = { url: "/uploads/map.png", width: 700, height: 700 };
  return { images, jobs, queue, assets, notify, detection, map, emit: (notice: WallJobEvent) => event(notice) };
}

describe("wall analysis publication ownership (FR-GM-11)", () => {
  it("reserves one map before its read resolves and counts all admitted reads", async () => {
    const { assets, queue, detection, map } = setup();
    const read = deferred<Uint8Array<ArrayBuffer>>();
    assets.readPrivate.mockReturnValue(read.promise);
    const first = detection.start("r1", map, 70);
    expect(await detection.start("r1", map, 70)).toBe("busy");
    const others = Array.from({ length: MAX_PENDING_JOBS - 1 }, (_, i) => detection.start(`r${i + 2}`, map, 70));
    expect(await detection.start("extra", map, 70)).toBe("overloaded");
    expect(queue.add).not.toHaveBeenCalled();
    read.resolve(new Uint8Array([1, 2, 3]));
    expect(await first).toBe("queued");
    expect(await Promise.all(others)).toEqual(Array(MAX_PENDING_JOBS - 1).fill("queued"));
    expect(queue.add).toHaveBeenCalledTimes(MAX_PENDING_JOBS);
    await detection.close();
  });

  it("does not publish a cancelled read", async () => {
    const { assets, queue, detection, map, notify } = setup();
    const read = deferred<Uint8Array<ArrayBuffer>>();
    assets.readPrivate.mockReturnValue(read.promise);
    const pending = detection.start("r1", map, 70);
    detection.forgetRoom("r1");
    read.resolve(new Uint8Array([1]));
    expect(await pending).toBe("unavailable");
    expect(queue.putImage).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(detection.status("r1", map.url)).toBeNull();
    await detection.close();
  });

  it("finishes a cancelled image write before deleting it and never queues its job", async () => {
    const { queue, detection, map, images } = setup();
    const writing = deferred<void>();
    const started = deferred<void>();
    queue.putImage.mockImplementation(async (key, bytes) => {
      started.resolve();
      await writing.promise;
      images.set(key, bytes);
    });
    const pending = detection.start("r1", map, 70);
    await started.promise;
    detection.forgetRoom("r1");
    expect(queue.dropImage).not.toHaveBeenCalled();
    writing.resolve();
    expect(await pending).toBe("unavailable");
    expect(queue.add).not.toHaveBeenCalled();
    expect(images.size).toBe(0);
    expect(queue.dropImage).toHaveBeenCalledTimes(1);
    await detection.close();
  });

  it("keeps cancelled queue insertions counted with images held until they settle", async () => {
    const { queue, detection, map, images, jobs, notify } = setup();
    const adding = deferred<void>();
    const starts = Array.from({ length: MAX_PENDING_JOBS }, () => deferred<void>());
    let index = 0;
    queue.add.mockImplementation(async (id, data) => {
      starts[index++]?.resolve();
      await adding.promise;
      jobs.set(id, data);
    });
    const pending = Array.from({ length: MAX_PENDING_JOBS }, (_, i) => detection.start(`r${i}`, map, 70));
    await Promise.all(starts.map((start) => start.promise));
    for (let i = 0; i < MAX_PENDING_JOBS; i += 1) detection.forgetRoom(`r${i}`);
    expect(await detection.start("extra", map, 70)).toBe("overloaded");
    expect(queue.remove).not.toHaveBeenCalled();
    expect(images.size).toBe(1);
    adding.resolve();
    expect(await Promise.all(pending)).toEqual(Array(MAX_PENDING_JOBS).fill("unavailable"));
    expect(jobs.size).toBe(0);
    expect(images.size).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(await detection.start("extra", map, 70)).toBe("queued");
    await detection.close();
  });

  it("waits for the shared image's initial write before either job is published", async () => {
    const { queue, detection, map, jobs, images } = setup();
    const writing = deferred<void>();
    const started = deferred<void>();
    queue.putImage.mockImplementation(async (key, bytes) => {
      started.resolve();
      await writing.promise;
      images.set(key, bytes);
    });
    const first = detection.start("r1", map, 70);
    await started.promise;
    const second = detection.start("r2", map, 70);
    await Promise.resolve();
    await Promise.resolve();
    expect(jobs.size).toBe(0);
    writing.resolve();
    expect(await Promise.all([first, second])).toEqual(["queued", "queued"]);
    expect(images.size).toBe(1);
    expect(queue.putImage).toHaveBeenCalledTimes(1);
    expect(queue.extendImage).toHaveBeenCalledTimes(1);
    await detection.close();
  });

  it("cleans an analysis that completes while add is still settling", async () => {
    const { queue, detection, map, emit, jobs, images } = setup();
    queue.add.mockImplementation(async (id, data) => {
      jobs.set(id, data);
      emit({ jobId: id, kind: "completed", returnvalue: { walls: [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 } }], preview: { contentType: "image/png", width: 10, height: 10, data: "AAAA" } } });
    });
    expect(await detection.start("r1", map, 70)).toBe("queued");
    expect(detection.status("r1", map.url)).toMatchObject({ status: "done", wallCount: 1 });
    expect(jobs.size).toBe(0);
    expect(images.size).toBe(0);
    await detection.close();
  });
  it("keeps a slot for a running job whose room was deleted until the job ends", async () => {
    const { queue, detection, map, emit } = setup();
    queue.remove.mockRejectedValue(new Error("Job is locked"));
    const rooms = Array.from({ length: MAX_PENDING_JOBS }, (_, i) => `r${i}`);
    for (const room of rooms) expect(await detection.start(room, map, 70)).toBe("queued");
    const [jobId] = [...queue.add.mock.calls[0]!];
    emit({ jobId, kind: "active" });
    detection.forgetRoom("r0");
    await Promise.resolve();
    expect(await detection.start("extra", map, 70)).toBe("overloaded");
    emit({ jobId, kind: "completed", returnvalue: "{}" });
    expect(await detection.start("extra", map, 70)).toBe("queued");
    await detection.close();
  });

  it("gives job IDs a suffix that differs between server runs", async () => {
    const ids: string[] = [];
    for (let run = 0; run < 2; run++) {
      const { queue, detection, map } = setup();
      await detection.start("r1", map, 70);
      ids.push(queue.add.mock.calls[0]![0]);
      await detection.close();
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});
