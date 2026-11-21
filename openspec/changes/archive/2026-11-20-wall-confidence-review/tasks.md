## 1. Contract

- [x] 1.1 Add optional `confidence`, `DOUBTFUL_WALL_CONFIDENCE` and `isDoubtfulWall` to `packages/shared/src/wallDetection.ts`; unit tests in `packages/shared/test/walls.test.ts` pass (accepts and omits, rejects out of range, applying drops it).
- [x] 1.2 Write `docs/adr/0038-wall-confidence.md` (amends ADR 0029; reviewer: Real-Time Architecture owner) and check the file exists.

## 2. Vision service

- [x] 2.1 `detect_model` adds `confidence` to each wall; python tests in `test_walls.py` cover the helper on a synthetic probability map (high on a line, low off it) and that other pipelines omit the field.

## 3. Server

- [x] 3.1 Integration test in `apps/server/test/wallDetection.test.ts`: confidence survives result validation and `GET detected`, and an out-of-range value fails the job.

## 4. Web

- [x] 4.1 `WallCanvas`: draw doubtful candidates amber and dashed, highlight and recentre the focused wall; component test checks styles.
- [x] 4.2 `WallSetup`: legend, doubtful count, Review doubtful walls step (next, back, erase, keep), and Apply confident walls only (exclude indices); tests in `apps/web/test/mapEditorWalls.test.tsx` check the sent `exclude`.

## 5. Verify

- [x] 5.1 `npm run lint && npm run typecheck && npm test` and the `services/vision` python tests pass.
- [x] 5.2 Playwright MCP check of the Walls preview: amber dashed walls, legend, count, review cycle, confident-only apply.
