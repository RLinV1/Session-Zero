# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **One mode today.** The Measure tool (`{ kind: "measure" }` in `apps/web/src/board/tools.ts`) is a press-drag-release gesture in `BoardView`. On release, `finishGesture` stores `this.measurement = { kind: "measure", from, to, free, tokenSize }`, which stays until the next press, a tool change or Clear. The gesture starts from `movementOrigin` (the selected token the viewer may move) when there is one.
- **The current label mixes range and movement.** `drawMark`'s `measure` case uses `measure()` for distance under the room's Diagonals rule (since `path-movement`). When the line crosses Difficult terrain, it switches to `rulerPathCost` and shows the budget against the allowance from `MovementControls`. The Alt ruler is free-hand Euclidean.
- **Step costs come from `path-movement`.** `stepCost` and `stepRulesOf` live in `packages/shared/src/movement.ts`. `rulerPathCost(from, to, grid, rules, runs)` steps one straight run of squares and counts Alternating diagonals from 1.
- **Tool options.** `ToolOptions` in `apps/web/src/ui/ToolRail.tsx` holds draw, area and fog options, persisted per browser. `toolFor` builds the active `BoardTool` from them. The rail shows `MovementControls` (the allowance) while Measure is active.
- **A click-points pattern already exists.** Fog polygon mode: `fogClick` adds corners, Enter closes (`closeFogPolygon`), Backspace drops a corner, Escape cancels (`cancelFogPolygon`), and `FOG_HINTS` says so. Double-click on the board pings, so it can't also finish a route.
- **The in-flight `ruler-terrain-cost` change** (3 of 4 tasks done) added terrain cost to the single-line ruler. Its behavior moves into Movement mode here, and Range mode drops terrain.

## Goals / Non-Goals

**Goals:**
- Range is pure distance; Movement is the drag's per-step cost, summed over placed runs.
- One shared function costs a multi-run route, so the drag and the ruler can never disagree.
- Reuse the fog polygon's interaction and keys so the board stays consistent.

**Non-Goals:**
- Route search in the ruler: the viewer chooses the route by placing points.
- Sharing rulers with other participants.
- Changing the Alt free-hand ruler, area templates or line-of-sight range.

## Decisions

**1. A `mode` on the Measure tool.**
`BoardTool` becomes `{ kind: "measure"; mode: "range" | "movement" }`. `ToolOptions` gains `measure: { mode }` (default `"range"`), persisted with the other tool options; a stored options object without it reads the default. `MovementControls` becomes just a two-button Range/Movement switch, remembered in this browser. The personal movement allowance (its input, stored setting and over-budget colouring) is removed: rulers and drags show length only.

**2. Range keeps today's gesture and drops terrain.**
Range mode keeps the drag and the stored `measure` mark. Its label is `measure(...).label` under `diagonalRuleOf(state)`: plain distance, with no `rulerPathCost`, no budget and no Blocked colouring. The Alt free-hand line is unchanged.

**3. Movement is a clicked route, a new `route` mark.**
`Mark` gains `{ kind: "route"; points: Point[]; done: boolean }`.
- **Points:** in Movement mode a press adds a point, snapped to a square centre with `snapTokenCenter`. The first point is `movementOrigin` when there is one, otherwise the first click.
- **Drawing:** while `done` is false, `drawMark` draws the placed runs plus a live run to the snapped pointer square.
- **Keys:** Enter sets `done`, Backspace removes the last point (the start stays), and Escape clears the route. These go through the same `Board.tsx` keydown branch as the fog polygon (`closeRoute` / `dropRoutePoint` / `cancelRoute` on `BoardView`).
- **Lifetime:** a finished route stays until the next press in Movement mode, a tool change or Clear, like today's measurement.
- **Erasing:** the eraser's `hitMark` treats a route as its segments.

**4. One route cost function in shared.**
`routeCost(points, grid, rules, runs)` in `packages/shared/src/movement.ts` walks each run square by square, as `rulerPathCost` does, but keeps one diagonal counter across all runs, so Alternating continues around turns. It returns `{ cells, cost, difficult, blocked }`. `rulerPathCost(from, to, …)` becomes `routeCost([from, to], …)`, so existing callers and tests keep their answers.

**5. Labels.**
- **Range:** `"25 ft"`.
- **Movement:** the plain cost, e.g. `"30 ft"`, plus `" · N difficult"` when N > 0, and `"Blocked"` in place of the cost when the route steps onto known Blocked ground. The line turns orange only when the route is Blocked.
- **Token drag:** the cheapest-path drag label changes the same way, from `"25 / 30 ft · 5 ft remaining"` to `"25 ft"` (plus `" · N difficult"`). `budgetLabel` is retired. This modifies the `path-movement` spec's "Cheapest-path drag" requirement.

The label also goes to the screen-reader status line (`movementFeedback`), as today.

**6. Hints.**
`TOOL_HINTS.measure` becomes mode-aware:
- **Range:** "Drag to measure · Alt: straight line · Esc: stop".
- **Movement:** "Click to add points · Enter to finish · Backspace removes a point · Esc cancels · Alt: straight line".

**7. Knowledge.**
Both modes read terrain as the drag does: effective terrain for the GM and `terrainView.runs` for a player. Missing squares count as Normal, so hidden terrain never changes a player's number.

**8. Reconciliation.**
`ruler-terrain-cost`'s remaining task is superseded. Close or reconcile that change before archiving this one; its proposal's single-line terrain cost becomes Movement mode.

## Risks / Trade-offs

- [Clicks in Movement mode no longer drag-measure] → The mode switch and the hint line say how each mode works. Range keeps the familiar drag.
- [Enter and Backspace already used by the fog polygon] → Different tools, so no overlap. The keydown branch checks the active tool first.
- [Long routes with many points] → Cost is linear in squares stepped. The existing 5,000-step cap per run in `rulerPathCost` carries over to `routeCost`.
