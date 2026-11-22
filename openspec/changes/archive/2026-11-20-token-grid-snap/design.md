## Context

`snapTokenCenter(p, size, grid)` snaps odd-sized tokens to cell centres and even-sized tokens to intersections. Board drags snap through it; `decide` never re-snaps. `GridSet` and `TokenAppearanceSet` leave `token.position` unchanged.

## Decisions

**Emit moves in `decide`, not remap in `reduce`.** Making `reduce` move tokens on `GridSet` would change what every stored `GridSet` means on replay, which needs an ADR and would shift tokens in existing rooms. Emitting `TokenMoved` from `decide` keeps history exact and reuses an event that already carries `from`.

**Nearest cell, not same cell index.** When a GM adjusts the grid to match the map, a token belongs on the map feature it was on. Keeping its cell index instead (cell 30 stays cell 30) would slide it `30 × Δcell` pixels across the map. `snapTokenCenter` on the new grid moves it at most half a cell.

**Only tokens that were snapped.** `isSnapped` (within 1e-6) tells a grid-aligned token from one placed freely. Free tokens keep their exact position, per FR-TAC-02.

**Size change anchors the top-left cell.** From a cell centre there are four equally near intersections, so "nearest" is ambiguous. Keeping the footprint's top-left corner (`center + (newSize − oldSize) × cell / 2`) is deterministic and matches how a size-2 token grows down and right from its cell. Fractional sizes (e.g. 1.5) have no whole top-left cell, so a resize to or from one leaves the position alone.

## Risks

- **More events per grid change.** One `TokenMoved` per aligned token. Rooms hold tens of tokens, so the cost is small.
- **Grid preview.** The GM's live grid preview does not move tokens; they move on Apply, when the command runs.
