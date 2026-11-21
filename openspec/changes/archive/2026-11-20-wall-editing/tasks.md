# Tasks

## 1. Contract

- [x] 1.1 Add `wall.add { walls ≤ 50 }` to `commands.ts` and handle it in `decide` (GM only, non-zero length, on the map, under `MAX_WALLS`); verify with unit tests in `packages/shared/test/walls.test.ts`, including undo.
- [x] 1.2 Add `WallDetectionRequest { sample?: Point }` to `wallDetection.ts`; amend ADR 0029; verify typecheck.

## 2. Vision worker

- [x] 2.1 Add the sampled-colour mask to `walls.py` (`detect_walls(image, cell, sample)`) and pass `sample` through `analyze` and `wall_worker.py`; verify with pytest (walls told apart from the floor only by colour are found from a sample, a dark-ink sample matches the ink rooms, a sample off the image is refused) and on the ice map, where a sample keeps the castle walls without the cliff noise automatic mode adds.

## 3. App server

- [x] 3.1 Accept and validate `sample` on `POST /wall-detection` (400 outside the map), and carry it into the job data; verify with integration tests.

## 4. Web

- [x] 4.1 Add the Walls tool and its modes to `tools.ts` and `ToolRail.tsx` (GM only); verify typecheck.
- [x] 4.2 Board: chain drawing with snapping and a live preview, erase by click, and sample click through `onDetectWalls`; keyboard: Enter or Escape ends a chain; verify in the running app.
- [x] 4.3 Add `api.walls.detect(…, sample)`, `RoomPage` wiring, and hint text in the Walls panel; verify in the running app.

## 5. Verification

- [x] 5.1 `npm run lint && npm run typecheck && npm test` and the vision tests pass.
- [x] 5.2 In the running app with Redis and the worker: draw walls, erase a false wall, run Detect like this on the ice map, and capture Playwright screenshots.
- [x] 5.3 Update `docs/WALL-DETECTION.md`.
