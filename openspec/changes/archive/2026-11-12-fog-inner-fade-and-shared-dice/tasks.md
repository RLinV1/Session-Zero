# Tasks

## 1. Fog's fade narrows

- [x] 1.1 Set `FOG_FEATHER_CELLS = 0.25` in `apps/web/src/board/fogTexture.ts`, keeping `fogEdgeAlpha` opaque inside and fading out over a quarter cell past the border, with the same billow and smoothstep. Verify: `apps/web/test/fogEdge.test.ts` asserts 1 for `d >= 0`, 0 for `d <= -0.25` for every noise value, a monotonic fade, and that the noise moves the edge (fog-of-war: "Border wavers").
- [x] 1.2 Mirror the curve in `fogShader.ts` `edgeAlpha` with the discard at `d <= -FEATHER`, and sample its edge noise every 1.5 cells. Verify: the GLSL-vs-TS parity test in `fogEdge.test.ts` (sampled `d`/`n` pairs give the same value).
- [x] 1.3 Keep puffs and wisps inside regions in `fogPuffs.ts` (wisps point inward, reach kept inside the border). Verify: a unit test that every laid-out puff and wisp, extent included, lies inside its region (fog-of-war: "Revealed ground stays clear").

## 2. Darkness has a crisp, smooth edge

- [x] 2.1 Add `darknessShapes` to `sightMask.ts`: the map minus every sight polygon in one `polygon-clipping` difference, corners rounded to whole pixels, identical sight merged once, null past `MAX_MERGED_SIGHT_CORNERS`. Verify: `apps/web/test/sightShapes.test.ts` checks the dark area for no sight, one, overlapping, separate and edge-touching sight.
- [x] 2.2 Draw it in `boardView.ts` as `Graphics` (fill each dark area, cut its lit islands), falling back to `makeSightMaskCanvas` (dark fill, polygons cleared, no blur or stroke) when the merge is capped or throws. Verify: `sightMask.test.ts` records the canvas calls; typecheck and the board tests pass.
- [x] 2.3 Test for crashes and cost with many owned tokens. Verify: `sightShapes.test.ts` merges 3, 5 and 10 tokens on The Broken Span (under 50 ms each; about 1–2 ms measured), never throws over 96 random layouts of 3–10 tokens on every shipped map, and never crashes with 10–50 tokens crowded together.

## 3. Every public roll is thrown on every board

- [x] 3.1 Add a pure `attackAim(roll, tokens, grid, map)` to `apps/web/src/board/diceThrow.ts`: null unless both attack sides are present and their tokens are in the viewer's state; it lands one cell short of the target (the midpoint when closer than two cells), starts at most the hand-throw reach back toward the attacker, and is clamped to the map. Verify: unit tests for adjacent, distant, map-edge, blanked-side and missing-token cases (shared-roll-throws scenarios).
- [x] 3.2 In `RoomPage.tsx` `onRolled`, use `drops.take(roll) ?? attackAim(...) ?? board.centreAim()` for every public roll, removing the `mine` condition, and leave the GM-only tray path untouched. Verify: a web test with a fake board where another participant's Roll-button roll, attack roll and missed-drop roll each call `throwDice`, while a GM-only roll does not.
- [x] 3.3 Confirm other participants' throws don't disable your roll controls (`rolling` still counts only your own rolls). Verify: a web test that another player's airborne roll leaves the Dice panel's Roll and the Attack section's buttons enabled.
- [ ] 3.4 Manual check in two browsers (`npm run dev`): a player's to-hit roll, damage roll and Roll-button roll animate on the other player's board, an attack on a fogged target lands in the middle of the other player's view, and reduced motion lands at once.

## 4. Docs and wrap-up

- [x] 4.1 Add an "Amended by" note to `docs/adr/0014-dice-drop-relay.md` and replace its "with no drop … everyone else shows only the result card" bullet. Update `docs/DESIGN.md` wherever it describes the fog fade or roll throws. Verify: `grep -n "only the result card" docs` finds no stale statement.
- [ ] 4.2 Archive `throw-dice-on-board` (or confirm it is archived) before archiving this change. Verify: `openspec list --specs` shows `board-dice-throw`.
- [x] 4.3 Run `npm run lint && npm run typecheck && npm test`. Verify: all pass.
