# Tasks

## 1. Contract and ADR

- [x] 1.1 Write `docs/adr/0029-walls-and-wall-detection.md` covering the wall model, commands, events, GM-only visibility, queue topology and the BullMQ-consumer choice; verify it is linked from DESIGN.md.
- [x] 1.2 Add `Wall`, `MAX_WALLS`, `RoomState.walls`, optional `TableState.walls`, `tableOf` and `emptyRoomState` in `packages/shared/src/state.ts`; verify `npm run typecheck`.
- [x] 1.3 Add segment/footprint geometry (`segmentsCross`, `segmentCrossesFootprint`, `blockedByWalls`, `pathCrossesWall`) and a `blocked` predicate on `spreadPositions` in `geometry.ts`; verify with unit tests, including the cell-edge case.
- [x] 1.4 Add `wall.applyDetected`, `wall.remove`, `wall.clear` commands and `WallsAdded`/`WallsRemoved` events; add the `wallDetection.ts` schemas (`WallDetectionStatus`, `WallDetectionResult`) and the `wallDetection` server message; verify typecheck.

## 2. Rules, state and visibility

- [x] 2.1 Handle the wall commands in `decide` (GM only, current-map check, `detectedWalls` context hook, replace-on-apply) and the events in `reduce`; verify with unit tests in `packages/shared/test/walls.test.ts` (FR-GM-11).
- [x] 2.2 Block token create/move/configure onto walls for everyone and player moves through walls; verify with unit tests for drop-on-wall, beside-wall, spread copies, player crossing and GM crossing.
- [x] 2.3 Clear walls in `scene.setMap` to a new URL, `encounterTable` → `walls: {}`, and restore walls through checkpoints; verify with unit tests.
- [x] 2.4 Make `WallsAdded`/`WallsRemoved` reversible in `undo.ts` and describe them in `activityLog.ts`; verify undo-of-apply restores prior walls in a unit test.
- [x] 2.5 Strip walls from player snapshots and redact wall events in `visibility.ts`; verify with a unit test asserting a player's state and events contain no wall data.

## 3. Vision worker (Python)

- [x] 3.1 Implement `services/vision/walls.py` (bounded decode, colour mask, morphology, thinning, graph tracing, RDP, welding, preview render); verify with pytest on synthetic maps: walls found along thick strokes, none along thin grid lines, zero on an empty floor, invalid bytes rejected.
- [x] 3.2 Implement `services/vision/wall_worker.py` consuming the `wall-detection` BullMQ queue and returning `{walls, preview}`; add `bullmq` to requirements, a `vision-walls` Compose service, and update the Dockerfile; verify with a pytest that runs the job handler directly.

## 4. App server

- [x] 4.1 Implement `apps/server/src/domain/wallDetection.ts`: BullMQ `Queue` producer, `QueueEvents` listener, result validation, bounded result store, GM notification hook, `unavailable` mode without Redis; verify with unit tests through a stand-in queue.
- [x] 4.2 Add the GM-only routes (`POST`/`GET` status, `GET` preview), enqueue on map uploads, and wire `detectedWalls` into `LiveRoom`'s decide context; verify with integration tests in `apps/server/test/wallDetection.test.ts` covering GM success, player 403, other-room 403, 503 without a queue, apply through the socket, and a player's stream carrying no walls.
- [x] 4.3 Emit the `wallDetection` notice to the room's GM sockets only; verify in the integration test that the GM receives it and the player does not.

## 5. Web

- [x] 5.1 Add the `api.walls` client calls and surface the `wallDetection` notice in `RoomConnection`; verify typecheck.
- [x] 5.2 Add the GM-only Walls panel (status, preview image, Detect / Apply / Clear / Try again) to the GM panel; verify in the running app.
- [x] 5.3 Draw walls for the GM in `board/boardView.ts`; verify in the running app.

## 6. End-to-end verification

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test` and `pytest` in `services/vision`; all green.
- [x] 6.2 Run Redis, the Python wall worker and the app together; upload maps, apply walls, try to drop a token on a wall, and capture Playwright screenshots of the detected walls.
- [x] 6.3 Update `docs/DESIGN.md` (architecture note, FR-GM-11 traceability) and add `docs/WALL-DETECTION.md` with run instructions.
- [x] 6.4 Read built-in library maps (`/img/<name>`) from `apps/web/public/img` so Detect walls works on them, not only on uploads; cover it, and refused addresses, in `apps/server/test/wallDetection.test.ts`.

## Workflow follow-up

- Review of the ADR and schema changes by the Real-Time Architecture owner before merge.
- Archive this change after merge.
