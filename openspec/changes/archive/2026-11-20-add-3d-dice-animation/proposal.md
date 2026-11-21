# Proposal

## Why

A roll at the table arrived as a text row: the total was on screen the instant the server answered, with nothing that looked like dice being thrown. That is the one moment in an encounter everyone watches together, and the table gave it no presence. The home page's dice demo had its own separate animation, a flat tumble of number chips, so the page advertising the table's dice showed dice the table did not have.

## What Changes

- **Rolls are thrown as 3D dice in the room's Dice panel**, for players and the GM alike. Each new roll drops into a tray above the latest-roll row, bounces, tumbles and comes to rest on the values the server rolled. Every participant who receives the roll sees it thrown, not just the roller.
- **The result waits for the dice.** While the dice are in the air the row says who is rolling what; the total and each die's value appear, and are announced to screen readers once, when the dice land.
- **Rolls already on the table are not replayed.** Joining, reloading, reconnecting or switching phone tabs shows the latest roll at rest.
- **GM-only rolls** are thrown in the GM's private colours (slate dice, amber numerals) next to the existing "GM only" badge. Players never receive them, so they never see them thrown.
- **Real dice shapes:** d4, d6, d8, d10, d12 and d20 are drawn as their polyhedra, with opposite faces summing as on real dice and 6 and 9 underlined where both appear. A d4 lands as a pyramid and is read at its top corner. A d2 or d3 is a d6 numbered over again; other odd sizes use the next body up; anything over twenty is a d20 printed with the rolled value.
- **Reduced motion:** no throw; the dice are drawn at rest and the result shows at once.
- **The home page's dice demo throws the same dice** from the same component, replacing its flat tumble. It still rolls with the shared parser and roller and shows every die with the total.
- **No contract change.** Commands, events, state, visibility filters and the server are untouched; the animation only presents a roll that has already been made. No dependency is added.

## Capabilities

### New Capabilities
- `dice-roll-animation`: how a roll is presented as thrown 3D dice: in the room (every participant, result held until landing, no replay, GM-only colours, reduced motion) and in the home page's dice demo, and the rule that the dice always come to rest showing the rolled values.

### Modified Capabilities
None. The home page's dice scenario ("every die is shown alongside the total") belongs to the in-flight `home-page-redesign` change's `gm-home` delta and remains true as written; this change does not edit it.

## Impact

- **apps/web:** new `ui/DiceTray.tsx` (the tray and the throw) and `ui/diceGeometry.ts` (polyhedra, face numbering, resting rotations); `panels/DicePanel.tsx` (tray, held result row); `pages/HomePage.tsx` (demo uses the tray; its interval-driven tumble is removed); `styles.css` (tray and die styles added, the demo's flat die and tumble styles removed); new `test/diceGeometry.test.ts`.
- **packages/shared, apps/server:** none. No schema change, so no ADR.
- **Dependencies:** none. The dice are CSS 3D transforms and SVG faces, driven by the Web Animations API; no WebGL, and the board's Pixi code is not involved.
