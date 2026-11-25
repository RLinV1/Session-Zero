## Why

The Movement ruler and a token drag cost the same squares the same way, but they disagree on the route. A drag searches for the cheapest path around Blocked terrain, walls and closed doors, using the token's footprint. The Movement ruler draws a straight run between each pair of clicked points, walks through walls, and always costs a one-square footprint. A player who plans a move with the ruler and then drags the token can see two different routes and two different costs for the same trip.

## What Changes

- **Each Movement-ruler leg is routed like a drag.** Between two clicked points, and from the last point to the pointer, the ruler shows the cheapest path the viewer knows of, avoiding Blocked terrain, known walls and closed or locked doors and windows, and the map edge. Clicked points stay as stops the route passes through.
- **The selected token's size is used.** A ruler started from a token routes and costs that token's footprint. A ruler started from empty ground uses one square, as today.
- **Same fallbacks as a drag.** A leg with no path, or one too long for the search, is drawn straight and marked **Blocked**. A ruler started from a token that isn't on the grid, or has a fractional size, keeps straight legs.
- **The cost matches a drag's.** The whole route is priced in one pass, so Alternating diagonals count across every leg.
- **No token check.** A route ending on another token is not marked Blocked, so measuring to a token still reads as a plain distance.
- **Unchanged:** Range mode, the Alt free-hand ruler, Enter, Backspace and Escape, and the ruler staying private to the viewer. Nothing is sent to the server.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ruler-modes`: Movement mode searches each leg's route as a drag does, uses the starting token's size, and treats known walls and doors as obstacles; rulers still reveal nothing hidden.

## Impact

- **`packages/shared`:** `movement.ts` — `routeCost` takes the footprint size (default 1, so existing callers are unchanged). Pure, no schema change.
- **`apps/web`:** `board/movementRuler.ts` (`routePlan` searches each leg and prices the joined path), `board/boardView.ts` (the route mark remembers the starting token's size; placed legs are cached; the drawn line follows the searched points).
- **Tests:** `packages/shared/test/rulerPathCost.test.ts`, `apps/web/test/movementRuler.test.tsx`.
- **Docs:** the ruler section of the user guide in `docs/user/`, if it describes Movement mode's straight runs.
