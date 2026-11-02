## Context

`viewerSight(state, viewer)` (ADR 0044) returns a player's sight polygons and `BoardView.syncSight` draws `state.sight` as a dark mask. The GM's own state has no `sight`; view-as-player uses `filterStateForViewer`.

## Decisions

1. **Local state in `Board`.** `tokenView` is a boolean in `Board`, never sent. Invariant 3 is untouched: nothing leaves the browser.
2. **Same computation.** `gmSightPolygons` calls `viewerSight` with a synthetic player that owns only the selected token(s). Hidden tokens are unhidden in the copy (viewerSight skips hidden ones) so the GM can check them. The result is set as `sight` on the state handed to `BoardView`, so Pixi code is unchanged. The mask darkens tokens outside sight too, which dims them while the GM still sees them. The board has single selection, so one token is viewed; the helper takes a list and returns one polygon each, so multi-select would work unchanged.
3. **No selection.** Checked with nothing selected, the board is not darkened and a chip says "Select a token to see its view": blacking out the board would look broken.
4. **Off switches.** An effect unchecks Token view when line of sight turns off or the board is read-only or not the GM's. A deleted or unselected token yields no sight, so the board lights again.
5. **No overlap with view-as-player.** The row and chip need `you.role === "gm"` and not read-only; a view-as-player board has the player as `you`.
6. **UI.** `BoardFilters` takes an optional `sight` prop rendered as a checkbox row like the others; the funnel button carries `data-active` and the chip sits under the toolbar.
