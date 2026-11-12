# Tasks

## 1. Notice

- [x] 1.1 Add `apps/web/src/ui/TurnNotice.tsx` with `turnNoticeToken` and `TurnNotice`. Verify in `apps/web/test/turnNotice.test.ts`: a player's own token notifies; another token, an unchanged turn, the GM and no encounter do not.
- [x] 1.2 Render one `.board-notices` live region in `RoomPage` with the GM's departure cards and the turn notice; `DepartureNotices` returns cards only. Accent left border for the turn notice.

## 2. Verify

- [x] 2.1 `npm run lint && npm run typecheck && npm test`.
- [x] 2.2 Playwright (run from a script with `playwright-core`; the Playwright MCP browser profile was locked by another session): GM and player in two tabs; advance to the player's token and check the notice appears for the player only and hides after 6 seconds. Show on board was not clicked in the script; it reuses the existing `focusToken`.
