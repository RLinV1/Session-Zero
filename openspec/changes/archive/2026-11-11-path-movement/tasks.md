# Tasks

## 1. ADR and review

- [x] 1.1 Write `docs/adr/0055-path-movement.md` recording design Decisions 1, 5, 6, 7 and 8, the replacement of the proportional drag cost, and the reconciliation with `terrain-tactical-movement`'s "Proportional private ruler" requirement. Verify the file exists with Status "Proposed — awaiting review by the Real-Time Architecture owner".

## 2. Room rules

- [x] 2.1 In `packages/shared/src/state.ts`, add `diagonalRule?` and `difficultTerrain?` to `RoomState`, the `DIAGONAL_RULES`/`DIFFICULT_TERRAIN_MODES` constants with labels ("Equal cost", "Alternating (1, 2)", "Euclidean"; "On entry", "On exit", "Both"), and the `diagonalRuleOf`/`difficultTerrainOf` helpers. Verify `npm run typecheck` passes.
- [x] 2.2 Add `room.setDiagonalRule`/`room.setDifficultTerrain` to `commands.ts` and `DiagonalRuleSet`/`DifficultTerrainSet` to `events.ts`. Handle them in `decide.ts` (GM only, unchanged value `invalid`, `previous` from the helpers), `reducer.ts`, `activityLog.ts` and the `visibility.ts` pass arm. Verify with `packages/shared/test/pathMovement.test.ts` cases (FR-GM-15): a player's change is forbidden, an unchanged value is invalid, older states read Equal and On entry, `previous` is right, and both events pass to players.

## 3. Step cost

- [x] 3.1 Add `stepCost` to `packages/shared/src/movement.ts` (design Decision 2). Unit test (FR-TAC-03):
  - A → D1 → D2 → B costs 25 / 25 / 30 ft under On entry / On exit / Both.
  - Difficult to Difficult under Both doubles once.
  - Starting on Difficult under On exit doubles the first step.
  - Three Alternating diagonals cost 20 ft, and Euclidean diagonals cost √2.
  - A two-square token pays Difficult when any landing square is Difficult.
  - Layered Difficult counts once.
  - A Blocked landing square returns `null`.
- [x] 3.2 Rewrite `rulerPathCost` on top of `stepCost` with the room's rules instead of a passed-in rule, and update `packages/shared/test/rulerPathCost.test.ts`. Verify the existing ruler cases still hold under Equal / On entry, and new cases cover On exit and Both.

## 4. Path search

- [x] 4.1 Add `cheapestPath` (design Decisions 3–5) with the per-search wall index, the Alternating parity state, the fewest-turns tie-break, the `MAX_PATH_NODES` cap, and compression into `via` (at most `MAX_MOVE_VIA`). Unit test:
  - It routes around a Blocked patch.
  - It prefers a longer route with no Difficult terrain over a shorter Difficult one.
  - It refuses to cut a corner past Blocked terrain or a wall.
  - It returns no path into an enclosed square.
  - It's deterministic between equal-cost routes and prefers fewer turns.
  - A two-square token fits only through two-square gaps.
  - It respects the node cap.
  - For a player, unknown ground is passable but marked uncertain, and walls they don't hold are ignored.

## 5. Moves with paths

- [x] 5.1 Add `via` to `token.move` and `TokenMoved` (design Decision 6). Validate each leg in `decide`, refuse `via` with Reposition and any off-map point, omit an empty `via` from the event, drop `via` in the undo inverse (`undo.ts`), and add the "along a path" activity wording. Verify with unit tests: a valid path is accepted and recorded with `via`; a path whose second leg crosses a wall is refused whole; an off-map point and Reposition with `via` are refused; undo returns the token to its start.
- [x] 5.2 Add `via` to `tokenMovePreview` and check it leg by leg in `movementFeedbackForViewer` (design Decision 7). Verify with unit tests: unknown if any leg leaves known coverage, blocked if any leg fails, clear otherwise, and the reply carries only the status.
- [x] 5.3 Send a player only the visible stretches of a `TokenMoved` path, with `gaps` for the hidden ones (design Decision 8), in live events and replays. Verify with unit tests: a GM move that dips under fog reaches a player with no point in fog and a gap across it; a move fully in view keeps its `via` and has no gaps; a move wholly hidden between visible ends carries no `via`; with line of sight on, an owner's move still resyncs.
- [x] 5.4 Add a server integration test, `apps/server/test/pathMovement.test.ts`:
  - The GM commits a path around a wall and every client ends at `to`.
  - A player's path that crosses a wall they don't hold is refused.
  - A player never receives `via` points under fog, live or in `/replay`.
  - The movement-preview reply for a path through fog is "unknown".

  Then run the `visibility-auditor` and `sync-reviewer` agents on the diff and fix or record their findings.

## 6. Web client

- [x] 6.1 Add "Diagonals" and "Difficult terrain applies" selects to the Table tab in `apps/web/src/ui/SettingsMenu.tsx`, each sending its own command. Update `apps/web/test/autoRemoveDefeated.test.tsx`'s Table tab cases for the six controls and the commands sent.
- [x] 6.2 Remove the Diagonals select from `MovementControls.tsx`, store only the allowance, and make `isMovementSettings` accept an absent `rule`. Point every reader of the old private rule (`boardView.ts`'s measure, `measure` in `tools.ts`) at `diagonalRuleOf(state)`. Update `apps/web/test/movementRuler.test.tsx`.
- [x] 6.3 Replace the drag preview in `boardView.ts`/`movementRuler.ts` with `cheapestPath` for grid-snapped tokens with a whole-number size and no Alt: draw the path, show `budgetLabel(cost, allowance)` or "Cost unknown" (falling back to the straight drag when no path is found), send the path in `tokenMovePreview`, and commit it with `via` on drop. Alt, free-placed and fractional-size drags keep a straight line with distance only. Verify with unit tests of the label and of what is sent, and in the browser: a drag around a Blocked patch, a cheaper detour, an enclosed square (straight blocked line, refused), and an Alt drag.
- [x] 6.4 Slide every live `TokenMoved` made by someone else on other boards: along `via`, jumping across `gaps`, or straight, cut to the player's fog and sight (design Decision 9), jumping under reduced motion and for snapshots. Verify in the browser with two clients that the watcher sees the token follow the path, jump across any stretch under fog, and that a reload shows it at `to`.

## 6a. Review follow-ups

- [x] 6a.1 Fall back to the straight drag when `cheapestPath` finds no path (design Decision 9a), drop `unavailable` from `DragPlan`, and make the search's heuristic follow the Diagonals rule. Verify with `dragPlan` tests (an enclosed square shows a straight blocked line; a drag past the search limit is straight) and a `cheapestPath` test that a 60-square Alternating diagonal is found.
- [x] 6a.2 In `boardView.ts`, end a token's path animation when its sprite is removed or the local user starts dragging it, so a deleted-then-restored token is positioned again. Verify with a unit test of the sprite sync.
- [x] 6a.3 In `decide` and `movementFeedbackForViewer`, compute effective terrain and blocking walls once per move instead of per leg. Verify the existing path tests still pass.
- [x] 6a.4 Add convergence checks to `apps/server/test/pathMovement.test.ts`: after a path move with hidden stretches, a player's state equals a freshly joined player's, and `room.setDiagonalRule`/`room.setDifficultTerrain` reach every client.

## 7. Finish

- [x] 7.1 Update `docs/DESIGN.md`'s command table (`room.setDiagonalRule`, `room.setDifficultTerrain`, `token.move` `via`), then run `npm run lint && npm run typecheck && npm test` and `npm run test:bench --workspace=@vtt/server`, and confirm all pass.
