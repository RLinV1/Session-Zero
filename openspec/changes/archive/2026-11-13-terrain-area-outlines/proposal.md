# Proposal

## Why

Each Difficult or Blocked square is outlined on all four sides, so a patch of terrain becomes a grid of boxes. The grid lines get busy, and it's hard to tell where an area starts and ends. Outlining the area as a whole makes its shape clear at a glance and keeps the hatching uncluttered. Players are also only sent terrain for squares they can see completely, so a square partly under fog shows as plain ground and leaves a gap in the area next to the fog.

## What Changes

- Terrain is drawn as areas. An area is a group of squares of the same kind (Difficult or Blocked) that share a side. Squares touching only at a corner belong to separate areas. Every square has exactly one kind, so an area never mixes the two.
- Each area gets one two-tone outline (a dark band along the inside of its edge, with a bright line inside that, as the per-square outline looked), in place of each square's inset outline. The tint and hatching are still drawn square by square, so the hatching runs on across the area.
- A side of a terrain square gets an outline when its neighbour is outside the map, or when the viewer can see the neighbour and it isn't the same kind. Where a Difficult area meets a Blocked area, both outlines are drawn on the shared edge.
- For a player, a side next to a square they can't see (fog, or out of sight) gets no outline. The rule depends only on what the viewer can see, never on the terrain beneath, so it reveals nothing hidden. The GM sees every square and so sees complete outlines.
- The map editor's Terrain step and the encounter preview draw the same area outlines as the board.
- Players are sent the terrain of every square they can see any part of (outside fog and, with line of sight on, inside their sight), instead of only squares they see completely. Movement route feedback keeps the whole-square rule, so it never hints at walls in the fogged part of a square. This amends ADR 0046 (new ADR 0069).
- Unchanged: the Terrain tool's stroke preview (on the board and in the map editor), which still outlines each square, and the corner markers for extra layers.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `board-palette`: the requirement "Board elements use distinct two-tone colours" changes from "a two-tone outline on every edge" of each terrain square to one two-tone outline around each area, with the fog and map-edge rules above. The requirement "The map editor uses the board's colours" gains the area outline and a note that the stroke preview stays per-square.
- `fog-of-war`: "Content under fog is not sent to players" gains the rule for terrain squares: sent when any part is visible, decided by sampling, without loosening movement feedback.

## Impact

- `apps/web/src/board/mapPalette.ts`: a new pure function that lists which square sides form area outlines.
- `apps/web/src/board/boardView.ts` (`drawTerrain`): draws outlines per area. Players' boards check which squares they can see with the shared `terrainKnowledge`, which the client already uses for movement. `drawTerrainDraft` is unchanged.
- `apps/web/src/pages/mapEditor/TerrainSetup.tsx` (`TerrainCells`): draws outlines per area. The stroke preview keeps per-square outlines. The encounter preview (`EncounterPreviewModal.tsx`) follows automatically.
- Tests: `apps/web/test/mapPalette.test.ts`, plus a check that the editor renders area outlines.
- `packages/shared/src/terrainVisibility.ts`: a new sampled `terrainSeen` test, used by `terrainForViewer` (what players are sent). `terrainKnowledge` and `movementRouteKnown` are unchanged.
- `docs/adr/0069-terrain-visible-in-part.md`, amending ADR 0046. Needs review by the Real-Time Architecture owner.
- No schema, command or event changes; `decide`/`reduce` unchanged.
