# ADR 0065: Editing the turn order mid-encounter

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0022-token-initiative-memory.md`, `docs/adr/0060-player-end-turn-and-ruling-dismissal.md` · **Relates to:** `docs/adr/0026` (token groups and initiative undo), `docs/adr/0049` (defeat removal)
**Change:** `openspec/changes/initiative-mass-roll-and-order-edits` · **Requirements:** FR-GM-21

## Context

A running encounter's turn order (`Initiative { order, activeIndex, round }`) could only be started, stepped and ended. A token joining or leaving mid-fight needed the encounter restarted, and a deleted token stayed in `order` as a "(removed)" row. The comment on `advance()` said such rows were skipped; they never were.

Scores are not in `Initiative`: each is saved on its token as `token.initiative` (ADR 0022), and `initiative.start` sorts by score descending, then token id.

## Decision

- **Commands** (GM only):
  - `initiative.add { entries: [{ tokenId, score }] }`, 1 to 60 entries like `initiative.start`: all or nothing. Every entry is checked before any is placed; the whole command is refused as `invalid` with no encounter, when a token is already in the order or listed twice, and `not_found` for an unknown token. A batch spares the GM a partly added group of reinforcements when one entry is refused, which one command per token would not.
  - `initiative.remove { tokenId }`: refused as `invalid` with no encounter or when `tokenId` is not in the order. It checks the order, not the board, so legacy "(removed)" rows can be removed.
- **Events.** Both carry the whole order before and after (invariant 6), as `InitiativeAdvanced` does:
  - `InitiativeJoined { tokenId, initiative, previous, score, previousScore }`, one per added token: `reduce` assigns the order and sets `token.initiative = score`. `decide` sorts the entries as Start does and places each against the order the one before left, so each event's `previous` is the order just before it and the result doesn't depend on the order the entries were sent in.
  - `InitiativeLeft { tokenId, initiative, previous, reason? }`: `reason: "deleted"` when it follows a deletion.
- **Placement.** `decide` places a joining token with the same comparator as `initiative.start`, against each entry's saved score. Entries with no token or no saved score (legacy rows) sort last. The token whose turn it is keeps it: `activeIndex` shifts when the order changes at or before it. Removing the active token hands the turn to the next one, wrapping to `round + 1` from the end, as `advance()` does.
- **Last token.** When the order would become empty, `decide` emits `InitiativeEnded { previous }` instead of `InitiativeLeft`.
- **Deletion.** Every decision passes through `withInitiativeExits`, which adds the exit event right after each `TokenDeleted` whose token is in the order (folding the batch, so several deletions in one command chain correctly). The pass is idempotent: a deletion already followed by its exit, as in the batch of a nested `decide` (`scene.savePreparation`, `scene.prepare`), gets no second one. That covers `token.delete`, a departing player's tokens, and defeat removal. Doing it in `reduce` was rejected: `TokenDeleted` would change the order without carrying it, and replaying old logs would no longer reproduce the state players saw.
- **Undo.** Neither exit event has an inverse. Undoing a defeat removal brings the token back on the board, with its saved score, and leaves the turn order, round, active turn and running encounter alone. With no encounter id, putting the token back could add it to a *later* encounter. The GM uses Add to encounter instead. `initiative.add` and `initiative.remove` are not undoable, like Next turn and End encounter.
- **Visibility.** Players receive a filtered snapshot instead of either event, as for the other initiative events, since both orders may name hidden tokens. Players get `InitiativeEnded` without its `reason`, so they can't learn that a hidden last token was deleted.
- **Mass roll.** The Start encounter and Add to encounter dialogs use the existing `dice.rollGroup` with `visibility: "gm"` (ADR 0046), in chunks of 30. The formula comes from the app's dice builder (ADR 0061), never a text field. No schema change.

## Consequences

- Event logs recorded before this ADR replay unchanged; their "(removed)" rows still show.
- Two event types join `DomainEvent`; rolling back after rooms use them means those events no longer parse.
- Deleting a hidden token that is in the order sends players a resync. That is a timing signal that something changed, the same one `InitiativeAdvanced` gives on a hidden token's turn; it names nothing.
- Undoing an `InitiativeStarted` is now refused with `undo.orderChanged` once one of its tokens was deleted, because the deletion changed the order. Before this ADR the deletion left the order alone, so the undo went through.
