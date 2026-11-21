## Why

Tokens stop sitting in a cell whenever the GM adjusts the grid, and when a token's size is edited (KAN-74). Token positions are board pixels, so a grid change moves the lines under the tokens and leaves them straddling grid lines. A size change emits only `TokenAppearanceSet`, but `snapTokenCenter` centres odd-sized tokens on a cell centre and even-sized tokens on an intersection, so a size-2 token set to size 1 stays on an intersection.

## What Changes

- **Grid change re-snaps aligned tokens.** `scene.setGrid`, and `scene.setMap` with a grid, also emit one `TokenMoved` per token that was snapped on the old grid, moving it to the nearest snapped spot on the new grid. The token stays on the same part of the map.
- **Size change keeps the top-left cell.** `token.configure` and `token.setAppearance` that change a snapped token's size also emit `TokenMoved`, keeping the token's top-left cell and aligning it for the new size. An explicit `position` in the same `token.configure` wins.
- **Off-grid tokens stay put.** A token placed off the grid on purpose (Alt-drag, FR-TAC-02) is not moved by either change.

## Capabilities

### New Capabilities
- `token-grid-snap`: tokens keep grid alignment across grid and size changes.

### Modified Capabilities
None.

## Impact

- **Shared only:** `packages/shared/src/decide.ts` and two helpers in `geometry.ts` (`isSnapped`, `resizedTokenCenter`). Existing events only: `TokenMoved` already carries `from`, so undo (FR-REC-02) and the activity log work unchanged, and `filterEventForViewer` already redacts moves of hidden tokens.
- **No schema change, no ADR:** commands and events keep their shape. Replaying old logs gives the same state, because the new moves are emitted by `decide`, not derived in `reduce`.
- **Activity log:** a grid change now also logs one "moved" line per re-snapped token. That is an honest record of what changed.
