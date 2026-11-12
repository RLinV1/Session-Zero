# Tasks

## 1. Groundwork

- [x] 1.1 Archive the complete `turn-notice` change (`/opsx:archive turn-notice`) so `openspec/specs/turn-notice/spec.md` exists. Verify that `openspec validate player-end-turn-and-ruling-dismissal --strict` passes against it.
- [x] 1.2 Write `docs/adr/0060-player-end-turn-and-ruling-dismissal.md` covering design D1 to D4 (the three commands, the `InitiativeRewound`, `RollsDismissed` and `RollsRestored` events, `DiceRoll.dismissed`, the token-id guard over an index, and `rollIds` as the replaced value). Verify the file exists and the PR requests review from the Real-Time Architecture owner.

## 2. Contract: turn order (`packages/shared`)

- [x] 2.1 Add the `initiative.endTurn { tokenId }` and `initiative.previous` commands to `commands.ts`, and the `InitiativeRewound { initiative, previous }` event to `events.ts`. Verify that `npm run typecheck` passes.
- [x] 2.2 Handle `initiative.endTurn` in `decide` (owner or GM, then encounter running, then token active; emit `InitiativeAdvanced`), adding a catalog message for "That turn has already ended". Verify with unit tests in `packages/shared/test/initiativeTurns.test.ts` (FR-GM-21): the owner advances, the round wraps, a non-owner is forbidden, a stale token is refused, and no encounter is refused.
- [x] 2.3 Add `retreat()` and handle `initiative.previous` in `decide` (GM only; refused at round 1, index 0 and with no encounter) and `InitiativeRewound` in the reducer. Verify with unit tests in the same file: back within a round, back across a round, refused at the first turn, and a player forbidden.
- [x] 2.4 Add `InitiativeRewound` to the `resync` case in `visibility.ts`, plus its activity-log ("stepped the turn back to <token>") and replay text. Verify with a `visibility.test.ts` case where a step back to a hidden token gives a player a snapshot with no active visible token, and an activity-log assertion.

## 3. Contract: ruling dismissal (`packages/shared`)

- [x] 3.1 Add optional `DiceRoll.dismissed`, the `roll.dismiss { rollIds }` command, and the `RollsDismissed { rollIds }` and `RollsRestored { rollIds }` events. Verify that `npm run typecheck` passes and that older rolls without the field still parse.
- [x] 3.2 Handle `roll.dismiss` in `decide` (GM only, attacks preset check, strict refusals for one id, skipping no-longer-pending rolls in a batch and refusing only when none remain) and both events in the reducer. Verify with `attackRulings.test.ts` cases (attack-rulings): ignore one, a batch with one roll already ruled, a batch where all are stale, a player forbidden, a plain roll invalid, and an ignored roll that can still be ruled.
- [x] 3.3 Make `RollsDismissed` reversible in `undo.ts`, with `RollsRestored` as its inverse. Verify with an `undo.test.ts` case where Clear all on three rolls followed by Undo leaves all three undismissed.
- [x] 3.4 Strip `dismissed` from player snapshots in `filterStateForViewer`, and redact `RollsDismissed` and `RollsRestored` for players in `filterEventForViewer`. Verify with `visibility.test.ts` cases where a player's snapshot and filtered events never contain `dismissed` or the roll ids.

## 4. Server integration (`apps/server/test`)

- [x] 4.1 Add a multi-client test where the GM's `initiative.advance` and a player's `initiative.endTurn` race on the same turn. Verify the turn moves exactly once and the later command is refused (FR-GM-21).
- [x] 4.2 Add a test where a player ends their own turn, and another player's end turn for that token is forbidden. Verify that every client converges on the same `initiative`.
- [x] 4.3 Add a test where the GM dismisses rolls and then undoes. Verify the GM sees `dismissed` set and then cleared, while a player socket receives only redacted seqs and its rolls never carry `dismissed`.

## 5. Web: turn banner (`apps/web`)

- [x] 5.1 Create `ui/TurnBanner.tsx` with a pure `turnBannerToken(state, you)` and the banner strip (token name and round, Show on board, End turn sending `initiative.endTurn`, disabled while in flight, inline refusal), inside a live region that stays mounted. Verify with `apps/web/test/turnBanner.test.ts`: the owner sees it, a non-owner, the GM and a hidden active token don't, it shows on first load mid-turn, and it switches token when the turn passes from one of the player's tokens to another.
- [x] 5.2 Mount the banner at the top of the room layout in `pages/RoomPage.tsx`, remove `TurnNotice` from `.board-notices`, switch `pages/home/TurnTile.tsx` to the banner, and delete `ui/TurnNotice.tsx`, its styles and `turnNotice.test.ts`. Verify with `npm run lint && npm run typecheck`, then in the running app: a player's banner appears on Next turn, stays, and End turn moves the turn.
- [x] 5.3 Add en and zh-TW catalog entries for the banner line and End turn, following `docs/GLOSSARY-zh-TW.md`. Verify that `npm run lint` (which enforces no literal UI text) passes and both catalogs have the keys.

## 6. Web: GM initiative controls

- [x] 6.1 Restructure the `InitiativeTracker` GM controls per design D6: Previous turn (`secondary`, disabled on round 1's first turn) and Next turn (`primary`) in an equal two-column row, the pending reminder below, and End encounter (`secondary danger`) on a right-aligned row with a `--space-2` gap. Verify in the running app at desktop and phone widths.
- [x] 6.2 Add the End encounter confirmation on `ui/Modal.tsx`, with Cancel focused first, and catalog entries for the dialog and Previous turn in en and zh-TW. Verify with a test where Cancel sends nothing and confirm sends `initiative.end`.

## 7. Web: Rulings Ignore and Clear all

- [x] 7.1 Make `pendingRulings()` in `panels/attackRoll.ts` skip dismissed rolls. Verify with a unit test showing that a dismissed to-hit roll leaves both the list and `pendingRulingCount`.
- [x] 7.2 Add Ignore to each attack roll row and Clear all at the top of `panels/RulingsPanel.tsx`. Clear all sends `roll.dismiss` with the ids it shows, appears only when at least one attack roll is listed, and never touches the Area Effect row. Add en and zh-TW strings. Verify with a component test covering Ignore, and Clear all with an Area Effect present, alongside `dicePanelRulings.test.tsx`.

## 8. AI seats (`apps/mcp`)

- [x] 8.1 Register an `end_turn` tool in `apps/mcp/src/tools.ts` (seat argument; finds the seat's active owned token from its filtered state; sends `initiative.endTurn`; returns a clear "not your turn" or server refusal as a tool error) and mention it in the seat brief next to `wait_for_turn`. Verify with an `apps/mcp/test` case for success, not your turn, and a stale refusal.

## 9. Wrap-up

- [x] 9.1 Run `npm run lint && npm run typecheck && npm test`, and verify everything passes.
- [ ] 9.2 Run the `sync-reviewer` and `visibility-auditor` agents on the diff, and verify no findings remain unresolved.
