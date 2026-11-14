# ADR 0068: Carry tokens across template applies and scene switches

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Partly reverses:** `docs/adr/0045-persistent-room-scenes.md` ("no automatic party transfer") · **Extends:** `docs/adr/0024` (encounter templates), `docs/adr/0050-encounter-keep-map-setup.md`
**Change:** `openspec/changes/carry-party-tokens` · **Requirements:** FR-GM-13, FR-GM-25

## Context

`encounter.apply` replaces every token with the template's, with fresh ids and no owners. `scene.switch` leaves each scene's tokens in that scene, and ADR 0045 said: "Tokens stay in their own scene … There is no automatic party transfer or cross-scene stat propagation." In play the GM recreates the party's tokens after every encounter or scene change, re-entering owners, HP, conditions and attacks.

## Decision

This ADR replaces the ADR 0045 sentence quoted above with: tokens stay in their own scene unless the GM carries them. A carried token moves; it is never in two scenes at once, and there is still no cross-scene stat propagation.

- **`TableState.staged?: Record<Id, Token>`.** Carried tokens wait here, with no place on the map, until the GM places them. A separate map, not a flag on `Token`, so every rule that reads `tokens` (sight, initiative, attacks, rulers, no-stacking, area effects, defeated-token removal, MCP seats) skips staged tokens without opting out. A staged token keeps its last `position`, which is meaningless while staged and is the value placement replaces (invariant 6). `reduce` defaults it to `{}` wherever it spreads a table. Saved scenes and checkpoints carry it because they carry `TableState`.
- **`carryTokenIds?: Id[]`** (max 60, unique) on `encounter.apply` and `scene.switch`. `decide` rejects an id that is not in the live `tokens` or `staged`. It builds the outgoing board without the carried tokens (also removing them from the initiative order, keeping the turn on the same remaining token or, when the active token was last, starting the next round, and from `tokenGroups`), and the incoming board with any token of the same id removed (ids repeat across scenes after `scene.copyCurrent`) and the carried tokens added to `staged`. It emits the existing `EncounterApplied` or `SceneSwitched` with those two boards. `reduce`, undo and the player resync are unchanged.
- **`carriedTokenIds?: Id[]`** on `EncounterApplied` and `SceneSwitched`, for the activity log only. `reduce` ignores it.
- **What a carry overwrites (invariant 6).** `SceneSwitched` also gains optional `replacedTokens?: Token[]` (the destination's own tokens with a carried id, which the carried ones replaced) and `previousInitiative?: Initiative | null` (the live turn order before the carried tokens left it). Each is present only when the carry changed it. `reduce` reads neither. `EncounterApplied` needs neither: its `previous` is the whole live board.
- **`token.placeStaged { origin, tokenIds?, expectedSceneId? }` → `StagedTokensPlaced { placements: { tokenId, from, to }[] }`.** GM only. Places the named staged tokens, or all of them, larger first, the first on `origin` snapped as a new token is, the rest by `spreadPositions` with no overlap, on the map, and not crossing a wall. All or nothing: an occupied or off-map origin, or a token with no spot, is refused with "Not enough space". Its undo inverse is **`StagedTokensRestaged { placements }`**, which moves the tokens back to `staged`. Undo is refused once a placed token has moved, gone, or joined the turn order, since a staged token takes no turn.
- **Select and place on a new map.** `scene.setMap` and `scene.importUVTT` gain optional `placeTokenIds?: Id[]`, a fourth answer to "Tokens already on the table" beside the ADR 0042 policies. `decide` emits the `MapSet` with no token adjustments, then `StagedTokensRestaged` sending the named tokens to wait where they stood, then `TokenDeleted { reason: "mapReplaced" }` for every other token on the map (an id not on the map is rejected). Tokens already waiting are untouched. All are one action: `StagedTokensRestaged` (inverse `StagedTokensPlaced`) and `mapReplaced` deletions are reversible, so undo restores the old map and every token. Tokens that leave the map this way also leave the turn order, as deleted tokens do (ADR 0065). The option is offered only at a live table, not in private scene preparation or template-editing rooms.
- **Asset references.** Staged tokens, live and in saved scenes, count toward the room's library asset index (ADR 0004), so their art can't be deleted while they wait.
- **Visibility.** `filterStateForViewer` gives the GM all of `staged` and a player only the staged tokens they own that are not hidden. Both new events resync players: non-owners never had the token, so a position delta is not enough. The transition events already resync.
- **Not offered** inside `scene.prepare` (a private scene's apply never takes tokens from the live board) or in temporary template-editing rooms. Saving an encounter template ignores staged tokens.

## Consequences

- All schema changes are additive and optional. Old events, snapshots and saved scenes parse as "nothing staged" and replay unchanged.
- Undoing a template apply after its carried tokens were placed is refused by the existing undo-conflict check until the placement is undone.
- Rolling back would drop the unknown `staged` field when a stored table is parsed, losing tokens still staged at that moment. Place staged tokens before rolling back, or roll forward.
