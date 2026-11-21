## Why

A GM who uploads a battle map today gets a picture with no geometry: tokens can be dropped in the middle of a stone wall and players can drag through solid rock, because the room has no idea where the walls are. Drawing walls by hand is the slow part of map prep that README §1 promises to remove ("optionally import or generate walls"). FR-GM-11 asks for vision-based map parsing in an isolated service, and DESIGN.md §2 already fixes the shape: a Python / OpenCV vision service driven by a BullMQ queue on Redis. The automatic grid detection branch (KAN-09) put that service in place, so wall extraction can now ride on it.

## What Changes

- **Walls become room state.** A wall is a straight segment in board coordinates (map pixels, invariant 8). The room keeps them with the rest of the board, so checkpoints restore them. Walls are GM-only data: players never receive them.
- **Automatic detection through BullMQ.** Uploading a map to a room, or pressing **Detect walls** for the current map, makes the app server put a job on the `wall-detection` BullMQ queue in Redis. A Python worker in `services/vision` consumes it. It runs an OpenCV pipeline (colour masking, morphological cleanup, centreline tracing, segment simplification and endpoint welding, following the prior art DESIGN.md §7 names), and returns the wall segments plus a **rendered preview image** of the map with the detected walls drawn on it.
- **The main server is notified when the job is done.** The app server listens to BullMQ queue events. When a job completes or fails it validates the result, keeps it for the GM, and pushes a GM-only `wallDetection` notice over the socket. The GM's panel then shows the preview image and the wall count.
- **The GM reviews, then applies.** **Apply walls** commits the detected walls in one undoable action. **Clear walls** removes them. Nothing reaches room state until the GM applies: a detection is a suggestion.
- **Walls block tokens.** A token can't be placed or moved so that its footprint overlaps a wall. A player also can't move a token straight through a wall. The GM may still move a token across a wall, but not onto one.
- **New commands** (GM only): `wall.applyDetected { mapUrl }`, `wall.remove { wallIds }`, `wall.clear`.
- **New events:** `WallsAdded { walls }` and `WallsRemoved { walls }`. The removal event carries each removed wall in full (invariant 6), and each event undoes the other.
- **Changing the map clears its walls** in the same action, because walls describe one image.
- **Contract change:** new commands, events, a `walls` field on `RoomState` and `TableState`, a `WallDetectionStatus` REST schema and a `wallDetection` server message. ADR 0029 records them for review by the Real-Time Architecture owner.

## Non-goals

- Doors, windows and portal states (FR-GM-18), and dynamic line of sight (FR-GM-19). The segment model is chosen so they can build on it.
- Hand-drawing or editing individual wall segments (the editing half of FR-GM-09). Removal by id is in the contract, but no drawing tool is built yet.
- UVTT import and export (FR-GM-06, FR-GM-12).
- Detection on library maps outside a room, and saving walls into library maps or encounter templates.
- A Redis-less fallback for detection. Without `REDIS_URL` the feature reports itself unavailable, and play is unaffected.

## Capabilities

### New Capabilities
- `wall-detection`: queuing a map for wall analysis, the vision worker's contract, completion notice to the GM, and the private result and preview image.
- `map-walls`: walls as room state, applying and clearing them, undo, GM-only visibility, and how walls block token placement and movement.

### Modified Capabilities
- None in `openspec/specs`. The map-preparation flow is unchanged; detection starts from the upload it already makes.

## Impact

- `packages/shared`: `state.ts` (`Wall`, `MAX_WALLS`, `RoomState.walls`, `TableState.walls`), `geometry.ts` (segment and footprint tests), `commands.ts`, `events.ts`, `decide.ts`, `reducer.ts`, `visibility.ts`, `undo.ts`, `activityLog.ts`, `encounters.ts`, a new `wallDetection.ts` (job and status schemas), `protocol.ts`. Unit tests.
- `apps/server`: new `domain/wallDetection.ts` (BullMQ producer and `QueueEvents` listener), routes under `/api/rooms/:roomId/wall-detection`, a `decide` context hook for detected walls, a GM-only socket notice, integration tests with an in-process stand-in queue.
- `services/vision`: `walls.py` (detector and preview renderer), `wall_worker.py` (BullMQ consumer), `bullmq` dependency, pytest coverage, and a `vision-walls` Compose service.
- `apps/web`: a GM **Walls** panel (status, preview image, Detect, Apply, Clear), a GM-only wall layer in `board/boardView.ts`, and the socket notice in `net/roomConnection.ts`.
- Docs: `docs/adr/0029-walls-and-wall-detection.md`, `docs/DESIGN.md` (architecture and traceability), `docs/WALL-DETECTION.md` (running it).
