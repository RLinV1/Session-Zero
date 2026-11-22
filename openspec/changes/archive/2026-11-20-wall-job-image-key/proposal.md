## Why

A wall-detection job carries the whole map image as base64 inside the BullMQ job (ADR 0029). A 25 MB map is about 34 MB of Redis text, and BullMQ keeps that job data for as long as the job exists, so a few GMs analysing maps at once can take hundreds of megabytes. A job lost before the server removes it (a crash, a failed remove) also leaves the image there with no expiry.

## What Changes

- The image bytes move out of the job into one raw Redis key, `vtt:wall-image:<sha256 of the bytes>`, written with an expiry. The job carries only that key name. Raw bytes are a quarter smaller than base64, and the key cannot outlive its expiry.
- Maps with the same bytes share one key, so two rooms analysing the same built-in map, or a retry, store the image once. The server counts how many live jobs use a key and deletes it when the last one finishes or is dropped.
- The server limits how many analyses may be pending in the whole server at once. A new one beyond the limit is refused with a clear message instead of queuing more images.
- The worker reads the key itself. It only accepts a key of exactly that shape, so a job cannot make it read any other Redis key. It still never fetches a URL and holds no storage credentials.
- No change to room state, commands, events or the HTTP contract, apart from one new 503 message when the server is busy.

## Capabilities

### New Capabilities
- `wall-job-transport`: how a wall-detection job hands its image to the worker, how long it may stay in Redis, and how many analyses may be pending.

### Modified Capabilities

## Impact

- `apps/server/src/domain/wallDetection.ts`, `apps/server/src/http/routes.ts`, `apps/server/test/wallDetection.test.ts`.
- `services/vision/wall_worker.py`, `services/vision/test_wall_worker.py`.
- Docs: `docs/WALL-DETECTION.md` and an amendment to ADR 0029.
- The app server and the worker must be deployed together: an old worker cannot read the new job, and an old server's jobs carry the image inline.
