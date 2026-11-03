# Design

## Context

See `proposal.md` for why the change is needed, and `specs/` for the behavior. These are the parts of the current code the approach depends on:

- **Pipeline (CLAUDE.md invariants 1–2).** Every change goes `Command → decide → events → reduce`. Dice use `DecideContext.random`, which keeps `decide` pure. `dice.roll` → `DiceRolled` puts each roll in `state.rolls`, which is capped at `ROLL_LOG_LIMIT = 30` (`state.ts:273`).
- **Single-target damage (ADR 0011).** `roll.applyDamage` emits `TokenStatsSet { stats, previous }` + `RollDamageApplied`. HP has a floor of `MIN_HP = -999`, and `TokenStats.maxHp` is nullable (`conditions.ts`).
- **Conditions.** `token.setConditions` emits `TokenConditionsSet { conditions, previous }`. There are at most 12 per token, gated by `presetRefusal(state, { conditions })`.
- **Undo (ADR 0013, `undo.ts`).** An action is one command's batch of events. It is undoable only if every event in it is in `REVERSIBLE_EVENT_TYPES`; `TokenStatsSet` and `TokenConditionsSet` already are.
- **Filters (`visibility.ts`).** `filterEventForViewer` returns an event (possibly a rewritten copy), `redacted`, or `resync`. `DiceRolled` sends `resync` when an attack side is hidden. `TokenStatsSet` and `TokenConditionsSet` are already redacted for hidden tokens.
- **Board (`boardView.ts`).** Only one token can be selected (`selectToken`). Template geometry is `areaShape()` in `board/tools.ts`. There is no menu on templates, and targeting modes ("Pick on board") already exist in the attack panel.
- **Precedent.** ADR 0039 removed an AoE radius from named attacks in favour of N single-target rolls. `nuke.detonate` already damages many tokens in one command.

## Goals / Non-Goals

**Goals:**
- A single shared "group roll" for both entry points, so the Dice tab and the Area Effect don't build two parallel models.
- An Area Effect whose state is persisted and can be replayed. It survives reconnects, and the 30-roll log rolling over can't lose it.
- Resolve is one command → one undoable action, built from the existing reversible `TokenStatsSet` and `TokenConditionsSet`.
- Every new payload is filtered for players. Hidden targets and per-target saves never leave the server for a player.

**Non-Goals:**
- Players making group rolls or rolling their own saves (a later change).
- A DC, or any automatic outcome derived from saves. Results stay advisory.
- Changing named attacks, `maxTargets` (ADR 0039), or `roll.applyDamage`.
- Several Area Effects open at once.
- 3D dice throws for group or damage rolls (see Open Questions).

## Decisions

### 1. Data model

```ts
// dice.ts
GroupRollEntry = { tokenId, name, hidden, dice: int[], total: int }
GroupRoll = {
  kind: "group", id, expression, label: string | null, byParticipantId,
  visibility: DiceVisibility, entries: GroupRollEntry[] /* 1..30 */,
}

// state.ts
AreaEffect = {
  id, label: string | null, createdBy,
  roll: Omit<GroupRoll, "visibility">,          // the per-target saves; GM-only
  call: { participantId, answered: boolean } | null,
  damage: null
        | { expression, mode: "single", dice, total }
        | { expression, mode: "perTarget", results: { tokenId, dice, total }[] },
}
RoomState.areaEffect: AreaEffect | null          // default null
RoomState.rolls: (DiceRoll | GroupRoll)[]        // group rolls share the log
```

- **A group roll lives in `state.rolls` as a union member marked by `kind: "group"`.** The spec says it takes one log entry, and sharing the log gives it the same ordering and cap as other rolls. Existing `DiceRoll` entries have no `kind`, so old snapshots and events still parse. Two alternatives were rejected. A separate `groupRolls` list would need its own merge-and-order logic in the roll log. Putting an optional `group` field on `DiceRoll` would make `dice`/`total` meaningless for those entries. Every consumer that reads `rolls` (rulings, roll log, `undo.rollLabels`, attack panel) has to narrow on `kind`. The compiler finds all of them.
- **The Area Effect's own group roll is stored inside the effect and is not added to `state.rolls`.** Its saves are always GM-only, and keeping it out of the log means it can't drop out after 30 rolls or show up in the public log. Its damage roll also stays inside the effect.
- **The stage is derived from data, not stored.** `call === null && damage === null` means rolled. `call && !call.answered` means waiting. `damage !== null` means damage rolled. That leaves no stage field that can disagree with the data.
- **Entries carry `name` and `hidden` as they were at roll time,** like `AttackSide` (ADR 0010), so the log reads correctly after a rename or a delete.

### 2. Commands and events

| Command | Who | Emits |
|---|---|---|
| `dice.rollGroup { tokenIds, expression, label?, visibility }` | GM | `GroupRolled { roll }` |
| `areaEffect.start { tokenIds, expression, label? }` | GM, attacks on | `AreaEffectStarted { effect }` |
| `areaEffect.call { effectId, participantId }` | GM | `AreaEffectCalled { effectId, participantId, previous: participantId \| null }` |
| `areaEffect.rollDamage { effectId, expression, mode }` | holder of the call | `AreaEffectDamageRolled { effectId, damage }` |
| `areaEffect.resolve { effectId, rows: { tokenId, amount: int \| null, addConditions: ConditionId[] }[] }` | GM | `TokenStatsSet`…, `TokenConditionsSet`…, `AreaEffectResolved { effect, amounts }` |
| `areaEffect.close { effectId }` | GM | `AreaEffectClosed { effect }` |

- **`group.*` is already taken by token groups,** so the group roll is `dice.rollGroup`. That follows `noun.verb`, and it sits beside `dice.roll`.
- **One `areaEffect.call` command handles the first call, a reassignment and a takeover.** `decide` tells them apart from the state: the first call needs `call === null && damage === null`; a reassignment needs a pending call and a different participant. `previous` records the participant who held the call before (invariant 6). Takeover is the GM calling themselves. This keeps the contract smaller than three near-identical commands.
- **`rows` are explicit and computed on the client.** "Conditions for all" is merged into each row before sending, and Half/None are UI-only. `decide` re-reads current HP when it applies, as `roll.applyDamage` does, so a stale screen can't apply a value twice: the second resolve finds no open effect and is refused.
- **Resolving and closing carry the full effect** that they close (invariant 6: the full deleted entity). That way the history is enough to show what was decided without replaying earlier events.
- **Skipping the call** needs no command. `areaEffect.resolve` is accepted whenever no call is pending.
- **Pre-filling the caller** is done only on the client (the owner of the active initiative token, falling back to the GM). The server checks only that the target participant exists in `state.participants`, which still includes participants who have left; the UI marks them.

### 3. Undo

`AreaEffectResolved` joins `REVERSIBLE_EVENT_TYPES`, so a resolve batch stays undoable as a whole. Its inverse is `AreaEffectResolveUndone { effectId }`. `reduce` leaves `areaEffect` alone for it and uses it only so the activity log can say what was undone; undo does not reopen the effect, as the spec requires. Its `undoConflict` is null; the paired `TokenStatsSet` and `TokenConditionsSet` conflicts already refuse an undo once HP or conditions have changed since. `describeUndo` labels it "Fireball (3 targets)".

The alternative was to make undo reopen the effect. It was rejected because another effect may have opened in the meantime (only one can be open), and an HP rollback should not bring back a prompt for a player.

`AreaEffectStarted`, `AreaEffectCalled`, `AreaEffectDamageRolled`, `AreaEffectClosed` and `GroupRolled` are not reversible, like `DiceRolled`.

### 4. Visibility (invariant 3)

`filterStateForViewer` for a player:
- **`rolls`:** GM-only group rolls are removed. Public ones keep only the entries whose token the viewer can currently see (`!hidden && !concealedFrom(fog, token, viewer)`). Unlike an attack's "Unknown" side, entries are dropped rather than blanked, so their number reveals nothing.
- **`areaEffect`:** `roll.entries` is replaced by `{ tokenId, name }` for visible targets only (no dice, no totals). `damage.results` is filtered the same way. `call` and `label` pass through.

`filterEventForViewer` for a player:
- **`GroupRolled`:** redacted when the roll is GM-only. Otherwise, a rewritten copy with the concealed entries removed (the filter can already return a modified event).
- **`AreaEffectStarted` / `AreaEffectDamageRolled`:** a rewritten copy built by the same projection function as the snapshot, so live events and snapshots can't diverge.
- **`AreaEffectCalled` / `AreaEffectClosed`:** they name no hidden data apart from the effect's targets, so `Called` passes. `Closed` and `Resolved` carry the projected effect. `Resolved` keeps `amounts` only for the targets in that projection, which feeds the damage numbers; a concealed target's amount is stripped.
- `TokenStatsSet` and `TokenConditionsSet` keep their existing per-token redaction, so the amounts for a hidden target are never seen.

The `visibility-auditor` agent should review this before merge.

### 5. Client

- **`board/`:** add `selectedTokenIds: Set` and a `toggleTokenSelection` callback. Shift held on a token pointer-down toggles the token instead of starting a drag. A template-pick mode uses the same pattern as attack targeting. A pure helper `tokensTouchingArea(geometry, tokens, grid)` sits next to `areaShape()` and is unit-tested. Its rule is footprint-square vs. shape overlap, where edge contact doesn't count. React keeps the selection and passes it in; panels never touch Pixi (CLAUDE.md).
- **Panels:**
  - `DicePanel` gets a Group roll section.
  - A new `AreaEffectPanel` in the Play tab, inside `features.attacks`, shows the stage-dependent controls.
  - The called player sees a `DamageCallPrompt`, a `PanelSection` pinned at the top of the Play tab plus a tab badge, so it is visible from any tab.
- **Rulings:** `pendingRulings(state)` in `attackRoll.ts` returns an `{ kind: "areaEffect" }` entry while `state.areaEffect` is non-null, so the tab badge, the `InitiativeTracker` count and `RulingsPanel` all pick it up from one place.

### 6. ADR

A new ADR, `docs/adr/0046-area-effects-and-group-rolls.md`, records:
- the new schemas;
- why `rolls` becomes a union;
- the undo choice;
- the filtering rules;
- that this amends ADR 0039: an area effect run by the GM is a different tool from a multi-target named attack, which is still N single rolls.

The Real-Time Architecture owner reviews it before the shared schemas are merged.

## Risks / Trade-offs

- [Making `state.rolls` a union touches every reader of the roll log] → TypeScript narrowing makes each one a compile error until it's handled, and a shared test confirms that old snapshots without `kind` still parse.
- [Shift-click is the gesture for selection, so a GM can't shift-drag a token] → No drag uses Shift today. Portals use shift-click on doors, which aren't tokens, so they don't conflict.
- [Building filtered event copies in the filter is new for complex payloads] → One projection function, `areaEffectForViewer`, serves both the snapshot and event paths. Server integration tests assert that a player never receives a hidden target's id, save or damage.
- [A resolve that names many targets produces up to 2×30 + 1 events in one batch] → This is about the size of `nuke.detonate`. `UNDO_HISTORY_LIMIT` counts actions, not events.
- [The called player leaves mid-effect] → The call stays with them, and the GM's row shows "left" with Reassign/Take over, as the spec requires. Nothing auto-reassigns.
- [A target is deleted or hidden while the effect is open] → Resolve skips deleted targets. The filters use current visibility, so a newly hidden target disappears from player views on the next snapshot (`TokenHiddenSet` already forces a resync).

## Migration Plan

`RoomState.areaEffect` defaults to `null`, and old roll entries parse as `DiceRoll`. No data migration is needed, and replaying existing event logs gives the same state. To roll back, revert the change; rooms that have new events would need those event types to stay parseable, so keep the schemas if any room has used the feature.

### 7. Resolve dialog (web only)

- **Docked modal.** The resolve step leaves the sidebar for the existing `Modal` (native `<dialog>`, `showModal()`), with a modifier class `resolve-dock`. That class places it at the bottom centre at a maximum of about a third of the viewport height, with a much lighter `::backdrop` than the default 62% dim. Using `showModal()` makes the board inert while the dialog is open: it stays visible but can't be panned. Closing keeps the draft, so the GM can close, look around and reopen. A non-modal floating panel was considered and rejected: it would need its own focus handling, while `Modal` already brings the focus trap, Escape and focus return.
- **One target per step.** The dialog shows one target with Previous/Next, its amount with Half/None, and the existing `ConditionPicker` checklist. The token's current conditions show checked and locked: the command still sends only additions, so neither the contract nor the ADR changes. **Apply these conditions to every target** merges the shown target's additions into every row. **Confirm resolution** builds the same `areaEffect.resolve` rows as before.
- **Draft above the dialog.** The draft (amounts, additions, current step) lives in `RoomPanel` state keyed by the effect's id, not in the dialog, so closing and reopening keeps it. `RoomPanel` is the one owner both openers share: the Rulings row and the Area Effect section each get an `onResolve` callback. A new effect id, or `areaEffect` becoming null, drops the draft and closes the dialog. Amounts are kept only once typed; until then a target shows its rolled damage, so a damage roll that lands after the dialog was first opened still fills them in (`panels/resolveDraft.ts`).
- **Resolve's appearance.** It uses the secondary button style (like Skip) while `areaEffectStage` is `started`, and the primary style (like Call) once it is `rolled`. It isn't offered while a call is pending.
- **Layout.** The title is the shown token's name. The effect's name and "n of N" sit in the header in small type. The token's roll, its rolled damage and its HP sit in that same header row in large type, so they never scroll out of view in the short docked dialog. The area-effect menus say "roll" or "result", never "save".
- **Damage numbers.** `attackEffectFor` maps `AreaEffectResolved` to a new `damages` effect: every visible target with an amount above 0, drawn by the effects overlay with the same `Damage` number as an applied damage roll, all at once (past 24, without motion, like the nuke's numbers).
- **Text.** The start form's label becomes "Effect name" with the placeholder "New Effect". The damage formula placeholder becomes "Damage Formula (e.g. 8d6)".

### 8. Dice for group and area-effect rolls (web only)

- **Source.** Group and area-effect rolls don't emit `DiceRolled`, so `connection.onRolled` never sees them. `RoomPage` listens to committed `GroupRolled`, `AreaEffectStarted` and `AreaEffectDamageRolled` instead. Those events are already filtered for the viewer, so each client animates only the numbers it was sent: saves on the GM's screen, and only visible targets for players.
- **The normal throw, aimed at each token.** Each token's dice use a Roll-button throw's paths, keyframes, stagger and die size (`boardDiePaths`, `throwKeyframes`, `throwStagger`, `boardDieSize`). They leave from the usual throwing side (`throwStart`) and come to rest around that token. Every token's throw starts together, so a roll lands after one throw (`THROW_MS` plus the stagger, about 1.6 s) however many targets it has. A single damage roll is thrown once, onto the centroid of the viewer's visible targets. The dice linger the usual 3 s.
- **One board slot.** A roll's throws count as one entry in their own short list (`MAX_BOARD_DROPS`, apart from `MAX_BOARD_THROWS`), so they never evict each other or a normal throw.
- **Dice cap.** Over about 40 dice in one roll, each token instead gets a single die showing its total, dropped straight down (about 700 ms). This keeps the DOM animation smooth: for example, per-target `8d6` on 30 targets would otherwise be 240 dice.
- **Airborne.** The roll id joins the existing `airborne` set until its dice land, so the panel and dialog totals wait for the dice as other rolls do. With reduced motion, or with no board, the roll lands at once.
- **Rejected alternatives.**
  - A short drop for every roll was quicker (about 0.7 s) but didn't look like a normal roll.
  - One central throw gets slower past 20 dice (split into sequential throws, or evicted by the three-throw cap), and the results can't be told apart by token.

## Open Questions

- Should the activity log name the targets of a resolved Area Effect, or only how many? The log is GM-only, so either way is safe.
