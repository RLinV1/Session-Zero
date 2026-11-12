# Proposal

## Why

Settings is buried in the room bar's "More" menu (`RoomMenu.tsx`), next to unrelated actions (Activity log, Replay, Guide), so people struggle to find it. Some personal preferences live elsewhere: arrow-key token movement is a toggle on the token card. Players also have no way to cut down attack animations at a busy table.

## What Changes

- **Settings gets its own button.** On desktop, an icon-only gear button sits in the room top bar beside "More" and opens the Settings dialog. On phones (the `compact` layout), Settings stays an item inside "More", like Share. "More" otherwise keeps Activity log, Replay and Guide. The Settings dialog no longer belongs to `RoomMenu`.
- **New Controls tab** in the Settings dialog, holding **Arrow keys move selected token**. The toggle moves off the token card (`TokenCard.tsx`). Each browser's current choice (`vtt.ui.arrowKeyMove`) is carried over once, so nobody loses it.
- **New "Attack animations" setting** on the Graphics tab: **All**, **Current turn**, **None**. It is per browser and never sent to the server.
  - **All:** every attack effect plays, as today.
  - **Current turn:** during an encounter, a strike and its hit/miss ending play only when the attacker is the token whose turn it is. Damage numbers always play. A nuke has no attacker; it counts as a strike and plays only on an NPC token's turn (one with no owner). With no encounter running, this behaves like All.
  - **None:** no strikes, hit/miss endings or damage numbers (including an area effect's damage numbers and a nuke's blast). The defeat fall still plays, so a removed token never just vanishes.
  - Dice throws and area-effect save dice are not attack animations and are unaffected. "Focus on attacks" only follows strikes that play.
- **Settings survive new fields.** Stored settings are merged over the defaults before they are validated. Today `isClientSettings` throws away the whole stored object when a field is missing, which would reset everyone's volume and graphics choices when a field is added.
- The account pages use the same Settings dialog, so they get the Controls tab and the new Graphics setting too.

No shared schema, command, event or server change.

## Capabilities

### New Capabilities
- `client-settings`: where Settings opens from (desktop gear button, the phones' "More" item), the dialog's tabs, the Controls tab with arrow-key movement, and carrying stored settings forward as new fields are added.

### Modified Capabilities
- `board-attack-effects`: adds the viewer's Attack animations choice (All / Current turn / None), deciding which attack effects play on their board.

## Impact

- `apps/web/src/ui/RoomMenu.tsx`: Settings item only on phones; the dialog's open state moves out.
- `apps/web/src/pages/RoomPage.tsx`: gear button in `topbar-end` on desktop; guide-tour focus return still works.
- `apps/web/src/ui/SettingsMenu.tsx`: Controls tab; Attack animations control on Graphics.
- `apps/web/src/ui/clientSettings.ts`: `arrowKeyMove` and `attackAnimations` fields, merge-over-defaults read, one-time carry-over of `vtt.ui.arrowKeyMove`.
- `apps/web/src/board/Board.tsx`, `board/TokenCard.tsx`: read arrow-key movement from client settings, remove the card toggle, filter effects after `attackEffectFor` by the chosen mode.
- Web tests for the settings migration and the effect filter (with the active initiative token).
