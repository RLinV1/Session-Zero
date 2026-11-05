# Proposal

## Why

An invite link is all it takes to hold a seat. A probe on a test server showed that one address holding a leaked link could fill all 32 seats, rejoin after removal, grow a room's permanent log without limit, and make the server send a full snapshot for every small message. The GM's only tools were removing players one at a time and resetting the link, which removes no one.

## What Changes

- **Seat limits.** Each seat gets budgets for commands, resyncs, live messages, open connections and new connections, shared across its connections.
- **Invite request limit.** Requests per address, counted before the lookup, so wrong codes count.
- **Lock the room (GM).** A switch in the Share dialog stops anyone new joining, even with the link. Everyone already seated is unaffected.
- **Remove several (GM).** Tick players in one dialog and remove them in one all-or-none step.
- Extends shared state, commands, events and the protocol, so this needs ADR 0051 and review by the Real-Time Architecture owner.

## Capabilities

### New Capabilities
- `seat-limits`: what one seat and one address may send, and what happens over each limit.

### Modified Capabilities
- `room-access`: the GM can lock a room and remove several players at once.

## Impact

- `packages/shared`: `RoomState.joinsLocked`; commands `room.setJoinsLocked` and `participant.revokeMany`; event `JoinsLockSet`; `ROOM_LOCKED`; the `too_many_connections` error code.
- `apps/server`: limits in `ws/socket.ts`, `LiveRoom.closeOldestConnections`, `inviteLookupsPerIp` on the join and seat routes.
- `apps/web`: lock switch in `ShareButton`, `RemoveSeveral` in `ParticipantsButton`, an "Open in too many places" screen in `RoomPage`.
- No migration: the lock is an event, and older rooms read as unlocked.
- Network-level floods are out of scope. They need a CDN or firewall in front of the server.
