# Design

## Context

- `roll.applyDamage { rollId }` (ADR 0011): `decide` works out `amount = max(0, roll.total)`, emits `TokenStatsSet` (when HP changes) and `RollDamageApplied { rollId, amount }`, then `withDefeats` adds any defeat removal.
- `areaEffect.resolve` (ADR 0046) already accepts a GM-chosen amount per target, from −9999 to 9999 (`MAX_AREA_AMOUNT`), plus `addConditions`. It heals on a negative amount, never above Max HP, and adds conditions without removing any (at most 12).
- `ResolveDialog.tsx` renders the area version: header results (roll, damage, HP), the amount field with Half / None, `ConditionPicker`, and Previous / Next / Confirm / Skip. `resolveDraft.ts` keeps the draft per effect.
- Undo (`undo.ts`) already reverses `TokenStatsSet`, `TokenConditionsSet` and `RollDamageApplied` (→ `RollDamageUnapplied`) as one action, and `canUndo` allows a stats change when a `RollDamageApplied` is in the same action.
- `RollDamageApplied` names no token; `visibility.ts` withholds it for GM-only rolls and for targets the player sees as Unknown.

## Goals / Non-Goals

**Goals:**
- One rule for how a GM-chosen amount changes HP, shared by area effects and attack damage.
- One dialog body, so both resolves look and behave the same.

**Non-Goals:**
- Stepping through several damage rolls in one dialog (decided: one dialog per roll).
- Resolving damage rolls whose target does not track HP (they stay out of the Rulings list, as today).
- Changing to-hit rulings, the area effect flow, or what players see.

## Decisions

**Extend `roll.applyDamage`; don't add a new command.** Add optional `amount` (int, ±`MAX_AREA_AMOUNT`) and `addConditions` (`ConditionId[]`, max 12, default `[]`), `.strict()`. Absent `amount` means "the roll's total, floored at 0", so an old client or an MCP seat that sends `{ rollId }` behaves as before. A new `roll.resolveDamage` command would leave two ways to do one thing and two code paths in `decide` and undo. The name stays `applyDamage` for compatibility; only the UI says Resolve.

**No event change.** `RollDamageApplied.amount` (`min(0)` today) records the applied amount. A heal is a negative amount, so the schema relaxes to `int` with the same bounds. That is a change to an existing event schema and goes in the ADR; old events (all ≥ 0) still parse. Conditions are recorded by the existing `TokenConditionsSet` with `previous`. Order in the action: `TokenStatsSet`, `TokenConditionsSet`, `RollDamageApplied`, then defeats, matching the area resolve.

Alternative considered: keep `amount ≥ 0` and forbid healing from an attack resolve. Rejected: the shared dialog already explains negative amounts heal, and treating the two dialogs differently would surprise the GM.

**One HP rule.** Extract the "apply an amount to a token's stats" logic from the `areaEffect.resolve` branch into a shared helper in `decide.ts` (damage floored at `MIN_HP`, heal capped at Max HP and never lowering HP), and call it from both commands. This keeps the two resolves from drifting.

**Activity log.** `RollDamageApplied` reads "applied N damage from <roll>" when N equals the roll's total, "applied N of T damage from <roll>" when it differs, and "healed N from <roll>" when negative. Added conditions already produce their own `TokenConditionsSet` line.

**Dialog: split the body out of `ResolveDialog`.** Extract a `ResolveTargetBody` component (header results, amount with Half / None and the hint, the conditions picker) used by both dialogs. The area dialog keeps Previous / Next / Apply-to-all / Skip around it; the damage dialog has one target, so it shows only Confirm. The damage dialog's draft (`{ rollId, amount, added }`) lives in `RulingsPanel` state keyed by roll id, so closing and reopening keeps it; it is dropped when the roll becomes applied, which also closes the dialog.

**Where Resolve appears.** `RulingButtons`'s damage branch keeps "Apply −N" (`roll.applyDamage { rollId }`, the full total) and adds "Resolve" with an `onResolve` callback. Its only caller is the Rulings list: the GM's own latest-roll card no longer offers rulings, and the GM resolves their own rolls from the list like any other.

## Risks / Trade-offs

- [The server no longer checks the amount against the roll] → The GM is the only one who can send it, and the GM can already set any HP in the token editor; the bounds stop absurd values. Tests cover a player's attempt (forbidden).
- [`RollDamageApplied.amount` widened to negative] → Players' clients on an old build would fail to parse a negative amount. Old and new web clients ship together from the same server; MCP seats parse events through the same shared package version. Called out in the ADR.
- [Two dialogs open at once (area and damage)] → Both are modal; opening one closes the panel's other dialog state.

## Migration Plan

No data migration: old events parse unchanged, and an old command shape still works. Deploy server and web together as usual. Rollback is a redeploy; events with negative amounts written in between would fail to parse on the old build, so roll back only before any heal-from-attack has been used, or keep the relaxed event schema.
