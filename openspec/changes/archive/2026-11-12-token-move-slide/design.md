# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **One slide function exists.** `BoardView.animateTokenPath(tokenId, points, gaps)` (`apps/web/src/board/boardView.ts`) slides a token through `points` at 90 ms a square, capped at 1.2 s, jumping across `gaps`, at constant speed. It runs in the board's frame loop (`this.animations`), records the token in `pathMoves`, and at the end rests the token at `state.tokens[id].position`. It returns early under reduced motion, while the token is being dragged here, or while `pendingMoves` holds it.
- **Only other people's moves slide.** `Board.tsx`'s `onCommitted` handler calls it for each live `TokenMoved` whose `committed.actorId` isn't the viewer. A path's `via`/`gaps` are already cut for the viewer by the server. A straight move is cut on the client with `visibleStretches` from the board's fog and sight; the GM gets it uncut. So the mover's other tabs and devices never slide either: they share the actor id.
- **The drag moves the real token.** `onPointerMove` sets the dragged token's `container.position` to the pointer. The drop (`onPointerUp`) snaps to `to`, works out `plan = dragPlan(...)` (cached when the target square didn't change), sets the container to `to`, records `pendingMoves`, and calls `moveToken(..., via)`. On refusal it puts the container back at the token's current position. `syncTokens` leaves the position of a token in `drag`, `pendingMoves` or `pathMoves` alone, and clears `pendingMoves` once state reaches it.
- **A token-shaped ghost already exists.** Placement draws a `TokenView` via `createTokenView(GHOST_ID)` and `drawToken(...)` into `fxLayer`, with `eventMode = "none"` and lowered alpha.
- **Other viewers' drag marker** is a ring from `showDragPreview`, driven by the ephemeral `tokenDragPreview`. It is unchanged.
- **Replays** hand `Board` the event frame for a single forward step (`replayFrame`; null for any other jump), already used to play attack effects. Event frames carry the same viewer-filtered `TokenMoved` as live play. Auto-play advances every `REPLAY_STEP_MS` = 800 ms (`apps/web/src/ui/replaySteps.ts`).

## Goals / Non-Goals

**Goals:**
- One slide routine, with one timing curve, for live moves, the mover's own drop and replays.
- The mover's slide follows exactly the path the move sends.
- No change to what any viewer may see: slides reuse today's cut paths.

**Non-Goals:**
- Changing other viewers' ring marker during a drag.
- Any server, shared schema or protocol change.
- Sliding moves that aren't `TokenMoved` (placement, token creation, map changes).

## Decisions

**1. The drag moves a faded copy, not the token.**
On the first pointer move of a drag, the board creates `dragGhost` the way the placement ghost is made: `createTokenView`, then `drawToken` with the dragged token's current look, in `fxLayer`, `eventMode = "none"`, `alpha = 0.5`. `onPointerMove` moves the ghost instead of the token's container. `drag.offset` and `drag.target` work as today, so `refreshMovementPreview` and the path line are unchanged. The ghost is destroyed on drop, on `cancelMovement`, on a tool change, and when the dragged token leaves state. A press that never moves creates no ghost, so a click stays a click.
*Alternative:* reuse the remote ring for the mover. Rejected in exploration: a faded copy reads better on your own screen.

**2. The drop starts the slide itself.**
On drop, after `plan` is known, the board records `pendingMoves`, then slides with `slide(tokenId, plan.points, [], { own: true })`. The path is `plan.points`, or `[origin, to]` for a straight move. While a slide is pending or own, it rests at `pendingMoves.get(id) ?? state position`, not at `state.tokens[id].position`, which still holds the old square until the event arrives. On refusal, the board stops the slide and slides from the token's current drawn position back to `origin` with the same curve, then clears `pendingMoves`.
*Alternative:* wait for the server's answer before sliding. Rejected in exploration: a pause on every move to cover a rare refusal.

**3. One timing curve with a slow start, paced by length.**
`animateTokenPath` becomes `slide(tokenId, points, gaps, { capMs, own })`. For visible length `L` (in squares `n = L / cellSize`):
- natural duration `D = P·n + R/2` ms, where `P = 136` ms a square is the cruising pace and `R = 250` ms is the speed-up time, so a 6-square move takes `6·136 + 125 ≈ 0.94 s`; live slides have no cap, and `D = min(D, capMs)` only for replays (Decision 5)
- `R' = min(R, D)`; cruising speed `v = L / (D − R'/2)`
- distance at time `t`: `v·t²/(2R')` while `t < R'`, then `v·R'/2 + v·(t − R')`

On a 70 px square, `v ≈ 0.51 px/ms`, so after 100 ms a live slide has gone `0.51·100²/500 ≈ 10 px` (0.15 squares), whatever its length. A replay slide capped to fit its step keeps the same 250 ms start and cruises faster. This is a pure function `slideDistance(t, L, D)`, unit-tested on its own. Gaps still take no time.
*Alternative:* keep today's 1.2 s cap. Rejected: long moves would race, and the pace should read the same for every move.

**4. Every live move slides, unless this board is already sliding it.**
`Board.tsx` drops the `actorId` check and calls `slide` for every live `TokenMoved`, cut as today. `slide` returns early for a token this board is sliding for its own drop (`own` slides are tracked in `ownSlides`) or that is still in `pendingMoves`. In the mover's tab, the event then changes nothing. Other tabs on the same account, which never had the drop, slide like anyone else. The path-cutting code in `onCommitted` moves into a helper `slidePointsFor(moved, viewer, state)` shared with replays.
*Alternative:* skip by `commandId`. Rejected: players' events carry no `commandId` (ADR 0013).

**5. Replays slide inside the step.**
`Board`'s `replayFrame` effect first calls `view.stopSlides()`, which ends every slide and puts each token where state says. Then, for an event frame with a `TokenMoved`, it calls `slide` with `slidePointsFor(...)` against the replayed state and `capMs = REPLAY_STEP_MS − 100` (700 ms), so each slide ends before the next auto-play step. Any other change of the shown step (stepping back, the slider) arrives with `replayFrame` null, so `stopSlides()` alone runs and the token simply appears.

**6. Jumps.**
`slide` returns early, leaving the token where state says, when reduced motion is on or when the visible length `L` is under one square. Alt and Reposition drags have plans with straight `points`, so they slide straight.

## Risks / Trade-offs

- [The drop's slide ends before the server's answer] → It rests at the pending square; `syncTokens` clears `pendingMoves` when state arrives, as today. A late refusal then slides back from the destination.
- [Pixi objects created per drag] → One `TokenView` per drag, destroyed on every exit path; covered by tests for drop, cancel and tool change.
- [Long moves take several seconds (30 squares ≈ 4.2 s)] → The token is already on its square in state, so commands, targeting and other moves don't wait for the slide; a new move of the same token replaces the running slide.
- [Two moves of one token in quick succession] → A new `slide` for a token replaces its running one, starting from the new move's first point, as `animateTokenPath` does today.
- [Replay steps faster than 700 ms when stepping by hand] → Each step stops slides first, so a slide never overlaps the next state.

## Migration Plan

Web client only; no data or protocol change. Older clients keep today's behavior until they reload. A short note in ADR 0055 records that the mover's board and replays slide too.
