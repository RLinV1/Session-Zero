# Tasks

## 1. Shared route cost

- [x] 1.1 Add `routeCost(points, grid, rules, runs)` to `packages/shared/src/movement.ts` (design Decision 4) and reimplement `rulerPathCost` as `routeCost([from, to], …)`. Verify `packages/shared/test/rulerPathCost.test.ts` still passes unchanged, and add `routeCost` cases:
  - Two runs of three squares cost 30 ft.
  - Alternating diagonals continue across a turn (one diagonal, a turn, one diagonal is 15 ft).
  - Difficult and Blocked squares on the second run are counted.

## 2. Tool mode and options

- [x] 2.1 Add `mode` to the Measure `BoardTool` and `measure: { mode }` to `ToolOptions` with `"range"` as the default, reading stored options without it as the default (design Decision 1). Verify with `apps/web/test/boardTools.test.ts` cases for `toolFor` and an old stored options object.
- [x] 2.2 Add the Range/Movement switch to `MovementControls.tsx`, and remove the movement allowance input and setting. Verify with `apps/web/test/movementRuler.test.tsx`: the switch changes the mode, it's remembered after a remount, and no allowance input appears in either mode.

## 3. Range mode

- [x] 3.1 Make the `measure` mark's label in `boardView.ts` plain distance under the room's Diagonals rule, with no terrain, budget or Blocked colouring (design Decision 2). Verify with a unit test of the label function: three squares across two Difficult squares reads "15 ft", and three Alternating diagonals read "20 ft".

## 4. Movement mode

- [x] 4.1 Add the `route` mark and the click, Enter, Backspace and Escape handling in `boardView.ts` and `Board.tsx`, plus eraser support in `hitMark` (design Decision 3). Verify with unit tests on a `BoardView` built as in `test/movementPreview.test.ts`:
  - Clicks add snapped points.
  - The start comes from the selected token.
  - Enter finishes.
  - Backspace removes the last point but not the start.
  - Escape clears.
  - A new press after finishing starts a new route.
- [x] 4.2 Draw the route and its live run, and label it with `routeCost`'s plain cost, " · N difficult" and "Blocked" (design Decision 5). Verify with unit tests of the label: right 3 then down 3 on open ground reads "30 ft"; a run across two Difficult squares counts them; a Blocked square reads "Blocked"; fogged Difficult squares cost as Normal for a player.
- [x] 4.3 Make the Measure hint mode-aware (design Decision 6). Verify in the browser: switch modes, measure a range across Difficult ground (plain distance), plot a three-point route with Backspace and Enter, Escape to clear, and Alt for the free-hand line in both modes.

## 4b. Drag label

- [x] 4.4 Change the token drag's label in `dragPlan` to plain cost ("25 ft", plus " · N difficult") and retire `budgetLabel`. Verify with `apps/web/test/dragPlan.test.ts`: a three-square drag reads "15 ft" whatever the allowance.

## 5. Finish

- [x] 5.1 Reconcile the in-flight `ruler-terrain-cost` change (design Decision 8), then run `npm run lint && npm run typecheck && npm test` from the repo root and confirm all pass.
