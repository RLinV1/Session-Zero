## Context

- `routePlan(state, you, points)` (`apps/web/src/board/movementRuler.ts`) prices the clicked points with `routeCost(points, grid, rules, runs)` (`packages/shared/src/movement.ts:100`). `routeCost` walks a straight run between each pair of points, counting diagonals across the whole route, and always costs a one-square footprint (`stepCost(..., 1, ...)`).
- A drag uses `routePlanFor` in the same file: `cheapestPath(from, to, size, grid, rules, knowledge, "line")` with `knowledge = { kinds: terrainCells(runs), walls, map }`, falling back to a straight line when the token isn't snapped, has a fractional size, or no path is found (`MAX_PATH_NODES`).
- `boardView.ts` keeps the route as a client-only `Mark` (`{ kind: "route", points, done }`, around `:1991-2006`) and redraws it in the `"route"` case (`:2615`) on every pointer move. The starting token's size is already known as `movementTokenSize` (`:551`, `:1593`), but the route mark doesn't keep it.

## Goals / Non-Goals

**Goals:** for the same squares and footprint, the Movement ruler shows the drag's route and cost; clicked points stay as stops.

**Non-Goals:** committing a move from the ruler; token-occupancy checks; any change to Range mode, the Alt ruler, the drag, or the server.

## Decisions

**Search each leg, then price the joined path once.** For each pair of consecutive stops (and the live pointer leg), call `cheapestPath` with the same knowledge and `"line"` preference the drag uses, and concatenate `[stop, ...via, nextStop]`. Then price the whole point list with a single `routeCost` call. `cheapestPath` restarts the Alternating diagonal count on every search, so pricing per leg would disagree with a drag; one pass over the joined points keeps the count running across stops. The segments between turning points are straight or diagonal runs, so `routeCost`'s straight-run walk reproduces exactly the steps the search took. No `MAX_MOVE_VIA` retry with `"turns"` is needed: nothing is committed, so the number of turns is unbounded.

Alternative considered: give `cheapestPath` a starting diagonal parity. It would let each leg's search account for parity, but changes a shared search for a rounding difference of at most one square per stop; the chosen route can still differ from a single global optimum by that much. Accepted for now.

**`routeCost` takes a size.** `routeCost(points, grid, rules, runs, size = 1)` passes `size` to `stepCost`, so a 2-square token's ruler costs every square its footprint lands on, as a drag does. The default keeps existing callers and tests unchanged.

**Fallback per leg, Blocked for the whole ruler.** A leg whose search returns null keeps its straight run; the route is then priced as today and `blocked` is set, so the ruler is drawn in the Blocked colour with the "Blocked" label. A route whose legs are all found is never marked Blocked, since the search already avoided Blocked squares and walls.

**Straight legs where a drag goes straight.** When the ruler starts from a token that isn't snapped to the grid or has a fractional size, every leg stays a straight run, matching `routePlanFor`'s `pathed` condition. A ruler started from empty ground uses a one-square footprint and is searched.

**The route mark keeps `tokenSize`.** `Mark` is a client type, so adding `tokenSize?: number` to the route mark (set from `movementTokenSize` when the route starts at a token) is not a schema change.

**Cache placed legs.** Placed legs only change when a stop is added or removed or the room state changes. Keep a per-leg cache keyed by the two stops, keyed again to the `state` object identity (as `movementObstacles` does with a `WeakMap`), so a pointer move runs one search, the live leg's, like a drag.

**No token check.** `dragPlan`'s `overlapsToken` step is not applied; `routePlan` calls the search directly.

## Risks / Trade-offs

- [A ruler with many stops on a large map runs several searches when the state changes] → Each search is bounded by `MAX_PATH_NODES`, and only state changes, not pointer moves, re-run placed legs.
- [Per-leg searches can pick a route one Alternating-diagonal step costlier than a single search would] → The shown cost is exact for the route shown; a drag of the same route costs the same.
- [Players' routes may be wrong under fog] → The same as the drag preview today; rulers never send anything, so nothing leaks.
