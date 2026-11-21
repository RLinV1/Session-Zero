## Why

The Attack section reads as clunky and cluttered:
- The target shows twice, once as a line and again as a highlighted chip.
- Three field labels, a big dice tray, a checkbox, and separate Add attack, Custom roll and Edit controls are all stacked in one column.
- The result sits at the top, before anything has been picked, so the section reads bottom-up.

## What Changes

The section becomes four blocks, top to bottom: who, what, roll, result.
- **Who.** An attacker dropdown, then a target dropdown with a Pick on board button beside it. They replace the Attacker select, the Target line, the target chips and their labels. A viewer with one token sees its name, not a dropdown. The target dropdown lists targets nearest first, with distances.
- **What.** The named-attack dropdown, and a ⋯ menu holding Edit <attack>, Add attack and Custom roll. With no attacks yet, an **Add an attack** button takes the dropdown's place.
- **Roll.** One Roll button ("Roll to hit" or "Roll damage"; its accessible name gives the attack and target). For the GM, an eye button beside it turns "Roll privately" on and off, replacing the checkbox.
- **Result.** A compact card below the controls: "7 damage" or "17 to hit", the outcome (Hit, Miss, Applied), a line like "Firebomb · 2d6 · Goblin → Aria", and the GM's Hit/Miss or Apply buttons. The dice are thrown in a smaller tray at the top of the card.
- **Custom roll** opens from the ⋯ menu as a closable box with the same Roll button and private toggle.
- The dropdowns share one new component, `ui/Picker.tsx`, which replaces `AttackPicker`.

**Unchanged:** commands, events, schemas, server rules, visibility rules, named-attack storage, and the encounter-end reset.

## Capabilities

### Modified Capabilities
- `attack-rolls`: layout of the Attack section.

## Impact

- **Order:** stacked on `fix/attack-panel-reset-and-token-defaults` (`attack-panel-encounter-reset`). Archive that change first.
- **`apps/web`:** `ui/Picker.tsx` (new; replaces `panels/AttackPicker.tsx`), `panels/AttackPanel.tsx`, `styles.css`.
- **Tests:** `apps/web/test/attackRoll.test.ts` (`attackHeadline`).
- **No change** to `packages/shared`, `apps/server`, or any ADR.
