# ADR 0029 — Walls and automatic wall detection

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-10 · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0013-undo.md`, `docs/adr/0019-checkpoints.md`, `docs/adr/0028-grid-detection-http-contract.md`
**Change:** `openspec/changes/auto-wall-detection` · **Requirements:** FR-GM-11, the wall data model of FR-GM-09

## Context

A room has no wall geometry, so a token can be dropped inside a wall and dragged through solid rock. FR-GM-11 asks for walls inferred from the map image by an isolated vision service. DESIGN.md §1 and §2 already fix the service's shape: Python and OpenCV in its own container, "driven by a BullMQ queue on Redis". Grid detection (KAN-09, ADR 0028) added `services/vision` and BullMQ to the server, but its jobs are consumed by a Node worker that calls Python over HTTP.

Two constraints shape the contract:

- **The socket payload limit.** Socket.IO accepts at most 64 KB per message, and a detected map has hundreds of segments.
- **Fog.** Wall geometry inside fog describes rooms the players have not seen.

## Decision

### State

- `Wall = { id, a: Point, b: Point }` in board coordinates (invariant 8). A segment is the UVTT wall model, so portals (FR-GM-18) and line of sight (FR-GM-19) can build on it.
- `RoomState.walls: Record<Id, Wall>`, at most `MAX_WALLS` (1500).
- `TableState.walls` is optional, so checkpoints restore walls (ADR 0019). Tables in events written before walls existed omit it, and `reduce` reads that as no walls, which is what the board held then. `encounterTable` produces no walls.

### Commands (GM only)

- `wall.applyDetected { mapUrl }`. The segments come from `DecideContext.detectedWalls(mapUrl)`: the server reads the validated detection result for that room, as it reads `checkpointTable` and `encounterTemplate`. The command stays a few bytes. A client can't commit geometry the server did not validate. It is `invalid` unless `mapUrl` is the current map and a result exists. It replaces: `WallsRemoved` for the current walls, then `WallsAdded`.
- `wall.remove { wallIds }` (at most 500) and `wall.clear`.

### Events

- `WallsAdded { walls }` and `WallsRemoved { walls }`. Each carries whole walls (invariant 6) and is the other's inverse, so both are reversible (ADR 0013).
- `scene.setMap` to another URL appends `WallsRemoved` for every wall in the same batch, because walls describe one image.

### Blocking

- **Footprint.** The footprint is the token's square inset by 10% on each side. Creating, moving or repositioning a token so that a wall crosses its footprint is `invalid` ("That spot is blocked by a wall."), for everyone. The inset lets a token stand beside a wall drawn on a cell edge.
- **Crossing.** A player's `token.move` whose straight path crosses a wall is `invalid` ("A wall is in the way."). The GM is exempt from this check, so detection noise never strands a token.
- **Exemptions.** Grid re-snaps and resizes are not checked.
- **Multi-copy placement.** `spreadPositions` skips blocked squares.

### Visibility

Walls are GM-only:

- `filterStateForViewer` sends players `walls: {}`.
- `filterEventForViewer` redacts `WallsAdded` and `WallsRemoved` for players.
- A refusal reads the same whether or not the player could see the wall.

### Detection pipeline

1. **Producer.** The app server puts a job on the BullMQ queue `wall-detection`. The job data names the image (see the amendment on the job transport below) and gives its size; the bytes are read by the server-owned object key (`AssetStore.readPrivate`). The worker never fetches a URL.
2. **Consumer.** `services/vision/wall_worker.py` uses the `bullmq` Python package, which shares the Node package's Lua scripts. It returns `{ walls, preview }`, where `preview` is a JPEG of the map with the walls drawn.
3. **Completion.** The app server's `QueueEvents` listener receives `completed` and `failed`. It validates the return value (zod: bounds, count, preview size) and keeps it in a bounded in-process store keyed by room and map. It then removes the job and sends `{ type: "wallDetection", mapUrl, status }` to the room's GM sockets only. That notice is not room data and gets no seq (invariant 4).
4. **Retrieval.** GM-only REST routes return the status and the preview bytes.
5. **No Redis.** The feature answers 503, and uploads and play are unaffected.

## Alternatives rejected

- **A client-sent segment list.** It exceeds the socket limit, and the server would commit geometry it never checked.
- **A REST route that writes walls.** It would bypass `decide` (invariant 1).
- **Players receiving walls.** It would leak fogged layout. Client-side pre-checks are not worth that.
- **A Node worker calling Python over HTTP**, as grid detection does. DESIGN.md names BullMQ as the vision service's driver, and a Python consumer keeps the CV container free of HTTP surface. Grid jobs can move to the same consumer later.
- **Results in Postgres.** They are unapplied suggestions, cheap to recompute, and nothing in the log refers to them.

## Consequences

- `RoomState` and `TableState` grow. Old snapshots and checkpoint events parse unchanged.
- The vision image now runs a second process, `vision-walls`, which needs `REDIS_URL`.
- A pending job holds one map image in Redis, up to 25 MB as raw bytes, shared between jobs with the same bytes and expiring on its own; at most four analyses are pending at once (see the amendment on the job transport below).
- An app server restart drops unapplied results, and the GM re-runs detection.

## Amendment: hand-drawn walls and sampled detection (`openspec/changes/wall-editing`)

Detection on painted maps is noisy, and all-or-nothing results leave the GM stuck. Two additions:

- **`wall.add { walls }`** (GM only, at most 50, each `{ a, b }` on the map with two different
  ends, within `MAX_WALLS`) commits the existing `WallsAdded` event. Hand-drawn walls are then
  exactly like detected ones: GM-only, undoable, and blocking tokens. The board's Walls tool
  sends one segment per command, so each segment undoes on its own, and erases with the
  existing `wall.remove`. The activity log now reads "added N walls" for both.
- **`POST /wall-detection` takes `{ sample?: Point }`** (`WallDetectionRequest`, strict). A
  point outside the map is refused with 400. The sample travels in the job data, and the worker
  then builds its mask from the colour around that point (median Lab, fixed ΔE tolerance)
  instead of choosing between the bright and dark top-hats. Shape filtering is unchanged. This
  is the colour pick that both prior-art tools rely on, done at board zoom.

Nothing else changes: results stay suggestions until applied, and walls stay GM-only.

## Amendment: sampled-detection tolerance (`feat/auto-wall-detection`)

Sampled detection used one fixed colour range, which suits some maps and not others, and automatic mode had no controls at all. Three changes:

- **`WallDetectionRequest` gains `tolerance?: number`**, in Lab units from 10 to 60 (default 30, the
  previous fixed value). It is valid only with `sample`; a request with `tolerance` alone, or one
  outside the range, is refused with 400. Old clients that send no tolerance behave as before.
  The shared constants are `SAMPLE_TOLERANCE_MIN`, `_MAX` and `_DEFAULT`.
- **`strictness?` (0.2-0.6) and `minLength?` (0-6 cells, default 0)** apply to
  automatic and sampled detection alike. Strictness is the share of a run's edge that must follow
  a contrasting outline, the threshold that decides terrain from wall; minimum length drops short
  pieces from the result, measured in the room's own cells. Without `strictness` the worker chooses: it tries 0.4, then 0.3, then 0.2,
  and keeps the first that finds enough wall, so a map with few thick walls still gets a result;
  a value the GM sets is used as given. Neither field needs a sample.
- **`style?` (`"bright"` or `"dark"`)** limits automatic detection to light stone walls or to dark
  ink walls; without it the worker tries both and keeps the better. On the Broken Span crop the dark
  family follows shadows and scraps, and its raw length can outscore the stone walls.
- **The job data carries `tolerance?`, `strictness?`, `minLength?` and `style?` beside `sample`.** The worker validates the same range
  (it trusts nothing the queue holds) and fails the job otherwise. The Walls step shows a colour-range
  slider in the "Detect like this" tool, and a wall-colour choice with strictness and shortest-wall
  sliders above Detect walls; each request sends their values.

Automatic strictness starts at 40% (it was a fixed 30%): a run is kept only when that share of its
edge lies along a contrasting outline. On the bundled maps it cuts the walls found on the snowy-cliff map from 147 to 81 and on the jungle map from 78 to 51,
mostly cliff and vine runs, and leaves the hero map's score unchanged. The worker's weld and thinning
steps were also rewritten to run in linear time, with identical output, so a map now takes under 5 s.

## Amendment: erasing detected walls before applying (`feat/auto-wall-detection`)

False detections used to be removable only after applying, one command per wall. The GM can now
leave them out first:

- **`GET /api/rooms/:roomId/wall-detection/walls?map=`** (GM only, like the preview) returns
  `{ walls }`, the validated segments of the latest result, in the order `decide` will read them.
  Players get 403: the segments are as GM-only as the walls they become.
- **`wall.applyDetected` gains `exclude?: { of, indices }`.** `indices` are positions in that list
  and `of` is its length when the GM looked. `decide` refuses the command if `of` differs from the
  server's current result, if an index is out of range, or if nothing would be left, so an
  exclusion list made against an older result is never applied to a newer one. The segments still
  come from the server's result, never the client; the client only chooses which to skip. The
  command stays one action, so one undo restores the walls it replaced.
- **The Walls step draws the detected walls as candidates** over the map. With the Erase tool a
  click on a candidate toggles it out of (or back into) the pending result; a click on a wall
  already in the room still removes that wall. Apply shows the remaining count.

## Amendment: walls and fog as an editor draft (`openspec/changes/map-editor-drafts`)

The map editor now edits walls and fog as a private draft and saves the difference with existing
commands (new fog, wall removals, wall additions in batches, then fog removals, so fog hides
before it reveals). Apply in the Walls step, with its `exclude` list, loads the remaining detected
walls from the endpoint above into the draft instead of sending `wall.applyDetected`; Save then
sends them with `wall.add`. No command, event or state changes beyond the amendment above.

## Amendment: an inked-outlines wall style (`openspec/changes/auto-wall-outlines`)

The stone search finds little on maps drawn in inked outlines (buildings, caves, rooms in a dark
line), and nothing diagonal. Those maps now get a second pipeline, adapted from ThreeHats/auto-wall
(MIT; `services/vision/THIRD_PARTY_NOTICES.md`):

- **`WallStyle` gains `"outlined"`**, beside `"bright"` and `"dark"`. The worker validates the same
  three values. Strictness does not apply to it; the shortest-wall filter does.
- **Automatic detection (no style) falls back to it** when the stone search finds under 20 cells
  of wall and the outlines find at least four times as much; otherwise automatic detection is
  unchanged. A given grid cell is tried beside one estimated from the image, since an unaligned
  grid blurs outlines away.

The result shape, the validation of returned walls and GM-only visibility are unchanged.

## Amendment: the job names its image (wall-job-transport)

The first version put the image in the job as base64, about 34 MB for the largest map, and BullMQ keeps job data for as long as the job exists. Now:

- The image sits in one raw Redis key, `vtt:wall-image:<sha256 hex of the bytes>`, written with an expiry of the job timeout plus one minute. The job carries only the key. Raw bytes are a quarter smaller than base64, and a key whose server died still expires.
- Maps with identical bytes share one key. The app server counts live jobs per key (it is single-process) and deletes the key when the last one finishes, fails, times out or is dropped.
- At most four analyses may be queued or running across the whole server. A fifth is refused with 503 before any image is stored. A job dropped by a room delete or a timeout keeps its slot and image until the queue confirms its removal; BullMQ cannot remove a running job, so that job holds them until it ends.
- Job IDs carry a per-process random suffix, so a job still queued from before a restart cannot share an ID with a new request (BullMQ ignores an add whose ID exists).
- The worker reads the key itself with its existing Redis connection, accepts only a key of exactly that shape (so a job cannot make it read another Redis key), and fails the job if the image is missing or over 25 MB. It still never fetches a URL and holds no storage credentials.

Rejected: the worker fetching the image from the app server (new credentials and an HTTP surface on the worker), compressing the base64 (the images are already compressed), and downscaling (it costs detection accuracy and needs an image library in the server). The app server and the worker must be deployed together.

## Amendment: stored walls for built-in maps (`openspec/changes/shipped-maps-line-of-sight`)

A built-in map ships with its walls stored beside its catalog entry. Detect walls on a built-in map that has stored walls for that exact map (URL, width and height all match) returns them immediately, with the vision service not consulted, so it works even when the service is down. Availability is per map: a built-in map without stored walls, and every other map, behave exactly as before. Detect like this still uses the vision service; validation and GM-only visibility are unchanged.

Schema changes, all backward compatible: `DetectedWall` gains an optional `portal`, so stored doors and windows travel through the detection result, and `wall.applyDetected` copies it onto the walls it creates (vision results never set it, so their behaviour is unchanged). `GET /api/wall-detection/availability` takes an optional `room`; with it the check is GM-only and per map, and the answer gains `sampleAvailable`, which stays tied to the vision service so Detect like this is offered only when the service can run it. Needs review by the Real-Time Architecture owner with ADR 0044.

## Amendment: terrain and tactical movement

Ordinary GM and player movement now checks the swept square footprint, retaining the footprint inset and starting-wall escape exception. The GM uses explicit one-move Reposition to bypass routes; its destination still must be wall- and Blocked-free. Player refusals are generic. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.

## Amendment: existing-token resize destinations

The resize exemption above is superseded for `token.configure` and `token.setAppearance`: actual size changes require a clear resulting footprint against effective Blocked terrain and blocking walls/portals, retaining the 10% wall inset. Automatic anchoring checks the destination only; an explicitly displaced centre also checks the swept route using the resulting size. Unchanged size and position allow unrelated edits while obstructed. Grid re-snaps retain their exemption. Positioning, fog concealment, atomic refusals, event ordering and existing non-undoable resize batches follow [ADR 0046](0046-terrain-tactical-movement.md); its Real-Time Architecture review remains required before release.
