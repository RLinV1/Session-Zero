# Proposal

## Why

A GM resolving a fireball, a trap or a breath weapon today has to roll and apply damage one token at a time: `dice.roll` and `roll.applyDamage` are single-target, always apply the full total, and every per-token roll competes for the 30-entry roll log. ADR 0039 removed the earlier area-of-effect radius in favour of repeated single-target attack rolls, which fits a multi-target named attack but not a GM-run area effect where each token gets its own outcome (full, half, none, or something else) and where the damage is rolled by the caster's player.

## What Changes

- **Group roll (new, GM only).** The GM selects tokens by shift-clicking on the board, or by picking a placed AoE template (every token whose footprint touches it), then adds or removes tokens freely. The GM enters one dice formula; the server rolls it once per selected token. The group roll keeps its own results instead of pushing N entries into the 30-roll log.
- **Dice tab: "Group roll".** The group roll on its own, with the Dice tab's existing public / GM-only visibility.
- **Play tab: "Area Effect" (new, GM only, needs the preset's attacks feature).** A persisted, staged effect:
  1. *Group roll*: per-token totals are advisory and GM-only; players see only the visible targets.
  2. *Call for damage*: the caller is pre-filled with the owner of the active-turn token (the GM when there is none) and can be changed before calling. The GM may roll the damage themselves.
  3. *Damage roll*: whoever holds the call writes the formula and chooses one roll for all targets or one roll per target with the same formula. While the call is pending the GM can reassign it to another player or take it over.
  4. *Resolve*: one amount field per target, pre-filled with that target's rolled damage (0 if none). **Half** sets floor(rolled ÷ 2), **None** sets 0, and any integer may be typed; negative heals, capped at max HP. The GM can add conditions to all targets or per target. **Confirm** applies everything as one undoable action.
  - The GM can skip the call, the resolve step, or both, at any stage. One Area Effect may be open per room.
- **Rulings.** An open Area Effect counts as one pending ruling at every stage (including while waiting on a player) and appears as a row in the GM's Rulings list with the controls for its current stage.
- New shared state, commands and events, and handling in both visibility filters. Existing schemas are extended (`RoomState`, the `Command` and `DomainEvent` unions), so this needs an ADR (amending ADR 0039) and review by the Real-Time Architecture owner. No existing command or event changes meaning.

## Capabilities

### New Capabilities
- `group-rolls`: GM selection of several tokens (shift-click or a placed template, editable) and one formula rolled server-side per token, offered as "Group roll" in the Dice tab with the existing roll visibility.
- `area-effects`: the Play tab's staged Area Effect: group roll, damage call with reassignment and GM takeover, single or per-token damage, per-target resolve with Half/None/custom amounts and conditions, skipping, one-step undo, and what players see.

### Modified Capabilities
- `attack-rulings`: the GM Rulings list and the "rulings pending" counts (Play tab badge and the initiative controls' reminder) also include an open Area Effect, at every stage.

## Impact

- `packages/shared`: new state (`RoomState.areaEffect` and group rolls), commands, events, `decide` and `reduce` cases, visibility filter cases, undo integration (the apply action reuses `TokenStatsSet` and `TokenConditionsSet`), activity log phrases.
- `apps/server`: no new transport. Commands go through the existing `liveRoom` pipeline. New multi-client integration tests (calling, reassigning, visibility, double-apply).
- `apps/web`: board multi-select (shift-click) and "tokens touching template" in `board/`; the Area Effect section in the Play tab; Group roll in `DicePanel`; caller prompt for players; Rulings list row and pending count in `attackRoll.ts`.
- Docs: new ADR in `docs/adr/` (0046) amending ADR 0039; Real-Time Architecture owner review.
- Requirements: extends FR-TAC-06 (AoE templates), FR-TAC-09 (dice expressions), FR-GM-22 (GM-only rolls), FR-GM-23 (player-safe filtering).
