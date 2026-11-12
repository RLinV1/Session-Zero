# Proposal

## Why

When a token moves, other participants see it slide along its path, but the person who moved it doesn't: their token is already under the pointer when they let go. Their other tabs and devices don't see it either, and replays jump from square to square. Watching the token walk the path it was charged for makes every move easier to follow, for the mover as much as anyone.

## What Changes

- **Ghost drag:** while a viewer drags their token, the token stays on its square and a faded copy of it (its art at about half opacity) follows the pointer, with the path line and cost label as today. Other viewers keep the ring they see now.
- **Slide on drop:** when the viewer lets go, their token slides along the path it sends, straight away, before the server answers. If the server refuses the move, the token slides back to its square.
- **Slower start on every slide:** every slide (the mover's, other viewers', replays) starts from rest and speeds up over about a quarter of a second, so a refused move barely shows.
- **Slower, steady pace:** a live slide moves at about 136 ms a square once up to speed, so a 6-square move takes just under 1 s. Live slides are no longer capped at 1.2 s; a long move takes as long as its length needs.
- **Every screen slides:** a move slides on every board that sees it, including the mover's other tabs and devices, not just other participants'.
- **Replays slide:** stepping forward through a replay slides the moved token along the path the viewer may see, fitted into the 800 ms auto-play step. Stepping by hand or jumping on the slider cuts a slide short.
- **Unchanged:** reduced motion still jumps; Alt and Reposition drags slide in a straight line; moves under one square jump. No shared schema, server or protocol change.

## Capabilities

### New Capabilities
- `token-slide`: how a token's move is drawn on every board and in replays: the mover's ghost drag, the slide on drop and back on refusal, the slower start, replay pacing, and when a move jumps instead.

### Modified Capabilities
- `path-movement`: "Moves carry their path" says other participants' boards show a live move sliding; it changes to every board, including the mover's own, as defined by `token-slide`.

## Impact

- `apps/web/src/board/boardView.ts`: drag drawing (ghost instead of moving the token), drop and refusal flow, `animateTokenPath` (slower start, a time cap, sliding back, cutting short).
- `apps/web/src/board/Board.tsx`: which live `TokenMoved` events slide (all, unless this board is already sliding that token), and sliding on replay event frames.
- `apps/web/src/ui/ReplayBar.tsx` / `replaySteps.ts`: the replay step length the slide fits into.
- Tests: `apps/web/test` unit tests on a `BoardView` built as in `movementPreview.test.ts`, the speed-up timing, replay pacing, and which events slide; a browser check.
- Docs: a note in ADR 0055 (path movement) that the mover's board slides too. No new ADR: no shared schema changes.
