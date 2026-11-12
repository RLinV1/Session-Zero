## Why

Players miss their turn. The only sign that their token is up is a "your turn" badge inside the Play tab and the highlighted row in the initiative list, which a player looking at the map or another tab doesn't see.

## What Changes

- **Turn notice for players.** When the active turn moves to a token the player owns, a notice appears over the board: "It's **Aria**'s turn." with **Show on board** (centers the token) and **Dismiss**. It hides itself after 6 seconds, and the next turn change replaces or clears it.
- Only a turn change seen live produces a notice; reloading mid-turn does not.
- The GM gets no notice: they run every turn that isn't a player's.
- The board's notice area becomes one shared live region for the GM's departure notices and the turn notice.

**Unchanged:** commands, events, schemas, server and visibility rules. The notice reads only the viewer's already filtered room state.

## Capabilities

### New Capabilities
- `turn-notice`: telling a player their token's turn has started.

## Impact

- **`apps/web`:** `ui/TurnNotice.tsx` (new), `ui/DepartureNotice.tsx` (cards only; the wrapper moves to the room page), `pages/RoomPage.tsx`, `styles.css`.
- **Tests:** `apps/web/test/turnNotice.test.ts`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
