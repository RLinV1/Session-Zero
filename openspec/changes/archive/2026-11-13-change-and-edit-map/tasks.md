# Tasks

## 1. Prerequisite and ADR

- [x] 1.1 Confirm `map-editor-sight-step` is archived, so `openspec/specs/map-editor/spec.md` describes the single Edit map control. If it isn't, archive it first, then run `openspec validate change-and-edit-map` and check that it passes.
- [x] 1.2 Write `docs/adr/0070-save-map-to-library.md`, covering:
  - the `scene.linkMap` command and `MapLinked` event (fields, GM-only, live board or saved scene, `expectedMapUrl`, not undoable, player filtering);
  - the server-built Save to library;
  - the image copy for unlinked and built-in maps;
  - the move of export to the library.

  Mark it as needing Real-Time Architecture owner review. Verify the file exists and is linked from the change's design.

## 2. Shared contract (`packages/shared`)

- [x] 2.1 Add `scene.linkMap { expectedMapUrl, assetId }` to `Command` (allowed inside `scene.prepare`) and `MapLinked { assetId, previous }` to `DomainEvent`. Verify `npm run typecheck` passes.
- [x] 2.2 Handle `scene.linkMap` in `decide`, checking these in order:
  - authorization (GM only);
  - that the board has a map and its `map.url` equals `expectedMapUrl`;
  - that it also works inside `scene.prepare` for a saved scene;

  then emit `MapLinked` with the previous `assetId`, without recording an undoable action. Verify with unit tests in `packages/shared/test` (`describe("scene.linkMap (FR-GM-17)")`): GM succeeds, player is forbidden, a mismatched URL or missing map is rejected, `scene.prepare` links a saved scene, and nothing is added to undo.
- [x] 2.3 Handle `MapLinked` in `reduce`. Verify with reducer tests that only `scene.map.assetId` changes and that replaying the event is deterministic.
- [x] 2.4 Update `filterEventForViewer` so players receive the live-board `MapLinked` (saved-scene links stay inside redacted `ScenePrepared`). Verify with visibility tests in `packages/shared/test`.

## 3. Server (`apps/server`)

- [x] 3.1 Extend `LiveRoom.captureScene` to also return the base terrain (`terrain?.base`). Verify existing UVTT export and preparation tests still pass, plus a new assertion that the terrain is returned for the live board and for a saved scene.
- [x] 3.2 Add `replaceAssetPreparation(id, ownerGmId, { grid, board })` to the library store interface, the memory store and the Postgres store. It writes unconditionally and bumps the revision. Verify in `libraryStore.test.ts`:
  - fields missing from the new board are removed;
  - a later `saveAssetPreparation` with the old revision gets the conflict error;
  - another owner's id returns null.
- [x] 3.3 Add an image-copy helper that reads a room upload (`assets.readPrivate`) or a built-in file (`builtinImageDir` + `BUILTIN_MAP_FILES`) and stores it under a fresh key with `assets.put`. Verify with a unit test that the new URL differs from the source, and from any shipped URL.
- [x] 3.4 Add `POST /api/rooms/:roomId/map/library` (`{ sceneId? }`), following design §2–§3:
  - guards: GM seat, account owner, room owner;
  - capture the board, resolve the target, overwrite or create;
  - on create: allowance check, then link through `scene.linkMap` sent as the GM, deleting the new asset and object if the link is refused;
  - respond with `{ asset, created }`.

  Verify with integration tests in `apps/server/test` (`describe("save room map to library (FR-GM-17)")`):
  - overwrite replaces grid, walls, fog and terrain exactly;
  - a direct upload creates a named copy and links it, and a second save overwrites it;
  - a built-in creates a non-shipped copy;
  - a scene being prepared privately saves that scene and links it;
  - a full allowance creates nothing;
  - player, other GM and guest are refused;
  - the map changing between capture and link leaves no orphan asset;
  - a player's snapshot is unchanged apart from the opaque link.
- [x] 3.5 Refactor `exportUvttScene` to take an image reader instead of a room id, and add `GET /api/library/:id/export` (owner only; 404 for others or for a map with no saved grid). Verify with `uvttExport.test.ts` cases for a library map with walls and portals (including the `X-UVTT-Warnings` header), a non-owner, and a map with no grid.
- [x] 3.6 Remove the room route `GET /api/rooms/:id/uvtt/export`. Verify that the room-export cases in `uvttExport.test.ts` move to the library route and that a request to the old path returns 404.

## 4. Web: Change map and Edit map (`apps/web`)

- [x] 4.1 In `MapSection`, add the `change | edit` mode with its step lists. Battle map shows Change map and Edit map, or Edit map alone for a fixed map. Upload map and From library with no map open in `change`. Add i18n ids for "Change map" (en and zh-TW, with the term added to `docs/GLOSSARY-zh-TW.md`). Verify with `mapEditorStepSwitch.test.tsx`:
  - Change map shows only Map and Grid tabs;
  - Edit map shows Grid, Walls, Fog, Sight and Terrain and opens on Grid;
  - a template-editing room shows only Edit map with Grid and Fog.
- [x] 4.2 In change mode, close the editor after any successful apply, including from the pending-save prompt and the token question, and move focus to the board. Verify with:
  - `carryTokens.test.tsx`: Select and place ends with the editor closed and the board in placement mode, and one click places the ticked tokens;
  - a Scale to fit case: the editor closes;
  - a failed apply: the editor stays on Grid with an error;
  - cancelling the token question: the editor stays open with the draft.
- [x] 4.3 Drop the "draft map before Walls" path from `pendingFor` for edit mode, and keep the close-with-draft prompt in change mode. Verify with the updated `mapEditorStepSwitch.test.tsx` scenarios from the `map-editor` delta.
- [x] 4.4 Remove the Map step's Export button, its guide step (`EditorGuide` / `ui/guide.ts`) and `api.uvtt.export`. Update the guide/tour targets for the two buttons. Verify `mapEditorGuide.test.tsx` passes and no step offers Export.
- [x] 4.5 Update the existing tests that open the editor via the old Edit map path (`mapEditorWalls`, `mapEditorFog`, `uvttEditor`, `libraryUvtt`, `sightStep`, `encounterEditMode`, `mapEditorHarness`) to use Change map or Edit map as appropriate. Verify `npm test --workspace=@vtt/web` passes.

## 5. Web: Save to library

- [x] 5.1 Add `api.rooms.saveMapToLibrary(roomId, token, { sceneId? })`, with a zod-parsed response. Verify with a typecheck and a fetch-mock unit test.
- [x] 5.2 Add the Save to library button to the Edit map header on every step. Show it only with a library (`hasLibrary`), not for a fixed map, and never to players. Pass the scene id while preparing a scene privately. Show "Saved to library", or the server's reason, in the header. Add i18n ids (en and zh-TW). Verify with a component test that the button is present on each Edit map step, and absent in Change map, in a template room and without a library.
- [x] 5.3 Add the `"library"` pending kind: Save changes first / Save to library without them / Keep editing, using the same unsaved condition as closing. Verify with component tests:
  - an unsaved wall warns;
  - Save changes first saves the wall and then calls the route;
  - a failed wall save doesn't call the route;
  - "without them" calls the route and keeps the wall unsaved;
  - Keep editing calls nothing.
- [x] 5.4 Remove `SaveGridToLibrary` from the board grid form, along with its i18n ids. Verify no reference to `gmMap.saveGridToLibrary` remains (lint's catalog check passes) and the board grid tests pass.

## 6. Web: library export

- [x] 6.1 Add Export .uvtt to `LibraryMapEditor`, using `api.library.export(id)`, with the portal note. Disable it, with the reason shown, while the editor has unsaved changes or the map has no saved grid. Add i18n ids. Verify with `libraryMapDraft.test.tsx` cases: the button downloads, and is disabled with unsaved changes and with no grid.

## 7. Wrap-up

- [x] 7.1 Check end to end in the running app (`npm run dev`):
  - Change map → library map → Select and place lands on the board in placement mode;
  - Edit map → walls → Save to library;
  - the dashboard library map editor → Export .uvtt contains the walls.
- [x] 7.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass. Run the sync-reviewer and visibility-auditor agents on the diff and address their findings.
