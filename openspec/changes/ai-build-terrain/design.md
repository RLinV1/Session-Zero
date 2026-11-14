# Design

## Context

See proposal.md. What already exists on `main`:

- **The builder (`mcp-game-builder`, ADR 0053):**
  - draft maps whose `setup` holds openings, lines and marks;
  - `BuildChoices { aiGrid, aiWalls }` on the build row;
  - a write guard checked under a per-build lock (`requireAiWalls`, `expectedUpdatedAt`);
  - `editedByUser` and published locks;
  - `planPublish`, which reads, and `publishBuild`, one transaction, which writes.
- **Native terrain (ADR 0046, `board-terrain-tool`):**
  - `TerrainRuns`, `compressTerrain` and `cellRect` in `packages/shared/src/terrain.ts`;
  - `LibraryMapBoard.terrain` and `EncounterTemplateData.terrain`;
  - `encounterTable` and the `MapSet` library-board path, which put Base terrain in a room;
  - the room's Blocked rule (`movementTerrain(...).blocked`);
  - the editor's `TerrainCells` drawing and `cellInMap` rule.

## Goals / Non-Goals

**Goals:** reuse the native terrain format, rules and drawing; keep the builder's existing permission, concurrency and review model; make a grid correction unable to move terrain silently.

**Non-Goals:** temporary effects, room commands or Undo, painting on the build page, localizing the builder pages (they are on `NOT_YET_LOCALIZED`), and the standalone `mcp-scene-preparation` service.

## Decisions

### 1. A separate choice, preserved by older clients

`aiTerrain` is a boolean column (`ai_terrain`, default false) beside `ai_grid` and `ai_walls`. `PUT /choices` parses `BuildChoicesChange`, which makes `aiTerrain` optional. When it is left out, the route keeps the stored value, so an older page that sends two booleans can't turn terrain off. The pass view's `allowed` gains `terrain`.

*Alternative:* a strict three-field body. Rejected: a page cached from before the deploy would silently turn terrain off.

### 2. Terrain is part of the map's setup, in the room's format

`DraftMapSetup` gains `terrain?: TerrainRun[]` and `terrainGrid?: { cellSize, offsetX, offsetY }`. Runs are the Base layer exactly as `LibraryMapBoard.terrain` stores them, so publishing copies them without converting. The server normalizes them with `compressTerrain(terrainCells(...))`, so the same squares always read the same.

*Alternative:* a square list, `{ column, row, kind }[]`, like marks. Rejected: it is a second convention, it is larger on the wire, and it would need converting at publish.

### 3. Authorization by the parts sent

The pass route reads the raw body's keys before it parses them. If `openings`, `lines` or `marks` is present, walls are needed; if `terrain` is present, terrain is needed. Any missing choice refuses the whole request with 403, and when the other part was allowed the message adds "Nothing was saved". If nothing is allowed at all, the old walls message is kept. The store write takes `requireAiWalls` and `requireAiTerrain` separately, and `assertChoicesAllow` checks both under the existing lock, in memory and in Postgres. On `BuildChoiceOffError`, the route reads the build again to name the choice that was turned off.

### 4. Each part is validated only when sent

`mapSetupProblems` (lines, openings, marks) runs only when wall parts are sent. `draftTerrainProblems` (grid, coverage) runs only when terrain is sent. A grid change can put old lines off the map, and that mustn't block a terrain save, or the reverse. The owner's route does the same: it validates walls only when they changed, so "Clear all terrain" always works.

### 5. Coverage by the editor's rule

`cellOverlapsMap(col, row, grid, map)` is the shared form of the editor's `cellInMap`: the square must overlap the map with positive area. `runOnMap` checks a run's two ends. This allows the cropped strips at column -1 and row -1 when the offset is above zero, and a last column running past the edge. It is a little stricter than `decide`'s run check, which accepts a zero-area end square inside a longer run, so anything accepted here is also accepted by the room and by library preparation. `get_map_setup` reports `terrainSquares` (the inclusive column and row range) so the AI doesn't need to work the edges out itself.

### 6. The grid terrain was proposed on

Lines are stored in grid corners and move with a correction by design (ADR 0053). Terrain doesn't move with the grid, for the same reason library preparation asks for an explicit terrain reset: a different square size means different ground. So each save of terrain records `terrainGrid` from the grid the map has at that moment (confirmed, or the AI's proposal). `draftTerrainState(setup, grid)` gives one of:

- `none`: there is no terrain;
- `noGrid`: there is no grid;
- `ready`: `sameTerrainGrid` holds, meaning no square edge under the terrain moves more than a quarter of a square. The drift is measured at the terrain's farthest squares, since half a pixel per square adds up, and offsets are compared without wrapping;
- `otherGrid`: anything else.

Only `ready` terrain is used to check tokens, drawn under encounter tokens, or published. `planPublish` also needs `gridStatus === "confirmed"`.

The "publish only what you looked at" rule (ADR 0053) is unchanged. The map item's `updatedAt` covers AI and owner edits. An agreed grid can change through detection without changing `updatedAt`, so `terrainGrid` is what stops a different grid being used.

### 7. The owner clears; the server keeps the grid

The owner's `PUT setup` keeps the stored terrain and `terrainGrid` when `terrain` is left out or sent back unchanged. The comparison ignores key order, because Postgres `jsonb` reorders keys. `[]` clears both. Any other terrain is 422. The page's `terrainGrid` is never stored. This is an owner edit, as all owner setup saves are.

### 8. Blocked footprints by the room's rule

`footprintOnBlocked(center, size, grid, runs)` is `movementTerrain(center, center, size, grid, runs).blocked`, the room's own destination rule (`destinationBlocked`). A token there could never move off. `checkBuild` reports it for draft maps with `ready` terrain. `draftEncounterToTemplate` refuses it for any board, including an already-published map's library terrain, through the existing per-token problem list. That makes the whole publish fail, with nothing written.

### 9. Drawing

- `mapOverlay` emits two SVG patterns, single hatching and crosshatching, and one rectangle per run clipped to the crop, under the grid lines, walls and labels. Its colours come from `MAP_PALETTE`'s `difficult` and `blocked` families. Blocked sits on a dark tint, so it doesn't read as a red wall line.
- The web review uses `TerrainCells` from `pages/mapEditor/TerrainSetup.tsx` as-is, drawn on the existing SVG over `<img>`, so the image file is never changed.
- Both pictures, and the encounter board, draw terrain only when it is `ready` for the grid shown. Stale terrain would otherwise sit in the wrong squares; the text notices say it is stale.

## Risks / Trade-offs

- **The AI's judgement of terrain.** The guidance asks the AI to be conservative, and the owner reviews everything. How accurately a real client does this is not yet qualified.
- **Body size.** The existing 64 KB JSON limits bound a save, at about 1,300 runs. This is documented rather than raised.
- **English-only owner text.** The new text follows the builder pages' current pattern, which lint exempts until those pages are migrated together.

## Migration Plan

`20261113180000_build_terrain_choice` adds `ai_terrain BOOLEAN NOT NULL DEFAULT false`. The draft data is JSON, so it needs no migration. Rolling back leaves an unused column.
