# Tasks

## 1. Contract (ADR first)

- [x] 1.1 Write `docs/adr/0060-resolve-attack-damage.md` (Status: Proposed, amends ADR 0011; Requirements FR-TAC-07, FR-GM-22): `roll.applyDamage` gains optional `amount` and `addConditions`; `RollDamageApplied.amount` allows negatives; no new events. Verify: the file exists and is linked from the change's proposal; request review from the Real-Time Architecture owner.
- [x] 1.2 In `packages/shared/src/commands.ts`, add `amount` (int, ±`MAX_AREA_AMOUNT`, optional) and `addConditions` (`ConditionId[]`, max 12, default `[]`) to `roll.applyDamage`, `.strict()`. In `events.ts`, relax `RollDamageApplied.amount` / `RollDamageUnapplied.amount` to an int within the same bounds. Verify: `npm run typecheck`, and a schema test that `{ type, rollId }` still parses.

## 2. Decide

- [x] 2.1 Extract the area resolve's HP rule into a helper in `decide.ts` and use it from `areaEffect.resolve`. Verify: existing `areaEffects` tests pass unchanged.
- [x] 2.2 Rewrite the `roll.applyDamage` branch: amount defaults to `max(0, total)`; apply it with the helper; add conditions (preset refusal when conditions are off, at most 12); emit `TokenStatsSet`, `TokenConditionsSet`, `RollDamageApplied { amount }`, then `withDefeats`. Verify: new cases in `packages/shared/test/attackRulings.test.ts` under `describe("resolve attack damage (FR-TAC-07)")` for full, half, none + condition, heal capped at Max HP, missing amount, out-of-bounds amount, conditions off, 13th condition, double apply, player forbidden.
- [x] 2.3 Undo: verify in `undo.test.ts` that undoing a resolve with HP and a condition restores both and unapplies the roll in one action, and that a None + condition resolve is undoable.
- [x] 2.4 Activity log: "applied N of T damage" when the amount differs, "healed N" when negative. Verify with cases in the activity log tests.

## 3. Visibility and server

- [x] 3.1 Verify `visibility.ts` needs no change: add a shared test that a resolve adding Prone to a hidden target sends players neither the conditions change nor the applied mark, and a revealed target's condition change does reach them.
- [x] 3.2 Add an integration test in `apps/server/test` where the GM resolves half damage and a condition over the wire and a connected player sees the new HP and condition on a visible token.

## 4. Web

- [x] 4.1 Extract `ResolveTargetBody` from `panels/ResolveDialog.tsx` (results header, amount + Half / None + hint, `ConditionPicker`) and use it in the area dialog. Verify: existing area resolve web tests pass.
- [x] 4.2 Add `panels/DamageResolveDialog.tsx` using `ResolveTargetBody` with a single Confirm, sending `roll.applyDamage { rollId, amount, addConditions }`; invalid amounts block Confirm with the message; refused resolves keep the dialog open. Verify: a web test opens it, presses Half, checks Poisoned, confirms, and asserts the sent command.
- [x] 4.3 Change `RulingButtons`'s damage branch to **Resolve** (`onResolve`), keep the draft per roll in `RulingsPanel`, drop it and close the dialog when the roll becomes applied. (The GM's own latest-roll card no longer offers rulings; the Rulings list is enough, by product decision.) Verify: tests for "closing keeps the draft" and "applied elsewhere closes the dialog".
- [x] 4.4 Strings: `ruling.resolve`, `ruling.resolveNamed`, damage-dialog title text, in English and zh-TW (terms per `docs/GLOSSARY-zh-TW.md`); remove `ruling.applyMinus` / `ruling.applyDamage` if unused. Verify: `npm run lint` (no literal text) and typecheck.

## 5. Verify

- [x] 5.1 `npm run lint && npm run typecheck && npm test`.
- [x] 5.2 In the running app, GM and player in two tabs: player rolls damage at a goblin, GM resolves Half with Prone; the player sees the halved HP and Prone; GM undoes from the activity log and both revert.
