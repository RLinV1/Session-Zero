## 1. Participants list

- [x] 1.1 In `ParticipantsButton.tsx`, list `left && !revoked` participants after active ones, marked with the text "AFK", muted, with no action buttons; keep count and seat total active-only. Verify with a component test that Sam shows "AFK", has no buttons, and the count is unchanged (FR-PL-06, KAN-73).
- [x] 1.2 Add CSS for the muted AFK row and badge. Verify in the browser that the label is readable in light and dark themes and is text, not colour alone.

## 2. Departure notice

- [x] 2.1 Change `DepartureNotice.tsx` to read "<name> has left the room." and make Review tokens appear only when an `onReview` handler is passed. Verify with component tests for the GM (Review tokens present when tokens owned) and a player (Dismiss only).
- [x] 2.2 In `RoomPage.tsx`, mount the notices for every role, passing `onReview` only for the GM and keeping the preview gating. Verify the GM and a player both see one notice after a leave, and a revoke gives players none.
- [x] 2.3 Verify a reload shows no old notice and a second leave shows exactly one new notice (component test with a snapshot swap).

## 3. Integration and verification

- [x] 3.1 Add a two-client case to `apps/server/test/leaveTable.test.ts` (FR-PL-06, KAN-58, KAN-73) asserting the other client's state has the leaver `left: true` and a revoked player has `revoked: true`. Verify `npm test --workspace=@vtt/server -- -t "leave"` passes.
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test`, then verify the flow in the browser (GM + player: leave, AFK entry, notices, reload, revoke) with Playwright.
