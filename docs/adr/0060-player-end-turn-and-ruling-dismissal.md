# ADR 0060 — Players end their own turn, the GM steps back, and rulings can be ignored

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0011-attack-rulings.md`, `docs/adr/0013-undo.md`
**Change:** `openspec/changes/player-end-turn-and-ruling-dismissal` · **Requirements:** FR-GM-21

## Context

Only the GM can move the turn (`initiative.advance`, no payload). Players wait for the GM after every turn, and an end-turn control for them needs to be safe against the GM's Next turn landing at the same moment. Pending rulings are derived from the roll log, so the only way to clear one is to rule on it.

## Decision

**`initiative.endTurn { tokenId }`.** Any owner of the token, or the GM, may end the token's turn. `decide` checks authorization (owner or GM; an unknown token is `not_found`), then that an encounter is running, then that `tokenId` is the active token, refusing with `invalid` ("That turn has already ended") otherwise. It emits the existing `InitiativeAdvanced`. A room's commands are decided one at a time, so when Next turn and End turn race, the second sees a different active token and is refused: the turn moves once.

The guard names a token, not an index. A player's `initiative` is filtered (`initiativeForPlayer`) and renumbered without hidden tokens, so an index from a player's screen doesn't mean the same as the server's. A token id does.

**`initiative.previous` → `InitiativeRewound { initiative, previous }`.** GM only. Steps back one, wrapping to the previous round's last token; refused at round 1's first turn. A new event rather than a reused `InitiativeAdvanced`, so the activity log and replay say "stepped back". Players receive it as a resync, like every turn-order event.

**`roll.dismiss { rollIds }` → `RollsDismissed { rollIds }`, `DiceRoll.dismissed?: true`.** GM only. Marks attack rolls the GM won't rule on, which drops them from the derived pending list. With one id, the usual refusals apply (not found, not an attack, ruled, applied, already dismissed); with several, rolls no longer pending are skipped and the command is refused only if none remain. `RollsDismissed` is reversible; its inverse is `RollsRestored { rollIds }`, which only undo produces. Ruling a dismissed roll is still allowed.

Invariant 6 is met by `rollIds` itself: `decide` admits only rolls without `dismissed`, so each listed roll's previous value is "absent". No separate `previous` array is carried.

**Dismissal is GM-only.** Player snapshots never contain `dismissed`; `RollsDismissed` and `RollsRestored` reach players as redacted seqs.

## Consequences

- All additions. Old logs replay unchanged; rolls without `dismissed` read as not dismissed.
- A player whose roll is ignored keeps seeing "Waiting for the GM" until they roll again.
- End turn, Next turn and End encounter still can't be undone. Previous turn takes back a turn change; End encounter asks for confirmation.

## Alternatives considered

- **Let players send `initiative.advance`.** No guard, so a race skips a creature's turn.
- **An `expected` index on `initiative.advance`.** Changes an existing command, and the player's index is renumbered by the visibility filter.
- **Ignore rulings in the GM's browser only.** The list is derived from shared state, so the ignore would come back on reload or another device.
