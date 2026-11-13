# Proposal

## Why

Starting an encounter (FR-GM-21) means typing a score for every token. The GM has no way to roll for all of them at once, and once the encounter is running the turn order can't change: a monster that joins mid-fight can't be added, one that flees can't be taken out, and a deleted token stays in the order as a "(removed)" row that someone has to click past. (The comment on `advance()` says such rows are skipped. They aren't.)

## What Changes

- **Mass roll in the Start encounter and Add to encounter dialogs.** Below the group checkboxes in each, above the token list, the app's dice builder (`DicePoolInput`, ADR 0061), the same one every other roll in the app uses, starting at 1d20, with a Roll button. There is no text field for a formula. Roll rolls the formula once for each *checked* token through the existing GM-only group roll (`dice.rollGroup`, `visibility: "gm"`). If more than 30 tokens are checked, it sends two calls, since a group roll holds at most 30. The dice animate on the GM's board only; players receive nothing. Each result fills that token's score field, and the rolled total stays shown to the left of the field so the GM can refer to it after editing the score. Starting the encounter works as before. The dialog covering the dice on the board is acceptable.
- **The GM adds tokens to a running encounter.** New command `initiative.add { entries: [{ tokenId, score }] }` (1 to 60 entries, like `initiative.start`) produces one new `InitiativeJoined` event per token. It is all-or-nothing: one bad entry refuses the whole command. The server places each token by score, using the same ordering as Start, and saves the score on the token. The token whose turn it is keeps the turn.
- **Add to encounter works like Start encounter.** Its dialog is a checklist of the tokens not in the order, with none checked at first. Each row has the token's swatch, name, rolled total and score field, pre-filled with the token's saved score. Group checkboxes tick a group's tokens. The same dice builder and Roll cover the checked tokens, and submitting adds every checked token that has a score, in one command.
- **Players' tokens get their own checkbox in both dialogs.** Next to the group checkboxes, a **Players' tokens** checkbox ticks every token owned by an active player. A group checkbox now ticks only that group's tokens. Ticking a group never ticks Players' tokens. Both dialogs open with nothing ticked.
- **The GM removes a token from a running encounter.** New command `initiative.remove { tokenId }` produces a new event `InitiativeLeft`. The token whose turn it is keeps the turn. Removing the active token moves the turn on, as End turn does. Removing the last token ends the encounter (`InitiativeEnded`), after the GM confirms.
- **Deleting a token removes it from the order.** Every way a token can be deleted (the GM deletes it, a departing player's tokens are deleted, the room removes a defeated token) is followed in the same command by `InitiativeLeft`, or by `InitiativeEnded` if it was the last token. New "(removed)" rows can no longer appear. Rooms that already have them still show them as before.
- **Undoing a defeat removal brings the token back on the board only.** It doesn't go back into the turn order or change the encounter, so an undo can never affect a later encounter. The GM can put it back with Add to encounter. (A defeat removal is the only token deletion undo can reverse today.)
- New ADR for the new commands and events and for removal on delete. As `CLAUDE.md` requires, it needs review by the Real-Time Architecture owner.

## Capabilities

### New Capabilities
- `initiative-mass-roll`: rolling one formula, built in the app's dice builder, for the checked tokens in the Start encounter and Add to encounter dialogs, GM-only, with each token's rolled total kept beside its score field.

### Modified Capabilities
- `initiative-turns`: adds the GM adding (several at once) and removing tokens in a running encounter, deleting a token taking it out of the order, the encounter ending when its last token leaves, and undo of a defeat removal leaving the turn order alone. The GM initiative controls requirement gains the remove control and the Add to encounter checklist dialog.
- `token-groups`: "Start an encounter from groups" changes so that a group includes only its own tokens, and active players' tokens are included only through a separate Players' tokens checkbox, which a group never ticks.

## Impact

- `packages/shared`: `commands.ts` (`initiative.add`, `initiative.remove`); `events.ts` (`InitiativeJoined`, `InitiativeLeft`); `decide.ts` (the two commands, a shared place-by-score helper, a `withInitiativeExits` pass on the three deletion paths); `reducer.ts`; `visibility.ts` (both events send players a filtered snapshot instead); `undo.ts`; `activityLog.ts`, `replay.ts`, and the zh-TW sentence catalogs.
- `apps/web`: `InitiativeTracker.tsx` (dice builder and Roll in both dialogs, the per-token result column, a token-row checklist shared by Start and Add to encounter, the Players' tokens checkbox, Remove per row, confirmation before removing the last token); `useInitiativeRoll.ts` (takes a dice pool, not text); `initiativeFields.ts`; `tokenGroups.ts` (`encounterIncludes` no longer adds players' tokens); en and zh-TW catalogs.
- `apps/server`: no pipeline changes. Integration tests for the new commands and for deletion over the wire.
- `docs/adr/0065-initiative-order-edits.md` (new), including the batch `initiative.add`.
- No change to `initiative.start`, the `Initiative` state shape, or `GroupRoll`.
