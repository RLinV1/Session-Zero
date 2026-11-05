# Tasks

## 1. ADR and review

- [x] 1.1 Write `docs/adr/0051-seat-limits-and-room-lock.md`, with a row in the `docs/DESIGN.md` index.
- [ ] 1.2 Request review from the Real-Time Architecture owner, and record the outcome in the ADR's status.

## 2. Shared contract (`packages/shared`)

- [x] 2.1 `RoomState.joinsLocked`, `room.setJoinsLocked`, `JoinsLockSet`, with the visibility filter and activity log.
- [x] 2.2 `participant.revokeMany`, all or none, reusing `ParticipantRevoked`.
- [x] 2.3 `decideJoin` refuses with `room_locked`; `ROOM_LOCKED`; `too_many_connections` error code.

## 3. Server (`apps/server`)

- [x] 3.1 Command, resync, live-traffic and connection limits per seat in `ws/socket.ts`, counted on arrival.
- [x] 3.2 `LiveRoom.closeOldestConnections`.
- [x] 3.3 `inviteLookupsPerIp` on the join and seat routes, before the lookup.

## 4. Web (`apps/web`)

- [x] 4.1 Lock switch in the Share dialog, usable even if the link fails to load.
- [x] 4.2 Remove several dialog in the participants list.
- [x] 4.3 "Open in too many places" screen, and no reconnect after that refusal.
- [x] 4.4 Join form doesn't mark the name as the cause when a room is locked.

## 5. Verification

- [x] 5.1 Unit tests in `packages/shared/test/joinLock.test.ts`.
- [x] 5.2 Integration tests in `apps/server/test/abuseLimits.test.ts`.
- [x] 5.3 Component tests in `apps/web/test` for the lock, the removal dialog and the connection refusal.
- [x] 5.4 Browser check, recorded in `verification-log.md`.
