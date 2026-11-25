# ADR 0082 — Tokens visible in part

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0016-manual-fog.md` (which tokens reach a player, and which roll sides fog blanks) · **Extends:** `docs/adr/0044-line-of-sight.md`, `docs/adr/0059-areas-clipped-at-fog.md`
**Change:** `openspec/changes/tokens-visible-in-part` · **Requirements:** FR-GM-17, FR-GM-19, FR-GM-23

## Context

ADR 0016 decides whether a player receives a token they don't own from one point, its centre: under fog, or with line of sight on, outside their sight, the token is withheld. So a goblin standing half out of fog, or half round a corner, isn't sent at all. The player sees empty floor where part of a creature stands. Areas (ADR 0059) and terrain squares already moved to "sent when any part is visible". ADR 0059 kept tokens on the centre rule, which left them the last kind of board content judged by one point.

## Decision

**A token's shape is its drawn disc.** `tokenDisc(token, grid)` in `packages/shared/src/areas.ts`:
- centred on `position`
- radius `max(0, size × cellSize / 2 − 2)`

It's the same circle the board draws, and the board's token views, drag ghosts, attack arrows and effects overlay all use it.

**Visibility is judged on a slightly smaller detection disc.** `tokenDetectionDisc` shrinks the drawn disc's radius by a further sixteenth of a cell (4.4 px on 70 px cells), and the filters sample that disc. A token is then sent only once a little more than a sliver of its edge shows. The inset scales with the cell, so the margin is the same at any map resolution.

The square footprint used by movement and attack rules was rejected for visibility. Its corners are empty space on the board, so a fog edge across a corner would send a token the player can't see at all. With both insets, a grid-snapped token whose square touches a grid-aligned fog edge from inside keeps its detection disc about 6 px inside the fog, well beyond `inFogRegion`'s 1 px edge allowance, so it stays hidden.

**Sent when any part is visible.** `concealedFrom` keeps its shape:
- the GM sees everything
- hidden tokens are withheld
- a player's own tokens are always sent

For anyone else's token, the test changes from "centre under fog or out of sight" to "no sampled point of its detection disc on the map is outside every fog region and inside sight". It samples like `areaVisibleTo`: 16 rim points, the centre and a half-cell lattice. It tries the centre first, which settles every token in the open. With no grid in the concealment it falls back to the centre.

Every caller follows without changes of its own:
- snapshots, and the turn order built from them
- the token event filters
- `decide`'s `not_found` answers
- the ephemeral relay, including drag previews

A token's own sight still starts from its centre (ADR 0044). So a token whose centre is on a fog edge sees only the fog around it, while other players can see the half of it outside.

**Fog blanks a side only when it covers the whole disc.** `fogConcealsSide` (attack-roll sides, group-roll and area-effect targets) and the "move first into fog" ordering in `token.configure` and `token.setAppearance` use `fogCoversToken`. That is the same disc test against fog alone; sight plays no part, because these blanks are shared and permanent. A token a player can see is therefore never also an "Unknown" side.

**Size and grid changes count.** A token's size and the grid's cell size set its disc, so:
- `TokenAppearanceSet` with a new size, `GridSet`, and a `MapSet` with a new grid or map resync any player whose set of visible tokens they change.
- `reduce`'s `concealFoggedSides` also runs after them.

**Clipped on the board.** For a player, tokens they don't own are drawn inside a container masked by the visible-region texture that already clips areas (ADR 0059): sight, or the whole board, minus fog. That includes their art, label and markers. Other participants' drag ghosts of such tokens are drawn in the masked aim layer. A player's own tokens are in an unmasked container above it, so they stay whole in fog. The GM's tokens are all in the unmasked group. Raising the fog layer over tokens instead was rejected, because it would cover players' own tokens.

## Consequences

- **Accepted trade-off: a partly visible token is sent whole**, including a centre under fog or out of sight. It's the same trade-off as ADR 0059: the hidden part is never drawn, but developer tools can read the exact position. Most of the token is visible anyway.
- **Accepted trade-off: fog drawn short of a grid line reveals a sliver.** Fog that stops more than about 6 px (2 px plus a sixteenth of a cell) short of a grid line reveals a sliver of a snapped token beside it, because the fog tool doesn't snap to the grid. Snapping fog is a separate change.
- **Replay changes.** `concealFoggedSides` runs in `reduce`, so replaying an existing log uses the new rule. A side blanked only because a token's centre (not its whole disc) was in fog is no longer blanked in rebuilt state, and a name can appear where players' screens once showed "Unknown". That token was partly visible, so by this rule it was always theirs to see. Sides recorded as `hidden` inside `DiceRolled` events don't change. Rooms rebuild by replaying their log, so every reader sees the same result. Versioning the rule by seq was rejected: it would add a permanent branch to a pure function for a cosmetic difference in old rolls.
- **Accepted: a combined shrink-and-move into fog can deliver one move.** A `token.configure` that both shrinks a token and moves it so fog covers it emits `TokenMoved` first. At the old size its disc may still be partly visible at the new position, so players receive that move, then a resync that removes the token. The new name never reaches them.
- **Stacking order.** A player's own tokens always draw above tokens they don't own. Bring-to-front works within each group. The GM's board is unchanged.
- **Cost.** About 20 point tests for a token near a fog or sight edge, per viewer. In a worst-case room of 200 tokens mostly standing on fog edges, a player snapshot's filter went from about 0.26 ms to 1.05 ms with line of sight on, and from 0.18 ms to 0.38 ms without it. The ephemeral latency benchmark is unchanged.
- No schema, command, event or protocol changes shape.
