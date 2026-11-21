# Proposal

## Why

With eleven combatants the GM's turn order is a column of eleven identical Remove buttons, longer than the panel, and clearing a defeated wave means a click and a command per token. Deleting several tokens is worse: each goes through its own editor and confirmation, and a manual delete can't be undone. The GM already keeps a selection of several tokens for group rolls and area effects (Shift-click, From template), but nothing else acts on it, and building it means clicking each token.

## What Changes

- **Compact turn order.** The turn order lists from the active turn on: three rows, then one "+N more" row that unfolds the rest and folds them again. The active turn is always the first row. Where the list wraps into the next round, a "Round N" divider says so. It folds only when at least two rows would be hidden. Players get the same view.
- **Shift-drag selection.** With the Select tool, the GM's Shift-drag on empty board draws a box in board coordinates and adds every token whose centre is inside it to the selection. A plain drag still pans, a token drag still moves the token, and a Shift press that doesn't move is still a click (it locks a door). Escape drops the box. Players get no box. The GM's hint line says "Shift-drag to select several".
- **One remove for the turn order.** The per-row Remove becomes a checkbox that edits the same selection, and one **Remove N from encounter** removes the selected tokens that are in the order with one new command, `initiative.removeSeveral`. Removing the whole order asks first, as removing the last token does. A row whose token is gone keeps its own Remove, since it can't be selected.
- **One bar for the roster.** The Tokens tab gets the same checkboxes and, while tokens are selected, one bar: **Move N to group** and **Delete N tokens** (behind a confirmation that names them), plus Clear. Delete uses a new command, `token.deleteSeveral`.
- **Deleting is undoable.** `TokenDeleted` gains `reason: "manual"`, which `token.delete` and `token.deleteSeveral` both emit, and undo reverses it like a defeat. Deletions committed before this have no reason and stay irreversible.

Kept per row: Edit and Duplicate in the roster (both act on one token; Duplicate places copies click by click) and the roster's group grip (it is also a drag handle).

## Capabilities

### Modified Capabilities
- `initiative-turns`: the GM controls lose the per-row Remove in favour of the selection and one bulk remove; the order is shown compact.
- `group-rolls`: the GM's selection can also be built with Shift-drag and the turn order's and roster's checkboxes.
- `token-editor`: deleting a token can be undone; several selected tokens can be deleted at once.
- `token-groups`: several selected tokens can be moved to a group at once.

## Impact

- `packages/shared`: `commands.ts` (`token.deleteSeveral`, `initiative.removeSeveral`, `MAX_TOKENS_PER_BULK`), `events.ts` (`reason: "manual"`), `decide.ts`, `undo.ts` and the zh-TW sentences, `scenes.ts` (the delete is a scene preparation command). ADR 0074.
- `apps/web`: `board/boardView.ts`, `board/Board.tsx`, `board/marquee.ts`, `panels/InitiativeTracker.tsx`, `panels/turnOrderView.ts`, `panels/TokenRoster.tsx`, `panels/GroupSelection.tsx`, `panels/RoomPanel.tsx`, `pages/RoomPage.tsx`, styles, and both catalogs.
- No server code: the commands go through the existing pipeline.
