import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { GridDetectionCandidate, canRenderGrid } from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";
import { DETECTION_VERSION, detectionJob, matchesDetection, type DetectionJob, type DetectionOutcome, type DetectionTarget } from "../store/gridDetectionStore";
import type { RoomStore } from "../store/roomStore";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VISION_RESPONSE_BYTES = 4096;
const VISION_TIMEOUT_MS = Number(process.env.GRID_HTTP_TIMEOUT_MS ?? 40_000);
const RECOVERY_INTERVAL_MS = 2000;

export class VisionBusyError extends Error {}
export class VisionInputError extends Error {}
export type Detector = (bytes: Uint8Array, dimensions: { width: number; height: number }) => Promise<DetectionOutcome>;
export interface GridDetectionDispatcher {
  enqueue(job: DetectionJob): Promise<void>;
  close(): Promise<void>;
}

/** Queue availability never changes an upload into an error; the store retains pending work. */
export async function enqueueDetection(store: RoomStore, dispatcher: GridDetectionDispatcher, target: DetectionTarget, attempt: number) {
  try {
    const row = await store.findDetection(target);
    if (row?.status === "queued" && row.attempt === attempt) await dispatcher.enqueue(detectionJob(row));
  } catch { /* A later recovery scan schedules the durable queued row. */ }
}

/** The configured URL and stored bytes are the only inputs; never fetch a client URL. */
export function visionDetector(url: string): Detector {
  return async (bytes, dimensions) => {
    const response = await fetch(`${url.replace(/\/$/, "")}/detect`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: { "content-type": "application/octet-stream", "x-image-width": String(dimensions.width), "x-image-height": String(dimensions.height), "x-grid-version": DETECTION_VERSION },
      body: Buffer.from(bytes),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 503 || response.status === 429) throw new VisionBusyError("Vision busy");
      if (response.status === 422) throw new VisionInputError("Invalid image");
      throw new Error("Vision service unavailable");
    }
    if (response.headers.get("x-grid-version") !== DETECTION_VERSION) {
      await response.body?.cancel();
      throw new Error("Vision configuration mismatch");
    }
    if (!response.body) throw new Error("Empty vision response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_VISION_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("Vision response too large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof result !== "object" || result === null || !("kind" in result)) throw new Error("Invalid vision response");
    if (result.kind === "no_grid") return { status: "no_grid" };
    if (result.kind !== "candidate") throw new Error("Invalid vision response");
    return { status: "suggested", candidate: GridDetectionCandidate.parse(result) };
  };
}

export async function createGridDetectionDispatcher(
  store: RoomStore,
  assets: AssetStore,
  options: { redisUrl?: string; visionUrl?: string; detector?: Detector; pendingLimit?: number; recoveryIntervalMs?: number; queueName?: string } = {},
): Promise<GridDetectionDispatcher> {
  const detector = options.detector ?? visionDetector(options.visionUrl ?? "http://127.0.0.1:8000");
  const pendingLimit = Math.max(1, options.pendingLimit ?? 8);
  const processJob = async (job: DetectionJob) => {
    if (!(await store.markDetectionRunning(job))) return;
    try {
      const row = await store.findDetection(job.target);
      if (!row || !matchesDetection(row, job)) return;
      const bytes = await assets.readPrivate(row.objectKey, MAX_IMAGE_BYTES);
      if (!bytes) throw new Error("Stored image unavailable");
      if (createHash("sha256").update(bytes).digest("hex") !== job.sourceHash) {
        await store.finishDetection(job, { status: "error", error: "source_changed" });
        return;
      }
      const outcome = await detector(bytes, { width: row.width, height: row.height });
      if (outcome.status === "suggested") {
        const candidate = GridDetectionCandidate.parse(outcome.candidate);
        if (!canRenderGrid(candidate.cellSize, row) || candidate.cellSize > Math.max(row.width, row.height)) throw new Error("Candidate outside drawable range");
      }
      if (outcome.status === "error" && (!outcome.error || outcome.error === "execution_failed")) await store.deferDetection(job, true);
      else await store.finishDetection(job, outcome);
    } catch (err) {
      if (err instanceof VisionBusyError) await store.deferDetection(job, false);
      else if (err instanceof VisionInputError) await store.finishDetection(job, { status: "error", error: "invalid_image" });
      else await store.deferDetection(job, true);
    }
  };

  let queue: Queue<DetectionJob> | null = null;
  let worker: Worker<DetectionJob> | null = null;
  let closed = false;
  const pending: DetectionJob[] = [];
  const scheduled = new Set<string>();
  let active: Promise<void> | null = null;
  const jobId = (job: DetectionJob) => createHash("sha256").update(JSON.stringify(job)).digest("hex");
  const pump = () => {
    if (closed || active || !pending.length) return;
    const job = pending.shift()!;
    active = processJob(job).catch(() => { /* Recover stale claims after a storage failure. */ }).finally(() => {
      scheduled.delete(jobId(job));
      active = null;
      pump();
    });
  };
  if (options.redisUrl) {
    const queueName = options.queueName ?? "grid-detection";
    const url = new URL(options.redisUrl);
    const address = {
      host: url.hostname, port: Number(url.port || 6379),
      ...(url.username && { username: decodeURIComponent(url.username) }),
      ...(url.password && { password: decodeURIComponent(url.password) }),
      ...(url.pathname.length > 1 && { db: Number(url.pathname.slice(1)) }),
      ...(url.protocol === "rediss:" && { tls: {} }),
    };
    queue = new Queue(queueName, { connection: { ...address, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1000 } });
    queue.on("error", () => {});
    await queue.setGlobalConcurrency(1);
    worker = new Worker(queueName, async (job) => processJob(job.data), {
      connection: { ...address, maxRetriesPerRequest: null }, concurrency: 1,
    });
    worker.on("error", () => {});
  }
  const enqueue = async (job: DetectionJob) => {
    if (closed) return;
    if (queue) {
      await queue.add("analyze", job, { jobId: jobId(job), removeOnComplete: true, removeOnFail: true });
    } else {
      const key = jobId(job);
      if (scheduled.has(key) || pending.length >= pendingLimit) return;
      scheduled.add(key);
      pending.push(job);
      pump();
    }
  };
  let recovering = false;
  const recover = async () => {
    if (closed || recovering || (!queue && pending.length >= pendingLimit)) return;
    recovering = true;
    try {
      for (const job of await store.recoverDetections(queue ? 100 : pendingLimit + 1)) await enqueue(job);
    } catch { /* Durable rows remain available for a later scan. */ }
    finally { recovering = false; }
  };
  await recover();
  const timer = setInterval(() => { void recover(); }, options.recoveryIntervalMs ?? RECOVERY_INTERVAL_MS);
  timer.unref();
  return { enqueue, close: async () => {
    closed = true;
    clearInterval(timer);
    pending.length = 0;
    await active;
    await worker?.close();
    await queue?.close();
  } };
}
