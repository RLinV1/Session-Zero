# Tasks

## 1. ADR

- [x] 1.1 Write a new ADR (next free number in `docs/adr/`) amending ADR 0016 for areas: an area is sent when any part is visible, the whole geometry is sent with it, sampling has a half-cell resolution, and the board clips areas the viewer may not edit. Add an "Amended by" line to ADR 0016. Verify the ADR is present and asks the Real-Time Architecture owner for review.

## 2. Shared visibility

- [x] 2.1 Move `areaShape`, `templateArea` and `AreaGeometry` from `apps/web/src/board/tools.ts` into `packages/shared/src/areas.ts`, export them from the package, and re-export them from `tools.ts` (design Decision 1). Verify `npm run typecheck` passes and the existing web area tests pass unchanged.
- [x] 2.2 Add `grid` to `Concealment` and `areaVisibleTo(c, outline, grid)`, and make `templateConcealedFrom` use it (design Decisions 2–3). Verify with tests in `packages/shared/test/areaTemplates.test.ts` (`describe("... (FR-GM-17)")`):
  - a cone from fog into lit ground is visible to another player
  - a circle wholly in fog isn't
  - a cone from lit ground into fog is visible
  - with sight, a line past a wall is visible when part of it is in sight, and isn't when none is
  - an empty sight array hides everything
  - owner, GM and GM-only cases are unchanged
  - a worst-case timing guard: 200 12-cell circles, 100 fog regions
- [x] 2.3 Verify with shared filter tests that `filterStateForViewer` and `filterEventForViewer` follow the new rule:
  - a `TemplatePlaced` for a cone aimed out of fog passes to players
  - one wholly in fog is redacted
  - `FogAdded` covering the last visible part resyncs, and the snapshot drops the area
  - a player's `template.remove` of another player's area wholly in fog answers not found

## 3. Server

- [x] 3.1 Update the `LiveRoom` aim preview relay to the new `Concealment`, and add integration tests in `apps/server/test/areaTemplates.test.ts`:
  - a preview aimed out of fog reaches another player
  - one wholly in fog doesn't
  - a placed cone aimed out of fog appears in another player's snapshot and live events

  Verify `npm test --workspace=@vtt/server -- -t "FR-GM-17"` passes.

## 4. Board

- [x] 4.1 Add `makeVisibleRegionCanvas(fog, sight, width, height)` in `apps/web/src/board/areaMask.ts`, capped at 2048 px on the longer side (design Decision 4). Verify with unit tests in `apps/web/test/areaMask.test.ts`, sampling pixel alpha as `sightMask.test.ts` does:
  - with no sight and no fog, the board is opaque
  - fog is clear
  - only inside sight is opaque
  - fog inside sight is clear
  - overlapping fog is clear
  - an empty sight array is clear everywhere
  - the cap holds on a 6000 px map
- [x] 4.2 Add the masked `clippedAreas` container in `markLayer` and draw templates the viewer may not edit into it from `redrawMarks` (design Decision 5). Verify with `BoardView` unit tests built as in `apps/web/test/movementPreview.test.ts`:
  - a player's view masks another player's template and not their own
  - the GM's view masks nothing and builds no mask
- [x] 4.3 Move other participants' aim previews into the masked `clippedAims` container in `fxLayer` for non-GM viewers (design Decision 5). Verify with `BoardView` tests for a player's view and the GM's view.
- [x] 4.4 Add `syncVisibleRegion()` next to `syncSight`, rebuilding on fog, sight, board size or role changes and destroying the old texture (design Decision 6). Verify with `BoardView` tests:
  - a new `fog` rebuilds once
  - an unrelated change doesn't rebuild
  - switching between the GM view and view-as-player builds and drops the mask

## 5. Finish

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`, and verify all pass.
- [x] 5.2 Verify in the browser with a GM tab and two player tabs:
  - a cone from lit ground into fog is clipped at the fog edge for the other player and whole for its owner and the GM
  - the GM's cone from inside fog shows only its lit part to players
  - a circle wholly in fog shows nothing to players
  - removing the fog shows the rest without a reload
  - with line of sight on, an area past a wall is clipped at the sight edge
  - the GM's view-as-player shows the clipped cone
  - another player's aim preview is clipped while they drag
