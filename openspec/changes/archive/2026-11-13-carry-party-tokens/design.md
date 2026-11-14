# Design

## Context

- `encounter.apply` builds the applied board from the template with fresh token ids and no owners (`encounterTable`, `encounters.ts`), and `EncounterApplied` carries `applied` and `previous` whole `TableState`s. `reduce` spreads `applied` over the room; undo swaps the two; players get `{ kind: "resync" }`.
- `scene.switch` emits `SceneSwitched { previous: SavedScene, restored: SavedScene }`, where `SavedScene` is `{ table: TableState, groups, tokenGroups, boardEpoch?, terrainRevision? }`. `reduce` stores `previous` under `fromId` and spreads `restored`; players resync. Scene switches already invalidate board undo (ADR 0045).
- `scene.copyCurrent` copies token ids into another scene, so two scenes can hold the same token id (ADR 0045 guards `roll.applyDamage` with `DiceRoll.sceneId` for this reason).
- `spreadPositions` (`geometry.ts`) already places N same-size tokens around an origin, ring by ring, avoiding overlaps, the map edge and (via `blocked`) walls; `token.duplicate` uses it in `decide`.
- `isTokenHidden` withholds hidden tokens from every player, owners included.

## Goals / Non-Goals

**Goals:**
- Carry and staging ride on the two existing transition events, so `reduce`, undo and the player resync stay as they are.
- Staged tokens are invisible to every rule that reads `tokens` without each rule having to opt out.
- Positions are computed in `decide`, deterministically.

**Non-Goals:**
- Carrying into a private scene preparation, or between two inactive scenes.
- Keeping the same token in sync across scenes (it exists in one place at a time).
- Template "player slots" or saved spawn points; the GM clicks.
- Carrying on checkpoint restore.

## Decisions

### 1. Staged tokens live in their own map, `TableState.staged?: Record<Id, Token>`
Alternatives: a `staged: true` flag on `Token`, or temporary hidden positions. A flag would make every reader of `tokens` (sight, initiative, attacks, rulers, no-stacking, area effects, defeated-token removal, MCP) filter it, and any missed reader would leak sight or allow targeting. Hidden-until-placed would hide the token from its own owner and overload `hidden`. A separate map is skipped by default; only the tray, the checklist and placement read it. `tableOf`, `saveScene`, checkpoints and both transition events carry it because they carry `TableState`. Optional, so old tables read as none; `reduce` sets `staged: table.staged ?? {}` in the same places it defaults `walls` and `drawings`.

A staged token keeps its last `position` (the field is required); it is meaningless while staged and is the `from` value placement replaces (invariant 6).

### 2. `carryTokenIds` on the commands; no new transition events
`encounter.apply` and `scene.switch` gain `carryTokenIds?: Id[]` (max 60, unique). `decide`:
1. Rejects unless every id is in `state.tokens` or `state.staged`.
2. Builds the outgoing board without the carried tokens: removes them from `tokens`/`staged`, from `initiative.order` (keeping `activeIndex` on the same remaining token, or ending the order when it empties), and from `tokenGroups`.
3. Builds the incoming board (template table or `savedScenes[sceneId]`), deletes any same-id token from its `tokens` and `staged` and its `tokenGroups`/initiative, then adds the carried tokens to `staged`.
4. Emits the existing event with these two boards as `previous`/`applied` (or `previous`/`restored`). `SceneSwitched` also records what the carry overwrote: `replacedTokens` (destination tokens with a carried id) and `previousInitiative` (the live order before the carry), each only when changed (invariant 6). When the active token was last in the order, the turn wraps to the top of the next round.

Because the events already hold whole boards, `reduce` and the `EncounterApplied` undo inverse need no logic changes, and replay of old events is unchanged. Alternative considered: a separate `TokensCarried` event alongside the switch. It would need its own undo and visibility handling, and two events must then stay atomic; folding into the board snapshots avoids both.

The events gain an optional `carriedTokenIds` purely so the activity log can say "carried 2 tokens"; `reduce` ignores it, and the GM-only events never reach players.

### 3. `token.placeStaged { origin, tokenIds?, expectedSceneId? }` → `StagedTokensPlaced`
GM only. Places the staged tokens named in `tokenIds` (unique, each must be in `staged`, otherwise rejected), or every staged token when it is absent; the client always sends the ticked ids, and absent exists for MCP and tests. Order: larger tokens first, then the staged map's insertion order, so big footprints get the near squares. For each token, `decide` calls `spreadPositions(origin, size, 1, grid, map, occupied, blockedByWall, false)` with `occupied` growing as tokens are placed; the first token goes on `origin` snapped as `token.create` snaps. It rejects with "Not enough space" (a new catalog id, ADR 0054) when `origin` overlaps a token or is off the map, or when any token finds no spot within the search budget; nothing is placed. A stale `expectedSceneId` gets the existing stale-scene rejection. `StagedTokensPlaced { placements: { tokenId, from, to }[] }` moves those tokens from `staged` to `tokens`.

Undo: the inverse is a second event type, `StagedTokensRestaged { placements }`, which moves them back with `from` restored. `undoConflict` refuses if any placed token was moved, removed, or has joined the turn order since.

Staged tokens, live and in saved scenes, count in `referencedAssetIds`, so the library warns before deleting their art.

### 4. Visibility
- `filterStateForViewer`: GM gets `staged` whole; a player gets only staged tokens they own and that are not hidden; others are dropped.
- `filterEventForViewer`: `StagedTokensPlaced` and `StagedTokensRestaged` → `resync` for players (non-owners never had the token entity, so a position delta is not enough; this happens once per transition). The transition events already resync.
- `token.move`, attack, target and area-effect commands look tokens up in `state.tokens`, so staged ids already miss with `not_found`; tests cover this explicitly.

### 5. Client
- Checklist component shared by the Encounter panel's apply confirmation and the scene switch confirmation; default = tokens with `ownerIds.length > 0` plus all staged. The header quick-switcher, which switches without a dialog (ADR 0045), sends the default selection.
- Placement mode lives in `board/`: it shows a ghost cluster of the tokens being placed under the pointer and a placement bar ("Place 2 carried tokens", Esc). Keyboard placement reuses the token-placement focus behaviour. The ghost cluster is a local preview only; the server's positions are authoritative.
- Placement mode starts automatically only when the GM's own client sent the transition command and its result leaves tokens staged; it is never started from a snapshot, so reloads and reconnects do not start it. The trigger is local UI state, not room state.
- "Waiting to be placed" list: a React panel in the board's corner, shown to the GM while `staged` is non-empty. It derives rows from the filtered state (name, owners' display names, hidden marker) and keeps the tick selection locally, defaulting new staged ids to ticked and dropping ids that leave `staged`. Place selected hands the ticked ids to the board's placement mode through the existing board-controller boundary (React never touches Pixi objects).
- Player tray: a small panel listing the viewer's staged tokens with "Waiting for the GM to place you".
- All strings via `t()`, English and zh-TW, terms per `docs/GLOSSARY-zh-TW.md`.

### 6a. Select and place on a new map
`scene.setMap`/`scene.importUVTT` take `placeTokenIds` instead of a `tokenPolicy`. `decide` adjusts no tokens (none stay on the map), then appends `StagedTokensRestaged` (from = to = the token's position) and `TokenDeleted { reason: "mapReplaced" }` after the `MapSet`. Reusing the placement-undo event keeps the event set small; making it and `mapReplaced` reversible makes the whole map change one undoable action. `withInitiativeExits` treats staging like deletion for the turn order. `MapSet` comes first so the undo entry reads as the map change. Alternative considered: a policy value `"place"` in `MAP_TOKEN_POLICIES`; rejected because it would also need the ids and would change `adjustMapTokens`' contract.

### 6. Template saves ignore staged tokens
Saving or replacing an encounter template reads `tokens` only, so staged tokens are not saved. This matches "owners are not saved": staged tokens are almost always the party.

## Risks / Trade-offs

- [A reader of `TableState` copies tables field by field and drops `staged`] → grep every `tableOf`-like builder (`sceneState`, `encounterTable`, `tableForPreset`, checkpoint save/restore, Postgres snapshot) and add a round-trip test per path.
- [Removing tokens from the outgoing initiative order shifts turns] → keep `activeIndex` on the same token; unit tests for carrying the active token and the last token.
- [Undoing an apply after the carried tokens were placed] → the apply's undo restores the whole previous board; `undoConflict` already refuses when the board changed after the apply, so placement after an apply blocks that undo until placement is undone first. Acceptable and consistent with existing apply undo.
- [Quick-switch carries tokens without asking] → it carries only the default (owned + staged), which is what the GM wants almost every time; the full confirmation remains for exceptions.
- [MCP AI seats see a new field] → zod parse in `apps/mcp` accepts the optional field; an AI move on a staged token gets the ordinary `not_found`.
- [Partial reversal of ADR 0045] → ADR 0068 records exactly which sentence changes and why; Real-Time Architecture owner review before merge.

## Migration Plan

No data migration. All schema additions are optional: old events, snapshots and saved scenes parse unchanged and behave as "nothing staged". Rollback: a server without the feature would strip the unknown `staged` field when it parses a stored table, so any token still staged at rollback time would be lost. Before rolling back, the GM places staged tokens; the rest of the feature leaves only ordinary tokens behind.

## Open Questions

- Should the activity log name each carried token, or only the count? (Copy only; no spec or task change.)
