# Tasks

## 1. Contract (ADR 0074)

- [x] 1.1 Add `token.deleteSeveral` and `initiative.removeSeveral` (1 to 100 ids) to `Command`, and `"manual"` to `TokenDeleted.reason`. Verify with `npm run typecheck`.
- [x] 1.2 Handle both in `decide`, authorization first, all or none, ids deduplicated; `initiative.removeSeveral` exits in turn order so the result doesn't depend on the order sent. `token.delete` emits `reason: "manual"`. Verify with `packages/shared/test/bulkTokenActions.test.ts` (FR-GM-21, FR-GM-10, FR-TAC-07).
- [x] 1.3 Make a `TokenDeleted` with any reason reversible; phrase a manual delete as "delete Goblin" / "delete of 3 tokens" in English and zh-TW. Verify with the undo cases in the same file (FR-REC-02), and update the two tests that asserted a manual delete was not undoable.
- [x] 1.4 Write ADR 0074 (checked against origin/main and the open PRs' ADR numbers: 0073 was the last).

## 2. Web

- [x] 2.1 Compact turn order: `compactTurnOrder` plus the fold row with `aria-expanded` / `aria-controls`. Verify with `apps/web/test/bulkSelection.test.ts` and the "compact turn order" cases in `initiativeControls.test.tsx`.
- [x] 2.2 Shift-drag box in `boardView.ts` (board coordinates, GM only, not read-only), `tokensInBox` in `board/marquee.ts`, and the GM hint line. Verify with the pointer-handler cases in `bulkSelection.test.ts`.
- [x] 2.3 Turn order checkboxes and Remove N from encounter, with the confirmation when the selection is the whole order. Verify with `initiativeControls.test.tsx`.
- [x] 2.4 Roster checkboxes and the selection bar (Move N to group, Delete N tokens with confirmation, Clear). Verify with `apps/web/test/rosterBulkActions.test.tsx`.

## 3. Integration and checks

- [x] 3.1 Over the wire: both commands, players' convergence and filtered views, the hidden token never sent, one undo restoring every token. Verify with `apps/server/test/bulkTokenActions.test.ts`.
- [x] 3.2 `npm run lint && npm run typecheck && npm test`.
- [x] 3.3 Check it in the running app on an isolated dev server; record it in `verification-log.md`.
