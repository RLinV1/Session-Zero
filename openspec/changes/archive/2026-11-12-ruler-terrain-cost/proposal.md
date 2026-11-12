> **Superseded** by `ruler-range-and-movement-modes`: terrain cost moved from the single-line ruler into its Movement mode, Range mode ignores terrain, and `rulerPathCost` is now `routeCost([from, to], …)`. Archive this change without syncing; it has no spec deltas.

## Why

The Measure ruler showed plain distance and ignored painted terrain, so it disagreed with what a move costs (FR-TAC-03).

## What Changes

- New pure `rulerPathCost` in `packages/shared/src/movement.ts`: steps cell by cell from origin to end under the chosen diagonal rule; each Difficult cell entered doubles that step; any Blocked cell entered flags the path.
- Ruler label appends `· N difficult` and shows `Blocked` (orange) when the path crosses Blocked terrain; budget uses terrain cost.
- Uses the viewer's own terrain only (GM effective terrain, players `terrainView.runs`), so no hidden terrain leaks. Ephemeral; no schema, command or event change.
- Cell-centre approximation: large tokens are measured by their centre cell, and real token moves still use the swept-footprint cost.

## Impact

`packages/shared/src/movement.ts`, `packages/shared/test/rulerPathCost.test.ts`, `apps/web/src/board/boardView.ts`.
