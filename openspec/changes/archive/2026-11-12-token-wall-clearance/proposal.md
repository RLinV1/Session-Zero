# Proposal

## Why

A token can't stand on, or move onto, any square that a wall reaches into, even slightly. Walls are tested against the token's square inset by only 10% on each side (ADR 0029), so a short wall stub in a corner, a diagonal wall clipping a square, or detection noise near a square's edge blocks the whole square. Players and the GM have to Alt-place or Reposition around walls that obviously don't stop anyone in the picture (FR-GM-11, FR-TAC-02).

## What Changes

- Walls are tested against a small **clearance circle** instead of the token's square. The circle is 10% of one square across. A token reaches a square when the circle can travel from its center to the square's center without touching a wall.
- **Multi-square tokens** are tested at one point per occupied square, at that square's center. A move fails if it would fail for a 1-square token travelling from any of those points. Tokens of size 1 or less use one point. Fractional sizes use `ceil(size)` points per side, spread evenly so the outer ones sit half a square inside the token's edge.
- The same test decides **landing** (create, duplicate, move, Reposition, resize, multi-copy spreading, the AI builder's creature placement) and the **sweep** of a move or of each leg of a path. The client's cheapest-path search and drag preview use the same test, so they keep agreeing with the server.
- A wall a token already touches where it starts is still ignored for that move's sweep, so a token the GM drew a wall over can walk away.
- Refusal messages are unchanged.
- **Behavior change (not a schema change):** spots and moves that were refused become allowed. Nothing that was allowed becomes refused, because the clearance circle lies inside the old inset square. Stored rooms need no migration.
- Blocked terrain keeps its whole-square rule.

## Capabilities

### New Capabilities
- `token-wall-clearance`: how walls and closed portals block where a token may stand and how it may move, for tokens of every size.

### Modified Capabilities
- `portals`: "Portal state controls movement" says no token's *footprint* may cross a closed portal; it now defers to the clearance rule.

## Impact

- `packages/shared/src/geometry.ts` (new clearance functions; `WALL_FOOTPRINT_INSET` and the square wall test retired), `terrain.ts` (`sweptCrossesWalls`), `movement.ts` (`movementBlocked`, `destinationBlocked`, `cheapestPath`), `decide.ts` (create, duplicate, `createTokens`), `build.ts` (creature placement).
- `apps/web/src/board/movementRuler.ts` (drag preview), `apps/web/src/pages/home/sightDemo.ts` (home demo).
- Tests: `packages/shared/test/walls.test.ts`, `cheapestPath.test.ts`, `terrain.test.ts`, `portals.test.ts`; `apps/server/test/visibleWalls.test.ts`; plus a new integration test.
- Docs: a new ADR amending ADR 0029's Blocking section, for review by the Real-Time Architecture owner.
