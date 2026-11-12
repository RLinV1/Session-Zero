## Context

Motivation is in proposal.md. Current state:

- **Turn order.** `initiative.advance` takes no payload and only the GM can send it (`can.administer`, `decide.ts`). It emits `InitiativeAdvanced { initiative, previous }`, and the reducer simply sets `state.initiative = event.initiative`. `advance()` (`decide.ts`) wraps to index 0 and `round + 1`. Neither `InitiativeAdvanced` nor `InitiativeEnded` can be undone.
- **What players see.** `initiativeForPlayer` (`visibility.ts`) drops hidden tokens from the order. When a hidden token is active, it sets `activeIndex` to `order.length`, so a player sees no active token. `InitiativeAdvanced` and `InitiativeStartUndone` reach players as a `resync` (a fresh filtered snapshot), not as the raw event.
- **Turn notice.** `ui/TurnNotice.tsx` is a toast inside `.board-notices` (top-right of the board) that hides itself after 6 seconds. It appears only on a turn change seen live. `pages/home/TurnTile.tsx` reuses it for a demo. Its spec lives in the unarchived but complete `turn-notice` change.
- **Pending rulings.** Nothing stores them. `pendingRulings()` (`panels/attackRoll.ts`) builds the list from the recent roll log: to-hit rolls without `verdict`, and damage rolls without `damageApplied` whose target tracks HP. `pendingRulingCount` adds 1 for an open Area Effect. `DiceRoll` already has optional bookkeeping fields set by later events (`verdict`, `damageApplied`).
- **AI seats.** `apps/mcp` talks to the room server only through REST and Socket.IO (ADR 0052). `wait_for_turn` reports the seat's turn from the seat's filtered state.

## Goals / Non-Goals

**Goals:**
- An end turn racing Next turn moves the turn on exactly once.
- Hidden tokens in the order never reach players through any new command, event or refusal.
- Every new state change goes through `Command → decide → event → reduce`, carries what it replaced, and is undone by a new event where undo is offered.

**Non-Goals:**
- Undo for Next turn, End turn or End encounter. Previous turn is how a turn change is taken back, and End encounter is guarded by a confirmation instead.
- Per-turn movement or action tracking, and anything that rolls back what happened during a turn.
- A table rule to stop players ending turns.
- Telling players that the GM ignored a roll.

## Decisions

### D1. `initiative.endTurn { tokenId }` is a new command that emits the existing `InitiativeAdvanced`

`decide` checks, in this order:
1. Authorization: the actor owns `tokenId`, or is the GM. Otherwise it returns forbidden. A token that doesn't exist is answered as not found, the same as the attack checks do.
2. An encounter is running. Otherwise it returns invalid with "no encounter".
3. `tokenId` is the active token. Otherwise it returns invalid with a new catalog message, roughly "That turn has already ended."

It then emits `InitiativeAdvanced { initiative: advance(current), previous: current }`.

The guard is what makes the race safe. The server processes a room's commands one at a time. Whichever of the GM's Next turn and the player's End turn lands second sees a different active token and is refused, so the turn moves on once.

*Alternatives.*
- Letting players send `initiative.advance`: that has no guard, so a race skips a turn. It would also mean changing an existing command's authorization.
- Adding an optional `expected` field to `initiative.advance`: that changes an existing schema anyway, and the player's index wouldn't be reliable, because `initiativeForPlayer` renumbers the order with hidden tokens removed. A token id means the same thing on every client.

Reusing `InitiativeAdvanced` means the reducer, the visibility filter (resync), the activity log, replay and `wait_for_turn` already handle it. The activity log line ("<actor> advanced to round N, Aria's turn") names whoever sent it, so a player's end turn reads correctly.

### D2. `initiative.previous` is a new command that emits a new `InitiativeRewound { initiative, previous }`

It is GM only (`can.administer`). A `retreat()` helper mirrors `advance()`: from index `i > 0` it goes to `i - 1`; from index 0 it goes to `order.length - 1` with `round - 1`. It is refused (invalid) at round 1, index 0, and when there's no encounter. The reducer case is the same as `InitiativeAdvanced`. Visibility adds it to the same `resync` case. The activity log says "<GM> stepped the turn back to <token>", and replay says "<GM> stepped the turn back".

*Alternative.* Reusing `InitiativeAdvanced` with the earlier initiative. The reducer would accept it, but the activity log and replay would then say "advanced" for a step back. Invariant 5 asks for compensating events that make sense on their own, and a new event type doesn't touch any existing schema.

### D3. `roll.dismiss { rollIds }` emits `RollsDismissed { rollIds }` and sets `DiceRoll.dismissed`

- **Command.** `rollIds` is between 1 and the roll log's size, with no duplicates. It's GM only (`can.ruleRolls`), and the attacks preset check applies just as it does for `roll.rule`.
- **Decide.** It resolves each id with `findDiceRoll`. One id gets the strict refusals from the spec: not found, not an attack, ruled, applied, already dismissed. With several ids, rolls that are no longer pending are dropped, and the command is refused only if nothing is left. The event lists only the ids it actually dismisses.
- **Reduce.** It sets `dismissed: true` on those rolls.
- **Previous value (invariant 6).** Every listed roll was undismissed before (decide guarantees that), so `rollIds` itself is the replaced value: each roll's previous `dismissed` was absent. The ADR states this explicitly so nobody adds a redundant `previous` array.
- **Undo.** `RollsDismissed` joins `REVERSIBLE_EVENT_TYPES`. Its inverse is a new `RollsRestored { rollIds }` that clears `dismissed`. That event is only produced by undo, not by any command, which matches how `InitiativeStartUndone` works. One Clear all is one command, so one Undo puts back the whole batch.
- **Ruling later still works.** `roll.rule` and `roll.applyDamage` don't look at `dismissed`. Ruling a dismissed roll leaves it dismissed, and since it's ruled now, it stays out of the list either way.
- **`pendingRulings()`** skips any roll with `dismissed`. That alone fixes the list, the Play-tab badge and the initiative reminder.

*Alternative.* Ignoring rolls only in the GM's browser (localStorage). Rejected in exploration: the list comes from shared room state, so an ignore would come back on reload or on a second GM device.

### D4. Players never learn about a dismissal

`filterStateForViewer` removes `dismissed` from every roll it sends to a player. `filterEventForViewer` returns `redacted` (seq only) to players for `RollsDismissed` and `RollsRestored`. So a player's Attack section keeps showing "Waiting for the GM" for an ignored roll until a newer roll replaces it as their latest, which is what the spec intends. Tests check that a player's snapshot and event stream never contain `dismissed`.

### D5. `TurnBanner` replaces `TurnNotice` and reads only current state

`turnBannerToken(state, you)` returns the active token when `you` is a player who owns it, and null otherwise. A hidden active token arrives as "no active token", so it gives null on its own. There's no ref to the previous turn and no timer, so a reload mid-turn shows the banner, and Previous turn back to Aria shows it again with no extra code.

- **Placement.** The banner is the last item of the room's top bar (`.room-topbar`), spanning its full width below the title and controls; on phones it wraps onto its own row there. Living in the top bar keeps the room grid's rows unchanged (the board and panel rows, and the phone layout's panel row), so nothing else moves. It sits above the board and side panel and isn't overlaid on the board, so it doesn't cover map content or the `.board-notices` stack. It takes up height only while it shows.
- **Accessibility.** An always-mounted, visually hidden `role="status"` line announces the turn, so screen readers register the live region before the banner fills it.
- **End turn.** The button sends `initiative.endTurn { tokenId }` and is disabled until the answer comes back. A refusal shows inline, using the catalog message from D1.
- **The old notice goes.** `TurnNotice` and its `.turn-notice` styles are deleted. `.board-notices` keeps departure and keep-seat notices. `TurnTile` swaps in the banner.
- **Text** goes through `t()`. `turn.*` keys are reused where they still fit (`turn.show`), and new keys are added for the banner line and End turn, in both en and zh-TW, with terms from `docs/GLOSSARY-zh-TW.md`.

### D6. GM initiative controls layout

`.init-controls` changes from one wrapping flex row to a column:
1. `.init-turn-buttons`: a two-column grid with `secondary` Previous turn and `primary` Next turn, equal width.
2. `.init-pending`: the reminder, only when the count is above 0.
3. `.init-end-row`: `display: flex; justify-content: flex-end; margin-top: var(--space-2)`, holding End encounter as `secondary danger`.

End encounter opens a confirmation on `ui/Modal.tsx`, with Cancel focused first. Previous turn is disabled on round 1's first turn, so the GM isn't offered an action the server will refuse.

### D7. MCP `end_turn`

The tool takes `seat`. It works out the seat's active owned token from its filtered state, the same way `turnNews` in `waitForTurn.ts` does. If there's no active owned token, it returns a `ToolError` saying it isn't this seat's turn, without a round trip. Otherwise it sends `initiative.endTurn { tokenId }` over the seat's Socket.IO connection, so it gets the same server checks as a person. Server refusals are passed back to the AI app as tool errors. It isn't read-only (`readOnlyHint: false`). The seat brief mentions it next to `wait_for_turn`.

### D8. One ADR

`docs/adr/0060-player-end-turn-and-ruling-dismissal.md` records D1 to D4: three commands, three events (`InitiativeRewound`, `RollsDismissed`, `RollsRestored`), the optional `DiceRoll.dismissed`, and why the token-id guard was chosen over an index. The Real-Time Architecture owner reviews it before any schema code merges.

## Risks / Trade-offs

- **[Risk] A player ends their turn by accident.** → The GM's Previous turn puts it back in one click (D2), and the banner's End turn is disabled while a request is in flight.
- **[Risk] A dismissed roll leaves the player waiting.** Their Attack section still says "Waiting for the GM". → This is accepted as part of keeping dismissals GM-only (D4). A newer roll replaces it. The design leaves room for a later player-side "not ruled" state without a schema change.
- **[Risk] The banner pushes the layout down at the start of each of the player's turns.** → The strip is a fixed, short height and appears without animation, honoring reduced motion. The board's resize-refit (kan-54) already handles a container size change.
- **[Trade-off] A player's End turn reads as "advanced" in replay.** Replay names the actor, so who ended the turn is still clear.
- **[Risk] The `turn-notice` delta modifies a spec that only exists in an unarchived change.** → Task 1 archives `turn-notice` first, so this delta applies to a real main spec.

## Migration Plan

All additions are backward compatible. Old events and rolls never have `dismissed`, which reads as "not dismissed". Rolling back the web client alone is safe, because the server keeps accepting `initiative.advance`. Rolling back the server after `RollsDismissed` or `InitiativeRewound` events exist needs the old reducer to ignore unknown event types. Confirm that during ADR review, or treat the server rollback as forward-only.
