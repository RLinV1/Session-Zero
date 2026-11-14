# ADR 0070: Save a room's map to the library, and link it

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0004` (library assets), `docs/adr/0037` (prepared library boards), `docs/adr/0036` (shipped maps)
**Change:** `openspec/changes/change-and-edit-map` · **Requirements:** FR-GM-09, FR-GM-17

## Context

A GM prepares walls, fog and terrain at the table. Before this change, only the grid could go back to the library (`PATCH /api/library/:id`), and only for a map placed from the library. Export .uvtt was the only way to keep a room's walls, and it was a room route. A map uploaded straight into a room, or a built-in map, has no `MapImage.assetId`, so it had no library map to save to.

## Decision

- **The server builds the save.** `POST /api/rooms/:roomId/map/library` with `{ sceneId? }`:
  - **Access:** a GM room credential, the room owner's signed-in account, and `findRoomOwner(roomId) === ownerId`.
  - **What it reads:** `LiveRoom.captureScene` (live board, or the saved scene being prepared privately), inside the room FIFO, now including base terrain.
  - **What it writes:** grid, walls, fog and base terrain, written over the target library map with `replaceAssetPreparation`. This write is unconditional: it bumps the preparation version, so a library editor open elsewhere gets the existing conflict message. The browser sends no board data (invariant 7).
  - Extra terrain layers (`Terrain.effects`) are not saved.
- **The target.** If `map.assetId` names a map row the owner holds, and its URL is not a shipped map's, that row is overwritten. Otherwise, a new library map is created:
  - its image bytes are copied (from a room upload, a library object or a shipped file) to a fresh stored object;
  - it counts against the upload allowance;
  - it is named after the scene, or after the built-in map.
  
  The image is copied rather than shared, so deleting the library map never removes the room's image, and the copy of a built-in is not mistaken for the seeded shipped row (ADR 0036 matches by URL).
- **`scene.linkMap { expectedSceneId?, expectedMapUrl, expectedAssetId, assetId }` → `MapLinked { assetId, previous }`.** This is a board command, GM only:
  - `decide` rejects it when the board has no map, or when its scene, map URL or current link (`expectedAssetId`) is no longer what the route read. A scene switch or a second save in between can't link the wrong board or make a second copy;
  - `reduce` sets `scene.map.assetId`;
  - `previous` is the replaced id, or `null` (invariant 6);
  - a saved scene is linked by wrapping it in the existing `scene.prepare` envelope, which yields `ScenePrepared` (already GM-only).
  
  The route sends it only after creating the copy. If it is refused, the route deletes the copy.
- **Not undoable.** `MapLinked` is not reversible. Undoing it would only make the next save create a duplicate. The activity log reads "… saved the map to the library".
- **Visibility.** On the live board, `MapLinked` passes to players. `assetId` is already opaque on `MapImage` and is in their snapshots today (ADR 0004). Saved-scene links travel inside `ScenePrepared`, which is redacted.
- **Export moves to the library.** `GET /api/library/:id/export` (owner only) serializes the library map's image, saved grid and walls. `exportUvttScene` takes an image reader instead of a room id. The room route `GET /api/rooms/:id/uvtt/export` is removed.

## Consequences

- Additive schemas only. Old events and snapshots parse unchanged.
- **Rollback:** an older server can't parse a stored `MapLinked`. Roll back only before any room has linked a map, or roll forward. Library copies stay valid either way.
- A crash between creating the copy and linking it can leave an unlinked library map, which is visible in the library and deletable there.
- Undo treats the link as a change to the map, as it already does for any `assetId` change (`mapUndo.test.ts`, KAN-66). Once Save to library has linked a map, the map change before it can no longer be undone. Only the first save of an unlinked or built-in map links; saving a map that is already linked doesn't affect undo.
