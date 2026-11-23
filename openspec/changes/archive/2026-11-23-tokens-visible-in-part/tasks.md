# Tasks

## 1. Shared disc shape

- [x] 1.1 Add `tokenDisc(token, grid)` to `packages/shared/src/areas.ts` (radius `max(0, size × cellSize / 2 − 2)`), export it from the package index, and verify with unit tests for size 1, size 2, a fractional size and a radius clamped to 0
- [x] 1.2 (The effects overlay uses it too. Visual size checked in the browser by the user.) Replace the inline radius formulas in `apps/web/src/board/boardView.ts` (token view, drag ghost, hit-test) with `tokenDisc`, and verify that `npm run typecheck` passes and that tokens draw at the same size in the running app

## 2. Visibility rule (FR-GM-17, FR-GM-19, FR-GM-23)

- [x] 2.1 Change `concealedFrom` to test the disc with `areaVisibleTo`: centre-first fast path, centre-only fallback when `Concealment` has no grid, and the GM, hidden and owner checks unchanged. Verify with new `packages/shared/test/fog.test.ts` cases tagged FR-GM-17:
  - half out of fog → visible
  - whole disc in fog → concealed
  - square touching a grid-aligned fog edge from inside → concealed
  - fog edge 4 px short of the grid line → visible (the documented sliver)
  - part of the disc off the map → not counted
- [x] 2.2 Add sight cases tagged FR-GM-19 to `lineOfSightVisibility.test.ts`, and verify they pass:
  - centre hidden behind a wall corner with part of the disc in sight → visible
  - token wholly behind a wall → concealed
  - beyond the sight range by more than its radius → concealed
- [x] 2.3 Widen `fogConcealsSide` to take `fog` and `scene`, testing the disc against fog alone. Verify with unit tests that a token half out of fog is not concealed and a token wholly in fog is, and that the `decide` and `reduce` callers typecheck
- [x] 2.4 Update the `token.update` move-before-rename ordering in `decide.ts` to the disc rule ("wholly fog-concealed after, not before"), and verify with a unit test that a rename-and-move into fog emits `TokenMoved` before the appearance event
- [x] 2.5 Verify the existing filter tests (`fog.test.ts`, `visibility.test.ts`, `visibleNames.test.ts`, `sightFogLeaks.test.ts`, `sightHidden.test.ts`, `lineOfSight*.test.ts`). Update only fixtures whose tokens sat with their centre in fog but their disc outside, and note each such update in the PR
- [x] 2.6 (Found during implementation.) Make the event filter resync when a token's disc enters or leaves the set of discs a player sees through a change other than a move. That covers `TokenAppearanceSet` with a new size, `GridSet`, and `MapSet` with a new grid or map. Verify with unit tests that a shrink burying a token resyncs without sending its new name, that a growth out of fog resyncs, and that a grid change burying a token resyncs

## 3. Rolls, turn order and replay

- [x] 3.1 Add unit tests that verify:
  - an attack on a goblin half out of fog records its side unblanked
  - a goblin that then moves wholly into fog has that side blanked for good, through `concealFoggedSides`
  - an area-effect target follows the same rule
- [x] 3.2 Add a unit test that verifies a player's filtered turn order includes a token half out of fog and leaves out one wholly in fog
- [x] 3.3 Add a replay test that verifies a log in which a token's centre (but not its whole disc) entered fog after an attack replays with that side unblanked, and that a `DiceRolled` event recorded with `hidden: true` stays hidden
- [x] 3.4 (Found during implementation.) Have `concealFoggedSides` also run after `TokenAppearanceSet`, `GridSet` and `MapSet` with a grid change. Verify with a unit test that a smaller size or grid that leaves fog covering the whole disc blanks the side

## 4. Server integration

- [x] 4.1 Add multi-client integration tests to `apps/server/test/fog.test.ts` that verify:
  - a GM move taking a goblin from open ground to half in fog keeps it in the player's state, with the new position delivered as a live `TokenMoved`
  - a further move wholly into fog resyncs the player without it
- [x] 4.2 Add an integration test that verifies a drag preview whose disc stays partly outside fog is relayed to the player, and one whose disc lies wholly in fog is not
- [x] 4.3 Run `npm run test:bench --workspace=@vtt/server` before and after the change, and record both results in the PR. Verify the snapshot filter time hasn't regressed meaningfully

## 5. Board clipping

- [x] 5.1 (Browser-checked by the user.) In `boardView.ts`, split `tokenLayer` into `ownTokens` (unmasked) and `otherTokens` (masked by a third sprite from `createRegionMasks`). Move a token's view between them when its owners change, and keep bring-to-front within its group. Verify in the running app that a player sees only the lit half of a goblin half in fog, including its label, and sees their own half-fogged token whole
- [x] 5.2 (Browser-checked by the user.) Draw remote drag ghosts of unowned tokens inside a masked container, not straight into `fxLayer`. Verify in the running app that another participant's ghost dragged along a fog edge shows only its lit part
- [x] 5.3 (Browser-checked by the user.) Verify in the running app:
  - the GM's view-as-player clips tokens the way the player's view does, and the normal GM view shows every token whole
  - removing fog or moving a sight-giving token updates the clipping without a reload
- [x] 5.4 Update the `redrawFog` doc comment, which says draw order "changes nothing" for players, to describe the token mask. Verify that `npm run lint` passes

## 6. Documentation and wrap-up

- [x] 6.1 Write `docs/adr/0082-tokens-visible-in-part.md` (next free number) covering:
  - disc shape and sampling
  - fog side blanking
  - replay consequence
  - board mask
  - accepted trade-offs

  Also add "Amended by" to ADR 0016 and a forward note in ADR 0059's Consequences. Verify the ADR's status reads "Proposed — awaiting review by the Real-Time Architecture owner"
- [ ] 6.2 (Lint and typecheck pass. `npm test` passes except `studioIsolation.test.ts` (FR-GM-27), which fails the same way with this change stashed.) Run `npm run lint && npm run typecheck && npm test`, and verify all three pass
- [x] 6.3 Run `openspec validate tokens-visible-in-part --strict` and verify it passes
