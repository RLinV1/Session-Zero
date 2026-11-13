# ADR 0014: Dice drops on the ephemeral channel

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0001-event-model.md` (the ephemeral channel, FR-SYNC-03)
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/throw-dice-on-board` · **Requirements:** FR-TAC-09, FR-SYNC-03
**Amended by:** `openspec/changes/fog-inner-fade-and-shared-dice` (every public roll is thrown on every board; no message changes)

## Context

`throw-dice-on-board` lets a player drag a die onto the map, and the dice land where it was let go. Only the thrower's browser knows that point. Everyone else should see the same throw at the same spot.

`board-dice-rolls` threw every public roll in the middle of everyone's board, tracked as one "roll in the air" for the whole room page. With drops added, that single slot needed holds and releases so a dropped roll wasn't also thrown in the middle. Several drags in a row raced through it: dice thrown twice, landings ignored, results not shown. That broadcast is removed. Each roll is now thrown on its own, only where someone let a die go, or on the roller's own board.

The roll itself must not change: the server rolls it, and `dice.roll` and `DiceRolled` stay as they are. What's missing is only *where* the thrower let go, which is presentation.

## Decision

- **A new ephemeral payload:** `diceDrop { expression, from, to }`, where `from` and `to` are board points (map pixels) and `expression` is the roll's expression as the server formats it (`formatExpression`).
  - Like `ping` and `tokenDragPreview`, it is relayed to the room's other clients, never persisted, and never given a seq (invariant 4).
- **Sender:** the browser sends `diceDrop` just before the `dice.roll` it belongs to, on the same socket, and keeps the drop itself too.
  - The server relays an ephemeral message as soon as it is handled, while the command goes through the room's queue, so every other client gets the drop before the `DiceRolled` event.
  - The roll command is exactly what the Roll button sends.
  - The die can't be thrown again until the server answers, so one client never has two throws of its own in flight. If the roll is refused or times out, the sender forgets its drop.
- **Server:** relays a drop only from an active participant, and only if both points are on the current map. With no map, or a point off it, the drop is a forged payload and is dropped.
  - Unlike pointer chatter, a drop is delivered **reliably** (`send`, not `volatile.emit`). It's one message per throw, and Socket.IO discards a volatile message whenever the previous write to that client is still flushing, so two throws close together lost the second.
- **Every viewer, the thrower included,** keeps drops in order per thrower for up to 5 seconds. When a roll arrives:
  - it takes that thrower's oldest waiting drop with the same expression, and the dice land there;
  - older drops ahead of it are discarded, because their rolls never came (refused);
  - with no drop, every board throws the roll itself (amended by `fog-inner-fade-and-shared-dice`): an attack roll from its attacker toward its target, as that viewer's filtered state shows them, and any other roll, or an attack with a side hidden from that viewer, into the middle of that viewer's visible board. No message carries this: each board works it out from the roll and its own state, so nothing hidden is sent. The race described above came from one shared "roll in the air" slot; rolls are now tracked one by one, so throwing everyone's rolls doesn't bring it back.
- **Replays look the same everywhere.** The throw's path and resting angles are seeded by the roll id and the two points, so it lands the same way on every board. If it can't be animated (reduced motion), the roll lands at once.
- **Private rolls:** `board-dice-rolls` keeps GM-only rolls off the board, in the GM's panel tray. The client doesn't offer the drag for a private roll and sends no drop for one.

## Consequences

- **No change** to commands, events, state, persistence or the visibility filters. Undo, replay and reconnect are untouched: a drop that is missed only changes what a viewer saw, not what happened.
- **Visibility:** a drop carries no room data beyond two points on the public map and an expression. Players can never receive a GM-only roll to pair it with. A modified GM client could announce its own private throw, but that only reveals what the GM chose to send.
- **Pairing is by thrower, expression and order,** not by roll id, which the sender doesn't know until the ack. A thrower's messages reach each viewer in the order they were sent, so each roll finds its own drop.
  - Accepted gap: one participant throwing from two tabs at the same moment has no order across the two sockets.
- **Reliable delivery** puts a drop in the same ordered stream as committed events. That is one small message per throw, behind a disabled die until the server answers, so it can't queue up the way pointer chatter would.
- **Tests:**
  - `apps/server/test/sync.test.ts`:
    - a drop is relayed to everyone else, unsequenced;
    - two drops sent back to back both arrive;
    - a drop off the map is not relayed.
  - `apps/web/test/diceDrops.test.ts`: in-order pairing, per-thrower separation, discarding refused throws, and the 5-second limit.
