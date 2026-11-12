# ADR 0061 — Dice formulas with several die types

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0010-attack-roll-context.md` (roll formula), `docs/adr/0046-area-effects.md` (formula length)
**Change:** `openspec/changes/dice-pool-builder` · **Requirements:** FR-TAC-09, FR-GM-22

## Context

A roll held one die type: `DiceExpression = { count, sides, modifier }` and the grammar `NdX±M`. A sneak attack (`2d6 + 1d4 + 3`) or a flaming sword could not be rolled, and named attacks (`AttackDice`) had the same limit. The app also takes rolls four different ways (typed text, die chips, a number and a menu); the change replaces them all with one dice builder, which needs one data shape for a formula.

## Decision

- **Formula shape.** `DiceExpression` becomes `{ terms: { count, sides }[], modifier }`: at least one term, at most 20 dice summed across terms, sides 2–1000, modifier ±999, as before.
- **Grammar.** `parseDiceExpression` accepts `term (+ term)* ([+-] M)?`, a term being `N?dX`, ignoring whitespace and case. Every old single-term string parses to a one-term expression with the same meaning. A repeated die type from text (`1d6+1d6`) is kept as two terms; the app's builder never writes one. `formatExpression` writes the canonical `2d6+1d4+3`.
- **Commands are unchanged.** They still carry the formula as text, which the server parses and rolls, so MCP seats and the AI builder keep working with the die sizes they may send today.
- **Lengths.** `expression` on `DiceRoll`, `GroupRoll`, area effects and their damage, the `dice.roll`, `dice.rollGroup`, `areaEffect.start` and `areaEffect.rollDamage` commands, and the `diceDrop` ephemeral rises from 32 to 64 characters. The longest builder formula is about 40. Widening a maximum accepts every old value.
- **No new roll field.** `decide` stores the canonical formula and `rollDice` rolls terms in order, so a roll's `dice` line up with its formula's terms. The shared `diceByTerm(expression, dice)` recovers each die's type for the breakdown and the 3D dice; old rolls are one term and work unchanged. If a formula doesn't account for the dice (corrupted data), callers show the plain dice.
- **Named attacks.** `AttackDice` becomes `{ terms, modifier }` with the seven standard dice, each die type once, at most 20 dice, modifier ±99. It is a `z.preprocess` that reads the old `{ count, sides, modifier }` as one term, so token attacks in stored events and snapshots, creatures' `attacks` JSON, AI build drafts and per-token browser settings all keep loading with no migration. Writers always write the new shape. Event and command names are unchanged; only the nested dice shape widens.

## Consequences

- Clients built before this change cannot read mixed-dice rolls or attacks. Server, web and MCP ship together from the shared package; rolling back after mixed dice have been used would leave values the old build can't parse, so this needs review before merge rather than relying on rollback.
- The roll log, group roll entries and the board's roll pop-up can show each die grouped by type ("2d6 (4, 2) + 1d4 (3) + 3"); the activity log keeps formula and total.

## Alternatives considered

- **Keep `{ count, sides, modifier }` and add `extra[]`.** Rejected: any reader that ignored `extra` would silently roll the wrong dice.
- **Store `sides: number[]` on each roll.** Rejected: it repeats what the formula already says, and old rolls would need the same derivation anyway.
