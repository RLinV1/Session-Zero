# Proposal

## Why

Fog and sight decide whether a player gets someone else's token from a single point, its centre (ADR 0016, ADR 0044). So a goblin standing half out of fog, or half round a corner into a player's sight, is withheld completely. The player sees empty floor where part of a creature plainly stands. Areas (ADR 0059) and terrain squares already switched to "sent when any part is visible". ADR 0059 kept tokens on the centre rule on purpose, which makes tokens the last kind of board content still judged by one point.

## What Changes

- **Behaviour change:** a token is sent to a player who doesn't own it when any part of its **drawn disc** is visible to them. The disc is the circle the board draws: radius `size × cellSize / 2 − 2 px`, centred on `position`. "Any part" is decided from points sampled over a **detection disc**: the drawn disc with its radius reduced by a further sixteenth of a cell (about 4.4 px on 70 px cells), so a sliver of edge alone doesn't count. The samples are taken over the detection disc (16 rim points, the centre, and the interior half-cell grid that `areaSamples` uses). A point counts when it lies on the map, outside every fog region and, with line of sight on, inside the player's sight. Hidden tokens are still never sent, owned tokens are always sent, and the GM sees everything.
- A partly visible token is sent whole, including a centre that may be under fog or out of sight. This is the same trade-off ADR 0059 accepted for areas.
- On a player's board, a token the player doesn't own is drawn through the same visible-region mask that clips areas (fog removed, and sight when line of sight is on). Only the visible part of its art, label and markers is shown. Today fog is drawn below tokens for players, so without this mask a partly visible token would show whole on top of the fog.
- **Behaviour change:** attack-roll sides and area-effect targets are blanked for good, and tokens left out of the turn order, only when the token's disc is wholly concealed by fog, not when its centre is. Like every other `reduce` change, replaying an existing log uses the new rule. A roll whose side was blanked only because a centre stepped into fog now keeps its name in replays. Sides already marked hidden inside recorded events are unchanged.
- In a single `token.update`, the "move before rename" ordering, which keeps a new name from reaching players, now triggers when the update takes the token's disc from partly outside fog to wholly under it.
- A token's own sight still starts from its centre. A token whose centre is on a fog edge still sees only the fog around it, but other players can now receive it, because about half its disc is outside the fog.
- Accepted limit: fog drawn more than about 6 px (2 px plus a sixteenth of a cell) short of a grid line can reveal a sliver of a grid-snapped token beside it. Snapping the fog tool to the grid is a separate change.

Non-goals:
- Clipping tokens on the server. A token's position is a point, so the client mask is all that's needed (unlike areas).
- Changing token rules that use the square footprint (stacking, range, adjacency, clearance).
- Snapping fog to the grid.
- Changing what an owned token sees.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fog-of-war`:
  - "Content under fog is not sent to players" changes from the token's centre to any sampled point of its drawn disc, for fog, sight, attack-roll sides and the turn order.
  - A new requirement: tokens a player doesn't own are drawn clipped at fog and sight.
- `line-of-sight`: in "A token in fog sees only the fog around it", the "On the fog's edge" scenario changes. Other players now receive a token whose disc reaches out of the fog.

## Impact

- `packages/shared/src/visibility.ts`:
  - `concealedFrom` tests a token's disc through `areaVisibleTo`.
  - `fogConcealsSide` tests the disc against fog alone.
  - The fallback when `Concealment` has no grid is the centre.
- `packages/shared/src/geometry.ts` (or `areas.ts`): a new pure `tokenDisc(token, grid)` that returns a circle `AreaGeometry`. It's shared by the filters and `apps/web/src/board/boardView.ts`, which today repeats the radius formula at two places.
- `packages/shared/src/decide.ts`:
  - the fog ordering in `token.update`
  - attack and group-roll `hidden` sides (these follow `fogConcealsSide`)
  - `not_found` checks (these follow `concealedFrom`)
- `packages/shared/src/reducer.ts`: `concealFoggedSides` follows `fogConcealsSide`. Its output changes for replayed logs.
- `apps/server`: the ephemeral relay (`liveRoom.ts`) follows `concealedFrom`, with no code change. Integration tests cover snapshots and live moves at a fog edge.
- `apps/web/src/board/boardView.ts`: tokens the viewer doesn't own go into a container masked by the visible region. The GM's view-as-player behaves the same as the player's view.
- `docs/adr/`:
  - A new ADR amending ADR 0016 and noting the reversal in ADR 0059.
  - It must state the replay change to `reduce` and ask the Real-Time Architecture owner for review.
  - No schema, command, event or protocol shape changes.
- Performance: a size-1 token takes about 20 point tests per viewer, and a size-10 token at most a few hundred. Each stops at the first visible point.
