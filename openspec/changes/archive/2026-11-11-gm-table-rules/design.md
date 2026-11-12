# Design

## Context

See proposal.md for the motivation and specs/table-rules/spec.md for the behavior. The current state that shapes the approach:

- **Existing room settings are separate fields, commands and events.** `reducedEffects` (ADR 0038), `autoRemoveDefeated` (ADR 0049) and `joinsLocked` (ADR 0051) are each a field on the `RoomState` interface, set by their own GM-only `room.set*` command and recorded by an `*Set { value, previous }` event. `RoomState` is a TypeScript interface, not a zod schema. Older snapshots and logs simply lack newer fields, and code reads them with `??` defaults. `autoRemoveDefeated` reads `?? true`.
- **0 HP removal happens in `decide`.** `withDefeats` (`decide.ts`) appends `TokenDeleted { reason: "defeated" }` after any `TokenStatsSet` that leaves HP at 0 or below, and does nothing only when `autoRemoveDefeated === false`.
- **Sight is computed per viewer.** `viewerSight` (`sight.ts`) returns `null` for the GM or when line of sight is off. Otherwise it returns one polygon per non-hidden token the viewer owns, so `[]` when they own none. `concealedFrom` treats anything outside sight as concealed for tokens the viewer doesn't own, and templates, portals and terrain follow the same concealment. `filterStateForViewer` sends `sight` whenever it is non-null.
- **Sight changes are resynced, not patched.** `filterEventForViewer` resyncs a player for every event that could change their sight polygons, but only inside an `if (before.scene.lineOfSight)` block.
- **Token payloads go through `tokenForViewer`.** In snapshots and in `TokenCreated`/`TokenDeleted`, it strips only `attacks` for non-owners. `TokenStatsSet` is passed whole (`stats` and `previous`) to anyone who can see the token.
- **The board's sight mask dims instead of hiding when there are no polygons.** `sightMaskAlpha` returns 1 when the viewer has at least one polygon and `DIMMED_ALPHA = 0.62` when they have none, deliberately, so a player with no token can still see the map.
- **The client reads `null` stats as "not tracked".** `TokenCard` shows "Not tracked" for `hp === null` and hides the AC row for `ac === null`. `TokenRoster` hides both. The nuke effect draws numbers only on tokens whose `hp !== null`.
- **The server's concealment cache is safe.** `LiveRoom` clears its per-viewer concealment cache on every commit, so a rule change can't leave a stale one behind.

## Goals / Non-Goals

**Goals:**
- Reuse the existing concealment for "hide map". No new hiding mechanism.
- One place decides what of a token's stats a viewer receives, used by snapshots and events alike.
- Old rooms and old history replay to the same state.

**Non-Goals:**
- Withholding the map image URL (see proposal: covered on the board only).
- Hiding damage numbers, hit/miss rulings, or that a token was defeated.
- Making rule changes undoable. Like the existing room settings, they are not.
- Per-player rules. Every rule applies to all players alike.

## Decisions

**1. One field, command and event per rule, following the existing room settings.**

| Rule | State field (absent reads as) | Command | Event |
|---|---|---|---|
| Remove tokens at 0 HP | `defeatRemoval?: "all" \| "npc" \| "off"` (see 2) | `room.setDefeatRemoval { mode }` | `DefeatRemovalSet { mode, previous }` |
| Hide map | `hideMapWithoutToken?: boolean` (false) | `room.setHideMapWithoutToken { enabled }` | `HideMapWithoutTokenSet { enabled, previous }` |
| Hide HP | `hideHp?: boolean` (false) | `room.setHideHp { enabled }` | `HideHpSet { enabled, previous }` |
| Hide AC | `hideAc?: boolean` (false) | `room.setHideAc { enabled }` | `HideAcSet { enabled, previous }` |

Each command is GM-only (`can.administer`), rejects an unchanged value as `invalid`, and is not undoable. Each event gets a line in the activity log.
*Alternative:* a single `room.setTableRules` with a `TableRules` object, which I suggested while exploring. Rejected: it breaks with the pattern every other room setting uses, and the visibility filter would then need to compare old and new objects to know whether to resync.

**2. `defeatRemoval` lives beside the old boolean instead of replacing it.**
A pure helper `defeatRemovalOf(state)` returns `state.defeatRemoval ?? (state.autoRemoveDefeated === false ? "off" : "all")`. `reduce` keeps applying `AutoRemoveDefeatedSet` to `autoRemoveDefeated`, so old logs replay unchanged, and applies `DefeatRemovalSet` to `defeatRemoval`. `decide` and the Settings tab read only `defeatRemovalOf`. `room.setAutoRemoveDefeated` is removed from the `Command` union; the only callers are this repo's tests and `SettingsMenu`, and MCP seats don't use it. `DefeatRemovalSet.previous` is `defeatRemovalOf(state)`, so an older room's first change records the effective value it replaced (invariant 6).
*Alternative:* migrate `autoRemoveDefeated` into the new field when reading a snapshot. Rejected: it would need a read-time migration, and the replay would no longer be the plain fold of its events.

**3. "Only NPC tokens" is one condition in `withDefeats`.**
The token folded from the batch is the one checked, so ownership changed in the same command counts. For `npc`, a token with `ownerIds.length > 0` is skipped. `"off"` returns the events untouched, as `false` does today.

**4. "Hide map" is a sight rule.**
`viewerSight` gains one rule before its line-of-sight check: for a player, when `hideMapWithoutToken` is on and no non-hidden token on the board is theirs, it returns `[]`. That is exactly what line of sight already produces for a player with no token, so `concealedFrom`, templates, portals, terrain, area effects and the ephemeral relay all withhold everything with no further change. When the player owns a visible token and line of sight is off, it returns `null` as before. The `Pick<RoomState, ...>` types of `viewerSight` and `concealmentFor` gain `hideMapWithoutToken`.

**5. Resyncs for the map rule are limited to ownership changes.**
`filterEventForViewer` gets a second guard next to the line-of-sight block. When `before.hideMapWithoutToken` is on and line of sight is off, it resyncs a player only for events that can change whether they own a visible token: `TokenCreated` or `TokenDeleted` of a token they own, `TokenHiddenSet` of one they own, and `TokenOwnersSet` that adds or removes them. A defeat keeps ADR 0049's event-then-`thenResync` behavior. Token moves do not resync here, since without line of sight a position never changes sight.
*Alternative:* turn the existing line-of-sight block on for this rule as well. Rejected: every move of a player's own token would resync them.

**6. Full darkness comes from the public rule on the client.**
`sightMaskAlpha(polygons, hideMap)` returns 1 when `hideMap` is set and there are no polygons, and otherwise behaves as today. `boardView` passes `state.hideMapWithoutToken === true`. The rule is public state, so no new per-viewer field is needed.

**7. One stats projection, used by every payload.**
`tokenForViewer(token, viewer, rules)` additionally sets `hp` and `maxHp` to `null` under `hideHp`, and `ac` to `null` under `hideAc`, for a player who doesn't own the token. A shared `statsForViewer(stats, token, viewer, rules)` does the stripping:
- `filterStateForViewer` passes the room's rules.
- `TokenCreated` and `TokenDeleted` already go through `tokenForViewer`, using `before`'s rules.
- `TokenStatsSet`: once the token is known to be visible, `stats` and `previous` are both stripped. If they are then equal, the change was only to hidden fields, so the event is redacted. Otherwise the stripped event is sent.
- `TokenOwnersSet`: resyncs a player whose ownership of the token changes while `hideHp` or `hideAc` is on, so their copy gains or loses the real values.
- `HideHpSet`, `HideAcSet` and `HideMapWithoutTokenSet` resync every player. `DefeatRemovalSet` passes, like `AutoRemoveDefeatedSet`.
Replays (`replayFrom`) apply the room's latest `hideHp`/`hideAc`/`hideMapWithoutToken` on top of every past state they filter, so a player can't read from history what the GM has since hidden, including values from before the rule was turned on. A player who was present then already saw them live; one who joined later never did.
`CheckpointRestored`, `EncounterApplied`, scene switches and initiative changes already resync, so they reach players through the filtered snapshot. Undo's compensating `TokenStatsSet` uses the same path.

**8. The client shows "Hidden" from the public rule.**
A small helper `statHidden(state, you, token, "hp" | "ac")` is true for a player who doesn't own the token while the matching rule is on. `TokenCard` shows "Hidden" for HP or AC when it is true, instead of "Not tracked" or no row. `TokenRoster` shows "HP hidden" and "AC hidden". No HP bar is drawn, because `hpFraction` already returns null for null HP.

**9. The Table tab is rewritten around the four rules.**
`TableSection` in `SettingsMenu.tsx` gets a select and three switches, labelled as in the spec with no hint text, each sending its own command. It shows the server's refusal message, as it does today. The tab still appears only for the GM outside a preview.

**10. A new ADR, [0054 "Table rules"](../../../docs/adr/0057-table-rules.md), amends ADR 0049.** It records Decisions 1, 2, 4, 5 and 7, the information that still gets through (spec and proposal), and the reconciliation with the in-flight `auto-remove-defeated-tokens` change: its "Room setting" requirement is replaced by `table-rules`' "Remove tokens at 0 HP mode".

## Risks / Trade-offs

- [With hidden HP, a player can't tell an untracked token from one whose HP is hidden] → Accepted. Every non-owned token reads "Hidden" while the rule is on, which reveals nothing.
- [With hidden HP, a nuke's numbers show only on the player's own tokens] → Accepted, and written into the spec. The blast still plays, and per-token amounts would reveal which tokens track HP.
- [Toggling a rule resyncs every player at once] → Rule changes are rare, GM-initiated, and the same cost as turning line of sight on.
- [A stats event missed by the projection would leak HP or AC] → Snapshot and event paths share `statsForViewer`. Server integration tests check every HP path (set stats, damage applied, area effect, nuke, undo, ownership change), and the visibility-auditor reviews the diff.
- [Removing `room.setAutoRemoveDefeated` breaks a client still sending it] → The web client and tests are updated together. External MCP seats don't use it, since it's a GM-only command.

## Migration Plan

No data migration is needed. Older snapshots and logs lack the new fields and read through their defaults; `defeatRemovalOf` keeps their removal choice. Deploying is a normal release. Rolling back leaves rooms with `defeatRemoval` or hide flags in their logs, which an older server would refuse to parse. So hold the release until the ADR is approved, and do not roll back past it once a GM has changed a new rule.

## Open Questions

- Whether the Real-Time Architecture owner wants the removed `room.setAutoRemoveDefeated` kept as an accepted alias for one release. This affects only the `Command` union, not the behavior, and can be settled in ADR review.
