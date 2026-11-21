# Tasks

## 1. Components

- [x] 1.1 Add `apps/web/src/ui/Picker.tsx` (select-only combobox with label, detail, check on the chosen option); remove `panels/AttackPicker.tsx`.
- [x] 1.2 Add `attackHeadline` to `panels/attackRoll.ts`; test it in `apps/web/test/attackRoll.test.ts`.

## 2. Attack section

- [x] 2.1 Rebuild `AttackForm` as who (attacker, then target and Pick on board), what (attack dropdown and ⋯ menu), roll (Roll button and private toggle), result (compact `LatestAttack`).
- [x] 2.2 Custom roll opens from the menu as a closable box, with the same Roll row.
- [x] 2.3 Styles in `styles.css`: picker, menu, rows, result card; drop the target-chip and old picker styles.

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test`.
- [x] 3.2 Playwright (script with `playwright-core`; the Playwright MCP profile was locked): pick attacker and target from the dropdowns, add two attacks from the ⋯ menu, roll, check the card text and the private toggle, open Custom roll. Found and fixed: attacker and target truncated to one letter on one line, so they now take two lines.
