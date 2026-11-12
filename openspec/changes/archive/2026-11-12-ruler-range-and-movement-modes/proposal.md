# Proposal

## Why

The ruler does two jobs at once. It measures range, which shouldn't care about terrain, and it plans movement, which should. It also only measures one straight line. Players want to check a spell's range without terrain getting in the way, and to plan a route with turns, costed the same way a token drag is.

## What Changes

- The ruler gets two modes, chosen in its tool options:
  - **Range:** one straight line from start to end, measured under the room's Diagonals rule (from `path-movement`), ignoring terrain. It shows plain distance, e.g. "25 ft", with no movement budget.
  - **Movement:** the viewer places points; between each pair the ruler draws a straight run of squares. It does not search for a cheaper route, since placing points is how the viewer chooses one. Each step is costed like a token drag, under the room's Diagonals and Difficult terrain rules. It shows the movement cost as plain distance, e.g. "30 ft" (no "x / y ft · z ft remaining"), and notes any Blocked square on the route.
- The personal movement allowance (the "Movement (ft)" box) is removed: rulers and drags show length only.
- The token drag's label changes the same way: "25 ft" instead of "25 / 30 ft · 5 ft remaining".
- Both modes use the viewer's own filtered view of terrain and walls, so nothing hidden leaks. Measurement stays private to the viewer and is never sent.
- **Unchanged:** the Alt free-hand ruler (straight-line, off the grid), area templates and line-of-sight range.
- No shared schema change; this is web-side work that reuses `path-movement`'s step-cost code.

## Capabilities

### New Capabilities
- `ruler-modes`: the Range and Movement modes of the ruler, what each measures, how points are placed and removed in Movement mode, and what each shows.

### Modified Capabilities
- `path-movement`: the "Cheapest-path drag" label shows plain cost, and the personal movement allowance is removed (requirement "Diagonals and Difficult terrain are room rules" replaced by "Movement rules belong to the room").
<!-- None in openspec/specs. Supersedes the in-flight `ruler-terrain-cost` change (terrain cost on the single-line ruler): its behaviour moves into Movement mode, and Range mode drops terrain. Reconcile or close it before archiving this one. -->

## Impact

- `apps/web/src/board/tools.ts` (`measure`, the measure tool's options), `boardView.ts` (multi-point measurement gesture and drawing, labels), `movementRuler.ts`, `MovementControls.tsx` (mode switch beside the allowance).
- Reuses `packages/shared/src/movement.ts` step costs from `path-movement`; depends on that change.
- Tests: Range ignores terrain and uses the Diagonals rule; Movement costs the A → D1 → D2 → B route per the Difficult rule; adding and removing points; labels.
