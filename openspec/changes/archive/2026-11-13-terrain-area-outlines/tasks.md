# Tasks

## 1. Outline function

- [x] 1.1 Add `terrainOutline(runs, isOutlined)` to `apps/web/src/board/mapPalette.ts` (design Decision 1): returns `{ kind, col, row, side }` for each square side whose neighbour has a different kind or none, and for which `isOutlined(neighbourCol, neighbourRow)` is true. Verify with new `describe("terrain area outlines (board-palette)")` tests in `apps/web/test/mapPalette.test.ts`: a 3x2 block gives 10 perimeter sides and no inner ones; an L-shape; a block with a hole outlines the hole; two corner-touching squares give 4 sides each; Difficult next to Blocked outlines the shared edge once per kind; `isOutlined` returning false for one neighbour drops exactly that side.
- [x] 1.2 Add an `isOutlined` builder for the board (design Decision 3): true when the neighbour is outside the map (`cellInMap` is false), otherwise true for the GM or `terrainKnowledge(state)` for a player, cached per square. Verify with tests: a map-edge side is outlined for a player; a side facing a fogged square isn't; a fogged neighbour that is plain ground and one that is Difficult give the same result (no leak).

## 2. Board

- [x] 2.1 In `boardView.ts` `drawTerrain`, remove the two per-square inset rects, keep the tint and hatching, then stroke the `terrainOutline` segments on the square boundaries: all dark lines (`outer`, `s/30`), then all bright lines (`inner`, `s/60`), with square caps. Leave `drawTerrainDraft` and the extra-layer markers unchanged. Verify in `npm run dev`: a painted block shows one perimeter outline, Difficult next to Blocked shows both colours, and the stroke preview still outlines each square.
- [x] 2.2 Redraw a player's terrain when `state.fog` or `state.sight` changes, not only `terrainView` (design Decision 3). Verify in the same dev session, as a player: revealing or covering fog next to a Difficult area adds or removes the outline on that side, and an area reaching the map edge is outlined there.

## 3. Map editor

- [x] 3.1 In `TerrainSetup.tsx` `TerrainCells`, drop the inset rects from each `<g data-terrain>` and add area outline paths (dark, then bright, square linecap) from `terrainOutline` with every square counted as visible (map-edge sides included). Add an `outline: "area" | "cell"` prop, defaulting to `"area"`; the stroke preview at `TerrainSetup.tsx:101` passes `"cell"` and keeps per-square outlines. Verify that `terrainDraftGrid.test.tsx` and `libraryGridSafety.test.tsx` still pass, and that a new test rendering a 2x2 Blocked block finds one outline path with 8 sides.
- [x] 3.2 Confirm `EncounterPreviewModal` (which uses `TerrainCells` with defaults) shows area outlines. Verify by opening an encounter preview with terrain in `npm run dev`.

## 4. Spec and wrap-up

- [x] 4.1 Update the existing comments that mention per-square outlines (`boardView.ts` `drawTerrain`, `TerrainCells`, `terrainHatch` docs) so they reference area outlines. Verify with `grep -n "outline" apps/web/src/board/mapPalette.ts apps/web/src/pages/mapEditor/TerrainSetup.tsx`.
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass. Then run the `visibility-auditor` agent on the diff and verify it reports no leak from player outlines.

## 5. Terrain sent for partly visible squares (ADR 0069)

- [x] 5.1 Add `terrainSeen` to `packages/shared/src/terrainVisibility.ts` and use it in `terrainForViewer`; leave `terrainKnowledge`/`movementRouteKnown` unchanged. Verify with `packages/shared/test` cases: a square half under fog is sent; a wholly fogged square isn't; a square touching fog only along an edge is sent; with line of sight on, a square partly in sight is sent and one wholly out of sight isn't; `movementRouteKnown` over a half-fogged square is still false.
- [x] 5.2 Switch the board's `outlineVisibility` to `terrainSeen` and update its tests in `apps/web/test/mapPalette.test.ts`. Verify that a player's board outlines toward a square they can partly see (it was sent to them), not toward a wholly fogged one, and that the tests pass.
- [x] 5.3 Add ADR 0069 and verify it's linked from the change (proposal Impact) and amends ADR 0046. Run `npm run lint && npm run typecheck && npm test` and the `visibility-auditor` on the diff; verify all pass and the audit reports no leak beyond the accepted trade-off.

