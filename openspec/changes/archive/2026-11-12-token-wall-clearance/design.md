# Design

## Context

See proposal.md for why. Today one footprint test decides every wall question:

- `footprintCrossesWall(center, size, grid, walls)` (`packages/shared/src/geometry.ts`) clips each wall against the token's square inset by `WALL_FOOTPRINT_INSET` (10%) per side.
- `sweptCrossesWalls(from, to, size, grid, walls)` (`terrain.ts`) tests walls against the polygon the same inset square sweeps.
- `movementBlocked` / `destinationBlocked` (`movement.ts`) combine them with Blocked terrain; `cheapestPath.canStep` reuses them per step; `decide` calls `footprintCrossesWall` directly for `token.create`, `token.duplicate` and `createTokens`; `build.ts` calls it for creature placement; the web drag preview (`movementRuler.ts`) and the home demo (`sightDemo.ts`) call both.
- The "start on a wall" rule filters out walls that touch the starting footprint before sweeping (`ahead`).

Board coordinates are map pixels (invariant 8). `decide` and the client must give the same answer for the same walls (ADR 0055).

## Goals / Non-Goals

**Goals:**
- One pair of pure shared functions that every wall-blocking caller uses, so server, path search and preview can't drift.
- Every spot or move allowed today stays allowed.

**Non-Goals:**
- Blocked terrain, which stays whole-square (`movementTerrain`).
- Line of sight and fog, which use walls but not footprints.
- Token-on-token overlap (the separate `token-no-stacking` change).
- Changes to any command, event or state schema.

## Decisions

### 1. Clearance radius is a fixed share of the grid square
`WALL_CLEARANCE = 0.05` (radius, as a share of `grid.cellSize`), so the circle's diameter is 10% of one square, about 3.5 px on the default 70 px grid. It doesn't scale with token size: a multi-square token is several 1-square tokens moving together (Decision 2).
*Alternative:* a radius proportional to the token's size. Rejected because the user's rule is "a Medium token from each occupied square", and a scaled circle would let a Huge token be blocked by a stub a Medium token ignores.

### 2. Sample points
`clearancePoints(center, size, grid): Point[]`
- `size <= 1`: `[center]`.
- Otherwise `n = ceil(size)`; offsets along each axis `-(size-1)/2 + i·(size-1)/(n-1)` squares for `i = 0..n-1`; all `n²` combinations added to `center`.

For whole sizes these are the square centers; for 1.5 they're 2×2 points ±0.25 square from the center. The square containment guarantees Decision 6.
*Alternative:* `round(size)` points. Rejected because a size 1.4 token would get a single point and could straddle a whole square of wall.

### 3. Landing test
`clearanceTouchesWall(center, size, grid, walls): boolean`: true when for any sample point `p` and wall `w`, `distance(p, w) <= r`. It uses the existing point-to-segment distance (`distanceToSegment`, already used in `build.ts`; it moves into `geometry.ts` if it isn't there). It replaces `footprintCrossesWall` at every call site, and the old function is deleted rather than kept, so no caller is left on the old rule.

### 4. Sweep test
`clearanceSweepTouchesWall(from, to, size, grid, walls): boolean`: true when for any sample offset `o` and wall `w`, `segmentDistance({a: from+o, b: to+o}, w) <= r`. Segment-to-segment distance is 0 when they cross, otherwise the least of the four endpoint-to-segment distances. This is a capsule test: exact, cheap, and with no polygon building. It replaces `sweptCrossesWalls` (and its use of `WALL_FOOTPRINT_INSET`), which `cheapestPath`, `movementBlocked` and the preview call.
*Alternative:* sampling the path at intervals. Rejected because it's inexact and can step over thin walls.

### 5. Start-on-a-wall exemption stays per token
Callers keep filtering `ahead = walls.filter(w => !clearanceTouchesWall(start, size, grid, [w]))` before the sweep, with the same meaning as today: a wall touching any of the token's start circles is ignored for that move. The landing test still applies to the end.

### 6. No migration
Every sample point's circle lies inside the old inset square (points sit at least 0.5 square inside the edge, and 0.5 − 0.05 ≥ 0.1 inset), so anything that passed the old test passes the new one. Stored rooms, event logs and replays need nothing. Replays re-run no checks; they apply events.

### 7. Performance
Work per check grows with `n²` (at most 100 for size 10). `cheapestPath` already narrows walls with `wallIndex` per step, and `movementBlocked` is called once per leg. To keep large tokens on big maps cheap, each test rejects walls whose bounding box misses the token's padded bounding box before the per-point loop. The server benchmark (`npm run test:bench`) must still pass.

### 8. ADR
`docs/adr/0063-token-wall-clearance.md` amends ADR 0029's Blocking section (footprint → clearance circle and sample points; the 10% inset is retired) and notes the path-search consequence for ADR 0055. Status: "Proposed — awaiting review by the Real-Time Architecture owner". No schema changes, so the shared contract shape stays as it is.

## Risks / Trade-offs

- **[Large tokens can straddle thin walls on grid lines]** → This is what the rule says. Doorways still stop them (spec scenario). The design records it as intended.
- **[Detection gaps wider than about 7 px now let tokens through where the swept 80% square used to stop them]** → Gaps that wide are rare in detected walls, and the GM can draw a closing wall. Covered by the 4 px scenario as the threshold example.
- **[Client and server drift if a caller is missed]** → The old functions are deleted, so a missed caller fails typecheck. `rg footprintCrossesWall|sweptCrossesWalls|WALL_FOOTPRINT_INSET` must come back empty.
- **[Floating-point edge cases at exactly `r`]** → Use `<=` ("touching blocks") consistently, and write tests that sit clearly on either side of `r`.
