# ADR 0039: Multi-target attacks

Status: Proposed for Real-Time Architecture owner review.

Extends ADR 0034 (shared token attacks).

Named AttackPreset definitions gain an optional `maxTargets` (integer 2 to 10). Absent means a single target, so existing creatures, tokens and events keep their meaning. Nothing is added to commands, events or `AttackContext`: the attack panel rolls the attack once per chosen target with the existing `dice.roll` command, so every roll is an ordinary single-target roll that is authorised, filtered, ruled and applied as before. The count is a gameplay limit enforced by the panel, not a security boundary; each roll is still validated on the server. The earlier area-of-effect radius was removed in favour of this.

`token.create` also gains an optional `groupId`. When set, `decide` checks that the group exists and emits `TokensGrouped` in the same action as the `TokenCreated` events, as `token.duplicate` already does, so New Token and Saved Creatures can place straight into a group and one undo reverses both.

**Amended by:** `docs/adr/0046-area-effects-and-group-rolls.md` — an area effect run by the GM (group roll, damage call, outcome per token) is a separate tool from a multi-target named attack, which is still N single-target rolls.
