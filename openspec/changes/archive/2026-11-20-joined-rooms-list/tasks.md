## 1. Identity

- [x] 1.1 In `apps/web/src/net/identity.ts`, add optional `roomName` to `StoredCredentials`; add `listJoinedRooms(storage?)` and `rememberRoomName(roomId, name)`.
- [x] 1.2 Unit tests in `apps/web/test/joinedRooms.test.ts`: lists guest seats sorted by name, excludes GM seats, skips malformed entries, returns `[]` when storage throws, name round-trip.

## 2. Room page

- [x] 2.1 In `RoomPage.tsx`, call `rememberRoomName` when `state.name` changes and `forgetCredentials` on refusal `unauthorized`; add `refusal` to the `RoomConnection` snapshot.

## 3. Home page

- [x] 3.1 In `HomePage.tsx`, render a `JoinedRooms` block in `.hero-paths` before `JoinBlock`; rows link to `/r/<roomId>`. Nothing renders when the list is empty.
- [x] 3.2 Styles in `apps/web/src/styles.css`, matching the other hero paths.

## 4. Verification

- [x] 4.1 Browser (Playwright MCP): join a room as a guest, go to `/`, the room is listed by name and opens; a GM-created room is not listed; a seat for an unknown room is removed after one visit.
- [x] 4.2 `npx openspec validate joined-rooms-list`, then `npm run lint && npm run typecheck && npm test`.
