# Tasks

## 1. Control

- [x] 1.1 `LeaveTable.tsx`: `secondary small` button with the Phosphor `SignOut` icon.
- [x] 1.2 `RoomPage.tsx`: a `whoami-row` holds the identity text and the button as separate items.
- [x] 1.3 `styles.css`: row layout, danger colour on hover, narrow-layout truncation on the text only; drop the old link styles.

## 2. Verify

- [x] 2.1 `apps/web/test/leaveTable.test.tsx`: it is a button with the shared style, it asks first, and it sends `participant.leave` only on confirm.
- [x] 2.2 Check in a real room as a player, wide and narrow, and as the GM (`verification-log.md`).
- [x] 2.3 `npm run lint && npm run typecheck && npm test`.
