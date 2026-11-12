# Proposal

## Why

The GM has one shared table setting (Remove tokens at 0 HP, ADR 0049), and it is all or nothing. GMs also want to control how much players can see: keep the map dark until a player has a token, and keep other tokens' HP and AC private. Today every player receives every visible token's full `stats`, and a player with no token sees the map dimmed rather than hidden.

## What Changes

The Settings dialog's GM-only **Table** tab shows these rules, labelled exactly:

```
Remove tokens at 0 HP:   (All | Only NPC tokens | Off)
Hide map from players without a token   [ ]
Hide HP from Players                    [ ]
Hide AC from Players                    [ ]
```

There is no hint text. Every rule is shared by the whole table and decided on the server.

- **Remove tokens at 0 HP** becomes three-way. **Only NPC tokens** removes only tokens with no owner (`ownerIds` empty). Existing rooms keep their choice: `true` reads as All, `false` as Off. Old `AutoRemoveDefeatedSet` events still replay.
- **Hide map from players without a token.** While a player owns no visible token on the active scene, their board shows the map fully dark, and the server withholds every other token, template and portal from them, using the line-of-sight concealment that already exists. This applies whether or not line of sight is on. A hidden owned token does not count. The map image itself is only covered on the board, not withheld from the payload. Once the GM assigns a token, the player's view opens up through the existing resync.
- **Hide HP from Players.** Players receive `hp` and `maxHp` as `null` for every token they don't own, in snapshots and in events, so no HP bar or number is drawn. Owners still see their own tokens' HP.
- **Hide AC from Players.** The same for `ac`, as a separate toggle.
- Changing any rule resyncs every player, since what they are allowed to see changes.
- Players' boards say HP and AC are hidden on tokens where a rule hides them, instead of reading as "Not tracked".
- **BREAKING (schema):** each rule has its own GM-only command and event, like the existing room settings. Each event records the value it replaced. `room.setAutoRemoveDefeated` is replaced by the three-way rule; its `AutoRemoveDefeatedSet` event stays readable so old history replays. This needs an ADR (amending ADR 0049) and review by the Real-Time Architecture owner.

What still gets through, by design: hit/miss rulings narrow an AC down, damage numbers show how much damage landed, and auto-removal shows when a token reached 0. With HP hidden, a map nuke's numbers show only on the viewer's own tokens, since the board can't tell which other tokens track HP.

## Capabilities

### New Capabilities
- `table-rules`: the GM's shared table rules in the Settings Table tab: the 0 HP removal mode, hiding the map from players without a token, and hiding HP and AC from players, including what each viewer receives under each rule.

### Modified Capabilities
<!-- The 0 HP removal requirements are in the in-flight `auto-remove-defeated-tokens` change, not yet synced to openspec/specs. Its "Room setting" requirement is superseded here; reconcile it when both are archived. -->

## Impact

- `packages/shared`: state (new optional fields beside the `autoRemoveDefeated` boolean, which older snapshots still read), commands, events, `decide` (GM-only authorization; `withDefeats` honours Only NPC tokens), `reduce`, `activityLog`.
- `packages/shared/src/sight.ts` (`viewerSight`) and `visibility.ts` (`filterStateForViewer`, `filterEventForViewer`, `tokenForViewer`): empty sight for players without a token, HP and AC stripping in snapshots and in the token-carrying events (`TokenStatsSet` with `previous`, `TokenDeleted`, creations), resync on a rule change.
- `apps/web/src/board/sightMask.ts`, `boardView.ts`: full darkness instead of `DIMMED_ALPHA` when the map is hidden by this rule.
- `apps/web/src/ui/SettingsMenu.tsx`: the Table tab's four controls.
- `apps/web/src/board/TokenCard.tsx`, `panels/TokenRoster.tsx`: "Hidden" instead of "Not tracked" or nothing where a rule hides a stat.
- `docs/adr/`: a new ADR for table rules.
- Tests: shared unit tests for decide, reduce and both filters; server integration tests showing a player never receives hidden HP or AC and gets full darkness/withheld tokens before being assigned one. Run the visibility-auditor and sync-reviewer.
