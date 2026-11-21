# Design

## Decisions

1. **One throw state, in the room page.** `RoomPage` holds the table's latest roll and the id of the last roll that landed. A roll is "thrown" while it is newer than that id. The board overlay, the Attack card and the Dice section all read the same `rollThrow`, so they agree on when the total may be shown. Every full snapshot (`welcome`: load, reconnect or resync) resets the landed id to that snapshot's latest roll, so joining, reconnecting or resyncing doesn't replay old rolls, including ones made while this viewer was offline. `RoomSnapshot.snapshots` counts welcomes, which tells a replaced state apart from one moved on by events. This replaces the Dice section's own landed state.
2. **Where it lands.**
   - A public roll: the board (`BoardDice`), for every viewer.
   - A private roll: the GM's panel tray. The Attack card's tray is used for the GM's own attack while Play is showing, and the Dice section's tray while Dice is showing.
   - A private roll with neither tray in view lands at once. Otherwise it would stay "Rolling…" forever.
3. **Popup after landing.** On landing, the room page sets `popupRollId` for 4 seconds (`ROLL_POPUP_MS`). `rollHeadline` gives the text: `attackHeadline` for attack rolls, otherwise the total and "<roller> · <dice>". The popup is `role="status"`, so screen readers announce it.
4. **Board overlay slot.** `Board` gets an `overlay` prop, drawn above the map and below the toolbar and notices, with `pointer-events: none`, so it never blocks panning, placing or targeting. It is plain DOM over the canvas; no Pixi code changes (CLAUDE.md: Pixi stays in `board/`).
5. **No leak path.** The overlay reads only `state.rolls` from the viewer's filtered snapshot (invariant 3). GM-only rolls are already absent from players' state, and attack parties are already "Unknown" for hidden tokens.

## Risks

- **Two rolls close together:** the second replaces the first mid-throw. That matches how the Dice tray worked before.
- **The GM's private popup appears on their board.** If the GM shares their screen, players could see it there. It carries a GM-only badge, and the dice themselves stay in the panel.
