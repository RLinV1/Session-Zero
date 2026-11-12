# Design

## Context

See proposal.md for why.

- A drag drop and an arrow-key step both send `token.move` (`Board.tsx` `moveToken` and the `ARROWS` handler). Both can land on snapped positions, so the server can't tell a snapped drag from a nudge.
- The drop is decided in `BoardView`'s pointer-up handler (`boardView.ts`, around "Snap by default; hold Alt for free placement"): it snaps unless `e.altKey`, builds a `dragPlan`, slides the token optimistically and calls `callbacks.moveToken`. A refused move slides back and `Board.tsx` shows `setRefusal`.
- `dragPlan` / `movementPreview` (`movementRuler.ts`) return `obstruction: "blocked" | "unknown" | "clear"`, which the board already draws.
- `token.create` and `token.duplicate` are GM-only (`can.administer`). Both go through `createTokens`, which uses `spreadPositions`. When `spreadPositions` runs out of free spots, it fills the remaining copies with `origin`, which stacks them.
- `spreadPositions` already treats footprints as overlapping when both axis distances are under the summed half-sides, so edges don't count.

## Goals / Non-Goals

**Goals:**
- One shared overlap rule used by `decide`, `spreadPositions` and the board.
- Server enforcement wherever the server can tell what happened (new tokens); client enforcement where it can't (drag versus nudge).

**Non-Goals:**
- Server enforcement for `token.move`.
- Encounter templates, the AI builder (`build.ts`), library-board placement and undo, which keep their own positions.
- Changing any command, event or state schema.

## Decisions

### 1. Shared occupancy helper
In `packages/shared/src/geometry.ts`:
- `footprintsOverlap(a: {position, size}, b: {position, size}, grid)`: the strict open-square test `spreadPositions` already uses, factored out.
- `occupyingTokens(tokens)`: excludes `stats.hp !== null && stats.hp <= 0`.
- `overlapsToken(tokens, at, size, grid, exceptId?)`: whether any occupying token (other than `exceptId`) overlaps.

`spreadPositions` uses `footprintsOverlap` internally, and its callers pass `occupyingTokens`. This keeps the client and server agreeing on the definition, and `decide` stays pure (no new inputs).

### 2. Drag check is client-only
In the drop handler, when `!e.altKey`, after snapping: if `overlapsToken(state.tokens, to, token.size, grid, token.id)`, send nothing, end the drag preview at the current position (the token never left its square, so there is no slide back), and call a new `callbacks.dropRefused(message)` so `Board.tsx` shows the existing refusal notice with `t("board.squareOccupied")`. GM Reposition with a snapped drop follows the same path.
*Alternative:* a `snappedDrag: true` flag on `token.move` so the server could enforce it. Rejected because it's a schema change (ADR and review), and since any client can leave the flag off, the server still couldn't guarantee anything.
*Invariant 7:* this isn't authorization. Moving onto a token stays legal through Alt and the arrow keys. It only guards the drag gesture, like the existing client-side path search.

### 3. Drag preview shows the square blocked
`dragPlan` takes the viewer's state and the token, so it can set `obstruction: "blocked"` when `!free && overlapsToken(...)`. The ruler and ghost already draw "blocked". The local check runs before the server's movement feedback is requested, so an occupied square never asks the server.

### 4. Server refuses overlapping new tokens
In `decide`:
- `token.create` and `token.duplicate` with a `position`: if `overlapsToken(state.tokens, position, size, grid)`, return `reject("invalid", sharedMsg("reject.squareOccupied"))`. The check counts hidden tokens too (the actor is the GM, who sees everything; FR-GM-23 is unaffected because no player can send these commands). The wall check (ADR 0029, or the `token-wall-clearance` change if it lands first) runs first, so a square that's both walled and occupied reports the wall.
- `createTokens`: `spreadPositions` gets an option to stop instead of falling back to `origin` (e.g. returns fewer points). When fewer positions than requested come back, return `reject("invalid", sharedMsg("reject.noEmptySquare"))`. With `besideOrigin`, the original's own square is never offered, as now.

### 5. Placement ghost
While placing, the board draws the ghost's squares in the "blocked" style when `overlapsToken(...)` at the ghost's position (snapped, or exact with Alt). A click there is still sent, and the server's refusal reaches the placement bar through the existing `result.message` path. That keeps one source of truth for the message, and the click is harmless because nothing is created.

### 6. Catalog strings
- Shared rejections (`packages/shared/src/i18n/messages/{en,zh-TW}/rejections.ts`): `reject.squareOccupied` "Another token is already there.", `reject.noEmptySquare` "There's no empty square nearby."
- Web (`apps/web/src/i18n`): `board.squareOccupied`, reusing the same English text.
- zh-TW wording follows `docs/GLOSSARY-zh-TW.md` (token, square).

## Risks / Trade-offs

- **[Hidden HP makes a downed enemy look occupied to players]** → This is accepted (`downed-token-marker` option A). Revealing that the square is free would reveal the enemy is down. Players can Alt-drag or use the arrow keys.
- **[MCP AI seats and forged clients can still stack via `token.move`]** → The rule is a gesture guard, not a server rule, and stacking is otherwise legal. Documented in the proposal.
- **[A previously accepted `count > 1` create with no room now fails]** → The new message says why. Callers asking for many copies in a cramped spot get a refusal instead of a hidden stack.
- **[Optimistic slide already started before the check]** → The check runs before `this.slide(...)` and `pendingMoves.set`, so a refused drop never starts a forward slide.
