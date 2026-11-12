## Why

An attack's damage roll can only be applied in full. **Apply −N** lowers the target's HP by exactly the roll's total, so a GM who rules half damage (a resistance, a successful save) or no damage has to edit HP by hand in the token editor, and add any condition the hit causes there too. Area effects already solve this with a resolve dialog: an amount field starting at the rolled damage, **Half**, **None**, and conditions to add. Single-target attack damage should work the same way.

## What Changes

- **Resolve joins Apply −N.** In the GM's Rulings list, each damage roll keeps **Apply −N** for applying the full damage in one tap, and gains **Resolve** beside it; the Rulings list is the one place the GM rules on and resolves attack rolls, their own included.
- **The AC points to a verdict.** On a to-hit roll whose target has an AC, the Rulings list shows **Hit** in the main button colour when the total is equal to or greater than the AC, and **Miss** in it otherwise. The GM still makes the call. It opens a resolve dialog for that one roll.
- **The resolve dialog** shows the target's name, the rolled damage and its formula, and the target's current HP, then:
  - an amount field starting at the roll's total, with **Half** (rounded down, as for area effects) and **None** (0); a negative amount heals, as in area effects;
  - when the room's preset has conditions on, the conditions checklist, adding to the target's conditions and never removing any;
  - **Confirm**, which applies the amount and conditions at once and marks the roll applied.
  Closing the dialog sends nothing.
- **One dialog per roll.** An attack that hit three targets made three damage rolls; each gets its own Resolve.
- **The command carries the GM's choice.** **BREAKING (schema)**: `roll.applyDamage` gains `amount` and `addConditions`. The server stops computing the amount from the roll's total and applies the GM's number within the same bounds as area effects. A command without `amount` keeps today's behaviour (full total), so older clients still work.
- **No new events.** The existing `TokenStatsSet`, `TokenConditionsSet` and `RollDamageApplied { amount }` record everything, and undo already reverses them as one action. `RollDamageApplied.amount` widens from "0 or more" to the same ±9999 bounds, so a heal can be recorded; old events still parse.
- **Activity log** reads "applied 4 of 8 damage …" when the amount differs from the total, and names any conditions added.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `attack-rulings`: "GM applies damage" becomes resolving damage with a chosen amount and conditions; "GM Rulings list" and "Player sees the outcome" show Resolve instead of Apply −N.

## Impact

- **`packages/shared`:** `commands.ts` (`roll.applyDamage` fields), `decide.ts` (amount and conditions, conditions-off refusal), `activityLog.ts`; tests in `attackRulings.test.ts`, `undo.test.ts`, `gamePresets.test.ts`.
- **`apps/web`:** `panels/RulingButtons.tsx`, `panels/RulingsPanel.tsx`, the resolve dialog (shared body extracted from `panels/ResolveDialog.tsx`), i18n strings in English and zh-TW.
- **`apps/server`:** an integration test that a resolve with conditions on a hidden target reaches players only as the existing filters allow.
- **Docs:** a new ADR, [`docs/adr/0062-resolve-attack-damage.md`](../../../docs/adr/0062-resolve-attack-damage.md), amending ADR 0011 (attack rulings), since an existing command schema changes; needs review by the Real-Time Architecture owner.
- **Visibility:** unchanged rules. `RollDamageApplied` still names no token, and HP and condition changes on hidden targets are withheld as today.
