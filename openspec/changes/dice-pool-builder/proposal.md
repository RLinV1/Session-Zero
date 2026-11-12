## Why

Rolls are entered four different ways. The Dice panel, group roll, area effect start, area effect damage, the home page demo, and the AI builder's draft editor take typed text (`1d20+5`), each with its own placeholder, default and error behaviour; the attack Custom roll uses die chips and a stepper; the attack editor uses a number, a die menu and a modifier. A roll can also hold only one type of die, so `2d6 + 1d4 + 3` (a sneak attack, a flaming sword) cannot be rolled at all. Users have to learn each control, and typing a formula is the least approachable of them.

## What Changes

- **One dice builder everywhere a roll is entered.** The user picks a number and a die type (d4, d6, d8, d10, d12, d20, d100), then uses **+ Die** to add another type of die and **+ Modifier** to add a constant, which may be negative. Each row can be removed. The builder shows the formula it makes (`2d6 + 1d4 + 3`). There is no text field for formulas anywhere in the app.
- Places it replaces: the Dice panel roll, Group roll, Area Effect start, Area Effect damage (including a called player's prompt), the attack Custom roll, the named-attack editor (token editor, New Token, Attack section, creature form), the AI builder's draft creature editor, and the home page dice demo. The Dice panel's example rolls (quick chips) are removed; the builder is the only way to choose dice there.
- **Mixed dice.** **BREAKING (schema)**: the dice grammar accepts several die terms and one modifier (`2d6+1d4+3`), at most 20 dice in all. Rolls, group rolls, area effects and named attacks can all hold mixed dice. Named attacks store a list of dice terms and a modifier; attacks saved in the old one-die shape still load.
- **Per-die breakdown, grouped by die type.** The Dice panel's roll log and the board's roll pop-up show `12 = 2d6 (4, 2) + 1d4 (3) + 3`. The pop-up's breakdown wraps on narrow screens and is not read out by screen readers (the roll log is). The activity log stays short: formula and total.
- **3D dice and board throws** show each die with its own shape when a roll mixes types.
- **Unchanged for typed clients:** commands still carry the formula as text, and the server still parses and rolls it. MCP seats and the AI builder keep working; the server keeps accepting the die sizes it accepts today (d2 to d1000) from them, while the app's builder offers the seven standard dice.

## Capabilities

### New Capabilities
- `dice-pool`: the dice formula (mixed die terms plus a modifier), the dice builder used for every roll input, and the per-die breakdown.

### Modified Capabilities
- `attack-rolls`: "Choosing dice and rolling": the Custom roll uses the dice builder and can mix dice.
- `group-rolls`: "The server rolls one formula for each selected token": the accepted form becomes the dice-pool formula.
- `gm-home`: "The home page demonstrates the product": the dice demo uses the builder, so there is no invalid expression to show.

## Impact

- **`packages/shared`:** `dice.ts` (grammar, `DiceExpression` as terms + modifier, roll and format, breakdown helper, `expression` max length 32 → 64), `attackPresets.ts` (`AttackDice` as terms + modifier, reading the old shape), `build.ts` (the AI builder's dice), `protocol.ts` (`diceDrop.expression` length), `decide.ts` call sites; tests.
- **`apps/web`:** a new `ui/DicePoolInput.tsx`; `panels/DicePanel.tsx`, `AreaEffectPanel.tsx`, `AttackPanel.tsx`, `pages/home/DiceTile.tsx`, `pages/build/DraftEditors.tsx`, `pages/build/BuildPage.tsx`; 3D dice (`ui/Die3D.tsx`, `ui/DiceTray.tsx`, `board/DroppedDice.tsx`, `board/tokenDice.ts`, `board/diceThrow.ts`, `panels/DiceThrowHandle.tsx`); `ui/RollCard.tsx`; per-token custom roll settings in browser storage (old shape still read); i18n.
- **`apps/mcp`:** `tools.ts`, `view.ts` format attacks with the new shape.
- **Persistence:** creatures' `attacks` JSON and token attacks in events keep the old shape until rewritten; both shapes parse. No database migration.
- **Docs:** a new ADR, [`docs/adr/0061-dice-pool-formulas.md`](../../../docs/adr/0061-dice-pool-formulas.md) (changes to `DiceExpression`, `AttackDice`, `DiceRoll`/`GroupRoll`/`diceDrop` lengths), review by the Real-Time Architecture owner; README FR-TAC-09 wording (`NdX + M`) updated to the mixed form.
