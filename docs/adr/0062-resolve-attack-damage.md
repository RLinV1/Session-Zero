# ADR 0062 — Resolving attack damage with a chosen amount and conditions

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0011-attack-rulings.md` (damage) · **Extends:** `docs/adr/0046-area-effects.md`
**Change:** `openspec/changes/resolve-attack-damage` · **Requirements:** FR-TAC-07, FR-GM-22

## Context

ADR 0011 has `roll.applyDamage { rollId }` lower the target's HP by exactly the roll's total. A GM who rules half damage (a resistance, a successful save) or no damage, or a hit that also knocks the target prone, has to edit the token by hand afterwards. Area effects (ADR 0046) already let the GM choose an amount per target and add conditions, in one action. Single-target attack damage should work the same way.

## Decision

- **Command.** `roll.applyDamage` gains two optional fields, and becomes `.strict()`:
  - `amount`: a whole number from −`MAX_AREA_AMOUNT` to `MAX_AREA_AMOUNT` (±9999). Absent means the roll's total, floored at 0, exactly as before, so an older client or an MCP seat sending `{ rollId }` keeps working.
  - `addConditions`: `ConditionId[]`, at most 12, default `[]`.
  The command keeps its name; only the UI calls it Resolve. A separate `roll.resolveDamage` would leave two ways to do one thing, and two paths through `decide` and undo.
- **One HP rule.** `decide` applies the amount with the same helper as `areaEffect.resolve`: damage lowers HP to no less than `MIN_HP`; a negative amount heals, never above Max HP when the token has one and never lowering HP; zero leaves HP unchanged.
- **Conditions.** Added to the target's conditions, never removing one; at most 12 (`invalid` otherwise). Adding any while the room's game preset has conditions off is refused as for any other preset-disabled action.
- **Events.** No new event. One action carries, in order:
  1. `TokenStatsSet` with `previous`, when HP changes;
  2. `TokenConditionsSet` with `previous`, when conditions change;
  3. `RollDamageApplied { rollId, amount }`, always;
  4. any defeat removal, as today.
- **Event schema change.** `RollDamageApplied.amount` and `RollDamageUnapplied.amount` widen from `int ≥ 0` to an int within ±`MAX_AREA_AMOUNT`, so a heal from an attack can be recorded. Every stored event (all ≥ 0) still parses.
- **Undo.** Unchanged: the existing inverse events already reverse HP, conditions and the applied mark as one action.
- **Visibility.** Unchanged: `RollDamageApplied` names no token and keeps ADR 0011's rules; `TokenStatsSet` and `TokenConditionsSet` keep their hidden-token rules.
- **Activity log.** "applied N of T damage" when the amount differs from the roll's total, "healed N" when it is negative.

## Consequences

- The server no longer checks the amount against the roll. Only the GM can send it, and the GM can already set any HP in the token editor; the bounds stop absurd values.
- A client built before this change cannot parse a negative `RollDamageApplied.amount`. Web clients ship with the server, and MCP seats parse events through the same shared package version. Rolling back after a heal-from-attack has been recorded needs the relaxed event schema kept.

## Alternatives considered

- **A new `roll.resolveDamage` command.** Rejected above: two commands for one action.
- **Forbid healing from an attack resolve (keep `amount ≥ 0`).** Rejected: the shared resolve dialog already says a negative amount heals, and treating the two dialogs differently would surprise the GM.
