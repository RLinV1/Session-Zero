# Design

## Context

See proposal.md for why. A join is not a `Command`: it has no actor yet. `decideJoin(state,
participant)` in `packages/shared/src/decide.ts` is its pure decision. `LiveRoom.join` runs it inside
the room's exclusive queue, after the account checks (`already_member`, `removed`) and before the
commit. That queue is how display names stay unique when two joins race (KAN-61). The join route maps
`JoinDecision.reason` (`blank`, `name_taken`) to HTTP 400 and 409. `JoinRejectionReason` is a
server-side TypeScript type, not a zod schema, and it is never sent to clients.

## Goals / Non-Goals

**Goals:**
- One cap, checked in one place, that joins racing for the last seat cannot get past.
- Nobody already at the table is affected: not their reconnects, their other devices or keeping their
  seat.

**Non-Goals:**
- A per-address join limit (the follow-up named in the proposal).
- A cap the GM can configure per room, or one set per deployment.
- Limits on spectators or on several connections from one seat: neither adds a participant.

## Decisions

### D1. The cap is part of the join decision

`decideJoin` counts the room's active players (`role === "player"` and `isActive`) and refuses when
there are already `MAX_PLAYERS_PER_ROOM` (32): `{ ok: false, code: "invalid", reason: "room_full" }`.
The order is blank name, then full room, then name taken. A full room is the answer whatever name was
typed, so the person isn't asked to change a name that would not help.

**Why there:** `decideJoin` already runs in the room's queue against the latest state, so joins
arriving together are decided one after another, and the 33rd sees 32. It is pure, so the rule is
unit-tested in `packages/shared` like the name rule. The account checks in `LiveRoom.join` come first
and are unchanged, so someone who already has a seat still hears "already in this room".

**Alternatives:**
- *Check in the HTTP route before `room.join`:* it reads the state outside the queue, so two joins
  could both see 31 players and both get in.
- *Count every participant ever, not active ones:* it bounds what the room stores, but a room where
  players come and go would fill up for good. The per-address join limit is the better tool for
  churn.

### D2. Counted: active players only

The GM is never refused by this rule. Creating the room makes the GM's seat, and the GM cannot leave.
Players who left or were removed keep their records for history (ADR 0006), but they no longer hold a
seat, which matches how names are freed ("Only active participants hold a name").

### D3. How a full room is reported

- **Server:** HTTP 409, `code: "room_full"` (`ROOM_FULL`, exported from `packages/shared` next to
  `JoinRoomRequest`), and a message: "This room is full: it holds 32 players. Ask the GM for a seat."
  409 matches the other join conflicts (`name_taken`, `already_member`). A new constant is an addition,
  not a change to an existing schema, so no ADR is needed.
- **Join page:** shows the message. It does not mark the name field invalid or tie the message to
  it (the conflict is not the name). The form stays usable for a retry.
- **GM's participants list:** a muted line, "N of 32 player seats taken", for the GM only. The GM is
  the person who can free a seat, by removing a player. The line sits **above** the names: a full
  room's list is 33 names long and scrolls, and a count at the bottom was out of sight (found in the
  live check, task 4.2).

### D4. The number

32 is four times the README target of 8 players, and it is where the capacity run's worst case
(every player chatting and rolling in the same instant) still cleared in about 0.2 seconds. It is a
constant in `packages/shared`, so the server and the web use one value. Raising it later is a one-line
change plus this spec's number.

## Risks / Trade-offs

- **[A table bigger than 32]** → Unlikely for this product's tabletop sessions. The GM can remove
  inactive players to free seats, and the constant can be raised.
- **[Join-and-leave churn still grows the stored history]** → Out of scope here (see Non-Goals).
  Each join is still one event and one credential row.
- **[Rooms already over 32 from before]** → They keep everyone and take no new joins until under 32
  (spec). Only test rooms are known to be that large.

## Migration Plan

No database or event change. Ship the shared, server and web parts together. An older web client
shows the 409's `error` text as it does for any refused join. Rollback is reverting the code.
