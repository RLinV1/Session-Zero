# ADR 0055 — Path movement

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0054-table-rules.md` (room-rule pattern), `docs/adr/0044-line-of-sight.md` (concealment)
**Change:** `openspec/changes/path-movement` · **Requirements:** FR-TAC-02, FR-TAC-03, FR-GM-15, FR-GM-23

## Context

A move is one straight leg: `token.move { to }` is checked by `movementBlocked` along the swept straight route and recorded as `TokenMoved { from, to }`. Movement cost is shown, never enforced, and was computed two ways: the drag readout doubled the share of the move where the footprint overlapped Difficult ground, while the ruler doubled each Difficult square entered. The diagonal rule was a private browser preference. Dragging a token around an obstacle was impossible: the straight route through it is refused.

## Decision

**Two room rules** in the ADR 0054 pattern (public, GM-only, unchanged value `invalid`, not undoable, absent reads as the default):

| Rule | Field | Command | Event |
|---|---|---|---|
| Diagonals | `diagonalRule?: "equal" \| "alternating" \| "euclidean"` (equal) | `room.setDiagonalRule { rule }` | `DiagonalRuleSet { rule, previous }` |
| Difficult terrain applies | `difficultTerrain?: "entry" \| "exit" \| "both"` (entry) | `room.setDifficultTerrain { mode }` | `DifficultTerrainSet { mode, previous }` |

**Per-step cost.** A pure `stepCost` costs one footprint step: base 1, a diagonal √2 (Euclidean) or 1, 2, 1, 2 … per move (Alternating), doubled at most once when Difficult lies under the landing footprint (entry), the leaving footprint (exit) or either (both). The drag, the path search and the ruler all use it. The proportional footprint-overlap cost is retired; Alt, free-placed and fractional-size drags show straight-line distance only.

**Paths are computed by the mover's client** from what that client holds (A* over anchor cell × Alternating parity, node cap). Among equal costs it prefers the path hugging the straight line; if that turns more than 64 times, the one turning least; failing that, the straight drag. Each step uses the server's own swept checks, so corner-cutting past Blocked terrain or walls is never offered.

**Moves carry their path.** `token.move` gains `via?: Point[]` (≤ 64 turning points, token centres). `decide` refuses the whole move unless every point is on the map, Reposition carries no `via`, and each leg `[start, ...via, to]` passes `movementBlocked` from the leg's start. A straight run of steps sweeps the union of its steps, so leg checks equal the client's step checks. `TokenMoved` gains `via?` (omitted when empty) and, in players' copies only, `gaps?`; `reduce` ignores both; undo inverts to a plain `TokenMoved` back to the start. `tokenMovePreview` gains `via?` and the private reply stays one status for the whole path: unknown if any leg leaves the player's known coverage, else blocked or clear.

**`via` reveals nothing hidden.** A player receives only the visible stretches of a path: each leg is cut at fog edges and, with line of sight on, sight edges under `before`'s concealment. Their event carries the visible points as `via` and `gaps?: number[]`, the indices of hidden stretches their board jumps across. No point in fog or out of sight is sent. Replays use the same filter.

**No path means a straight drag.** When the client finds no path (none exists for what it knows, the search hits its cap, or a start-on-a-wall layout makes the client stricter than the server), the drag falls back to the straight move and the server decides.

## Consequences

- Accepted: a detour taken entirely in view is shown even if the GM's client chose it because of something under fog. Players watching at the table would see the bend anyway.
- Accepted: a hand-written move whose turns sit in fog and end on the token's own square tells its sender, by being accepted or refused, whether the hidden legs are clear. The app's drag never sends one. AI seats (`apps/mcp`) and raw clients can.
- Cost stays advisory; the server checks obstacles, never budgets.
- Until players hold walls (`visible-walls-for-players`), a player's path ignores walls and a path through one is refused at drop, as straight drags were.
- Other boards animate a live `TokenMoved` along `via`, jumping across `gaps`; snapshots and replays jump.
- The in-flight `terrain-tactical-movement` change's "Proportional private ruler" requirement is replaced; reconcile when both are archived.
- Rolling back past this release would leave events an older server cannot parse.
