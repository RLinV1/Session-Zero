# ADR 0057 — Table rules

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0049-auto-remove-defeated-tokens.md` · **Extends:** `docs/adr/0044-line-of-sight.md` (sight concealment), `docs/adr/0038-attack-styles-nuke-and-animations.md` (room-wide option pattern)
**Change:** `openspec/changes/gm-table-rules` · **Requirements:** FR-TAC-07, FR-GM-15, FR-GM-16, FR-GM-23

## Context

The GM has one shared table option, Remove tokens at 0 HP (ADR 0049), and it is all or nothing. GMs also want to control what players can see: keep the board dark for a player who has no token yet, and keep HP and AC private on tokens a player doesn't own. Today every player receives every visible token's full `stats`, and a player with no token sees the map dimmed, not hidden.

## Decision

**Four room rules, each its own field, command and event,** like `reducedEffects`, `autoRemoveDefeated` and `joinsLocked`. All are public, GM-only to change (an unchanged value is `invalid`), not undoable, and absent from older snapshots and logs.

| Rule | `RoomState` field (absent reads as) | Command | Event |
|---|---|---|---|
| Remove tokens at 0 HP | `defeatRemoval?: "all" \| "npc" \| "off"` (below) | `room.setDefeatRemoval { mode }` | `DefeatRemovalSet { mode, previous }` |
| Hide map from players without a token | `hideMapWithoutToken?: boolean` (false) | `room.setHideMapWithoutToken { enabled }` | `HideMapWithoutTokenSet { enabled, previous }` |
| Hide HP from Players | `hideHp?: boolean` (false) | `room.setHideHp { enabled }` | `HideHpSet { enabled, previous }` |
| Hide AC from Players | `hideAc?: boolean` (false) | `room.setHideAc { enabled }` | `HideAcSet { enabled, previous }` |

**0 HP removal mode (amends ADR 0049).** `defeatRemovalOf(state) = state.defeatRemoval ?? (state.autoRemoveDefeated === false ? "off" : "all")`. `reduce` keeps applying `AutoRemoveDefeatedSet` to `autoRemoveDefeated`, so old logs replay unchanged. `room.setAutoRemoveDefeated` is removed from `Command`; `AutoRemoveDefeatedSet` stays in `DomainEvent`. `withDefeats` reads the mode: `"npc"` skips a token whose folded `ownerIds` is non-empty, `"off"` removes nothing. `DefeatRemovalSet.previous` is the effective mode it replaced (invariant 6).

**Hide map is a sight rule.** `viewerSight` returns `[]` for a player when the rule is on and they own no non-hidden token, whether or not line of sight is on; otherwise it behaves as before. That is the concealment line of sight already gives a player with no token (ADR 0044), so tokens, templates, portals, terrain and area effects are all withheld with no further change, and so are the ephemeral relay's token drag and template previews. Pings and dice drops still arrive as bare board points that name nothing, as they already do for a player with no token under line of sight. The map image URL still reaches the player; the board covers it at full darkness when the rule is on and there are no polygons (it dims to 0.62 otherwise, as before). With line of sight off, `filterEventForViewer` resyncs a player only for events that can change whether they own a visible token: `TokenCreated`/`TokenDeleted` of their token (a defeat keeps ADR 0049's event-then-`thenResync`), `TokenHiddenSet` of their token, and `TokenOwnersSet` adding or removing them. Moves never resync for this rule.

**Hide HP and AC is one stats projection.** `statsForViewer` sets `hp` and `maxHp` to `null` under `hideHp`, and `ac` to `null` under `hideAc`, for a player who doesn't own the token. `tokenForViewer` uses it, so snapshots, `TokenCreated` and `TokenDeleted` agree. `TokenStatsSet` has `stats` and `previous` projected; if they are then equal the event is redacted, since only hidden fields changed. A `TokenOwnersSet` that changes the viewer's ownership while either rule is on resyncs them. `HideMapWithoutTokenSet`, `HideHpSet` and `HideAcSet` resync every player; `DefeatRemovalSet` passes. Replays use the same filters, with the room's latest HP, AC and map rules applied to every past state, so history never shows what the GM has since hidden.

## Consequences

- Still visible by design: hit/miss rulings narrow an AC down, damage numbers show how much landed, and a defeat shows a token reached 0. With HP hidden a nuke's numbers show only on the viewer's own tokens, since the board can't tell which other tokens track HP.
- The client reads the public rule and shows "Hidden" on every token the viewer doesn't own while the HP rule is on, tracked or not. A player can still infer that a token tracks HP from a damage number on it (an applied roll or an area effect), since damage numbers are kept by design; they never learn the value.
- Toggling a visibility rule resyncs every player once. Rule changes are rare and GM-initiated.
- Rolling back past this release would leave events an older server cannot parse, once a GM has changed a rule.
- Reconciliation: `openspec/changes/auto-remove-defeated-tokens`' "Room setting" requirement (a switch) is replaced by `table-rules`' "Remove tokens at 0 HP mode" (three choices). Reconcile them when both are archived.
- Open for review: whether to accept `room.setAutoRemoveDefeated` as an alias for one release.
