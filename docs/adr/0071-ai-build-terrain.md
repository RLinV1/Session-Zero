# ADR 0071: The AI game builder proposes permanent terrain

**Status:** Proposed. Needs review by the Real-Time Architecture owner; not yet reviewed. Implemented locally ahead of that review, with the owner's authorization. · **Extends:** [ADR 0053](0053-build-pass-and-approved-templates.md) (build passes, the owner's choices, approved templates), [ADR 0046](0046-terrain-tactical-movement.md) (permanent terrain and its movement rules)
**Change:** `openspec/changes/ai-build-terrain` · **Requirements:** FR-GM-26, FR-GM-27, FR-GM-17

## Context

The game builder (ADR 0053) lets an owner's AI propose a map's grid, walls, doors and windows in a private draft. The owner reviews the draft and publishes it as ordinary library items. Terrain was left out: the tools said "You can't add fog or terrain", so a GM painted every Difficult and Blocked square in the map editor after publishing.

The room already has permanent terrain (ADR 0046): a Base layer of `TerrainRun`s (`{ row, start, end, kind }`, Normal implicit), carried by `LibraryMapBoard.terrain` and `EncounterTemplateData.terrain`, and placed in a room by the existing library-board and encounter paths. Nothing new is needed at the table. The builder only has to fill that same field, after the owner has seen it.

Two shared schemas change, which is why this ADR exists: `BuildChoices` gains a choice, and `DraftMapSetup` / `DraftMapSetupChange` gain terrain. Both are builder contracts, not room state.

## Decision

- **A third owner choice, `aiTerrain`, off by default.**
  - The `builds.ai_terrain` column is added by an additive migration, defaulting to false. Every existing build reads as off, and older code ignores the column.
  - Starting a build takes it like `aiGrid` and `aiWalls`. The build page and New build show it, and offer it in one new preset.
  - `PUT /api/builds/:id/choices` accepts `BuildChoicesChange`, where `aiTerrain` is optional. A page from before this ADR, which sends only the first two, leaves terrain as it was rather than turning it off. The store decides this inside its locked write, so a change made at the same moment isn't lost.
  - A pass reads the choice as `allowed.terrain` and can never change it, as with the other two choices.
- **Terrain lives in the draft map's setup.** `DraftMapSetup` gains:
  - `terrain?: TerrainRun[]`, which is the Base layer in the room's own run format, validated by the existing `TerrainRuns` (ordered, non-overlapping, at most `MAX_TERRAIN_CELLS` squares);
  - `terrainGrid?: { cellSize, offsetX, offsetY }`, the grid it was proposed on. Only the server sets it.
  
  Squares use the same indexing as marks, encounter tokens and the room: square (c, r) spans `offsetX + c·cellSize` onwards. There is no second coordinate convention. A draft from before this ADR has neither field and reads as before.
- **`save_map_setup` takes `terrain`, and it is authorized by what is sent.** Openings, lines and marks need `aiWalls`; terrain needs `aiTerrain`.
  - A terrain-only save works with walls off.
  - A save that includes any part the owner hasn't allowed writes nothing, and says "Nothing was saved" when the other part was allowed.
  - Omitting `terrain` keeps it, `[]` clears it, and a list replaces the whole proposed layer. Stored runs are normalized: next-door runs of one kind are joined.
  - The store's write guard gains `requireAiTerrain`, checked inside the write under the same per-build lock as `requireAiWalls` (`assertChoicesAllow`). The version check, the owner-edited lock and the published lock are unchanged, so turning terrain off mid-save, an owner's edit, or a second save at the same moment all win. Turning the choice off keeps what was already proposed, for the owner to review.
- **Map coverage uses the terrain editor's rule.** A square must overlap the map by some area (`cellOverlapsMap`, the same rule as the editor's `cellInMap`). A square the edge crops counts: with an offset, that is column -1 or row -1, or a last column running past the edge. A square that only touches the edge doesn't count. Terrain needs a grid. Each part of a save is checked only when it is sent, so terrain alone isn't held back by lines that a grid change has put off the map.
- **A grid correction can't silently move terrain.** Terrain and its runs are stored with `terrainGrid`. `draftTerrainState` compares it with the map's grid now (`sameTerrainGrid`):
  - Terrain is on the same grid when no square edge under the terrain moves more than a quarter of a square. The drift is measured at the terrain's farthest squares, because half a pixel per square adds up across a large map. Offsets are compared without wrapping: a wrapped offset would number every square one off.
  - On another grid, terrain is `otherGrid`. `check_build`, `get_map_setup` and the owner's page report it. Publishing refuses it until the AI saves it again on the new grid, or the owner clears it or puts the grid back.
  - This keeps the native rule that a grid change needs an explicit terrain reset (library preparation's `resetTerrain`).
  - Publishing also needs a **confirmed** grid, as drawn lines do.
- **The owner can clear terrain, not paint it.** `PUT /api/builds/:id/maps/:key/setup` keeps omitted terrain, clears it on `[]`, and accepts it sent back unchanged. Any other terrain is refused with "Here you can only clear the terrain your AI proposed". The server never takes the page's `terrainGrid`. The save is an owner edit, so the existing `editedByUser` lock stops the AI changing that map. Painting stays in the map editor, after publishing.
- **Pictures.** `view_file`'s overlay draws each run as one rectangle, under the grid lines and walls. It uses the board palette's colours and patterns: Difficult in violet with single hatching, Blocked in red crosshatching over a dark tint, so it never reads as a red wall line. The owner's map review and encounter board draw terrain with the map editor's own `TerrainCells`. Both draw terrain only on a grid it fits, so stale terrain isn't shown in the wrong squares; the text says it is stale. The stored images stay clean.
- **Placement reuses the room's rule.** A token whose footprint lies on Blocked ground could never move off it (`movementTerrain(p, p, …).blocked`, ADR 0046), so:
  - `footprintOnBlocked` makes `checkBuild` report such a token;
  - `draftEncounterToTemplate` refuses it, with the same per-token problem list as a token across a wall. This applies to an already-published map's library terrain too.
  
  Difficult ground stays valid placement.
- **Publication.** `planPublish` sets the published `LibraryMapBoard.terrain` to the proposed Base layer, beside the walls `draftMapBoard` builds. A map with no proposed terrain keeps its file's board exactly as before. The encounter's template takes the board's terrain through the existing `draftEncounterToTemplate`. All of it goes through the existing single `publishBuild` transaction. A room started from the encounter, or placing the map with its library board, gets the terrain through the existing `encounterTable` and `MapSet` paths.
- **No new room commands, events or Undo.** Nothing in this ADR mutates `RoomState`. There are no temporary terrain effects (`Terrain.effects`). The builder never writes to a live room.

## Consequences

- **Additive only.** Older drafts, older pages and older builds keep working. Rolling back the code leaves an unused column and unused draft fields. The terrain those builds published is ordinary library terrain.
- **Payload size.** The room server's and MCP server's existing 64 KB JSON limits bound one save. With runs joined, that is far more than most maps need. A pathological checkerboard of 10,000 single squares wouldn't fit, and the guide tells the AI to join runs.
- **Wording.** The guide tells the AI that water, shadow, darkness, colour and texture alone don't make a square Blocked. Where it can't tell, it should leave a square Normal and mark or flag it. How well a real AI follows this hasn't been measured.
- **Not localized.** The builder's screens are still on the lint guard's `NOT_YET_LOCALIZED` list, so the new owner text follows that page's English-only pattern, until the builder pages are migrated together.
