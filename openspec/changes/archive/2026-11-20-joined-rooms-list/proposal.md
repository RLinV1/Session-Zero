## Why

A player who joined a room by invite and then closed the tab has no way back except the original link (KAN-64). Their seat still exists: the guest credential sits in this browser's localStorage under `vtt.credentials.<roomId>`. Nothing reads those keys to build a list, and the GM dashboard only lists rooms the GM identity owns. Until accounts and the `/rooms` hub (KAN-57) exist, the home page can list the rooms this browser has joined, from what the browser already holds.

## What Changes

- **"Rooms you've joined" on the home page.** When this browser holds guest credentials for one or more rooms, the hero shows a short list above "Joining a game?". Each row names the room and opens `/r/<roomId>`. With no guest credentials, or when localStorage throws (private browsing), the home page renders exactly as it does today.
- **Credentials remember the room name.** `StoredCredentials` gains an optional `roomName`. The room page records the name from each snapshot it receives, so it is known for new joins and for existing seats the next time they open the room, and stays current if the GM renames the room. Rows for a seat whose name is not yet known read "A room you joined".
- **Dead seats drop off the list.** When the server refuses the room page's credential with `unauthorized` (the seat or the room was deleted, which deletes its credentials), the room page forgets the stored seat, as it already does for seats that ended while connected. The list only ever shows rooms that can still open. A `not_found` refusal keeps the seat: the server also sends it when a room fails to load, and forgetting a live seat would lose it for good. `RoomConnection` exposes which code refused it (`refusal`).
- **No duplicates with the dashboard.** Credentials that carry an `inviteCode` are this browser's GM seats (the existing convention in `guestRoomForInvite`); they are excluded, since the GM dashboard lists them.

## Capabilities

### New Capabilities
- `joined-rooms`: the home page's per-browser list of rooms joined as a guest.

### Modified Capabilities
None.

## Impact

- **Web only:** `apps/web/src/net/identity.ts` (new `roomName` field, `listJoinedRooms`, `rememberRoomName`), `apps/web/src/net/roomConnection.ts` (`refusal` on the snapshot), `apps/web/src/pages/RoomPage.tsx` (records the name, forgets refused seats), `apps/web/src/pages/HomePage.tsx` (the list), `apps/web/src/styles.css`.
- **No contract or server change:** `packages/shared`, the server, commands, events and visibility filters are untouched. No new endpoint; guest identity stays client-held (DESIGN.md §5). No ADR needed.
- **Stored shape:** the added field is optional, so credentials written by older builds still load.

## Non-goals

- The cross-device `/rooms` hub (KAN-57). This list is per browser and is superseded once accounts land.
- Probing the server for stale seats on page load. There is no guest-readable endpoint for it and this change adds none; a dead seat is found, and removed, the first time it is opened.
