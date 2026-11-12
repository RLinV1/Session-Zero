# Tasks

## 1. ADR

- [x] 1.1 Write `docs/adr/0063-token-wall-clearance.md` amending ADR 0029's Blocking section (design Decisions 1–6 and 8), Status "Proposed — awaiting review by the Real-Time Architecture owner", and add a pointer from ADR 0029's Blocking section to it. Verify both files link each other.

## 2. Shared geometry

- [x] 2.1 Add `WALL_CLEARANCE`, `clearancePoints`, `clearanceTouchesWall` and `clearanceSweepTouchesWall` to `packages/shared/src/geometry.ts` (design Decisions 1–4, 7), exported from the package index. Verify with unit tests in `packages/shared/test/walls.test.ts` (FR-GM-11):
  - `clearancePoints` gives 1 point for sizes 0.5 and 1, the four square centers for size 2, and points ±0.25 square away for size 1.5.
  - A corner stub reaching a third of the way to the center doesn't touch; a wall through the center does; a wall exactly 3.5 px from the center on a 70 px grid touches; one at 4 px doesn't.
  - A sweep across a 4 px gap between two segments touches; a sweep through a 70 px gap doesn't.
  - A Large token's sweep through a one-square gap touches; a Medium token's doesn't.
- [x] 2.2 Replace `sweptCrossesWalls` in `terrain.ts` and `footprintCrossesWall` everywhere in `packages/shared/src` (`movement.ts` incl. `cheapestPath.canStep` and the `ahead` filter, `decide.ts` create/duplicate/`createTokens`, `build.ts` creature placement), then delete the old functions and `WALL_FOOTPRINT_INSET`. Verify `rg "footprintCrossesWall|sweptCrossesWalls|WALL_FOOTPRINT_INSET" packages apps` returns nothing and `npm run typecheck` passes.
- [x] 2.3 Update the existing tests that encode the inset square (`walls.test.ts` "lets a token stand beside a wall…", `cheapestPath.test.ts`, `terrain.test.ts`, `portals.test.ts`) to the new rule, keeping every case that was allowed as allowed. Verify `npm test --workspace=@vtt/shared` passes.

## 3. Decide behavior

- [x] 3.1 Add `decide` unit tests in `packages/shared/test/walls.test.ts` for the spec scenarios (FR-GM-11): corner stub move accepted; wall through center refused with "That move is unavailable."; Large token straddling a grid-line wall accepted; Large token placed with one square's center on a wall refused with "That spot is blocked by a wall."; size 1.5 placed with a wall through its center only, accepted; a token with a wall drawn through it can move off; a multi-copy `token.create` skips a square whose center is on a wall. Verify they pass.

## 4. Server

- [x] 4.1 Add an integration test in `apps/server/test` (e.g. `wallClearance.test.ts`): a player's `token.move` onto a corner-stub square is accepted over the wire, and one through a closed portal is refused with "That move is unavailable." Update `visibleWalls.test.ts` if any expectation relied on the inset square. Verify `npm test --workspace=@vtt/server` passes.
- [x] 4.2 Run `npm run test:bench --workspace=@vtt/server` and confirm the latency budgets still hold (design Decision 7).

## 5. Web client

- [x] 5.1 Switch `apps/web/src/board/movementRuler.ts` (`movementPreview`) and `apps/web/src/pages/home/sightDemo.ts` to the clearance functions. Verify with a test in `apps/web/test` that the drag preview over a corner-stub square reports `clear`, and over a square with a wall through its center reports `blocked`.
- [x] 5.2 In the browser, as the GM, drag a token onto a square with a small wall stub and onto one with a wall through its center. Verify the first shows a path and is accepted, and the second is shown blocked and refused.

## 6. Wrap-up

- [ ] 6.1 Run the `sync-reviewer` agent on the diff and address its findings. Then run `npm run lint && npm run typecheck && npm test` and verify all pass.
