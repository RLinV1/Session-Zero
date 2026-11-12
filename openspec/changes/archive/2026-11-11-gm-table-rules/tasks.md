# Tasks

## 1. ADR and review

- [x] 1.1 Write `docs/adr/0054-table-rules.md` (amends ADR 0049) recording design Decisions 1, 2, 4, 5 and 7, what still gets through, the replacement of `room.setAutoRemoveDefeated`, and the reconciliation with `auto-remove-defeated-tokens`' "Room setting" requirement. Verify the file exists, lists Status "Proposed — awaiting review by the Real-Time Architecture owner", and is linked from the design.

## 2. Shared contract: state, commands, events

- [x] 2.1 In `packages/shared/src/state.ts`, add optional `defeatRemoval`, `hideMapWithoutToken`, `hideHp` and `hideAc` to `RoomState` and the `DefeatRemoval` type, plus the pure helper `defeatRemovalOf(state)` (design Decision 2), exported from the package index. Verify `npm run typecheck` passes.
- [x] 2.2 In `commands.ts`, add `room.setDefeatRemoval`, `room.setHideMapWithoutToken`, `room.setHideHp` and `room.setHideAc`, and remove `room.setAutoRemoveDefeated`. In `events.ts`, add `DefeatRemovalSet`, `HideMapWithoutTokenSet`, `HideHpSet` and `HideAcSet`, each with `previous`, keeping `AutoRemoveDefeatedSet`. Verify `npm run typecheck` flags every unhandled switch, then passes once tasks 2.3 to 2.5 are done.
- [x] 2.3 Handle the four commands in `decide.ts` (GM only; unchanged value → `invalid`; `previous` from `defeatRemovalOf` or `?? false`), and make `withDefeats` follow `defeatRemovalOf`, skipping owned tokens under `npc`. Verify with `packages/shared/test/tableRules.test.ts` (FR-TAC-07, FR-GM-15):
  - a player's change is forbidden, and an unchanged value is invalid
  - an older state without the field reads All, or Off when `autoRemoveDefeated: false`
  - under `npc`, an area effect removes Goblin and keeps an owned Aria
  - changing the mode removes nothing already at 0
- [x] 2.4 Handle the four events in `reducer.ts`, and keep `AutoRemoveDefeatedSet` applying to `autoRemoveDefeated`. Verify with a test that a log mixing an old `AutoRemoveDefeatedSet { enabled: false }` and a later `DefeatRemovalSet` replays to the expected `defeatRemovalOf`.
- [x] 2.5 Add activity-log lines for the four events in `activityLog.ts`. Verify by extending `packages/shared/test/activityLog.test.ts` with one entry each.
- [x] 2.6 Update the existing `room.setAutoRemoveDefeated` uses to the new command: `packages/shared/test/autoRemoveDefeated.test.ts`, `apps/server/test/autoRemoveDefeated.test.ts` and `apps/server/test/areaEffects.test.ts`. Verify those files pass with unchanged expectations.

## 3. Visibility: hide map

- [x] 3.1 In `sight.ts`, add the hide-map rule to `viewerSight` (design Decision 4), and widen the `Pick` types of `viewerSight` and `concealmentFor`. Verify with `packages/shared/test/tableRules.test.ts` (FR-GM-23):
  - rule on, line of sight off: a player with no token gets `sight: []` and no tokens, templates or portals in `filterStateForViewer`
  - a hidden owned token does not count
  - owning a visible token gives `sight` absent and every token they'd otherwise see
  - the GM is unaffected
- [x] 3.2 Add the ownership resyncs in `filterEventForViewer` (design Decision 5) and resync players on `HideMapWithoutTokenSet`. Verify with unit tests: `TokenOwnersSet` adding the player resyncs, `TokenMoved` of their own token with line of sight off does not, and the rule event resyncs players and passes for the GM.

## 4. Visibility: hide HP and AC

- [x] 4.1 Add `statsForViewer` and the rules parameter to `tokenForViewer` in `visibility.ts` (design Decision 7), and use it in `filterStateForViewer` and for `TokenCreated`/`TokenDeleted`. Verify with unit tests (FR-GM-23): under `hideHp`, a player's snapshot has `hp`/`maxHp` null on unowned tokens and real values on their own; under `hideAc`, the same for `ac`; with both off, nothing changes; the GM always sees everything.
- [x] 4.2 Strip `TokenStatsSet.stats` and `previous` and redact when only hidden fields changed, and resync on `TokenOwnersSet` that changes the viewer's ownership while a rule is on, and on `HideHpSet`/`HideAcSet`. Verify with unit tests: an HP-only change to Goblin is redacted for a player under `hideHp`; an AC change under `hideHp` alone passes with HP nulled; the owner gets the full event.
- [x] 4.3 Add server integration tests in `apps/server/test/tableRules.test.ts` with a GM and two players over the wire. Under `hideHp` and `hideAc`, no message a non-owner receives (welcome, events, resyncs, `/replay`) contains the hidden values after `token.setStats`, `roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, undo and an ownership change. A player with no token under the map rule receives no tokens until one is assigned, then receives them without reconnecting.
- [x] 4.4 Run the `visibility-auditor` and `sync-reviewer` agents on the diff and fix or record every finding.

## 5. Web client

- [x] 5.1 Rewrite `TableSection` in `apps/web/src/ui/SettingsMenu.tsx`: the "Remove tokens at 0 HP" select (All / Only NPC tokens / Off) and the three switches with the spec's exact labels and no hint text, each sending its command and showing a refusal. Update `apps/web/test/autoRemoveDefeated.test.tsx` (or move it to `tableRules.test.tsx`) to check the labels, the commands sent, and that players see no Table tab.
- [x] 5.2 Pass the map rule to `sightMaskAlpha` from `board/boardView.ts` so a player with no polygons under the rule gets alpha 1 (design Decision 6). Verify with a unit test of `sightMaskAlpha` and, in the browser, that a player without a token sees a fully dark board while the rule is on and the dimmed map while it is off.
- [x] 5.3 Add `statHidden` and show "Hidden" for HP and AC in `board/TokenCard.tsx`, and "HP hidden" / "AC hidden" in `panels/TokenRoster.tsx`. Verify with `apps/web/test/tokenCard.test.tsx` cases: a player sees "Hidden" for another token's HP under the rule and their own token's real HP; the GM always sees values.

## 6. Finish

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test` from the repo root and confirm all pass.
