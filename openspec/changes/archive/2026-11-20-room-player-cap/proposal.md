# Proposal

## Why

Nothing limits how many players a room holds. Anyone with the invite link can keep adding seats, and
each seat is a stored event and a stored credential that every connection in the room then carries.
The capacity test of 2026-10-03 (`openspec/changes/user-accounts/verification-log.md`, "Capacity")
found no failures up to 256 players, but a burst from everyone at once then takes about 3 seconds to
clear. The README asks for 1 GM and at least 8 players (§6, Room Capacity). A cap of 32 players is
four times that, and at 32 a full burst cleared in about 0.2 seconds.

## What Changes

- A room holds at most **32 active players**. The GM is not counted. Players who left or were
  removed are not counted, so their seats free up.
- A join to a full room is refused with HTTP 409 and the code `room_full`. Like any refused join, it
  adds no participant, appends no event and leaves no credential behind. A guest and a signed-in
  person are refused alike.
- The cap applies only to new seats. Reconnecting, resuming a seat on another device and keeping a
  guest seat on an account all reuse an existing seat, so they still work when the room is full.
- A room already over 32 players keeps everyone. It refuses new joins until it is back under 32.
- The join page explains a full room without marking the name field as wrong.
- The GM's participants list shows how many of the 32 player seats are taken.

**Not in this change:** a limit on how often one address may join. With players leaving and joining
again, the cap bounds the seats in use at once, not the seats a room stores over time. A per-address
join limit is the follow-up for that.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-participants`: adds the 32-player cap on joins, how a full room is reported to the person
  joining, and the GM's count of player seats taken.

## Impact

- `packages/shared`: a `MAX_PLAYERS_PER_ROOM` constant and a `ROOM_FULL` code; the join decision
  (`decideJoin`) counts active players. No existing zod schema, command or event changes, so no ADR
  is needed.
- `apps/server`: the invite join route maps the new refusal to 409 `room_full`.
- `apps/web`: the join page's message for a full room; the GM's seat count in the participants list.
- Tests in all three packages. No database migration; existing rooms are unaffected until they
  take a new join.
