# Design

## Context

- `packages/shared/src/dice.ts`: `DiceExpression = { count, sides, modifier }`; `parseDiceExpression` matches one `NdX±M` term; `rollDice` returns `{ dice, total }`; `formatExpression` writes `NdX±M`. `MAX_DICE = 20`, sides 2–1000, modifier ±999.
- `DiceRoll`, `GroupRoll`, area effect `expression` fields: `string max(32)`, written by `decide` as `formatExpression(parsed)`, so they are canonical. `DiceRoll.dice` / `RolledDice.dice` are `number[]` in roll order with no sides.
- `AttackDice = { count, sides ∈ {4,6,8,10,12,20,100}, modifier ±99 }`, stored in token `attacks` (events and state), creature `attacks` (Postgres JSON), the AI builder's drafts (`build.ts` wraps it), and per-token custom roll settings in `localStorage`.
- `decide` parses at three sites: `dice.roll`, `areaEffect.rollDamage`, `rollForTokens` (group roll and area effect start).
- 3D dice take one `sides` per roll (`Die3D`, `DiceTray`, `DroppedDice`, `tokenDice`, `DiceThrowHandle`), but `labelDie(sides, value)` already works per die.
- Text inputs at seven sites (see proposal); attack Custom roll and `DiceField` are structured.

## Goals / Non-Goals

**Goals:**
- One data shape for a formula, shared by free rolls and named attacks.
- No change to command shapes: the wire carries text.
- Old events, stored creatures and browser settings keep loading.

**Non-Goals:**
- Subtracting dice (`1d20-1d4`), keep-highest, advantage, exploding dice.
- Changing the activity log's wording.
- Restricting what MCP seats may send beyond today's limits.

## Decisions

**Formula shape: `{ terms: { count, sides }[], modifier }`.** `DiceExpression` becomes this, with at least one term and the dice summed across terms ≤ 20 (which also bounds the number of terms). `AttackDice` becomes the same shape with sides limited to the seven standard dice, no repeated sides, and modifier ±99, so a builder value converts to either with no loss. Alternative: keep `{count, sides, modifier}` and add `extra[]`. Rejected: every reader that ignores `extra` would roll the wrong dice silently.

**Old shapes are read by preprocessing.** `AttackDice` is wrapped in `z.preprocess` that turns `{ count, sides, modifier }` into `{ terms: [{ count, sides }], modifier }`. This covers state snapshots, replayed events, creature JSON, and the AI builder's drafts with one rule, so nothing needs migrating. Writers always write the new shape. The `attacks` events keep their schema name; only the nested dice shape widens, which the ADR records.

**Grammar.** `parseDiceExpression` accepts `term (+ term)* ([+-] M)?` where a term is `N?dX`, whitespace and case ignored. Repeated die types are accepted from text (MCP may send `1d6+1d6`) and kept as separate terms; the builder never writes them. `formatExpression` writes `2d6+1d4+3`. Every existing one-term string parses to a one-term expression, so old behaviour is unchanged.

**Die types come from the stored formula, not a new field.** `decide` stores `formatExpression(parsed)`, and `rollDice` rolls terms in order, so a roll's dice line up with its formula's terms: `dice[0..count₀)` are the first term's, and so on. A shared `diceByTerm(expression, dice)` returns `[{ sides, values }]` for the breakdown and the 3D dice. Old rolls are one term, so they work unchanged. Alternative: add `sides: number[]` to `DiceRoll` and `RolledDice`. Rejected: it duplicates what the formula already says, and needs the same derivation for old rolls anyway. If the formula ever fails to parse (corrupted data), the breakdown falls back to the plain list of dice.

**Length limits.** The longest canonical formula the builder can make is about 40 characters (`1d4+1d6+1d8+1d10+1d12+1d20+14d100-99`); `expression` on `DiceRoll`, `GroupRoll`, area effects, `areaEffect.start` / `rollDamage` / `dice.roll` commands and the `diceDrop` ephemeral rise from 32 to 64. Widening a max accepts every old value.

**Builder component.** `ui/DicePoolInput.tsx` is a controlled component over `{ terms, modifier }` with props for defaults and an optional preset list. It owns the rules from the spec (unique die types, 20-dice cap, last row not removable, modifier ±99). Callers convert to text with `formatExpression` when sending. The Custom roll's chip-and-stepper layout and `DiceField` are both replaced by it; on phones the count is a stepper (−/+) and the die type a native `<select>`, so it stays tappable.

**Breakdown.** `diceByTerm` lives in `packages/shared` (pure). The web formats it through `t()` ("2d6 (4, 2) + 1d4 (3) + 3") in one helper used by the Dice panel's roll rows, group roll entries and `RollCard`. In `RollCard` the breakdown sits outside the `role="status"` text, marked `aria-hidden`, so screen readers hear only the headline.

**3D dice.** `layoutDice` and `Die3D` take `sides` per die instead of per roll; the drop and tray types carry `dieSides: number[]` built from `diceByTerm`. `DiceThrowHandle` shows the first term's die shape. `diceThrow`'s count limit uses the total dice across terms.

**Browser settings.** The per-token custom roll settings in `localStorage` are read through the same old-shape conversion; a value that does not parse falls back to the default `1d20`.

## Risks / Trade-offs

- [Wide blast radius: shared types change under server, web and MCP] → Do the shared change first behind passing tests, then update call sites by compiler errors; `npm run typecheck` finds every one.
- [The order-alignment assumption between formula and dice] → Pin it with a shared test that rolls `2d6+1d4` with a fixed random source and checks `diceByTerm`.
- [MCP AI builder tool schemas describe dice as `{count, sides, modifier}`] → The preprocess still accepts that shape, so existing AI clients keep working; the tool descriptions are updated to the new shape.
- [Losing quick typing for experienced users] → Accepted by the product owner; the Dice panel's example rolls are removed too, so the builder is the only path.

## Migration Plan

No data migration. Old events, snapshots, creatures and browser settings are read through the preprocess and the backward-compatible grammar. Server and web deploy together. Rolling back after mixed-dice rolls or attacks exist would leave values the old build cannot parse, so the ADR asks for review before merge rather than relying on rollback.
