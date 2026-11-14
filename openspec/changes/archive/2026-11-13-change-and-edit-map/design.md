# Design

## Context

- **`MapSection` in `apps/web/src/pages/GmPanel.tsx`** owns the whole editor. It has:
  - one `editorOpen` flag and one `step`;
  - two step lists, `STEPS` (Map, Grid, Walls, Fog, Sight, Terrain) and `FIXED_MAP_STEPS` (Grid, Fog for template-editing rooms);
  - `applyPrep()`, which ends with `setStep("walls")` after any successful apply, after calling `carry?.carried(placeIds)` for Select and place.
  
  The unsaved-changes prompt is driven by `pendingFor(from, to)`, `ask()` and the `pending` modal, which already asks when closing with a draft map, grid edits or unsaved walls and fog.
- **Room export.** `GET /api/rooms/:id/uvtt/export` (`apps/server/src/http/uvttRoutes.ts`) calls `room.captureScene()` and `exportUvttScene()` (`apps/server/src/uvtt/exportScene.ts`). Its only caller is the Map step's Export button. `LibraryMapEditor` has no export.
- **Library side.** The library already stores walls, fog and base terrain per map: `LibraryPreparation` / `LibraryMapBoard` (ADR 0037), with `saveAssetPreparation`, which checks a revision. The board-side `SaveGridToLibrary` writes only `{ grid }` through `PATCH /api/library/:id`.
- **Reading a room's board.** `LiveRoom.captureScene(actorId, sceneId?)` reads the live board or one saved scene inside the room's FIFO, filtered for the GM. It returns map, grid, walls, fog and `terrainRevision`, but not the terrain itself. `boardFromRoom()` (`domain/encounterTemplates.ts`) is the precedent for a library write built from room state, with an owner check.
- **Built-in maps.** In a room, a built-in map has a shipped URL and no `assetId` (builtin-library-assets). Account libraries also hold seeded rows with the same URL and an object key of the form `shipped:<slug>` (ADR 0036). `LibraryPage` sorts any map whose URL matches a shipped map under "Included with the app".

## Goals / Non-Goals

**Goals:**
- Two editor entry points sharing one editor component, with no second copy of the editor.
- Save to library is decided and assembled on the server from the room's state (invariant 7), never from a client payload.
- Linking a map to its new library copy goes through the command pipeline (invariant 1) and carries the replaced value (invariant 6).

**Non-Goals:**
- No change to how the library map editor saves, or to its revision check.
- No change to encounter templates. They keep their own copy of the walls.
- No export of a room's unsaved or live board. Export is library-only.
- Extra terrain layers (`Terrain.effects`) are not migrated, saved or removed.

## Decisions

### 1. One editor, a mode chosen at open
`MapSection` gains `mode: "change" | "edit"`, set by the button that opened the editor. The step list follows from it:

| Mode | Steps |
|---|---|
| `change` | `[map, grid]`, plus `walls` while a UVTT import's draft is open (its existing pre-Apply wall review) |
| `edit` | `[grid, walls, fog, sight, terrain]` |
| `edit` with a fixed map | `[grid, fog]` (today's `FIXED_MAP_STEPS`) |

Upload map and From library with no map open in `change`.

**Change mode closes after Apply.** When an apply succeeds in `change` mode, `applyPrep` closes the editor instead of calling `setStep("walls")`. This also applies when the apply came from the pending-save prompt or the token question; their `then` target no longer matters. On the self-close, focus goes to the board, so placement mode's keyboard control works straight away; it does not go back to the Change map button.

*Considered:* closing only when Select and place ticked at least one token. Rejected by the GM user decision ("always returns to the board"), and it keeps Change map's outcome predictable.

*Considered:* a separate lightweight dialog for Change map. Rejected, because the Grid step's alignment UI is the editor's, and duplicating it would split the draft and detection logic.

### 2. Save to library is one server route that reads the room
`POST /api/rooms/:roomId/map/library` with body `{ sceneId?: Id }`:
- `sceneId` is present only while preparing a scene privately.
- Guarded like other GM room routes, plus `requireAccountOwner`, plus `findRoomOwner(roomId) === gmId`.
- Steps:
  1. `captureScene(actorId, sceneId)`, extended to also return the base terrain (`terrain?.base`), read inside the FIFO.
  2. Resolve the target:
     - If `map.assetId` names a map row this GM owns, and its URL is not a shipped map's, that row is the target.
     - Otherwise create a new asset (§3).
  3. Write the board through a new store call, `replaceAssetPreparation(id, gmId, { grid, board })`. It writes unconditionally ("completely overwrite") and bumps the revision, so a library editor open elsewhere hits the existing conflict message on its next save.
  4. If a new asset was created, send `scene.linkMap` as the GM through the room's normal pipeline (§4). If the room refuses it because the map changed meanwhile, delete the new asset and its object, and answer 409.
- Response: the library asset's wire form plus `{ created: boolean }`.

*Considered:* reusing `PUT /api/library/:id/preparation` from the browser with the client's walls and fog. Rejected because:
- it trusts a client payload (invariant 7);
- it needs the current revision, which defeats "completely overwrite";
- it can't create and link.

### 3. Creating a library map copies the image bytes
The image is copied to a new stored object; the library row never shares the room's object key:
- **Room uploads** (`/uploads/<key>`): read with `assets.readPrivate` up to the upload byte limit.
- **Built-in maps:** read from `builtinImageDir` with `BUILTIN_MAP_FILES`, as `exportScene` already does.

Either way the bytes go to `assets.put` under a fresh key. Reasons for copying:
- Library delete removes its object, which would break the room's image if the object were shared.
- A copy of a built-in must get a non-shipped URL, or `LibraryPage` and `ensureShippedMaps` would treat it as the seeded built-in.

The row gets `grid` from the room, `detectionStatus: null` (the room's grid is explicit, so nothing is detected), and it counts toward `refuseIfFull(..., LIBRARY_UPLOAD_NEEDS)` plus the byte size. Its name is the scene's name for a saved or active scene, otherwise the room's name; for a built-in, it is the built-in's name.

### 4. `scene.linkMap` → `MapLinked` (new shared schema, [ADR 0070](../../../docs/adr/0070-save-map-to-library.md))
- **Command:** `{ type: "scene.linkMap", expectedSceneId?: Id, expectedMapUrl: string, expectedAssetId: Id | null, assetId: Id }`, a board command.
- **`decide`:**
  - GM only (`can.administer`);
  - rejects when the board has no map, or its scene, `map.url` or current link (`expectedAssetId`) differs from what the route read. A scene switch or a second save in between can't link the wrong board or leave two copies.
- **Event:** `{ type: "MapLinked", assetId: Id, previous: Id | null }`. `reduce` sets `scene.map.assetId`.
- **Saved scenes:** a scene being prepared privately is linked by sending `scene.prepare { sceneId, command: scene.linkMap }`, the existing envelope, which yields `ScenePrepared`. So `MapLinked` needs no `sceneId`.
- **Undo and log:** not reversible, so it isn't an undoable action. The GM's activity log reads "… saved the map to the library" (the log covers every event type).
- **Players:**
  - Live-board events reach them. `assetId` is already opaque on `MapImage` (ADR 0004), and the asset index picks the link up from state.
  - Saved-scene links travel in `ScenePrepared`, which is redacted.
- The server issues it only from the route in §2. A GM's own client could send it, but `decide` limits it to the GM and a matching map URL. The route checks the asset id for ownership; `decide` can't, because it is pure. A forged id links to nothing useful and leaks nothing.

*Considered:* a `sceneId` field on the command. Rejected, because `scene.prepare` already targets saved scenes with GM-only redaction.

*Considered:* putting `assetId` into a `scene.setMap` re-send. Rejected, because `MapSet` resets token policy and terrain context, and would show up in undo.

### 5. Unsaved-changes warning reuses the pending prompt
A new pending kind, `"library"`, with Save changes first / Save to library without them / Keep editing. "Unsaved" is the same condition `pendingFor(step, "close")` uses: grid dirty, walls/fog/sight/terrain draft. In Edit mode there is never a draft map. Save changes first runs the existing save for that kind, and calls the route only if it succeeds.

### 6. Export moves to the library
`GET /api/library/:id/export` (owner only, 404 otherwise) builds a `CapturedScene` from the asset: map image, saved grid, and walls from `LibraryMapBoard` with synthetic ids. It then calls `exportUvttScene`. `exportUvttScene` is refactored to take an image reader rather than a room id, so it can read a library object, a room upload or a built-in. `LibraryMapEditor` gets the button, disabled while it has unsaved changes or the map has no saved grid. The room route, `api.uvtt.export` and the Map step's button are removed.

### 7. Board-side Save grid to library is removed
`SaveGridToLibrary` and its i18n ids go away. `PATCH /api/library/:id` stays, because the library's own grid editor uses it.

## Risks / Trade-offs

- **[Risk] Mid-session fog is saved half-revealed** → This is the user's decision. The "Saved to library" line doesn't hide it, and the GM can re-fog in the library editor.
- **[Risk] Overwrite clobbers edits made in the library editor in another tab** → The library editor's existing revision check refuses its stale save with "This map changed. Reopen it…", so nothing is silently lost on that side.
- **[Risk] A new asset is created, then the link fails** (the map changed, or the room closed) → The route deletes the asset and its object before answering. A crash between steps can leave an unlinked library copy, which is visible and deletable in the library. That's acceptable.
- **[Risk] Copying large images** → Bounded by the existing upload byte limit and allowance, and done once per first save.
- **[Trade-off] `MapLinked` is not undoable** → Undoing it would only make the next save create a duplicate. The link is bookkeeping, not a board change.
- **[Risk] The Change map / Edit map split breaks the GM's habit and the guide tour targets (`data-tour="gm-grid"`)** → Update the guide steps and both catalogs in the same change.

## Migration Plan

- The new schemas are additive and optional. Old events and snapshots are unaffected.
- **Rollback:** an older server ignores nothing it can't parse, because `MapLinked` would fail to parse. So roll back only before any room has been linked, or roll forward. Unlinked library copies remain valid library maps.
- Archive `map-editor-sight-step` before this change, so the `map-editor` delta applies to its version of "Map setup opens as its own screen".
