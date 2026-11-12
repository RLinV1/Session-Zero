# ADR 0063 — Token wall clearance

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0029-walls-and-wall-detection.md` (Blocking: the inset footprint) · **Extends:** `docs/adr/0055-path-movement.md` (each step's wall check)
**Change:** `openspec/changes/token-wall-clearance` · **Requirements:** FR-GM-11, FR-TAC-02

## Context

ADR 0029 tests walls against the token's square inset by 10% on each side. Any wall reaching into the inner 80% blocks the whole square: a short stub in a corner, a diagonal clipping a square, detection noise near an edge. Tokens can't stand where nothing in the picture stops them, and the cheapest-path search (ADR 0055) routes around such squares too.

## Decision

- **Clearance circle.** Walls (and closed or locked portals) are tested against a circle of radius `WALL_CLEARANCE` = 0.05 of a grid square (10% of a square across), never against the token's square. A wall at distance ≤ the radius touches it. The circle doesn't scale with the token.
- **Sample points.** A token of size ≤ 1 is tested at its center. A larger token is tested at `ceil(size)` points per side, spread evenly with the outermost half a square inside its edge; for a whole size these are the centers of its squares. So a multi-square token is blocked exactly when a 1-square token at any of its squares would be.
- **Landing** (`clearanceTouchesWall`): create, duplicate, move, Reposition, resize and multi-copy spreading need every sample point's circle clear of walls. Refusal messages are unchanged.
- **Sweep** (`clearanceSweepTouchesWall`): a non-Reposition move, and each leg of a path, is refused when a sample point's circle, swept in a straight line (a capsule), touches a wall. Walls touching the token's circles where it starts are ignored for that move, as before.
- **One implementation.** `decide`, `cheapestPath`, the drag preview and the builder all call these two functions. `footprintCrossesWall`, `sweptCrossesWalls` and `WALL_FOOTPRINT_INSET` are removed.
- Blocked terrain keeps its whole-square rule (ADR 0046).

## Consequences

- Every circle lies inside the old inset square, so no spot or move that was allowed becomes refused. Rooms, logs and replays need no migration, and no schema changes.
- A Large token can straddle a thin wall on the grid line between its squares. A one-square doorway still stops it.
- Gaps between wall segments wider than the circle (about 7 px on a 70 px grid) now let tokens through. The 80% swept square used to stop gaps up to most of a square. The GM can close such gaps by drawing a wall.
- Larger tokens cost up to `ceil(size)²` point tests per wall. Walls whose bounding box misses the token's padded box are skipped first.
