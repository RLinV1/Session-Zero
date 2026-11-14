# Proposal

## Why

The GM's single Edit map button mixes two jobs: replacing the map, and preparing the current one. After Apply map, the editor stays open and jumps to the Walls step (`GmPanel.tsx:505`). When the GM chose Select and place, the board has already entered placement mode, but behind a full-screen editor. So the GM has to notice that and close the editor before they can drop the party.

Separately, walls, fog and terrain prepared at the table can't be saved back to the library. Only the grid can, and only for a map that came from the library. Export .uvtt is the only way to keep a room's walls. It sits in the room editor, while the dashboard's library map editor, where maps are kept, has no export.

## What Changes

- **BREAKING (UI):** Manage › Battle map replaces Edit map with two controls:
  - **Change map**: the full-screen editor limited to its Map and Grid steps. Apply map, and the "Tokens already on the table" choice when tokens are on the map, always close the editor and return the GM to the board. With Select and place, placement mode is usable straight away.
  - **Edit map**: the editor on the current map with Grid, Walls, Fog, Sight and Terrain. It opens on Grid and has no Map step.
- A **Save to library** button in the Edit map header, on every step. The server reads the room's current board and completely overwrites the library map the room's map came from: grid, walls (with doors, windows and portals), fog exactly as it is now, and base terrain.
- When the room's map has no library map the GM can overwrite (it was uploaded straight into the room, or it is a built-in example map), Save to library creates a new library map from the room's image. It then links the room's map to it, so the next save overwrites that copy. Linking is a new GM-only command, `scene.linkMap`, with a new event, `MapLinked`. Both are new shared schemas and need an ADR.
- Pressing Save to library with unsaved editor changes warns the GM first, with three choices: Save changes first, Save to library without them, or Keep editing.
- **BREAKING (UI):** The room editor no longer offers Export .uvtt. The dashboard's library map editor gains Export .uvtt, which builds the file from the library map's image, grid and saved walls.
- **BREAKING (UI):** The board-side "Save grid to library" button is removed; Save to library covers it.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `map-editor`:
  - Battle map offers Change map and Edit map instead of one Edit map control.
  - Change map's steps, and closing the editor after Apply.
  - Edit map's steps, and Save to library in its header.
  - The unsaved-changes prompt no longer needs a "draft map before Walls" case.
  - No Export in the room editor.
- `asset-library`:
  - "Save grid to library" is replaced by "Save a room's map to the library": full overwrite, new copy plus link for unlinked maps, unsaved-changes warning.
  - New: export a library map as UVTT from the library map editor.
- `builtin-library-assets`: a room on a built-in map offers Save to library, which saves a copy, instead of offering no save control.

## Impact

- **Shared contract** (`packages/shared`):
  - new `scene.linkMap` command and `MapLinked` event, handled in `decide`/`reduce` for the live board and for a GM-only saved scene;
  - new ADR (0070) for these schemas.
- **Server** (`apps/server`):
  - a GM-only, account-only route that reads the room's or saved scene's board, writes the library map's preparation, or creates a new library asset by copying the room's image object;
  - a library UVTT export route that reuses `exportUvttScene`;
  - the room UVTT export route goes away;
  - upload allowance checks apply to the new copy.
- **Web** (`apps/web`):
  - `GmPanel.tsx` `MapSection`: two entry points, step sets, closing after apply, header button, warning prompt; removes `SaveGridToLibrary` and room export;
  - `mapEditor/LibraryMapEditor.tsx`: export button;
  - `api.ts`;
  - i18n catalogs (en, zh-TW) and `docs/GLOSSARY-zh-TW.md` terms;
  - guide steps (`ui/guide.ts`, `EditorGuide`) that point at the Map step's Export, or at Edit map.
- **Tests:** web tests that open the editor via Edit map (`mapEditorStepSwitch`, `mapEditorWalls`, `uvttEditor`, `libraryUvtt`, `sightStep`, `encounterEditMode`), carry/placement tests, server integration tests for save and link, and shared unit tests for the command.
- **Ordering:** builds on the `map-editor` requirement "Map setup opens as its own screen" as written in the unarchived `map-editor-sight-step` change. That change should be archived first.
