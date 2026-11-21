# Design

## Context

This change builds on the KAN-09 grid detection branch. That branch added `services/vision` (Python, OpenCV), a `vision` Compose service, BullMQ in `apps/server`, and `AssetStore.readPrivate`, which reads an upload by its server-owned object key. Its grid jobs are consumed by a Node worker that calls the Python service over private HTTP.

DESIGN.md §1 and §2 describe the vision service as "driven by a BullMQ queue on Redis". Wall extraction is slower than grid estimation, and its result includes an image, so it uses that shape directly: Node produces the job, Python consumes it, and Node is told when it is done.

The room has no wall geometry today. `TableState` (ADR 0019) is the part of the board that checkpoints restore. The socket's `maxHttpBufferSize` is 64 KB, which rules out a client sending a few hundred segments in one command.

## Goals / Non-Goals

**Goals:** Walls are authoritative room state reached only through `decide`/`reduce`. Detection runs in the isolated Python service through BullMQ. The app server learns of completion by event, not polling, and pushes a notice to the GM. The GM reviews a rendered preview before applying. Walls stop tokens landing in walls, and stop players walking through them.

**Non-Goals:** Portals and doors, line of sight, a wall drawing tool, UVTT, library or encounter-template walls, and detection without Redis. See the proposal.

## Decisions

### D1. Wall model and limits

`Wall = { id, a: Point, b: Point }` in board coordinates (map pixels, invariant 8). `RoomState.walls: Record<Id, Wall>`, capped at `MAX_WALLS = 1500`. `TableState` gains `walls` too, so a checkpoint restore brings back the walls of that moment. It is `optional()` in the schema because older `CheckpointRestored`/`EncounterApplied` events carry tables without it. `reduce` reads a missing value as `{}`, which is exactly what the board held then. Segments match the UVTT wall model, so portals (FR-GM-18) and raycast LoS (FR-GM-19) can extend it later.

### D2. Commands and events

- `wall.applyDetected { mapUrl }`: GM only. `decide` reads the segments from `DecideContext.detectedWalls(mapUrl)`, a hook the server fills from the stored detection result. This follows the existing pattern of `checkpointTable` and `encounterTemplate`. The command stays tiny under the 64 KB socket limit, and the walls committed are exactly those the server validated. It is refused unless `mapUrl` is the room's current map and a result exists. It emits `WallsRemoved` for any current walls, then `WallsAdded`, so applying replaces.
- `wall.remove { wallIds ≤ 500 }` and `wall.clear`: GM only, emitting `WallsRemoved` with the full walls (invariant 6).
- `WallsAdded { walls }` and `WallsRemoved { walls }` are each other's inverse, so both join `REVERSIBLE_EVENT_TYPES`. The undo conflict check refuses if any added wall is gone, or any removed wall's id is back.
- `scene.setMap` to a different URL appends `WallsRemoved` for all walls in the same batch. The batch is not undoable, because `MapSet` is not.
- `encounterTable` produces `walls: {}`.

Rejected: a client-supplied segment list (exceeds the socket limit, and lets a client commit unvalidated geometry), and a REST endpoint that commits walls (would bypass the command pipeline, invariant 1).

### D3. Blocking rules in `decide`

The footprint is the token's square (`size × cellSize`), inset by 10% on each side. A move is blocked when any wall segment intersects that inset square (a Liang–Barsky clip). The inset is what lets a token stand in the cell beside a wall drawn along the cell edge. It applies to `token.create` (each spread copy), `token.move`, and `token.configure` with a new position, for everyone.

For a player's `token.move`, the segment from the current centre to `to` must not properly cross a wall. The GM is exempt from the crossing check: detection is noisy, and the GM must be able to fix positions. `spreadPositions` takes an extra `blocked(p)` predicate so multi-copy creation skips blocked squares.

Grid re-snaps and resizes are not checked. Those are system adjustments, and refusing them would refuse the grid change itself. The refusal messages are fixed strings, and players get the same answer whether or not they can see the walls.

### D4. Visibility

Walls are GM-only. `filterStateForViewer` drops `walls` (and `walls` inside nothing else, because checkpoints are already GM-only). `filterEventForViewer` redacts `WallsAdded`/`WallsRemoved` for players. `MapSet` batches already resync players as before.

This keeps fogged geometry from leaking. It also means a player's client cannot pre-check moves, so the server's refusal is the feedback.

### D5. Queue topology

- **Queue** `wall-detection` on the app's `REDIS_URL`. **Producer:** the app server (`domain/wallDetection.ts`). **Consumer:** `services/vision/wall_worker.py`, using the official `bullmq` Python package, which runs the same Lua scripts as the Node package. **Completion:** the app server's `QueueEvents` listener receives `completed` and `failed`.
- **Job id:** `walls-<roomId>-<sha1(map url)[0:16]>-<process suffix>-<attempt>`. Re-running for the same map removes the finished job first. **Job data:** `{ image: base64 bytes, width, height }`. The bytes come from `AssetStore.readPrivate(objectKey, 25 MB)` for an object key taken from the room's own upload or current map URL (`/uploads/<key>`). The worker never fetches a URL.
- **Return value:** `{ walls: [{a,b}], preview: { contentType: "image/jpeg", width, height, data: base64 } }`.
- On `completed`, the server loads the job, validates the return value with zod, stores it in a bounded in-process result store (one entry per room and map, newest 200 rooms), removes the job from Redis, and emits `{ type: "wallDetection", status }` to the room's GM sockets.
- Jobs carry `removeOnComplete`/`removeOnFail` age limits, so a missed event cannot leave image bytes in Redis.
- **No Redis:** the dispatcher reports `unavailable`. The routes answer 503, and the upload path skips enqueueing. Tests inject a stand-in queue that runs a fake worker in-process, so CI needs no containers (DESIGN.md §2).

Rejected:
- **Node worker plus Python HTTP, as the grid branch does.** DESIGN.md names BullMQ as the vision service's driver, and the user asked for the Python service to consume the queue.
- **Python writing results to Postgres or object storage.** That would give the CV container database and storage credentials and widen its blast radius.
- **Persisting results in Postgres.** They are suggestions. Re-running detection after a restart is cheap, and nothing in the event log depends on them.

### D6. REST and socket contract

All routes are GM-only (the room's active GM credential, as the grid routes are) and `Cache-Control: no-store`:

- `POST /api/rooms/:roomId/wall-detection`: analyze the current map. Answers `202 {status:"queued"}`, `404` with no map, or `503` when unavailable.
- `GET /api/rooms/:roomId/wall-detection?map=<url>`: the `WallDetectionStatus` for that map. Answers `404` when this room never analyzed it.
- `GET /api/rooms/:roomId/wall-detection/preview?map=<url>`: the preview bytes with their content type.

`WallDetectionStatus` = `{status:"queued"|"running"} | {status:"done", wallCount, width, height} | {status:"failed", message}` (zod, shared). The socket's `ServerMessage` gains `{ type: "wallDetection"; mapUrl; status }`, sent only to GM sockets. It is not room data and gets no seq (invariant 4).

### D7. Detection pipeline (`services/vision/walls.py`)

Following the prior art in DESIGN.md §7:

1. **Decode and bound.** At most 25 MB and 40 MP. Downscale to a working image whose longest side is at most 1600 px, keeping the scale factor.
2. **Colour mask.** Convert to grey and blur lightly. The wall mask is the darker Otsu class, capped at a darkness ceiling so mid-tone floors do not qualify.
3. **Morphological cleanup.** An opening with a kernel about 0.6% of the image side removes thin grid lines and text. A closing bridges small gaps. Connected components smaller than a minimum area are dropped.
4. **Centreline tracing.** Zhang–Suen thinning gives a one-pixel skeleton, which avoids the double-wall artefact (`foundry-auto-wall`). The skeleton is walked as a pixel graph, from junctions and endpoints, into polylines. Short spurs are pruned.
5. **Simplification and welding.** Ramer–Douglas–Peucker (`approxPolyDP`) on each polyline, then endpoints within a tolerance are welded to a shared point, and segments shorter than the minimum length are dropped. Coordinates are scaled back to original pixels and clipped to the image.
6. **Preview.** The map is downscaled to 1024 px and dimmed. Walls are drawn in a bright colour with welded joints marked, then encoded as JPEG.

The output is capped at `MAX_WALLS`, keeping the longest segments.

### D8. Web

- A GM-only **Walls** panel beside Fog. It shows the status, the preview image (fetched as a blob, so the bearer header can be sent), the wall count, and Detect walls, Apply walls, Clear walls and Try again.
- `boardView.ts` gains a GM-only wall layer, drawn as solid lines above the map and below tokens.
- `RoomConnection` surfaces the `wallDetection` notice so the panel refreshes immediately.
- A refused move already shows the server's message and snaps the token back.

## Risks / Trade-offs

- **Maps whose walls are not dark strokes** (textured stone, light walls on dark floors) may be missed. Mitigations: the preview shows exactly what was found, nothing applies without the GM, and Clear walls and undo are one click. A tunable sensitivity is a follow-up.
- **The vision worker is down.** Jobs wait in Redis. The panel stays on "Detecting walls…", and the job's age limit eventually fails it, leaving Try again.
- **Large job payloads.** Up to about 34 MB of base64 per job sits in Redis while a job is pending. This is bounded by one job per room and map, by the age limits, and by the worker being the only consumer.
- **Two worker styles in one service** (an HTTP grid worker and a BullMQ wall worker). Documented in ADR 0029 as the direction DESIGN.md sets; grid jobs can move to the same consumer later.
- **Results live in one app-server process.** A restart drops unapplied results, and the GM re-runs detection. DESIGN.md runs one app server.
