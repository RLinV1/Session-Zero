## 1. Contract and server

- [x] 1.1 Add `DetectedWallsResponse` to `packages/shared/src/wallDetection.ts`; amend ADR 0029; verify typecheck.
- [x] 1.2 Add GM-only `GET /api/rooms/:roomId/wall-detection/walls?map=`; integration test in `apps/server/test/wallDetection.test.ts` (GM gets the walls, player 403, no result 404).

## 2. Draft and save planner

- [x] 2.1 `pages/mapEditor/mapDraft.ts`: the draft type, `draftFrom(state)`, `draftDirty`, and the pure `planDraftSave(room, draft)`; unit tests for order, batching, geometry matching and clear.
- [x] 2.2 `GmPanel` owns the draft; the Walls and Fog steps read and write it; Fog whole map and Reveal edit it.

## 3. UI

- [x] 3.1 The editor header shows unsaved changes with Save changes and Discard; closing asks Save, Discard or Keep editing.
- [x] 3.2 Apply walls loads the detected walls into the draft.
- [x] 3.3 Editor tests: drawing sends nothing until Save; Save sends the planned commands; the close prompt.

## 4. Verification

- [x] 4.1 `npm run lint && npm run typecheck && npm test`.
- [x] 4.2 In the running app: draw fog and walls, check a player sees nothing; save, check they do; the Discard path.
