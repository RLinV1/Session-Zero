## Why

Players struggle to find Leave table. It sits inside the sentence "You are P1 (player) · Leave table", in the same grey as that sentence. The `button.link` style turns its underline off, so nothing marks it as a control until the pointer is already on it. On a phone the whole line truncates, so a long display name can push it out of view.

## What Changes

- **Leave table becomes a real button.** It uses the shared small neutral button style (`secondary small`), the same as the dashboard's Open and Delete, with a Phosphor sign-out icon, so it reads as a control at rest. Its text and border turn red on hover. Red stays off at rest because the design language keeps buttons neutral by default and it sits beside the board for the whole session.
- **It gets its own place on the identity row,** right-aligned beside "You are …", instead of running on inside the sentence. On a phone the name truncates and the button stays whole.
- **The confirmation no longer inherits the identity line's text styles,** because it is rendered outside that line.

**Unchanged:** it stays in the room sidebar, is never the panel's primary control, is hidden from the GM and during read-only views, and opens the same confirmation. Commands, events, schemas, server rules and visibility rules do not change.

## Capabilities

### Modified Capabilities
- `leave-table`: how the control looks and where it sits in the sidebar header.

## Impact

Web only: `apps/web/src/panels/LeaveTable.tsx`, `apps/web/src/pages/RoomPage.tsx`, `apps/web/src/styles.css`, and a new `apps/web/test/leaveTable.test.tsx`. No contract change, no ADR.
