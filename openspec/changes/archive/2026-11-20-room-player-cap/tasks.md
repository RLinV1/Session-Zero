# Tasks

## 1. Kernel (packages/shared)

- [x] 1.1 Add `MAX_PLAYERS_PER_ROOM = 32` and `ROOM_FULL = "room_full"`, and make `decideJoin` refuse a join when the room already has 32 active players (D1, D2). Verify in `packages/shared/test/roomPlayerCap.test.ts`:
  - the 33rd player is refused with reason `room_full`;
  - the GM is not counted (GM + 31 players: accepted);
  - a player who left or was removed is not counted;
  - a room already over 32 refuses;
  - a blank name is still refused as blank, and a full room is refused as full even when the name is taken.

## 2. Server

- [x] 2.1 Map `room_full` in the invite join route to HTTP 409 with `code: "room_full"` (D3). Verify in `apps/server/test/roomPlayerCap.test.ts` over HTTP and Socket.IO:
  - 32 joins accepted, the 33rd refused with 409 `room_full`, no event appended, and its token does not connect;
  - a signed-in person is refused the same way, and their Your rooms list does not show the room;
  - three guests racing for the last seat: exactly one succeeds;
  - a player leaving, and a player removed, each free a seat;
  - in a full room, a player reconnects with their credential and an account opens its kept seat on a second device.

## 3. Web

- [x] 3.1 Join page: on `room_full`, show the message without marking the name field invalid, and keep the form usable (D3). Verify with a web test.
- [x] 3.2 GM's participants list: "N of 32 player seats taken", above the names, for the GM only (D3). Verify the count with a web test, and in the browser that the GM sees it without scrolling and a player does not (verification log steps 67 to 70).

## 4. Finish

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test`, and `openspec validate room-player-cap --strict`. Verify all clean.
- [x] 4.2 Live check against the isolated test server: fill a room to 32 players, see the 33rd refused, and see the join page's message and the GM's count in the browser. Record it in `openspec/changes/user-accounts/verification-log.md`.
