# Design

## Decisions

1. **Ownership, not `can.attackWith`.** `turnNoticeToken(previousActiveId, state, you)` returns the newly active token only if `you` is a player listed in its `ownerIds`. The GM can act for every token, so `can.attackWith` would notify them on every turn.
2. **Live changes only.** `TurnNotice` remembers the active token id; the first render only records it. This matches `DepartureNotices`, so a reload doesn't replay old news.
3. **One live region.** Two absolutely positioned `.board-notices` containers would overlap, so `RoomPage` renders a single `role="status"` container holding the GM's departure cards and the turn notice. `DepartureNotices` now returns only its cards.
4. **Short-lived.** The notice hides after 6 seconds, and any turn change replaces it, so it never names a turn that has passed. Show on board reuses `focusToken`.

## Non-goals

- Browser or OS notifications, sounds, or a tab-title flash.
- A notice for the GM.
