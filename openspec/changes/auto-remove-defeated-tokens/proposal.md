# Proposal

## Why

When a monster reaches 0 HP the GM has to notice, delete the token by hand and hope the table saw it fall. Damage arrives from several places (applied rolls, area effects, nukes, HP edits), so it is easy to miss one, and a defeated token sits on the board looking alive. A GM who runs fast combats wants the table to do this: a room setting that removes a token the moment its HP reaches 0 or below, with a short death animation so nobody is surprised by a token vanishing.

## What Changes

- **Room setting "Remove tokens at 0 HP" (GM only).** A switch in the app's Settings menu, shown only to the GM. It is shared room state, not a per-browser preference: every participant is subject to it and the GM's choice survives reloads. On by default, including rooms from before this change (the field is absent there and reads as on); the GM can turn it off.
- **Automatic removal.** While the setting is on, any command that leaves a token with HP at 0 or below also removes that token in the same batch (stats change first, then the existing token deletion). This covers applying a damage roll, resolving an Area Effect, a nuke, and HP edits on a token. A token with no HP is never removed.
- **Death animation.** Every viewer who can see the token sees a short death animation on its square, and the token stays drawn until the animation ends. With reduced animations (device, client setting or the GM's table-wide setting) or low graphics quality, only a short fade plays. A hidden or fogged token plays nothing for players and leaks nothing.
- **Undo.** The removal is recorded as the existing token deletion, marked as a defeat. The batch becomes undoable as one action: undo puts the token back with its previous HP.
- Extends shared state, commands and events (`RoomState`, the `Command` and `DomainEvent` unions, `TokenDeleted`) and both visibility filters, so this needs an ADR (0049) and review by the Real-Time Architecture owner.

## Capabilities

### New Capabilities
- `auto-remove-defeated-tokens`: the GM's room setting, the rule for when a token is removed, who sees the death animation, and how the removal is undone.

### Modified Capabilities
- None. The existing specs do not describe token deletion or HP-driven removal (see Impact for the near-misses checked).

## Impact

- `packages/shared`: `RoomState.autoRemoveDefeated`; command `room.setAutoRemoveDefeated` and event `AutoRemoveDefeatedSet`; `TokenDeleted` gains an optional `reason: "defeated"`; one helper in `decide` used by `roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, `token.setStats` and `token.update`; undo for defeat batches (`inverseOf`, `canUndo`, `undoConflict`, `describeUndo`); visibility; activity log and replay phrases.
- `apps/server`: no new transport. New multi-client integration test.
- `apps/web`: a GM-only "Table" section in `ui/SettingsMenu.tsx`; a defeat effect in `board/` (`effects.ts`, `boardView.ts`, `Board.tsx`); no Pixi in React components.
- Docs: `docs/adr/0049-auto-remove-defeated-tokens.md` (Proposed).
- Requirements: FR-TAC-07 (token statistics), FR-GM-14/FR-GM-15 (server-side authorization), FR-GM-16 and FR-GM-23 (nothing hidden leaks), FR-REC-02/03 (undo).
- Specs checked, no conflict: `board-attack-effects` ("unconscious: greyed out" is a manual condition, independent of HP, and stays), `area-effects` (Resolve may now also remove tokens; its "one undoable action" still holds), `token-duplication`, `room-participants`.

## Assumptions

- The rule is HP at 0 or below (`hp <= 0`).
- Default on; applies per room, to every scene.
- Tokens with `hp: null` are never removed.
- Summoned and library-placed tokens are treated like any other token.
- Player-owned tokens are removed too. This is a risk for the GM; undo restores them.
- A removed token's entry in the initiative order is left as existing token deletion leaves it.
- Turning the setting on does not remove tokens that are already at 0 HP or below.
