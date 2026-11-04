# Tasks

Notes for whoever applies this: all code changes go to Sonnet subagents (max 3-5 at once); run lint, typecheck and vitest once at the end, not per agent. Use the `impeccable` and `design-taste-frontend` skills for tasks 6 and 7.

## 1. ADR and review

- [x] 1.1 Finalise `docs/adr/0049-auto-remove-defeated-tokens.md` (drafted, Status: Proposed). Done when it records the owner-resync decision from design.md Decision 5 and the file is linked from the change.
- [ ] 1.2 Request review from the Real-Time Architecture owner. Done when the ADR status records the outcome before the shared tasks merge.

## 2. Shared contract (`packages/shared`)

- [x] 2.1 Add `RoomState.autoRemoveDefeated` (default `true`, older snapshots without the field read true), command `room.setAutoRemoveDefeated`, event `AutoRemoveDefeatedSet { enabled, previous }`, the `decide` case (`can.administer` first; unchanged value is invalid) and the `reduce` case. Done when a typecheck passes and a state without the field still parses.
- [x] 2.2 Add optional `reason: "defeated"` to `TokenDeleted` in `events.ts`. Done when existing deletion events and a stored log still parse.
- [x] 2.3 Add the `withDefeats` helper in `decide.ts` and call it from `roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, `token.setStats` and `token.update`. Rules: only when the option is on; `hp !== null && hp <= 0`; `TokenDeleted` straight after the token's `TokenStatsSet` and after all of that token's other events (an Area Effect row that also adds conditions must not emit a condition event after the delete). Done when the unit tests in 5.1 pass.
- [x] 2.4 Visibility: `AutoRemoveDefeatedSet` returns `pass` in `filterEventForViewer`; `autoRemoveDefeated` passes in `filterStateForViewer`; confirm `TokenDeleted` with `reason` is still redacted for hidden or fogged tokens; resolve the owner `resync` question per the ADR. Done when the visibility tests in 5.1 pass.
- [x] 2.5 Activity log and replay phrases: "<actor> turned automatic removal of defeated tokens on/off", "<name> was defeated and removed" for `TokenDeleted` with `reason` in `activityLog.ts` and `replay.ts`. Done when the activity log test has a label for the new event and the new phrase.

## 3. Undo

- [x] 3.1 In `undo.ts` make `TokenDeleted` with `reason: "defeated"` reversible (`isReversible`, `ReversibleEvent`), give it the inverse `TokenCreated { token }` in `inverseOf`, let `canUndo` accept a bare `TokenStatsSet` batch that also holds a defeat, skip the stats check for tokens deleted in the same entry in `undoConflict`, refuse when the token id or name is taken, and add the `describeUndo` phrase. Done when undo tests in 5.1 pass: undo restores the token and its previous HP in one action, manual `token.delete` is still not undoable, and an undo conflict is refused with its reason.

## 4. Server integration

- [x] 4.1 Add a multi-client integration test in `apps/server/test` (FR-TAC-07, FR-GM-23): the GM turns the option on, a visible token dies from applied damage (every client receives `TokenStatsSet` then `TokenDeleted` with `reason`), a hidden token dies (players receive neither event nor the token on reconnect), a player's attempt to change the option is forbidden, a reconnect snapshot lacks the token, and undo brings it back. Done when it passes.

## 5. Tests in `packages/shared/test`

- [x] 5.1 Add `autoRemoveDefeated.test.ts`, referencing FR-TAC-07 and FR-GM-23 in the `describe` names. Cases: option default on (a new room removes a token at 0 HP with no setup; a state without the field reads on); GM-only toggle and unchanged value refused; for each of `roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, `token.setStats` and `token.update` that HP at 0 or below removes only while on (a token landing exactly on 0 IS removed); `hp: null` stays; healing never removes; turning on is not retroactive; the deleted token carries the 0 or negative HP and `reason`; event order (stats then delete); `reduce` replay of the batch; visibility (hidden and fogged tokens redacted for players, shown to the GM; setting passed to everyone); undo and undo conflict; old snapshot without the field. Done when the file passes.

## 6. Web: Settings menu toggle

- [x] 6.1 Add the optional `room` prop to `ui/SettingsMenu.tsx` and a GM-only **Table** fieldset with the **Remove tokens at 0 HP** switch and hint, wired through `RoomMenu` to `RoomConnection.command("room.setAutoRemoveDefeated")` and reading `state.autoRemoveDefeated`; keep `AccountPages` unchanged; fix the "Saved in this browser" line. Done when the web test in 8.1 passes and the Playwright check in 9.2 shows it.

## 7. Web: death animation (`apps/web/src/board/`)

- [x] 7.1 In `effects.ts` add the `defeat` `AttackEffect` from `TokenDeleted` with `reason`, reading the token from the event, null for a player when hidden, and a pure `defeatPlan` (full effect, or a 250 ms fade for reduced motion or low graphics quality, and a concurrency cap). Done when the unit tests in 8.1 pass.
- [x] 7.2 In `boardView.ts` add the `dying` map so `syncTokens()` keeps the sprite until the animation ends (hard timeout, finish at once on destroy or full state replace, interaction off); add `playAttackEffect` handling for `defeat`; add `Board.tsx` wiring only if `onCommitted` needs it. Done when the Playwright check in 9.2 shows the token animating then leaving, and nothing plays after a reload.

## 8. Web tests

- [x] 8.1 Add `apps/web/test/autoRemoveDefeated.test.tsx` (FR-TAC-07): the switch shows for the GM only and sends the command; `attackEffectFor` gives a `defeat` for a visible defeat, null for a hidden token for a player, null for a plain `TokenDeleted`; `defeatPlan` honours reduced motion, table-wide `reducedEffects` and low quality. Done when it passes.

## 9. Final verification

- [ ] 9.1 Run `npm run lint && npm run typecheck && npm test` once. Done when all three pass.
- [ ] 9.2 Verify with the Playwright MCP: toggle the setting as GM, damage a token to 0 HP and see the animation, check a player view, undo from the activity log. Done when each is seen working.
