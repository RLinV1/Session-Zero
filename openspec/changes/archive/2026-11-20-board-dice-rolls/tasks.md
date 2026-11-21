# Tasks

## 1. Throw state

- [x] 1.1 In `RoomPage`, track the table's latest roll, the last landed roll and the popup roll; land a private roll at once when neither panel tray is in view; pass `rollThrow` to the panels.
- [x] 1.1a Reset the landed roll on every full snapshot (`RoomSnapshot.snapshots`), not only the first. Found in review: a reconnect replayed a roll made while offline. Verified in Playwright by dropping the player's socket while the GM rolled: nothing replays on reconnect, and the next live roll still throws.
- [x] 1.2 Add `rollHeadline` to `panels/attackRoll.ts`; test attack and plain rolls in `apps/web/test/attackRoll.test.ts`.

## 2. Board and panels

- [x] 2.1 Add `ui/BoardDice.tsx` and an `overlay` slot on `Board`; style `.board-dice` and `.board-roll-popup` (no pointer input).
- [x] 2.2 `DicePanel`: tray only for private rolls, driven by `rollThrow`; the row waits for the landing.
- [x] 2.3 `AttackPanel`: tray only for private rolls, driven by `rollThrow`.

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test`.
- [x] 3.2 Playwright (script with `playwright-core`), GM and player in two browsers:
  - the GM's public attack is thrown on both boards, with the same popup;
  - the GM's private attack is thrown in the GM's card, with a GM-only popup on the GM's board and nothing for the player;
  - the player's Dice section roll is thrown on the player's board, and the GM's board shows "19 / Pat · 1d20".
