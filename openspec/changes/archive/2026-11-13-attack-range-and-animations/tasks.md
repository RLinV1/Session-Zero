# Tasks

## 0. Prerequisites

- [x] 0.1 Confirm `flashy-attack-animations` is archived, so `board-attack-effects` holds "Varied automatic ranged attacks". Verify with `openspec show board-attack-effects --type spec` listing it before archiving this change.
- [ ] 0.2 Write `docs/adr/0067-attack-range-and-shapes.md` covering `AttackPreset.range`, `AttackContext.range`, the `arrow` and `pierce` shapes, the diagonal formula moving to shared, and the rollback note (design D1, D2, D3, D5); get Real-Time Architecture owner sign-off. Verify the file exists and is linked where `docs/DESIGN.md` lists ADRs.

## 1. Contract (packages/shared)

- [x] 1.1 Add the optional `range` union to `AttackPreset` (limits `> 0`, `≤ 9999`). Verify with unit tests (`describe("... (attack-range)")`): melee with and without reach, ranged, absent, and rejection of `0`, `-10` and `kind: "thrown"`; old attacks and creature JSON still parse.
- [x] 1.2 Add optional `range: "melee" | "ranged"` to `AttackContext`, and in `decide` copy it from the matched named attack next to `animation`, dropping any client value. Verify with decide tests: a matched melee/ranged attack sets it, an unmatched label or range None leaves it absent, and a forged client value is ignored.
- [x] 1.3 Verify with a visibility test that a player who doesn't own the actor receives `attack.range` on the roll but no named attacks or range numbers in snapshots or events.
- [x] 1.4 Move the diagonal-step formula into shared, and add `footprintSquares`, `attackDistance`, `isAdjacent` and `inRange` (design D3). Verify with unit tests covering every scenario in `attack-range` "How range is measured", plus sizes 0.5, 1.5, 2 and 3 and overlapping tokens.
- [x] 1.5 Append `"arrow"` and `"pierce"` to `ANIMATION_SHAPES`. Verify that existing animation schema tests pass, that a definition with each new shape parses, and with a library route integration test that an arrow and a pierce animation can be created and listed (`library-animations`).

## 2. Server (apps/server, apps/mcp)

- [x] 2.1 Verify with integration tests: saving an attack with a range reaches the GM's and owners' devices only; a forged range is refused; an out-of-range roll is accepted and broadcast; a roll with a forged `range` is stored with the attack's real kind.
- [x] 2.2 Accept `range` in the AI builder's draft attacks and document it in `apps/mcp/src/buildGuide.ts`. Verify with an MCP tool test that a drafted creature keeps its range when placed.

## 3. Board animations (apps/web/src/board)

- [x] 3.1 Use `measure`'s diagonal step from shared, and make `drawAttackLine` label `attackDistance` with the room's rule. Verify that the existing ruler tests pass unchanged and a new test checks the attack line label under Alternating.
- [x] 3.1a Pass the chosen attack's `range` with Pick on board, and draw `drawAttackLine` red with "· Out of range" over an out-of-range token (design D8). Verify with a board test that the colour and label switch between in-range and out-of-range hovers and stay normal with no range, and that clicking an out-of-range token still chooses it.
- [x] 3.2 Rewrite `strikeAnimation` per design D4 and remove `rangedAnimationFor`/`RANGED_ATTACK_SHAPES`. Verify with unit tests covering each Automatic scenario in `board-attack-effects`, including the same result for a viewer without the named attacks.
- [x] 3.3 Add `arrow` (volley's `make`, grey default) and `pierce` (new `make`) to `effectPresets.ts`/`fxStrikes.ts`, with sound recipes, soft fallbacks, reduced-motion markers and en/zh-TW `animation.builtin.*` names. Verify that thumbnail and preset tests cover every shape, and check both in the library editor's Play preview.

## 4. Attack panel and editor (apps/web/src/panels)

- [x] 4.1 Add the Range control to the attack editor (None/Melee/Ranged, Reach pre-filled with one square, unit-label suffix, store no reach when left at one square). Source units from the room, or from GM defaults in the library (falling back to 5 `ft`). Verify with component tests for each `attack-range` editor scenario.
- [x] 4.2 Change `targetsByDistance` to group by range (design D7), and update the single-target picker (collapsed "Out of range (n)" group that starts closed each time, "no target in range" note) and the multi-target popover. Verify with component tests for the grouped-list scenarios.
- [x] 4.3 Show the red out-of-range state with visually hidden "Out of range" text on the picker, on chosen multi-target rows, and for board-picked targets. Verify with a component test and an accessible-name assertion.
- [x] 4.4 Add the lazily loaded preview stage under the Animation picker: plays on choose, Play replays, Automatic follows the Range choice, scales to narrow widths, shows the reduced-motion version, and shows an unavailable message. Verify with component tests that it plays the right definition and sends no command.
- [x] 4.5 Change the picker labels: no tag for Automatic and built-ins, `t("attack.custom")` for library entries and the saved copy. Add en and zh-TW entries. Verify with a component test for both locales, and that `npm run lint` passes.

## 5. Verification

- [ ] 5.1 In the running app, set ranges on Melee, reach-10 and Ranged attacks; check the grouped list, the red picker, the red board targeting line, and that an out-of-range roll is still allowed; check that the Automatic slash or arrow plays the same on a GM and a player board; preview each animation, including Arrow and Pierce.
- [x] 5.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass.
