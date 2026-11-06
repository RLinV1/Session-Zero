# ADR 0051 — Seat limits and locking a room

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0006-participant-lifecycle.md`
**Change:** `openspec/changes/invite-abuse-limits` · **Requirements:** FR-PL-01, FR-GM-20, FR-PL-06, FR-SYNC-03

## Context

An invite link is all it takes to hold a seat, with no account, by design (FR-PL-01). A leaked link therefore lets a stranger act as a player. A probe on a test server showed what that allowed from one address:

| Action | Result |
|---|---|
| Fill all 32 seats | Accepted: the join limit (150 per 15 minutes) is above the cap |
| Reset the link while full | Old link dies, but the room stays full: a reset removes no one |
| Rejoin after removal | Accepted under a new name: only a signed-in seat is blocked from rejoining |
| 3,000 `dice.roll` in a burst | All accepted, and the log grew by 3,000. Only chat and dice looks had limits |
| 1,000 `resync` | 1,000 full snapshots sent back |
| 100 connections on one credential | All connected, and the live-traffic limit was per connection |
| 1,000 joins with wrong codes | All answered 404: the join limit is only counted after a room is found |

A rotating invite code would not help. The code is not guessable (10 characters from 31), and the problem is what a real holder of it can do. This ADR does not address network-level floods, which need a CDN or firewall in front of the server.

## Decision

**Limits on a seat**, in `ws/socket.ts`. Each is per participant in a loaded room, shared by all of that participant's connections, and in memory like the existing limits.

| Limit | Budget | Over it |
|---|---|---|
| Commands, player | 800 per 20 seconds, and 1,800 per 5 minutes | `rejected`: "You're sending commands too fast" |
| Commands, GM | 3,000 per 30 seconds | The same |
| Resync | 30 per minute | Dropped |
| Live traffic | 40 per second, 10 of them move previews | Dropped, as before, but now per seat |
| Open connections | 8 | The oldest closes with `error: too_many_connections` |
| New connections | 120 per minute | Refused with `error: too_many_connections` |

- Budgets come from the client's real bursts. The fastest thing a player can send is a held arrow key: "Move with arrow keys" is on by default and sends one `token.move` per key repeat, about 33 a second at the fastest system setting. An earlier budget of 600 per 20 seconds stopped a browser test holding a key at that rate after 18 seconds, so the 20-second budget is 40 a second. The 5-minute budget is what bounds the log: nearly a minute of nonstop movement. The GM's largest burst is making every imported opening a door, one command per opening, up to `MAX_WALLS` (1,500).
- Commands and resyncs are counted on arrival, before the per-socket queue, so a flood can't pile up behind a slow store. Malformed commands count too, and are still answered.
- A dropped resync heals itself: the client asks again on the next event it can't place.
- Past the connection cap the oldest connection closes rather than the new one being refused. A dropped network can leave dead sockets open for up to 45 seconds, and refusing would lock out the person who just reconnected. The closed tab stops for good instead of reconnecting, since that would close the next one. Its credential stays valid, and reloading gets back in.
- New connections are limited because each costs a full snapshot, so reconnecting would otherwise bypass the resync limit.

**Limit on invite requests.** `inviteLookupsPerIp`, 300 per 15 minutes, covers `POST /api/invites/:code/join` and `GET /api/invites/:code/seat`. It is counted before the lookup, so wrong codes count. It sits above the per-room join limit so a whole class on one address (32 joins and seat lookups) is never affected.

**Limit on handshakes.** `HANDSHAKES_PER_CONNECTION`, 3 per connection, in `ws/socket.ts`. Socket.IO runs `io.use` for every CONNECT packet and keeps a refused connection open for another, so one upgrade carried 2,000 refused handshakes in 94 ms. Each costs two store lookups, and a proxy counts them all as one request. A fourth closes the connection with no reply. Socket.IO's client only ever sends one: it closes the connection when refused, and a reconnect is a new connection. It is counted on arrival, before the payload is parsed, because a burst has all landed before the first lookup returns: counting refusals instead let 564 of the 2,000 through in a test.

**Locking a room.** `RoomState.joinsLocked: boolean` (public, default false; older rooms read as false), set by the GM's `room.setJoinsLocked { locked }`, recorded as `JoinsLockSet { locked, previous }`, passed to all viewers since it hides nothing. While locked, `decideJoin` refuses with reason `room_locked`, and the route answers 409 `ROOM_LOCKED`. Existing seats are untouched: connections stay, credentials reconnect, a signed-in member can resume. It is not undoable, like the other room settings, and a link reset does not change it.

It is an event rather than a column like the invite code. The code stays out of the log so it can't be dug back out of history (FR-GM-20). The lock has no such secret, and invariant 1 applies: every GM tab sees it change at once.

**Removing several players.** `participant.revokeMany { participantIds }` (1 to `MAX_PLAYERS_PER_ROOM`), GM only, all or none. It reuses `ParticipantRevoked`, one per player, so sockets, credential locks and the departure review behave exactly as for a single removal (ADR 0006).

**Protocol.** `ServerMessage.error.code` gains `too_many_connections`. `ROOM_LOCKED` joins `ROOM_FULL` as a join refusal code.

## Alternatives rejected

- **Rotating the QR code or link on a timer.** It breaks links already sent, and does nothing against anyone who already has a seat.
- **Lowering the per-address join limit below the seat cap.** A class or LAN table legitimately shares an address and needs up to 32 joins.
- **Blocking a removed guest by address.** The same shared-address problem, and guests have no other durable identity. The lock is the supported way to stop them returning.
- **Sending N `participant.revoke` commands from the UI.** A failure midway leaves a half-finished removal, which is the worst moment for one.
- **A room-wide command budget.** One bad seat could spend it and silence the whole table.
- **A tight budget of 3 commands a second for players.** It would have stopped a held arrow key after about 2 seconds.

## Consequences

- The 20-second budget is above any normal key repeat, so in play only a script should see the refusal. Someone keeping a token moving nonstop for nearly a minute would reach the 5-minute budget, and their moves would be refused until the window frees up.
- 32 seats can still add about 190 events a second to one room, sustained. The log's growth is now bounded by a rate rather than unlimited, and the GM has the tools to end it: lock, remove several, reset. There is still no cap on a room's total log size, and nothing ends it while the GM is away.
- The counters are per process, like all existing limits, and reset on restart. They move to Redis when there is more than one app server.
- Other unauthenticated routes, and new connections with invalid credentials, have no per-address limit in the app. Caddy limits them per address, and anything larger needs a CDN (`docs/EDGE-PROTECTION.md`).
