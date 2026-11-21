# Design

## Context

Manual library and room grid editors already share `GridForm`; accepted room grids change only through `scene.setGrid`. Library maps store their own grid. `/api/uploads` currently also serves token images, and room uploads are tracked for room deletion. See the proposal for motivation.

## Goals / Non-Goals

**Goals:** Keep analysis outside room state, bind work to server-owned images, and make every attempt recoverable and race-safe. Keep image decoding and processing bounded.

**Non-Goals:** Backfill old maps, auto-apply results, infer hex grids or walls, or expose job telemetry to players.

## Decisions

### Persistence and API

Add nullable `detection_status`, integer `detection_attempt`, and nullable `detection_result` to library assets and room uploads. Null denotes a legacy map or token with no analysis. New map records start queued at attempt 1. Store methods conditionally move queued to running, finish only when the attempt matches, and retry only error rows. A startup scan re-enqueues queued rows and resets interrupted running rows to queued. Deleting the parent row removes its analysis data.

The exact state transitions are `null → queued(1) → running(1) → suggested | no_grid | error`. A retry is allowed only from `error(n)` and moves to `queued(n+1)` after clearing the result. Recovery re-enqueues `queued(n)` unchanged and moves a `running(n)` row older than 60 seconds to `queued(n+1)`. Every running and finish update checks its attempt number, so the older worker cannot publish a result. A candidate remains available until deletion or retry; it is never copied into `grid` by a worker.

`GET /api/library/:id/grid-detection` and `POST .../retry` require the owning GM device token and answer 404 for other assets. `GET /api/rooms/:roomId/grid-detection` and `POST .../retry` require an active GM guest credential and an `x-expected-map-url` header matching the current direct room map. A replaced map therefore cannot satisfy an older poll. All replies use the shared discriminated `GridDetectionStatus` schema; success replies contain status, attempt and, only when suggested, the candidate. There is no player-readable summary or room event.

The GET routes return 200 and one of `{status:"queued"|"running"|"no_grid"|"error",attempt}` or `{status:"suggested",attempt,candidate:{cellSize,offsetX,offsetY,confidence}}`. Legacy maps, token uploads, deleted maps, and a mismatched current room map return 404. A successful retry returns 202 with the newly queued status; a retry while queued, running, or complete returns 409. Unauthorized library requests return 401, another GM's asset returns 404, and non-GM room requests return 403. Replies use `Cache-Control: no-store`.

The direct upload multipart field `purpose=map` starts analysis; omitted purpose remains token-compatible. A new direct map response still has `url` so existing callers work. Library `kind=map` is the other trigger. A placement copies its saved grid without enqueueing.

### Dispatcher and private vision boundary

With `REDIS_URL` and a shared Postgres store, BullMQ carries `{scope,id,attempt}` jobs and a Node worker reads metadata and bytes by the stored object key. A memory store always uses the `setImmediate` dispatcher because a worker in another process cannot read its rows; this also applies when Redis is configured. Startup recovery reads pending rows and schedules them. Enqueue failure marks the current attempt error without failing the image upload. The worker sends binary image bytes and expected dimensions to `VISION_URL` over a private service link; it never follows a caller-supplied URL. Read, request and service failures become error status. The asset store exposes a bounded server-side read for disk or S3. Job IDs include the attempt; conditional updates prevent stale completions and retries racing with workers.

Using room events for this status was rejected because players receive those payloads and an accepted grid must remain unchanged until explicit Apply. Fetching the public image URL in the worker was rejected because it would permit arbitrary URL fetching if a map URL were forged. A separate HTTP status channel and object-key read keep both boundaries explicit. Local Compose exposes vision only on loopback for the Node dev server; deployment uses a private service DNS name and Redis-backed jobs. The Python service is never part of the public ingress.

### Detector contract and validation

The Python/OpenCV service accepts one image body (max 25 MB), verifies decoded dimensions and a 40 megapixel ceiling, and returns `{kind:"candidate",cellSize,offsetX,offsetY,confidence}` or `{kind:"no_grid"}`. It estimates periodic vertical and horizontal line positions independently, rejects inconsistent spacing, and converts phase to the original image pixel system. A service timeout bounds wall time. Node validates all numbers, canonical offsets, dimensions and the shared drawable-line limit before persisting a candidate; invalid output is an error. Confidence below 0.75 is still shown with a warning.

### Editor lifecycle

Each editor starts polling on open and stops on close or map change. A generation guard ignores old responses. Use suggestion changes only draft size and offsets through the existing preview path; Save or Apply alone commits. Room polling is limited to a directly uploaded current map, and its preview stays local to the GM browser. The current accepted grid label replaces the old `Confidence: manual` wording; automatic confidence has its own label.

Only progress and available suggestions appear in the editor. A `no_grid` or `error` result, or a status request error, hides the analysis area without a notice or retry button. The manual draft and controls stay available, including validation and save errors. Internal status and retry APIs retain their existing behavior.

## Risks / Trade-offs

- Weak or decorative line patterns can lower accuracy → expose confidence, warn below 0.75, and retain full manual correction.
- Worker or service outage leaves an internal error → upload remains usable and the editor quietly leaves alignment to the GM.
- A restart can leave queued/running work → startup recovery re-enqueues it; attempt checks make duplicate jobs safe.
- A large compressed image can expand heavily → bound decoded pixel count, body size, and service time.

## Migration Plan

Deploy the additive Prisma migration and private vision service before enabling server jobs. Set `VISION_URL` to its private address and `REDIS_URL` for durable deployed jobs; local development uses the in-process dispatcher without Redis. Existing records retain null status and are not analyzed. Rollback can stop jobs and revert the application while leaving additive columns unused.
