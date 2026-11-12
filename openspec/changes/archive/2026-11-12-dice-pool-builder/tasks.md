# Tasks

## 1. Contract (ADR first)

- [x] 1.1 Write `docs/adr/0061-dice-pool-formulas.md` (Status: Proposed; Requirements FR-TAC-09, FR-GM-22): `DiceExpression` and `AttackDice` become terms + modifier with old shapes preprocessed; `expression` lengths 32 → 64; die types derived from the canonical formula, no new roll field. Update README FR-TAC-09's wording from `NdX + M` to the mixed form. Verify: files exist; request review from the Real-Time Architecture owner.
- [x] 1.2 In `packages/shared/src/dice.ts`, change `DiceExpression` to `{ terms, modifier }`, rewrite `parseDiceExpression`, `rollDice` and `formatExpression`, and add `diceByTerm`. Verify: `packages/shared/test/dice.test.ts` under `describe("dice pool (FR-TAC-09)")` covers `2d6+1d4+3`, `d20`, `1d20-1`, 21 dice refused, `1d20+banana` refused, sides 1 and 1001 refused, repeated `1d6+1d6` accepted, and `diceByTerm` alignment with a fixed random source.
- [x] 1.3 Raise `expression` max to 64 on `DiceRoll`, `GroupRoll`, area effect schemas, the `dice.roll`, `areaEffect.start`, `areaEffect.rollDamage` and group roll commands, and `diceDrop` in `protocol.ts`. Verify: a schema test parses a 40-character formula in each.
- [x] 1.4 In `attackPresets.ts`, change `AttackDice` to terms + modifier (standard dice, unique sides, ≤ 20 dice, ±99) with a `z.preprocess` from `{ count, sides, modifier }`; update `build.ts`'s builder dice to match. Verify: tests that an old-shape attack, an old creature JSON and an old AI draft parse to one term, and that a repeated die type or 21 dice are refused.
- [x] 1.5 Fix `decide.ts` call sites (`dice.roll`, `areaEffect.rollDamage`, `rollForTokens`) and any attack helpers for the new shape. Verify: `npm run typecheck` and existing `decide` tests pass; a new group roll test with `1d20+1d4` per token.

## 2. MCP and server

- [x] 2.1 Update `apps/mcp/src/tools.ts` and `view.ts` (attack formatting) and the builder tool descriptions for the new dice shape. Verify: `npm test --workspace=@vtt/mcp` (or the MCP tests in `npm test`) pass, including one that sends old-shape dice.
- [x] 2.2 Add a server integration test: a player rolls `2d6+1d4+3` over the wire and another client receives a roll whose `diceByTerm` groups read 2 × d6 and 1 × d4.

## 3. Builder

- [x] 3.1 Add `apps/web/src/ui/DicePoolInput.tsx` implementing the builder rules (unique die types, 20-dice cap, last die row not removable, one modifier row ±99, formula readout, accessible names per row, stepper + `<select>` on phones). Verify: `apps/web/test/dicePoolInput.test.tsx` covers + Die, + Modifier, remove, the die menu hiding used types, the 20-dice cap, and a preset filling the builder.
- [x] 3.2 Replace the Dice panel's input with the builder and remove its quick chips (`DicePanel.tsx`). Verify: Dice panel tests roll `1d20` by default, show no example rolls, and roll a built formula.
- [x] 3.3 Replace Group roll (`DicePanel.tsx` `GroupRollForm`), Area Effect start and damage, including the called player's prompt (`AreaEffectPanel.tsx`). Verify: existing group roll and area effect web tests updated to drive the builder.
- [x] 3.4 Replace the attack Custom roll and `DiceField` in `AttackPanel.tsx` (used by the token editor, New Token, Attack section and creature form), reading old per-token `localStorage` settings. Verify: `tokenAttacksUi.test.tsx` and attack panel tests; a test that an old stored `{count:1,sides:20,modifier:5}` opens as 1 × d20 + 5.
- [x] 3.5 Replace the AI builder's draft creature dice fields (`pages/build/DraftEditors.tsx`, `BuildPage.tsx`) and the home page demo (`pages/home/DiceTile.tsx`). Verify: their tests, and a grep showing no remaining text input bound to a dice formula in `apps/web/src`.

## 4. Display

- [x] 4.1 Add one breakdown helper (via `t()`, English and zh-TW) on top of `diceByTerm`, and use it in the Dice panel roll rows, group roll entries, and `ui/RollCard.tsx` (breakdown `aria-hidden`, wrapping). Verify: tests for "2d6 (4, 2) + 1d4 (3) + 3", an old `1d20+5` roll, and the pop-up's live text excluding the breakdown.
- [x] 4.2 Make the 3D dice per-die: `Die3D`, `DiceTray`, `DroppedDice`, `tokenDice`, `diceThrow`, `DiceThrowHandle`, and `DicePanel`'s `trayRoll`. Verify: `tokenDice.test.ts` and a new test that a `1d20+1d4` drop lays out one d20 and one d4.

## 5. Verify

- [x] 5.1 `npm run lint && npm run typecheck && npm test`.
- [x] 5.2 In the running app: build `2d6+1d4+3` in the Dice panel and throw it on the board (two shapes land, pop-up shows the grouped breakdown); give a token a mixed-dice named attack and roll it; start an area effect and roll mixed damage; confirm the activity log reads formula and total only; check a phone-width viewport for the builder and pop-up.
