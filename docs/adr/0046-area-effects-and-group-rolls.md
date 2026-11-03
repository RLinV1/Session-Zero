# ADR 0046 — Area effects and group rolls

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0039-multi-target-attacks.md` · **Extends:** `docs/adr/0010-attack-roll-context.md`, `docs/adr/0011-attack-rulings.md`, `docs/adr/0013-undo.md`
**Change:** `openspec/changes/area-effects` · **Requirements:** FR-TAC-06, FR-TAC-09, FR-GM-22, FR-GM-23

## Context

A fireball, a trap or a breath weapon catches several tokens at once. Each token rolls the same save, a player rolls the damage, and the GM decides per token whether it takes all of it, half, none, or something else. Today the GM does this one token at a time. `dice.roll` and `roll.applyDamage` name a single target and always apply the full total, and every per-token roll takes one of the 30 slots in the roll log.

ADR 0039 removed an area-of-effect radius from named attacks, in favour of rolling a multi-target attack once per target. That still holds for attacks. An area effect is a different tool: the GM runs it, the outcome is decided per token, and the damage roll is handed to a player.

## Decision

### Group rolls

- `GroupRoll { kind: "group", id, expression, label, byParticipantId, visibility, entries[] }` has one entry per token: `{ tokenId, name, hidden, dice, total }`. As with `AttackSide`, `name` and `hidden` are recorded at roll time, so the log still reads right after a rename or delete, and a token once concealed stays concealed for good.
- `RoomState.rolls` becomes `(DiceRoll | GroupRoll)[]`. A group roll takes one log slot and is ordered and capped with every other roll.
  - `DiceRoll` is unchanged and has no `kind`, so stored rolls and events parse as before.
  - Code that reads `.attack`, `.dice` and similar narrows first with `isGroupRoll`. `diceRollsOf` lists only the plain rolls.
- Command `dice.rollGroup { tokenIds (1–30, distinct), expression, label?, visibility }`, GM only. Event `GroupRolled { roll }`.
  - `group.*` is already used by token groups (ADR 0026), so the command sits under `dice.*`.
  - `decide` rolls the expression once per token with `ctx.random`.

### Area effects

- `RoomState.areaEffect: AreaEffect | null`. A room holds at most one. A snapshot from before this change has no such field, and readers treat it as `null`.

  ```
  AreaEffect {
    id, label, expression, byParticipantId,
    targets: { tokenId, name, hidden, roll: { dice, total } | null }[],
    call:   { participantId } | null,
    damage: { mode: "single", expression, byParticipantId, dice, total }
          | { mode: "perTarget", expression, byParticipantId, results: { tokenId, dice, total }[] }
          | null,
  }
  ```

- The stage is derived from the data, never stored:
  - `damage` set → **rolled**;
  - otherwise `call` set → **called**;
  - otherwise **started**.
- The effect keeps its own saves and its own damage roll and adds nothing to `rolls`. The saves are always GM-only, and keeping them out of the log means they can't drop out of the 30-roll window while the effect is still open.
- Commands, all GM-only except `rollDamage`:

  | Command | Event | Rule |
  |---|---|---|
  | `areaEffect.start { tokenIds, expression, label? }` | `AreaEffectStarted { effect }` | Needs the preset's attacks feature. Refused while another effect is open. |
  | `areaEffect.call { effectId, participantId }` | `AreaEffectCalled { effectId, participantId, previous }` | One command covers the first call (`previous: null`), a reassignment and a takeover (the GM calling themselves). Refused once the damage is rolled, or when the call already sits with that participant. |
  | `areaEffect.rollDamage { effectId, expression, mode }` | `AreaEffectDamageRolled { effectId, damage }` | Only the participant holding a pending call may send it. With `perTarget`, the same expression is rolled once for each target that still exists. |
  | `areaEffect.resolve { effectId, rows[] }` | `TokenStatsSet`…, `TokenConditionsSet`…, `AreaEffectResolved { effect, amounts }` | Refused while a call is pending. |
  | `areaEffect.close { effectId }` | `AreaEffectClosed { effect }` | Changes no token. |

- Each resolve row is `{ tokenId, amount: int | null, addConditions }`.
  - **Computed on the client:** Half, None and "conditions for all" are merged into the rows in the UI.
  - **Computed by `decide`, from the token's state at that moment:** the new HP (floored at `MIN_HP`; healing is capped at `maxHp` and never lowers HP), and the condition set (the existing conditions plus the added ones, at most 12).
  - **Closing the effect** is why a second Confirm from a stale screen is refused.
- `AreaEffectResolved` and `AreaEffectClosed` carry the whole effect they close (invariant 6).

### Undo

`AreaEffectResolved` is reversible and its inverse is empty. Undoing a resolve emits the inverse `TokenStatsSet` and `TokenConditionsSet` events and then `ActionUndone`. The existing per-token conflict checks refuse the undo once any of those values has changed. `canUndo` accepts a stats change together with `AreaEffectResolved`, as it already does with `RollDamageApplied` and `MapNuked`.

Undo does not reopen the effect, for two reasons:
- another effect may have opened since, and only one can be open;
- an HP rollback should not bring a damage prompt back to a player.

### Visibility (FR-GM-22, FR-GM-23)

- **Group roll.** A GM-only group roll never reaches a player. A public one reaches players with the entries for concealed tokens removed: hidden tokens, unowned tokens under fog or out of the player's line of sight (ADR 0044), and entries marked `hidden`. Entries are removed rather than shown as "Unknown", so the number of entries reveals nothing. A roll with no visible entries is withheld entirely.
- **Area effect.** One projection, `areaEffectForViewer`, is used by both `filterStateForViewer` and `filterEventForViewer`:
  - every target's save becomes `null`;
  - concealed targets, and their per-target damage results, are removed;
  - `call`, `label` and the single damage total pass through.
- **Area effect events.** The filter returns a rewritten copy of each event:
  - `AreaEffectStarted`, `AreaEffectDamageRolled` and `AreaEffectClosed` are projected;
  - `AreaEffectResolved` is projected with `amounts` kept only for the targets the player can see, so their board can show damage numbers. Those targets' HP changes already reach the player, so this reveals nothing new;
  - `AreaEffectCalled` passes unchanged, since it names only participants, who are public.
- **Withheld effects.** If a player can see none of an effect's targets and doesn't hold its call, the effect is withheld from them entirely: `areaEffect: null` in the snapshot, and its events are redacted. An empty target list would otherwise tell them a concealed token is being targeted.
  - A call that gives a withheld effect to a player, or moves it away from them, is answered with a resync, as is any change that conceals or reveals a target.
  - A player who is called for an all-hidden effect learns only that it exists, its label, and that it has no target they can see.
- **The HP and condition changes** inside a resolve keep their existing per-token redaction.
- **Replay.** Table frames also carry the viewer's copy of the open area effect.

## Consequences

- This adds new state, commands and events. No existing command or event changes meaning.
- Every reader of `rolls` narrows on `isGroupRoll`, and the compiler finds each one.
- An open effect counts as one pending ruling in the GM's Rulings list, Play tab badge and initiative reminder (`attack-rulings`).
- A target concealed from a player when the roll or effect started, but later deleted, counts as visible to them, as old attack rolls already do (ADR 0044). The player may then see its name in a group roll entry or the open effect, and an effect withheld from them may reach them. Accepted.
- A group roll entry or effect target concealed only by line of sight shows up once the token comes into view, because concealment follows current visibility (ADR 0044). Only entries marked `hidden` (hidden tokens, and unowned tokens under fog when rolled) stay concealed for good. Accepted.
- A resolve is one batch: the player's visible HP and condition changes, a redacted seq for each change to a target they can't see, then `AreaEffectResolved`. Any redacted seqs in that batch tell the player that at least one concealed target was affected, though not which one or how. Other batched commands already have this side channel. Accepted.
- This leaves out players making group rolls, rolling their own saves, a DC with automatic outcomes, and several open effects at once.
