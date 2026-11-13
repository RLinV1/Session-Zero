# Tasks

## 1. ADR and contract (`packages/shared`)

- [x] 1.1 Write `docs/adr/0068-carry-party-tokens.md` (partly reverses ADR 0045 "no automatic party transfer", extends ADR 0050; records decisions 1-4 of design.md) and verify it lists the schema additions and requests Real-Time Architecture owner review
- [x] 1.2 Add optional `staged: Record<Id, Token>` to `TableState`; include it in `tableOf`, `saveScene`, `sceneState`, `encounterTable`/`tableForPreset` and checkpoint tables; verify with a unit test that a table with staged tokens round-trips through each builder and that an old table without `staged` still parses
- [x] 1.3 Add optional `carryTokenIds` (max 60, unique) to `encounter.apply` and `scene.switch`, optional `carriedTokenIds` to `EncounterApplied` and `SceneSwitched`, the `token.placeStaged { origin, tokenIds?, expectedSceneId? }` command (`tokenIds` unique, max 60), and the `StagedTokensPlaced` / `StagedTokensRestaged` events; verify `npm run typecheck` passes and schema tests reject duplicate or excess ids

## 2. Decide and reduce (`packages/shared`)

- [x] 2.1 Implement the carry helper in `decide`: validate ids against live `tokens` + `staged`, remove carried tokens from the outgoing board's tokens, staged, initiative order (keeping `activeIndex` on the same token) and `tokenGroups`, replace same-id tokens on the incoming board, add carried tokens to incoming `staged`; verify unit tests (FR-GM-13, FR-GM-25) for forged id, player forbidden, active-token removal from initiative, same-id replacement, and stats/owners/hidden kept
- [x] 2.2 Use the helper in `encounter.apply` (with and without `keepMapSetup`) and `scene.switch`; verify unit tests: apply with carry, switch with carry, switch twice before placing, untick leaves a token behind, apply inside `scene.prepare` rejects `carryTokenIds`
- [x] 2.3 Implement `token.placeStaged` in `decide` per design decision 3 (only the named `tokenIds`, or all when absent; reject ids not in `staged`; larger tokens first, `spreadPositions` per token with growing `occupied` and wall `blocked`, reject an occupied/off-map origin or a party that does not fit with "Not enough space", stale scene with the existing rejection); verify unit tests for one click, a subset leaving the rest staged, an id on the map or unknown, crowded spot next to a wall, a 2x2 token, not enough space counting only the placed subset, player forbidden, nothing staged
- [x] 2.4 Reduce `StagedTokensPlaced` / `StagedTokensRestaged`, default `staged` to `{}` wherever `reduce` spreads a table (`SceneSwitched`, `SceneCreated`, `EncounterApplied`, `CheckpointRestored`); verify reducer unit tests including replay of old events unchanged
- [x] 2.5 Add the undo inverse (`StagedTokensPlaced` ↔ `StagedTokensRestaged`) and `undoConflict` for moved/removed placed tokens; verify undo unit tests including "undo apply refused after placement until placement is undone"
- [x] 2.6 Confirm staged ids are rejected by `token.move`, attack, target and area-effect commands and excluded from sight; verify unit tests for each

## 3. Visibility (`packages/shared`)

- [x] 3.1 `filterStateForViewer`: GM gets all `staged`; a player gets only owned, non-hidden staged tokens; verify unit tests (owner, non-owner, hidden owned, saved scenes still redacted)
- [x] 3.2 `filterEventForViewer`: `StagedTokensPlaced` / `StagedTokensRestaged` resync for players; verify unit tests and run the `visibility-auditor` agent on the diff

## 4. Server (`apps/server`)

- [x] 4.1 Pass `carryTokenIds` through the `encounter.apply` enrichment in `liveRoom.ts`; verify `npm run typecheck`
- [x] 4.2 Integration tests across the wire: GM switches carrying the party, players resync with only their own staged token; GM places with one click and both players see the tokens; forged ids and player `token.placeStaged` rejected; reconnect while staged keeps the tray; Postgres store round-trips `staged`; verify `npm test --workspace=@vtt/server`
- [x] 4.3 Confirm template save/replace ignores staged tokens; verify an integration test that saves a room with staged tokens and gets none in the template

## 5. MCP (`apps/mcp`)

- [x] 5.1 Ensure snapshot parsing accepts `staged` and that a seat's move on a staged token surfaces the ordinary rejection; verify the MCP test suite passes

## 6. Web (`apps/web`)

- [x] 6.1 Build the carry checklist component (default: owned + staged) and add it to the Encounter panel apply confirmation and the scene switch confirmation; header quick-switch sends the default selection; verify by component test and in the running app
- [x] 6.2 Add GM placement mode in `board/` for a given set of staged ids (ghost cluster under the pointer, placement bar, Esc to leave, keyboard square choice and Enter, "Not enough space" shown on rejection) sending `token.placeStaged` with those `tokenIds` through `RoomConnection.command`; start it automatically only after this client's own transition command, never from a snapshot; verify in the running app with two browsers, including that a reload does not start it
- [x] 6.3 Add the GM "Waiting to be placed" list (names, owners, hidden marker, ticks defaulting on, Place selected disabled with nothing ticked, gone when nothing is staged) that hands the ticked ids to placement mode; verify by component test and in the running app by splitting the party across two clicks and by placing after a reload
- [x] 6.4 Add the player waiting tray for owned staged tokens; verify in the running app as a player
- [x] 6.5 Add all strings to the English and zh-TW catalogs per `docs/GLOSSARY-zh-TW.md`; activity log entries for carried and placed tokens; verify `npm run lint` passes (no literal text)

## 7. Wrap-up

- [x] 7.1 Run `npm run lint && npm run typecheck && npm test` and the `sync-reviewer` agent on the full diff; verify all pass with no findings left open

## 8. Select and place on a new map

- [x] 8.1 Add `placeTokenIds` to `scene.setMap` and `scene.importUVTT`, `TokenDeleted.reason: "mapReplaced"`, and emit `MapSet` + `StagedTokensRestaged` + `TokenDeleted` in `decide`; verify unit tests for keep/remove, nothing ticked, waiting tokens untouched, forged id, player forbidden, UVTT import
- [x] 8.2 Make `StagedTokensRestaged` and `mapReplaced` deletions reversible, with conflict checks and undo labels; take staged tokens out of the turn order; verify undo restores map and every token, and is refused after placement
- [x] 8.3 Add Select and place to the "Tokens already on the table" dialog with the player-first checklist, start placement after apply, hide it outside a live table; verify component tests in `uvttEditor.test.tsx` and `mapTokenPolicy.test.ts`
- [x] 8.4 Integration test over the wire: staging, removal, per-player visibility and undo; verify `npm test --workspace=@vtt/server`
