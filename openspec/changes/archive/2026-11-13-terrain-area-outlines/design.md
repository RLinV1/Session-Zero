# Design

## Context

See proposal.md (Why). Terrain is drawn in three places, and each one handles squares separately:

- `boardView.ts` `drawTerrain`: a tint, two-tone hatching, then two inset `rect` outlines per square. The GM draws `effectiveTerrain(state.terrain)`. Players draw `state.terrainView.runs`, which the server has already cut down to the squares they can see (`terrainForViewer`).
- `TerrainSetup.tsx` `TerrainCells`: the same drawing in SVG, used by the map editor's Terrain step (effective terrain, extra-layer markers and stroke preview) and by `EncounterPreviewModal`. Each square is a `<g data-terrain=kind>`, and tests (`terrainDraftGrid.test.tsx`, `libraryGridSafety.test.tsx`) count those elements.
- `boardView.ts` `drawTerrainDraft`: the board's stroke preview. It doesn't change.

Every square already has exactly one kind (`terrainCells` keys a map by `row:col`), so "an area is one kind" needs no new data rule.

## Goals / Non-Goals

**Goals:**
- One pure, unit-tested function that decides which square sides are outlined, shared by the Pixi board and the SVG editor.
- Players' outlines that reveal nothing about squares they can't see.

**Non-Goals:**
- Tracing areas as polygons, or rounding or mitering their corners.
- Changing the stroke preview, extra-layer markers, colours or hatching.
- Any change to schemas, commands or events, or to movement knowledge (`movementRouteKnown`).

## Decisions

### 1. Outline sides square by square, not by tracing polygons
`terrainOutline(runs, isOutlined)` in `mapPalette.ts` builds the square-to-kind lookup with `terrainCells`. For each square and each of its four sides, it emits a segment `{ kind, col, row, side }` when the neighbour on that side has a different kind (or none) and `isOutlined(neighbourCol, neighbourRow)` is true. The renderers turn segments into board coordinates with `cellRect`.
- Squares that share a side never outline that side, and squares touching only at a corner aren't neighbours. So the per-area behaviour, holes and L-shapes all come for free, without a flood fill.
- *Alternative:* trace each area's outline into a polygon and stroke it. That gives cleaner joins, but it needs an extra algorithm with edge cases (holes, corner-touching squares) for no visible gain at this line width. Rejected.
- For speed, neighbouring segments in a row or column could be joined into one longer line. That's optional; up to 10k squares means at most 40k segments, drawn only when terrain changes.

### 2. A two-tone band along the inside of the area's edge, as the old outline looked
Each side is stroked twice, parallel to its edge and inside its own square, at the same offsets the old per-square rects used: a dark band (`outer`, width `s/30`, from the edge to `s/30`), then the bright line just inside it (`inner`, width `s/60`). The full dark band shows, as it did before. (The first build centred both lines on the edge, so the bright line covered the middle of the dark one and the outline looked lighter.) Each side's ends move in by the inset at an outer corner, stay put along a straight run, and move out at an inner corner, so an area's lines join into one continuous band. Square line ends (Pixi `cap: "square"`, SVG `stroke-linecap="square"`) fill the corners. Since each kind's band lies inside its own squares, a Difficult and a Blocked outline on a shared edge sit side by side. The offsets live in `outlineTone` so the board and editor match.
- *Alternative:* keep the inset. That means moving each side inward and handling inner and outer corners differently. The user chose the boundary line.

### 3. Which neighbours count: viewer-only knowledge
`isOutlined(col, row)` returns true when the square is outside the map (so the map edge is outlined), and otherwise `known(col, row)`:
- GM (board, map editor, encounter preview): always true.
- Player board: `terrainKnowledge(state)` from `@vtt/shared`. It's pure, and players' clients already use it through `movementRouteKnown`. It uses the fog and sight the player has received, which is the same test the server uses to decide which terrain squares to send. It is built once per `drawTerrain` call. Results can be cached per square for that call, since the function clips polygons.
- "Outside the map" reuses `cellInMap` from `terrainStroke.ts`, which imports only `@vtt/shared`, so there's no import cycle. A square is outside when it doesn't overlap the map image at all. With no map, every neighbour counts as outside.

The neighbour's kind comes only from the runs this viewer received, and a square the viewer can't see is never outlined. So the outline can't depend on hidden terrain: no leak (invariant 3), and nothing new crosses the wire.

**Redraw trigger:** a player's outlines now depend on fog and sight as well as `terrainView`. `drawTerrain` currently redraws only when `terrainView` or the grid changes. The server sends a new `terrainView` whenever fog or sight changes which squares are visible, but a fog change that doesn't change which terrain squares are visible could leave an outline on a side that's now fogged, or missing on one that's now revealed. Fix: also compare `state.fog` and `state.sight` in the player's redraw check.

### 5. Terrain sent for squares a player can partly see (ADR 0069)
A new `terrainSeen(state, concealment?)` in `terrainVisibility.ts` returns a per-square test, like `terrainKnowledge` does. A square counts when any of a 4 x 4 lattice of points (the centres of its quarters, within the map) lies outside every fog region and, if sight is limited, inside sight. It uses the same `inFogRegion` and `inSight` tests as tokens and areas. `terrainForViewer` uses it in place of `terrainKnowledge`. The redaction check that compares projections before and after picks it up automatically.
- `movementRouteKnown` keeps the whole-square `terrainKnowledge`, so route feedback never consults hidden walls for a partly fogged square (the user chose strict movement).
- The board's `outlineVisibility` switches to `terrainSeen`, so a player's outline test matches what the server sent.
- *Alternative:* exact polygon intersection. It needs a boolean-polygon library, and was rejected as in ADR 0059.

### 4. `TerrainCells` keeps its per-square groups and gains an outline mode
Squares stay as `<g data-terrain=kind>` with their tint and hatching (the existing tests depend on these), minus the inset rects. One extra `<path>` per kind and tone draws the area outline, built from `terrainOutline` with every square counted as visible. A prop (e.g. `outline: "area" | "cell"`, default `"area"`) lets the editor's stroke preview at `TerrainSetup.tsx:101` keep per-square outlines, which `erase` previews already draw on their own. Extra-layer markers are unaffected.

## Risks / Trade-offs

- [Two outlines on a shared Difficult/Blocked edge could overlap] → Each kind's band lies inside its own squares (Decision 2).
- [Square line ends overlap at corners, so the semi-transparent dark band is slightly darker there on the board] → Accepted; it's a few pixels and barely visible.
- [A player's fog-only change leaves outlines stale] → Add fog and sight to the redraw check (Decision 3), covered by a test.
- [`terrainKnowledge` clips polygons per square, which is slower on large maps with many fog regions] → It has a bounding-box early exit, results are cached per draw, and it only runs when terrain, fog or sight change.
- [Outlines thinner at the very edge of the map image] → Accepted; the half of the stroke outside the map image is still drawn on the board.

## Migration Plan

Rendering only; no data migration. Rollback is reverting the commit.
