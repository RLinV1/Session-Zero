# Proposal

## Why

The AI game builder (`mcp-game-builder`, ADR 0053) lets an owner's AI propose a map's grid, walls, doors and windows. It can't propose terrain: the tools say "You can't add fog or terrain". So after publishing, the GM paints every Difficult and Blocked square in the map editor, even when the adventure says plainly where the rubble and the chasm are. The room already has permanent terrain (`terrain-tactical-movement`, ADR 0046), and library maps and encounters already carry it. The builder only needs to fill that field, after the owner has seen it.

## What Changes

- **A third owner choice: "Let my AI propose terrain".** It is off by default for new and existing builds, and stored like the other two. It is shown on New build (with one new preset) and on the build page. A pass can read it and never change it. Turning it off stops further AI terrain changes and keeps what was proposed, for review.
- **`get_map_setup` and `save_map_setup` gain permanent Base terrain.**
  - Terrain is sent as the room's own `TerrainRun`s (`{ row, start, end, kind }`), with Difficult and Blocked only, Normal implicit, and the same square indexing as marks and tokens.
  - Omitting it keeps it, `[]` clears it, and a list replaces it.
  - The runs are validated with the existing `TerrainRuns`: ordered, non-overlapping, and at most 10,000 squares. Every square must overlap the map by the terrain editor's own rule, so a cropped edge square counts.
  - Terrain needs a grid, and is stored with the grid it was proposed on.
  - A save is authorized by the parts it sends: walls for openings, lines and marks, and terrain for terrain. A terrain-only save works with walls off, and a mixed save with any part not allowed writes nothing. The store rechecks the choices, the item's version and the edit and publication locks inside the write.
- **Pictures and review.**
  - `view_file` draws Difficult and Blocked squares in the board's colours and patterns.
  - The owner's map review and encounter board draw them with the map editor's own terrain drawing, over the clean original image, beside the existing walls, portals and tokens.
  - The owner gets "Clear all terrain", which is an owner edit, so the AI can't change that map afterwards. Painting stays in the map editor after publishing.
- **Grid, placement and publication.**
  - Publishing terrain needs a confirmed grid, and the grid the terrain was proposed on, within the grid agreement's tolerance. After a correction, `check_build`, `get_map_setup` and the owner's page say so, and publishing refuses until the terrain is saved again or cleared.
  - A token whose footprint lies on Blocked ground is reported by the check and refused at publish, by the room's own movement rule. Difficult ground is fine.
  - The proposed terrain becomes the published `LibraryMapBoard.terrain` and the encounter's `terrain`, through the existing single publish transaction. A room started from the encounter, or placing the map with its library board, gets it through the existing paths.
- **Guidance.** The field guide explains Difficult and Blocked, the run format, cropped edges and grid changes. It says that water, shadow, darkness, colour or texture alone don't make a square Blocked, and that unclear squares stay Normal with a mark or flag.

Not in scope: temporary terrain effects (`Terrain.effects`), new room commands, events or Undo, direct room mutation, painting terrain on the build page, and anything from the standalone `mcp-scene-preparation` exploration (its hosted service, UVTT terrain export or storage lifecycle). This change doesn't complete or replace that work.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

These capabilities are introduced by the unarchived `mcp-game-builder` change. This change adds requirements to them, and leaves that change's own requirements and roadmap as they are.

- `game-build-access`: the owner's terrain choice, independent of the other two.
- `game-build-drafts`: proposing, replacing and clearing terrain with the setup tools; validation, map coverage and the grid it was proposed on; the AI's view of terrain; tokens on Blocked terrain.
- `game-build-review`: the owner sees and clears terrain, and published maps, encounters and rooms carry it.

The native behaviour this relies on stays as specified in `openspec/specs/board-terrain-tool` and the `terrain-tactical-movement` change: Base terrain, Normal implicit, Blocked footprints, and library and encounter terrain.

## Impact

- `packages/shared`:
  - `build.ts`: `BuildChoices.aiTerrain`, `BuildChoicesChange`, `DraftMapSetup.terrain` and `terrainGrid`, `DraftMapSetupChange.terrain`, and the terrain helpers;
  - `checkBuild` and `draftEncounterToTemplate`;
  - `terrain.ts`: `cellOverlapsMap` and `runOnMap`, plus a widened `cellRect` parameter type.
- `apps/server`:
  - the `ai_terrain` migration and Prisma field;
  - both stores (`requireAiTerrain`, `assertChoicesAllow`);
  - the `http/build.ts` setup, choices and owner routes;
  - `domain/buildPublish.ts`, and `domain/mapOverlay.ts`.
- `apps/mcp`: the `save_map_setup` terrain argument, tool descriptions and field guide.
- `apps/web`: the choice controls and preset, the map review terrain section and drawing, and the encounter board drawing.
- `docs/adr/0071-ai-build-terrain.md`, which needs review by the Real-Time Architecture owner, and `docs/AI-GAME-BUILDER.md`.
- No room schema, command, event or visibility filter changes.
