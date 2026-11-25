# Tasks

## 1. Shared cost (packages/shared)

- [x] 1.1 Add `size = 1` to `routeCost` in `movement.ts` and pass it to `stepCost`; verify existing `rulerPathCost.test.ts` cases still pass unchanged
- [x] 1.2 Add `rulerPathCost.test.ts` cases (`describe("... (ruler-modes)")`): a 2-square footprint landing on one Difficult square costs double under On entry; Alternating diagonals continue across a mid-route point (1 + 2 diagonals = 20 ft). Run `npm test -- rulerPathCost`

## 2. Ruler routing (apps/web)

- [x] 2.1 In `movementRuler.ts`, change `routePlan` to take the footprint size and whether to search, run `cheapestPath` per leg with the drag's knowledge and `"line"` preference, fall back to a straight leg and mark the route blocked when a search returns null, and price the joined points with one `routeCost` call; return the joined points for drawing. Verify with the tests in 3.1
- [x] 2.2 In `boardView.ts`, store `tokenSize` (and whether the starting token is snapped with a whole-number size) on the route mark when it starts from a token; draw the line through the points `routePlan` returns while keeping the stop dots on the clicked points. Verify by hand: a route bends around a wall in `npm run dev`
- [x] 2.3 Cache placed legs per route and per room state, so a pointer move searches only the live leg; verify a route with five stops stays responsive while moving the pointer

## 3. Tests (ruler-modes)

- [x] 3.1 In `apps/web/test/movementRuler.test.tsx`, add cases: route bends around a known wall; route goes around a Blocked patch and is not blocked; ruler and `dragPlan` agree in points and label for the same 2-square token and target; enclosed stop gives a straight leg labelled "Blocked"; stop off the line is passed through; route ending on a token is not blocked; a player's route crosses a wall their state doesn't hold; a fractional-size starting token gets straight legs
- [x] 3.2 Confirm the existing Range mode, Alt ruler and Enter/Backspace/Escape tests still pass unchanged

## 4. Docs and checks

- [x] 4.1 Update the ruler description in `docs/user/` if it says Movement mode draws straight runs
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
