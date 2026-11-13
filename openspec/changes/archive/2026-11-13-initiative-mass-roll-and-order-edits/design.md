# Design

## Context

See proposal.md for the motivation. The current state that shapes the approach:

- `Initiative` is `{ order: Id[], activeIndex, round }`. Scores are not in it; each is saved on its token as `token.initiative` (ADR 0022), and only `InitiativeStarted` writes them. So every token in a running order has a saved score.
- `initiative.start` sorts on the server: score descending, then token id ascending.
- Tokens are deleted in three places in `decide.ts`: `token.delete`, the departing-player token actions, and `withDefeats()`. Only defeat deletions (`reason: "defeated"`) can be undone (ADR 0049).
- `inverseOf(event)` in `undo.ts` doesn't look at room state. `history.undo` in `decide` does have the state, and emits the inverses in reverse order followed by `ActionUndone`.
- Players never receive initiative events directly. `filterEventForViewer` sends them a filtered snapshot instead (a resync), except for `InitiativeEnded`, which is sent filtered.
- `dice.rollGroup` (ADR 0046) is GM-only, rolls in `decide` with `ctx.random`, accepts 1 to 30 tokens, and for `visibility: "gm"` animates on the GM's board only (`board/tokenDice.ts`, `dropFor`).
- `RoomConnection.command()` resolves to `{ ok, seq }` only.
- Every roll input in the app is the shared dice builder `DicePoolInput` (ADR 0061); there is no text field for a formula anywhere. Callers keep a `DicePool` and send `poolExpression(pool)`.
- The Start encounter dialog's group filter (`encounterIncludes` in `tokenGroups.ts`, KAN-82) includes the chosen groups' tokens *and* every active player's tokens; there is no way to choose one without the other.

## Goals / Non-Goals

**Goals:**
- Turn-order edits mid-encounter that keep the token whose turn it is active, follow the same ordering as Start, and carry the order they replaced (invariant 6).
- Removal on delete that leaves existing event logs replaying exactly as before.
- Mass roll with no schema change.

**Non-Goals:**
- Per-token initiative modifiers (no new `Token` field). The GM types a formula such as `1d20+2`.
- Making `initiative.add` / `initiative.remove` undoable. Like Next turn and End encounter, they aren't on the undo list; the GM reverses one by doing the opposite.
- Making GM `token.delete` or a departing player's token deletion undoable. That's unchanged.
- An encounter id. Since undo never touches the turn order (D4), one encounter never needs telling apart from a later one.
- Putting a token back in the turn order when its defeat removal is undone.
- Changes to `Initiative`, `initiative.start`, `GroupRoll`, `CommandResult`, or the dice builder itself.

## Decisions

### D1. Two new events that carry the whole order before and after

```
InitiativeJoined { tokenId, initiative, previous, score: InitiativeScore, previousScore: InitiativeScore | null }
InitiativeLeft   { tokenId, initiative, previous, reason?: "deleted" }
```

`decide` computes the new order; `reduce` only assigns it. `InitiativeJoined` also sets `token.initiative = score`. These follow `InitiativeAdvanced` and `InitiativeRewound`, which already carry both orders. Alternative considered: events carrying only `tokenId`, with `reduce` working out the placement. Rejected because the event would no longer show its own result, and the turn and placement rules would live in two places.

`initiative.add` is a batch: `{ entries: [{ tokenId, score }] }`, 1 to 60 entries, the same shape and limit as `initiative.start`. `decide` checks every entry first (GM only, encounter running, token exists, not already in the order, no token listed twice, score in range) and refuses the whole command if any fails. It then sorts the entries the way Start does (score descending, token id ascending) and emits one `InitiativeJoined` per entry, each placed by `placeByScore` against the order the one before it left, so each event's `previous` is the order just before it. Because placement uses the same comparator, the result doesn't depend on the order the entries were sent in. Alternative considered: keeping `initiative.add { tokenId, score }` and having the dialog send one command per checked token. Rejected because a refusal partway through would leave some of the checked tokens added and others not.

### D2. Place by saved score in one shared helper

`placeByScore(initiative, tokens, tokenId, score)`: insert `tokenId` before the first entry `e` where `(score, tokenId)` sorts ahead of `(tokens[e].initiative, e)`, using the same comparator as `initiative.start`. Entries whose token is missing or has no saved score sort last; that only happens in legacy rows. If the token lands at or before `activeIndex`, `activeIndex + 1`. Used by `initiative.add`, once per entry.

`withoutToken(initiative, tokenId)` returns the new `Initiative` or `"empty"`. If the removed index is less than `activeIndex`, it does `activeIndex - 1`. If it equals `activeIndex`, the index stays and so points at the next token; if that runs off the end, it wraps to 0 and `round + 1`, the same as `advance()`. If it's greater, nothing changes. `"empty"` tells the caller to emit `InitiativeEnded { previous }`.

### D3. Removal on delete happens in decide (option ii), not reduce

A `withInitiativeExits(state, events)` pass runs on every decision. For each `TokenDeleted` whose token is in the order as folded so far, it adds `InitiativeLeft { reason: "deleted" }` (or `InitiativeEnded` when the order would be empty) right after it. It runs after `withDefeats`, so defeat deletions are covered, and it also wraps the `token.delete` and departing-player results. Alternative considered: filtering the order in the `TokenDeleted` reducer. Rejected because the event wouldn't carry the replaced order (invariant 6), replaying old logs would give different results, and undo couldn't restore the place.

The pass folds the batch as it goes (as `withDefeats` does with `reduceAll`), so several deletions in one command, such as an area effect defeating three goblins, each see the order the previous one left.

### D4. Undo leaves the turn order alone

When an undo entry for a defeat holds `InitiativeLeft` or `InitiativeEnded`, those events have no inverse: `inverseOf` returns `[]` for them, as it does for `AreaEffectResolved`. Undo brings back the token (with its saved `initiative`, carried in `TokenDeleted.token`) and nothing else. `undoConflict` gains no initiative check, and the existing `TokenDeleted` checks (token already back, name taken) still apply. The defeat entry must stay undoable with these events in it; `canUndo` and `recordUndo` are adjusted only as far as that requires.

Alternatives considered:
- Restoring `InitiativeLeft.previous` as-is. Rejected because it brings back the old round and active turn.
- Putting the token back by score whenever an encounter is running. Rejected because, with no encounter id, an undo during a *later* encounter would add the token to that encounter. Reliably telling encounters apart would need a schema change to `Initiative`, which isn't worth it when the GM can use Add to encounter.

### D5. Visibility

`InitiativeJoined` and `InitiativeLeft` join the existing resync case in `filterEventForViewer`, since both orders may name hidden tokens. The activity log entry for a hidden token goes through the same name filtering as `InitiativeStarted`.

### D6. Mass roll on the client with the existing group roll

The formula is built in `DicePoolInput`, as every other roll in the app is (ADR 0061), starting at `poolOf(20)`; there is no text field. `useInitiativeRoll` keeps a `DicePool` and sends `expression: poolExpression(pool)`. The builder can only make formulas the server accepts, so the dialog no longer needs to handle a malformed formula; a refusal from the server (for example, a token deleted meanwhile) still shows in the dialog.

The dialog sends `dice.rollGroup { tokenIds: checked, expression, visibility: "gm", label: t("init.rollLabel") }`, split into calls of at most 30 tokens (`MAX_GROUP_ROLL_TOKENS`), one after another. After each `ok`, the client finds the newest `GroupRoll` in `state.rolls` whose `byParticipantId` is the GM, whose `expression` matches, and whose entry token ids equal the call's ids. It copies `{ total, dice }` for each token into dialog state (`rolled: Record<tokenId, GroupRollEntry>`) and puts `String(total)` into `scores`. Alternative considered: returning events in `CommandResult`. Rejected as a protocol change for one caller. The matching is safe enough: one GM, one dialog, calls sent one after another.

The result column is local React state, cleared on close and on a successful Start or Add. Both dialogs use the same roll hook and builder (D8).

### D7. ADR 0065

`docs/adr/0065-initiative-order-edits.md` records D1 through D4 (including the batch `initiative.add`), references ADR 0022, 0026, 0049 and 0060, and notes that the comment on `advance()` saying deleted tokens are "skipped" was wrong; the comment is corrected.

### D8. Add to encounter is the Start encounter checklist, over the tokens outside the order

Both dialogs render one shared checklist: the filter fieldset, then the dice builder and Roll (D6), then a row per token with an include checkbox, swatch, name, rolled result (D6) and score field pre-filled with the token's saved score (`initiativeFieldValue`), Score validation, the messages naming bad fields, and building entries (`invalidInitiative`, `initiativeEntries`) are shared too. They differ only in:

| | Start encounter | Add to encounter |
|---|---|---|
| Tokens listed | every token | tokens not in `initiative.order` |
| Checked at first | all, or the filters' tokens when opened from groups | none |
| Submit | `initiative.start { entries }` | `initiative.add { entries }` |

The inclusion state (filters, `excluded`, `added`) moves into a small hook so both dialogs track it the same way. With no filter ticked, Start includes every token, as it does today, while Add includes none. Alternative considered: keeping a token `<select>` with one score field. Rejected because a GM bringing in a group of reinforcements would have to repeat the dialog once per token.

### D9. Players' tokens as their own filter

The filter fieldset holds one checkbox per group plus a **Players' tokens** checkbox. `encounterIncludes(state, groupIds, players)` returns the chosen groups' tokens, plus every token an active player owns only when `players` is true. Ticking a single token by hand still overrides the filters, as now. The fieldset is shown when there is at least one group or at least one player-owned token among the listed tokens. Both dialogs open with no filter ticked, and ticking a group never ticks Players' tokens: the GM ticks it when the players should come too. With no filter ticked, Start includes every token, as today; Add includes none. in Add, the filters only ever tick tokens that are outside the order. This changes the `token-groups` requirement "Start an encounter from groups", but no schema: it is client-side selection only.

## Risks / Trade-offs

- [After undoing a defeat removal mid-encounter, the GM has to add the token back by hand] → Accepted, so an undo can never affect a later encounter. The token's saved score comes back with it, so the GM can type it again in Add to encounter.
- [The client could match the wrong group roll if the GM rolls twice very quickly] → The Roll button is disabled while a roll is in flight, and calls are sent one at a time.
- [Over 30 tokens creates two entries in the roll log] → Accepted. Over 30 is unusual, and both entries are GM-only.
- [A batch add with one stale entry, such as a token another GM action just put in the order, refuses the whole add] → Accepted and wanted: the dialog shows the server's message and the GM unticks that token. Nothing is half-added.
- [GMs used to a group bringing the players' tokens along] → Ticking a group now includes only that group; the GM ticks Players' tokens too. Accepted: the GM asked for the two to be independent, and the box sits beside the groups.
- [Old rooms keep "(removed)" rows] → Accepted and specified. The GM can now remove them with Remove from order, because `initiative.remove` checks that the id is in the order, not that the token exists.
- [`withInitiativeExits` misses a new deletion path added later] → A unit test lists every `TokenDeleted`-producing command, and the helper wraps the decide result in one place.

## Migration Plan

Additive events; no data migration. Old logs replay unchanged, since no existing event changes meaning. Rollback means reverting the deploy. Rooms that recorded the new events would then fail to parse them, so roll back only before rooms have used the feature, which is the usual rule for new events.
