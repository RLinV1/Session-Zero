# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **A move is one straight leg.** `token.move { tokenId, to, expectedOrigin?, boardEpoch?, reposition? }` (`commands.ts:218`) is checked in `decide` by `movementBlocked(state, token, to, reposition)`. That function checks the destination footprint for Blocked terrain and wall clearance, then the swept straight route against Blocked runs (`movementTerrain(...).blocked`) and walls (`sweptCrossesWalls`), using the token's current position as the start. It records `TokenMoved { tokenId, from, to }`. Undo swaps `from` and `to` (`undo.ts:274`).
- **Diagonal moves can't clip a corner.** The swept checks use positive-area overlap of the token's footprint along the line (`footprintInterval`). A diagonal step therefore collides with Blocked terrain in either of the two squares beside it, so corner-cutting past Blocked terrain is already refused.
- **Two cost formulas.** The drag readout is `movementPreview` (`apps/web/src/board/movementRuler.ts`). It calls `movementTerrain`: proportional footprint overlap, Chebyshev or Euclidean distance, ignoring the diagonal rule. The ruler uses `measure` plus `rulerPathCost` (`movement.ts:35`), stepping cell by cell under the private diagonal rule and doubling each Difficult cell entered.
- **The diagonal rule is private.** It lives in `MovementControls` (`vtt.movement.<roomId>` in localStorage, `{ allowance, rule }`), alongside the allowance.
- **Players' drags are checked privately on the server.** A dragging player sends an ephemeral `tokenMovePreview { requestId, tokenId, from, to, boardEpoch, reposition? }`. The server answers that socket only with `tokenMoveFeedback { status: clear | blocked | unknown }` (`movementFeedbackForViewer`, `visibility.ts:76`). The answer is "unknown" unless the route lies within the player's known terrain coverage (`movementRouteKnown`).
- **Players don't have walls.** They receive doors and windows outside fog, but no plain walls (ADR 0029), until `visible-walls-for-players` ships.
- **Other screens see moves as jumps.** During a drag they see a live ghost (`tokenDragPreview`), and on commit the token jumps to `to`.
- **Room rules** follow the table-rules pattern (ADR 0057): an optional `RoomState` field read with a default, a GM-only `room.set*` command, and a `*Set { value, previous }` event that passes the visibility filter and has an activity-log line.

## Goals / Non-Goals

**Goals:**
- One shared, pure step-cost function used by the drag, the path search and the ruler.
- The server checks exactly the route the mover saw, leg by leg, with today's checks.
- No path, preview reply or event carries geometry a player may not see.

**Non-Goals:**
- Enforcing movement allowances or costs on the server. Cost stays advisory; the server checks only obstacles.
- Range and multi-point ruler modes (`ruler-range-and-movement-modes`).
- Sending walls to players (`visible-walls-for-players`).
- Changing line-of-sight range, area templates or the Alt free-hand ruler.

## Decisions

**1. Two room rules in the table-rules pattern.**

| Rule | `RoomState` field (absent reads as) | Command | Event |
|---|---|---|---|
| Diagonals | `diagonalRule?: "equal" \| "alternating" \| "euclidean"` (`"equal"`) | `room.setDiagonalRule { rule }` | `DiagonalRuleSet { rule, previous }` |
| Difficult terrain applies | `difficultTerrain?: "entry" \| "exit" \| "both"` (`"entry"`) | `room.setDifficultTerrain { mode }` | `DifficultTerrainSet { mode, previous }` |

Both rules are GM-only, refuse an unchanged value as `invalid`, are not undoable, and are public (the events pass the visibility filter). `diagonalRuleOf(state)` and `difficultTerrainOf(state)` return the defaults. Labels live in shared constants next to `DEFEAT_REMOVAL_LABELS` so the Table tab and the activity log agree. `MovementControls` drops its Diagonals select and stores only `allowance`; an old `rule` in stored settings is ignored, and `isMovementSettings` accepts its absence.

**2. One pure step-cost function in `packages/shared/src/movement.ts`.**
`stepCost({ from, to, diagonalIndex }, footprint, rules, kinds)` returns the step's cost in squares, or `null` when the step can't be taken.
- `from` and `to` are the anchor cells of the token's top-left square and are adjacent.
- The footprint is `size × size` squares from the anchor.
- The base length is 1, or for a diagonal step √2 (Euclidean), or under Alternating 2 on every second diagonal of the move (`diagonalIndex` counts from 1).
- The step is doubled if any Difficult square is in the landing footprint (entry), in the leaving footprint (exit), or in either (both), and at most once.
- `kinds` is the viewer's terrain map (`terrainCells`).

`rulerPathCost` is rewritten on top of `stepCost` so the ruler and the drag agree. It walks the same rounded cell line as today, but under the room's rules instead of the private preference.

**3. Path search on the client: Dijkstra over (anchor cell, Alternating parity).**
`cheapestPath(start, goal, size, rules, knowledge)` in `movement.ts`:
- **Nodes** are anchor cells inside the map (plus the token's own cell) paired with a parity bit. The bit is used only under Alternating, so the next diagonal's cost is known.
- **Edges** are the 8 neighbours. An edge exists when `stepCost` is non-null and the step's swept route is clear of the viewer's known Blocked terrain, walls and closed or locked portals. The swept route uses the same `movementTerrain(...).blocked`/`sweptCrossesWalls` as the server, so corner rules match exactly.
- **Ties:** among equal costs, the secondary key is either the summed distance of the path's squares from the straight start–goal line ("line", the default, so a drag looks like a line drawn on the grid) or the number of direction changes ("turns", with the heading added to the search state). `dragPlan` searches by "line"; if that path has more than `MAX_MOVE_VIA` turns it searches by "turns"; if that is still too many, it falls back to the straight drag. Results are deterministic.
- **Bounds:** a fixed node cap (`MAX_PATH_NODES = 40_000`, i.e. 200×100 cells × 2) returns "no path" when exceeded, and an A* heuristic of the Chebyshev distance × 1 keeps searches small.
- **Wall checks** use a per-drag uniform-grid index of the viewer's walls by cell. It's rebuilt when `state.walls`, terrain or the grid changes, so a step tests only the walls near it.

Each pointer move searches again only when the target square changes. Typical maps are about 1,300 cells, so a search is well under a frame.
*Alternative:* the server computes paths for players. Rejected while exploring: it adds a network round trip per target change, and a path computed from walls the player can't see would reveal them. `visible-walls-for-players` gives the client the walls it may route around.

**4. What a player's search may use.**
- **Terrain:** the GM uses effective terrain. A player uses `terrainView.runs`, and ground outside `terrainKnowledge` counts as Normal and passable but marks the path "uncertain" from that step on.
- **Walls:** the GM uses all walls (`blocksMovement`). A player uses only the doors and windows in their state, plus any walls the room sends them later.
- **Feedback:** while the path is uncertain or its walls unconfirmed, the line is drawn faint dashed and the private server check (Decision 7) supplies the status, as today.

**5. Path compression into `via`.**
The step sequence is compressed to the cells where direction changes. Their token centres (`snapTokenCenter` of the anchor) form `via`, excluding the start and the end. A straight run of steps sweeps exactly the union of its steps (the footprint is convex and moves in a constant direction), so checking a compressed leg on the server equals checking each step on the client. `via` has at most `MAX_MOVE_VIA = 64` points. A path that needs more falls back as Decision 3 describes: fewest turns, then the straight drag.

**6. `token.move` and `TokenMoved` carry `via`.**
- **`token.move`** gains `via: z.array(Point).max(64).optional()`. `decide` checks, in order:
  1. Every point is on the map.
  2. Reposition carries no `via`; one that does is `invalid`.
  3. Each leg `[start, ...via, to]` passes `movementBlocked(state, { ...token, position: legStart }, legEnd)`.

  Any failure refuses the whole move with "That move is unavailable." and records nothing.
- **`TokenMoved`** gains `via?: Point[]`, recorded only when non-empty, and `gaps?: number[]`, which only the player filter sets (Decision 8). `reduce` ignores both (the position is still `to`).
- **Undo** inverts to `TokenMoved { from: to, to: from }` with no `via`.
- **The activity log** says "moved X from A to B", with "along a path" when `via` is present.
- **Other moves** (`token.configure` with a position, keyboard steps, duplication) are unchanged.

**7. The movement-preview channel checks paths.**
`tokenMovePreview` gains `via?: Point[]` (max 64). `movementFeedbackForViewer` answers:
- "unknown" when any point is off the map, or when any leg isn't within the player's known coverage (`movementRouteKnown` per leg);
- otherwise "blocked" if any leg fails `movementBlocked`, and "clear" if none does.

It still answers a single status and never names a leg.

**8. A player receives only the visible stretches of a path.**
In `filterEventForViewer`'s `TokenMoved` arm, after the existing `byVisibility` decision returns `pass`, each leg of `[from, ...via, to]` is cut where it crosses a fog edge or, with line of sight on, a sight edge (`before`'s concealment). Each piece is kept if its midpoint is visible. The player's event carries the resulting points as `via`, plus `gaps`: the indices `i` in `[from, ...via, to]` where the stretch from point `i` to `i + 1` is hidden, so their board jumps across it. No point inside fog or out of sight is sent. A path with nothing hidden is sent unchanged; one with nothing visible is sent without `via`. Replays use the same arm.
A detour taken entirely in view is still sent, even if the GM's client chose it because of something under fog. Players watching the token at the table would see that bend anyway; this is accepted, not a leak to fix.
Probing is accepted too. A hand-written move whose turns sit in fog and end on the token's own square tells its sender, by being accepted or refused, whether the hidden legs are clear. The app's own drag never sends one: a drop on the token's own square sends nothing, and a refused drop through fog behaves like a refused straight drag today. AI seats (`apps/mcp`) and anyone sending raw messages can do it.

**9. Other boards animate along `via`, jumping across `gaps`.**
`Board` already subscribes to live committed events for effects. Every live `TokenMoved` made by someone else, for a token that isn't being dragged locally, slides. One with `via` follows it, jumping across the server's `gaps`; a straight one is cut on the player's board with `visibleStretches` against the fog and sight it holds, so it jumps across fog too (the GM's board slides the whole way). It animates the sprite through `[from, ...via, to]` at about 90 ms per square, capped at 1.2 s, jumping across each stretch listed in `gaps`. Reduced motion jumps, and snapshots, reconnects and replays jump too. The animation is drawing only: the token's state position is `to` the moment the event arrives.

**9a. No path falls back to a straight drag.**
When `cheapestPath` returns null, `dragPlan` returns the straight drag: line, distance-only label and obstruction from `movementPreview`. The drop then sends a plain `token.move` and the server decides. This covers enclosed squares (the line shows blocked and the server refuses), searches that hit the node cap, and the rare start-on-a-wall layout where the client is stricter than the server, whose first leg ignores walls crossing the starting footprint. The search's heuristic matches the Diagonals rule (Equal: Chebyshev; Alternating: `max + floor(min / 2)`; Euclidean: octile), so it explores far fewer squares under Alternating and Euclidean.

**10. Cost readout.**
The drag label becomes `budgetLabel(cost, allowance)` (the ruler's "25 / 30 ft · 5 ft remaining"), shown as "Cost unknown" when uncertain. An Alt, free-placed or fractional-size drag shows straight-line distance only, which retires the proportional formula. The spec's "Proportional private ruler" requirement in the in-flight `terrain-tactical-movement` change is replaced; reconcile when both are archived.

**11. The existing ruler follows the room rules now.**
Until `ruler-range-and-movement-modes` lands, the single-line ruler keeps its behavior but reads the Diagonals rule from the room and costs Difficult terrain through `stepCost`. That way nothing still reads the private rule once it is removed.

**12. A new ADR, 0055 "Path movement"**, records Decisions 1, 5, 6, 7 and 8 and requests review by the Real-Time Architecture owner.

## Risks / Trade-offs

- [A player's path crosses a wall they don't know about and is refused at drop] → Same as today's straight drags. The faint dashed line and "unknown" feedback warn them, and `visible-walls-for-players` closes most of the gap.
- [Turns can be inferred from a stripped move] → Only the start and end are shown, as today. Turns under fog are never sent.
- [Search cost on very large maps] → The node cap returns "no path" rather than hanging. The wall index keeps edge checks local.
- [Removing the private Diagonals rule changes what a player's ruler shows] → Intended: everyone now sees the GM's rule. The default, Equal, matches the old default.
- [Rolling back past this release] → Logs with `via`, `DiagonalRuleSet` or `DifficultTerrainSet` can't be parsed by an older server. Hold the release until the ADR is approved.

## Migration Plan

No data migration is needed. Older rooms read Equal and On entry, and moves without `via` behave exactly as today. Stored planner settings keep their allowance, and their old `rule` is ignored.
