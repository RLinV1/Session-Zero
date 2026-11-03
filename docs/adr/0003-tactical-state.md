# ADR 0003 — Tactical state: stats, conditions, initiative and rolls

**Status:** Accepted · **Extends:** `docs/adr/0001-event-model.md`
**Owner:** Real-Time Architecture (Raymond) · **Implements:** FR-GM-21, FR-GM-22, FR-GM-24, FR-TAC-07, FR-TAC-08, FR-TAC-09

## Context

The M2 tactical requirements need state the kernel did not carry: numeric resources and
status conditions per token, an encounter turn order, and a shared roll log. `Token` and
`RoomState` are existing contracts in `packages/shared`, so extending them needs a record
of why the shapes are what they are.

## Decisions

### Stats and conditions live on the token

`Token` gains `stats: {hp, maxHp, ac}` and `conditions: ConditionId[]`. They belong to the
token rather than a side table because every consumer — the canvas, the roster, the
visibility filter — already has the token in hand, and a hidden token's stats must
disappear with it. Putting them anywhere else would create a second thing to remember to
filter.

`ConditionId` is a closed enum, not free text. A fixed catalogue is what lets the renderer
guarantee a distinct shape per condition (FR-TAC-08); arbitrary strings would force a
fallback marker and the accessibility property would quietly degrade.

### Initiative holds token ids, not entries

`Initiative` is `{order: Id[], activeIndex, round}`. Ordering is computed once in `decide`
— sorted by score, ties broken on token id — and only the resulting order is committed.
Two clients sorting a tie differently would diverge, and the score itself has no use after
the sort, so it is not carried in state.

Entries whose token is deleted mid-encounter are **skipped, not removed**. `order` travels
inside the event, and rewriting it later would edit history.

### Dice randomness is injected

`DecideContext` gains an optional `random: () => number`. `decide` must stay deterministic
(CLAUDE.md invariant 2), so it cannot reach for `Math.random`. The server injects a CSPRNG
(`randomInt` from `node:crypto`) because a roll decides encounter outcomes and should not
be predictable from other rolls; tests inject a fixed sequence and assert exact totals.

The client parses the expression too, but only to validate the input box. The server
re-parses and rolls, and its result is the only one anyone sees (FR-GM-15).

### The roll log is capped in state, not in history

`RoomState.rolls` keeps the newest 30. Every roll stays in the event log — that is the
activity log FR-REC-01 will read — but a room running for hours should not carry an
unbounded array in every snapshot.

### GM-only rolls are filtered, not flagged

A `gm` roll is removed from a player's snapshot entirely and its event is redacted, so the
player learns only that some seq happened. Sending a placeholder would tell a player the
GM had just rolled, which is exactly the information FR-GM-22 exists to withhold.

Initiative changes resync players rather than passing the raw event, because `order` may
name hidden tokens — the same reasoning as a token reveal in ADR 0002.

## Consequences

- `Token` gains two required fields; `token.create` seeds them empty, and any future store
  that reconstructs tokens must too.
- Adding a condition means adding to `CONDITIONS` with a shape distinct from its
  neighbours. The test asserting abbreviations are unique will catch a duplicate.
- `RoomState` grew two fields, so every snapshot is slightly larger; the roll cap bounds it.

## Amendment: terrain and tactical movement

Optional layered terrain is now table content; edit revisions and the board epoch remain outside checkpoint tables. Players receive a derived effective projection rather than canonical layers. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
