## Why

Only the GM can move the turn on, so every player's turn ends with "GM, I'm done" and a wait. Players also miss that their turn has started: the turn notice is a small toast in the board's top-right corner that hides itself after 6 seconds. On the GM's side, the Rulings list can only be emptied by ruling on every roll, so rolls the GM has decided not to rule on (a stray roll, a re-roll, a table call made out loud) keep the pending count up for good. That makes the "N rulings pending" reminder beside Next turn useless (FR-GM-21, attack-rulings).

## What Changes

- **Players end their own turn.** A new `initiative.endTurn { tokenId }` command lets any owner of the active token end that token's turn. It produces the existing `InitiativeAdvanced` event. The command names the token whose turn it ends, so a player's End turn that crosses the GM's Next turn is refused instead of skipping the next creature. Players can always do this; there is no table rule to turn it off. Pending rulings don't block it and stay in the GM's queue.
- **Turn banner replaces the turn toast.** While it is the viewer's token's turn, a banner across the top of the room reads "It's **Aria**'s turn · Round 3" with **Show on board** and **End turn**. It stays for the whole turn, comes back after a reload mid-turn, and leaves when the turn moves on. The GM gets no banner. The home page's turn demo uses the banner.
- **GM Previous turn.** A new GM-only `initiative.previous` command steps the turn back one, wrapping to the last turn of the previous round. It produces a new `InitiativeRewound { initiative, previous }` event, so the activity log and replay say what happened. It is refused on round 1's first turn. It moves only the turn; whatever happened during the turn it steps past stays.
- **GM initiative controls layout.** Previous turn and Next turn sit side by side, equal width, with Next turn as the primary (accent) button. The pending reminder sits below them. **End encounter** is a `secondary danger` button of normal size on its own row, right-aligned, with a small gap above it, and asks for confirmation before ending.
- **Ignore and Clear all for rulings.** Each attack roll in the GM's Rulings list gets **Ignore**, and the list gets **Clear all** at the top, which ignores every attack roll shown. A new GM-only `roll.dismiss { rollIds }` command produces `RollsDismissed`, which marks the rolls `dismissed`. That flag is GM-only bookkeeping and never reaches players. Ignored rolls leave the list and the pending count. They stay in the Dice tab's roll log, where the GM can still rule on them. The GM can undo an ignore. Clear all never touches the open Area Effect, which keeps its own Skip.
- **AI seats end their turn.** The MCP seat server gets an `end_turn` tool that sends `initiative.endTurn` for the seat's active token, under the same checks.

Schema additions to `packages/shared` (three commands, two events, one optional `DiceRoll` field) are covered by a new ADR (0060), which the Real-Time Architecture owner reviews.

## Capabilities

### New Capabilities
- `initiative-turns`: who can move the turn and how. This covers a player ending their own token's turn, the GM's Previous turn, the GM initiative controls layout, and an AI seat's `end_turn`.

### Modified Capabilities
- `turn-notice`: the toast that hides itself after 6 seconds becomes a banner at the top that lasts the whole turn, shows after a reload, and carries End turn. (This capability comes from the `turn-notice` change, which is complete but not archived. Archive that change first so this delta has a main spec to modify.)
- `attack-rulings`: the GM Rulings list gains Ignore and Clear all, and ignored rolls drop out of the list and the pending counts.

## Impact

- **`packages/shared`:** `commands.ts` (`initiative.endTurn`, `initiative.previous`, `roll.dismiss`), `events.ts` (`InitiativeRewound`, `RollsDismissed`), `dice.ts` (`DiceRoll.dismissed`), `decide.ts`, the reducer, `visibility.ts` (resync for `InitiativeRewound`, redact `RollsDismissed`, strip `dismissed`), `undo.ts` (`RollsDismissed` reversible), `activityLog.ts`, `replay.ts`, and the shared message catalog for new refusals.
- **`apps/server`:** no new code paths, just integration tests through the existing command pipeline.
- **`apps/web`:** `ui/TurnBanner.tsx` (new, replacing `ui/TurnNotice.tsx`), `pages/RoomPage.tsx`, `pages/home/TurnTile.tsx`, `panels/InitiativeTracker.tsx`, `panels/RulingsPanel.tsx`, `panels/attackRoll.ts` (`pendingRulings`), `styles.css`, and en and zh-TW catalogs.
- **`apps/mcp`:** an `end_turn` tool in `tools.ts`, plus the seat brief.
- **Docs:** `docs/adr/0060-player-end-turn-and-ruling-dismissal.md`.
