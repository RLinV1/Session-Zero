## Why

Dice are thrown in small trays in the side panel: the Attack section's and the Dice section's. Players looking at the map miss them, and a roll made by someone else only shows up if you happen to have the Dice tab open. Rolling should be a table moment everyone sees.

## What Changes

- **Public rolls are thrown on the board, for everyone.** Every new public roll, whether an attack roll or a Dice panel roll and whoever made it, throws its dice large over the centre of every connected participant's board.
- **A popup says what was rolled.** When the dice land, a popup under them shows the result for 4 seconds:
  - an attack roll: "7 damage" / "17 to hit", then "Firebomb damage · 2d6 · Goblin → Aria";
  - a plain roll: "19", then "Pat · 1d20".
- **Private rolls stay in the panel.** A GM-only roll is thrown in the GM's panel tray: the Attack section's card for their own attack, otherwise the Dice section's tray. The GM also gets the popup, marked GM only. Players never receive GM-only rolls, so they see nothing.
- The Dice section's row for the latest roll still waits for the dice to land before showing the total.
- Rolls already on the table when the room loads, or when a viewer reconnects, aren't thrown again.

**Unchanged:** commands, events, schemas, server rules and visibility filters. Everything shown comes from each viewer's already-filtered room state, so hidden tokens stay "Unknown" and GM-only rolls never reach players.

## Capabilities

### New Capabilities
- `board-dice`: throwing rolls on the board and announcing them.

## Impact

- **Order:** stacked on `attack-section-compact`, which removes the public tray from the Attack section.
- **`apps/web`:**
  - `ui/BoardDice.tsx` (new): the board overlay and popup.
  - `board/Board.tsx`: an `overlay` slot.
  - `pages/RoomPage.tsx`: which roll is being thrown and when it landed, for the board and the panels.
  - `panels/DicePanel.tsx`: tray only for private rolls, driven by the room page.
  - `panels/AttackPanel.tsx`: tray only for private rolls.
  - `panels/RoomPanel.tsx`: passes the throw state.
  - `panels/attackRoll.ts`: `rollHeadline`.
  - `net/roomConnection.ts`: `snapshots`, a count of full snapshots received.
  - `styles.css`.
- **Tests:** `apps/web/test/attackRoll.test.ts` (`rollHeadline`).
- **No change** to `packages/shared`, `apps/server`, or any ADR.
