# ADR 0049 — Auto-remove defeated tokens

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0038-attack-styles-nuke-and-animations.md` (room-wide option pattern), `docs/adr/0013-undo.md`
**Change:** `openspec/changes/auto-remove-defeated-tokens` · **Requirements:** FR-TAC-07, FR-GM-15, FR-GM-16, FR-GM-23, FR-REC-02

## Context

A token whose HP reaches 0 or below stays on the board until the GM deletes it by hand. HP changes arrive from `roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, `token.setStats` and `token.update`, so a GM can miss one, and the table sees no moment of defeat. We want a GM-controlled room option that removes the token in the same pipeline, with a death animation, and that can be undone.

`TokenDeleted` is not reversible today (only `TokenCreated` is), and `canUndo` refuses a batch with a bare `TokenStatsSet`. Removal therefore needs undo changes, not only a new option.

## Decision

- `RoomState.autoRemoveDefeated: boolean` (public, default true; older rooms read as true), set by the GM-only `room.setAutoRemoveDefeated { enabled }` -> `AutoRemoveDefeatedSet { enabled, previous }`. Same shape as `reducedEffects` (ADR 0038). Not undoable.
- `TokenDeleted` gains an optional `reason: "defeated"`. Existing events and logs parse unchanged.
- `decide` appends, after each `TokenStatsSet` that leaves `hp <= 0` while the option is on, a `TokenDeleted { token, reason: "defeated" }` carrying the whole token as it was removed. Applies to the five paths above. HP exactly 0 is removed too; `hp: null` never removed; turning the option on is not retroactive; undo never re-triggers removal.
- Undo: a `TokenDeleted` with `reason: "defeated"` is reversible. Its inverse is `TokenCreated { token }`; applied before the reversed `TokenStatsSet`, it restores the token with its previous HP. `canUndo` allows a bare stats edit that also removed a token. `undoConflict` refuses when the token id or its name is already taken. Manual `token.delete` stays non-undoable.
- Visibility: the option is public. `TokenDeleted` keeps its existing redaction (hidden or fogged tokens are never sent to players). `reason` is not secret.
- Client: `board/` plays a defeat animation for a live `TokenDeleted` with `reason: "defeated"` and keeps the sprite until it ends; reduced motion or low quality fades only. Replays, reconnects and snapshots show no animation.

## Consequences

- One rule and one place (`decide`) for every damage path; no hidden `reduce` behaviour.
- Defeat batches become undoable, which also makes plain HP edits that remove a token undoable.
- Owner resync (decided in implementation, reviewer may overrule): with line of sight on, `TokenDeleted` of a token the viewer owns used to return `resync` because a sight origin vanished, and a snapshot is non-live so no animation would play. For `reason: "defeated"` only, `filterEventForViewer` now returns the event with `thenResync: true`; the server sends the (filtered) event, then a fresh snapshot, so the board animates and sight is recomputed. A manual delete still resyncs without the event. No client-side snapshot comparison is needed. A hidden or fogged token is redacted exactly as any `TokenDeleted`, so nothing leaks (FR-GM-23).
- The removal rule is HP 0 or below (`hp <= 0`), per the requirement change; the deleted token is folded from every event the batch holds for that id, so undo recreates it as it was removed.
- Default on. The field is absent in old snapshots and logs and reads as true (`?? true`; `decide` treats only an explicit `false` as off), so rooms created before this change also become on. That is acceptable because the feature is unreleased: no existing room has ever seen the old behaviour on this setting, and replay stays deterministic (events carry no default; `AutoRemoveDefeatedSet.previous` is read with the same `?? true`).
- Initiative order keeps the removed id, as with manual deletion.
