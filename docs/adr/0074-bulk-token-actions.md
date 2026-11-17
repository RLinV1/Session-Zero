# ADR 0074: Bulk token actions and undoable deletes

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0065-initiative-order-edits.md`, `docs/adr/0046` (group selection) · **Changes:** `docs/adr/0049-auto-remove-defeated-tokens.md` ("Manual `token.delete` stays non-undoable")
**Change:** `openspec/changes/gm-bulk-select` · **Requirements:** FR-GM-10, FR-GM-21, FR-TAC-07, FR-REC-02, FR-REC-03

## Context

With a dozen combatants, the GM's turn order is a column of identical Remove buttons, and clearing out a defeated wave means one click (and one command) per token. Deleting tokens is worse: each goes through its own editor and confirmation. The GM already has a selection of several tokens, built with Shift-click or From template for group rolls and area effects (ADR 0046). This change lets the GM drag a rectangle to add to that selection and act on all of it at once.

A manual `token.delete` is not undoable (ADR 0049 kept it that way). A bulk delete that can't be taken back is too sharp, so deleting by hand becomes undoable too.

## Decision

- **`initiative.removeSeveral { tokenIds }`** (1 to `MAX_TOKENS_PER_BULK` = 100). GM only. Refused as `invalid` with no encounter or when any id is not in the order, so nothing is half-removed. Duplicate ids count once. `decide` takes the tokens out in turn order, each from the order the one before left, and emits one `InitiativeLeft` per token; when the selection is the whole order the last exit is `InitiativeEnded`. The result doesn't depend on the order the ids were sent in. Same events, same visibility and same undo as `initiative.remove` (ADR 0065): not undoable, the GM adds tokens back with Add to encounter.
- **`token.deleteSeveral { tokenIds }`** (1 to 100). GM only. Refused as `not_found` when any id is not a token on the board, deleting nothing. Duplicate ids count once. Emits one `TokenDeleted { token, reason: "manual" }` per token, carrying the whole token (invariant 6). `withInitiativeExits` adds each deleted token's exit from the turn order in the same action, as for every deletion. It is a scene preparation command, like `token.delete`.
- **`TokenDeleted.reason` gains `"manual"`.** `token.delete` now emits it too. A `TokenDeleted` with any reason is reversible; one with no reason is not. Old manual deletes have no reason, so the undo history `reduce` builds from an existing log is unchanged and replay stays deterministic.
- **Undo.** The inverse of a manual `TokenDeleted` is `TokenCreated` with the stored token, as for a defeat. One undo restores every token a bulk delete took. Group membership survives, because `TokensGrouped` state is keyed by token id and deletion never cleared it. The turn order is not restored: undo never touches it (ADR 0065). `undoConflict` refuses when a token with the same id or name is back. The activity log offers "Undo delete Goblin" or "Undo delete of 3 tokens".
- **Visibility.** Unchanged. Only `"defeated"` gets the deliver-then-resync path (ADR 0049), so a manual deletion of a token a player owns still resyncs that player, and a hidden or fogged token's deletion is redacted.
- **Client (no schema).** The GM's selection stays local to their screen (ADR 0046). Shift-drag on empty board with the Select tool draws a rectangle in board coordinates and adds every token whose centre is inside it. A plain drag still pans, and a Shift press that doesn't move still clicks (a door's lock). Players never get it. The turn order shows a checkbox on each row in place of Remove, plus one **Remove N from encounter** for the selected tokens that are in the order. The Tokens tab shows one **Delete N tokens** for the selection, behind a confirmation.

## Consequences

- Two new commands and one new enum value. Old events, logs and snapshots parse unchanged. A client from before this change can't send the new commands, and the server it talks to still accepts `token.delete`.
- Deleting by hand is now on the undo list, for one token or many. The single-token delete keeps its confirmation.
- A bulk delete is one action of N `TokenDeleted` events, plus exits. The 100-token cap keeps the command and its batch small.
- Rolling back would leave `"manual"` deletions in the log that an older server can't parse. Roll forward instead.
