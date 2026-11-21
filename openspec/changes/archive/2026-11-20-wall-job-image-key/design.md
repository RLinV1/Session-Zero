## Context

- `WallDetections.start` (`apps/server/src/domain/wallDetection.ts`) reads the map and queues `{ image: base64, ... }` through the `WallJobQueue` seam. BullMQ stores the job JSON in Redis until the job is removed; the server removes it on finish, timeout and drop.
- The worker (`services/vision/wall_worker.py`) already has a Redis connection (it queues from the same Redis and writes a heartbeat key). It deliberately never fetches a URL and holds no storage credentials (ADR 0029). That is why the image must travel through Redis at all.
- Tests use a `WallJobQueue` stand-in, so the seam is the place to change.

## Goals / Non-Goals

**Goals:**
- Lower and bound Redis memory per analysis, without giving the worker new credentials or the ability to fetch URLs.

**Non-Goals:**
- Downscaling the image (detection quality depends on resolution, and the server has no image library).
- Changing detection, results, the preview or the HTTP contract.
- Setting `maxmemory` or an eviction policy on the shared Redis.

## Decisions

1. **A separate raw key per image, not a smaller job.** Alternatives: (a) the worker fetches from the app by an internal URL: new credentials and an HTTP surface on the worker, which ADR 0029 rejects; (b) gzip the base64: the images are already PNG/WebP, so little is saved; (c) downscale: loses accuracy. A raw key is binary-safe, 25% smaller than base64, and can carry its own expiry.
2. **Key = `vtt:wall-image:<sha256 hex>`.** Content addressing makes identical maps share a key (a retry, or two rooms on the same shipped map). The key shape is fixed and short, so the worker can refuse anything else with a strict match and cannot be pointed at other Redis keys.
3. **Server-side reference count, not a Redis counter.** The app is single-process (`RoomRegistry` already assumes it), so a `Map<key, count>` is enough. The count goes up when a job is queued and down when it finishes, fails, times out or is dropped; the key is deleted at zero. If the process dies first, the expiry removes it.
4. **Expiry = job timeout + 60 s.** The existing ten-minute timeout bounds a job, so an image never lives past it. Each `SET` for an already-stored image refreshes the expiry.
5. **Cap of 4 pending analyses server-wide.** At the 25 MB limit this bounds Redis to about 100 MB of images, and in practice far less because shipped maps are shared. The cap is a constant next to `MAX_RESULTS`; GMs over it get a 503 that says to try again. Per-room "busy" stays.
6. **The seam gains `putImage` and `dropImage`.** `add` keeps its signature and the data type changes (`image` becomes `imageKey`). The stand-in queue in tests keeps the bytes in a map, so tests read what the worker would read.

## Risks / Trade-offs

- [Old worker and new server do not interoperate] -> deploy together; this is called out in the proposal and docs. Jobs from before the change are not expected to exist across a deploy because they are removed on completion and time out in ten minutes.
- [The image key could expire while the job waits behind a slow worker] -> the expiry is longer than the job timeout, and a missing key fails the job with the existing "couldn't read this map" message.
- [Cap refuses legitimate bursts] -> four concurrent analyses is generous for a table-top app; the constant is easy to raise.
- [A bug in the reference count leaks a key] -> the expiry is the backstop.
