## Why

When a player uses Leave table they vanish from the top bar's participant list, and only the GM is told (KAN-58). Everyone else at the table gets no signal that someone left, so players wonder whether that person dropped out, is still around, or was removed. KAN-73 closes that gap.

## What Changes

- A player who left on their own stays in the participants popover, marked with the text "AFK" (muted, not colour alone). They get no actions (no View as, Reset dice, Remove).
- The AFK entry does not count toward the participants count or the GM's player-seat count, and is still never offered in an owner picker.
- Every connected client, not only the GM, sees a notice "<name> has left the room." once, in the existing polite live region. The GM's notice keeps Review tokens and Dismiss; a player's notice has Dismiss only.
- A player removed by the GM (revoked) is neither shown as AFK nor announced to players. The GM's removal flow is unchanged.
- A reload never replays old notices (same first-snapshot rule as today).
- Web-only. No shared schema, command, event or visibility change: `ParticipantLeft` and the `left` / `revoked` flags already reach every client unfiltered (ADR 0006).
- Out of scope: marking players AFK because their connection dropped. State does not track connection presence today.

## Capabilities

### New Capabilities

### Modified Capabilities
- `leave-table`: the departure notice goes to every client, not only the GM; wording becomes "<name> has left the room."
- `room-participants`: the participants list also shows players who left, marked AFK; count and owner pickers still exclude them.

## Impact

- `apps/web/src/ui/DepartureNotice.tsx` (notice for all roles, Review tokens only for the GM)
- `apps/web/src/ui/ParticipantsButton.tsx` (AFK entries in the list)
- `apps/web/src/pages/RoomPage.tsx` (mount the notice for players too)
- Web CSS for the AFK row; tests in `apps/web` and a two-client check in `apps/server/test/leaveTable.test.ts` (FR-PL-06, KAN-58, KAN-73).
