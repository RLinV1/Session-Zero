# ADR 0019: Named checkpoints

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-03 · **Amends:** `docs/adr/0001-event-model.md` (checkpoints), `docs/adr/0013-undo.md` (reversible set) · **Amended by:** `docs/adr/0024-encounter-templates.md` (whole-board apply from a template), `docs/adr/0036-checkpoint-delete-preview.md` (delete and preview)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-41-checkpoints` · **Ticket:** KAN-41 (FR-REC-02)

## Context

Undo (ADR 0013) reverses recent actions from a fixed reversible set. A GM who wants the board back to "before the ambush" after a dozen mixed changes (new tokens, a map swap, fog, a fresh initiative order) has no path back. FR-REC-02 asks for named checkpoint save and restore as the universal fallback. ADR 0001 sketched it in one line: "Checkpoints = named `seq` + snapshot; restore appends a `CheckpointRestored`-style event rather than truncating." Postgres has carried an unused `checkpoints` table since `0001_init`.

Two constraints shape the design. `decide` and `reduce` are pure and see only the current `RoomState`, never history (invariant 2). And every room payload is filtered per viewer, so a restore must not carry hidden tokens or GM-only templates to players (invariant 3).

## Decision

### A checkpoint is a name and a seq in the log

`checkpoint.create { name }` (GM only, name 1–60 characters after trimming) emits `CheckpointCreated { checkpoint: { id, name, seq } }`, where `seq` is the last committed seq before it. `RoomState.checkpoints` holds that metadata list, newest last, capped at 50.

No snapshot is stored. To restore, the server folds the room's log with the same `reduceCommitted` the room load uses, up to the checkpoint's seq, and takes its **table**. Replay is deterministic, so it reproduces the saved table exactly. A snapshot cache can be added later without a protocol change if replay ever gets slow. The Postgres `checkpoints` table stays unused; dropping it is left to a cleanup migration.

### The table, and only the table, is restored

`TableState = { scene, tokens, templates, fog, initiative }`: what is on the board. `participants`, `rolls`, `chat`, `name`, `undo` and `checkpoints` record what happened in the session and are untouched. A restored token whose owners have since left keeps its `ownerIds`; ownership by an inactive participant grants nothing.

### `decide` receives the table through `DecideContext`

`DecideContext.checkpointTable?(id): TableState | null`. `LiveRoom.submit` fills it for `checkpoint.restore` only, inside the room's exclusive queue, so no command can commit between the replay and the decision. `decide` authorises first (GM only), then checks the id is in `state.checkpoints` and the table is available, then emits `CheckpointRestored { checkpointId, name, restored, previous }`, with `previous` taken from the current state (invariant 6). A replay that throws is rejected with a clear message and commits nothing.

### Players get a resync, never the event

For any non-GM viewer, `filterEventForViewer` answers `resync` for `CheckpointRestored` and `redacted` for `CheckpointCreated`, and `filterStateForViewer` sets `checkpoints: []`. Both tables in a restore event hold hidden tokens, GM-only templates and fog-concealed content; a fresh filtered snapshot is simpler and provably safe compared with filtering two nested states inside an event.

### A restore is reversible

`CheckpointRestored` joins `REVERSIBLE_EVENT_TYPES`. Its inverse is the same event type with `restored` and `previous` swapped. It is one event, so one undo entry, and undoing a wrong restore is one click. A restore also closes the undo history for board edits made before it: their "still current" check could pass by coincidence (a token moved back onto its checkpoint square) and undo across the restore. Rulings, which live on rolls, stay undoable.

## Consequences

- A restore is append-only: history before it is untouched (FR-REC-03, KAN-42).
- Restore cost is a replay of the room's log. A restore slower than 500 ms is logged as a warning, the cue for a snapshot cache. Room logs here are hundreds to low thousands of events. Add a snapshot cache if a restore ever takes over 500 ms.
- A `CheckpointRestored` event carries two full tables, bounded by the token, template and fog caps, and is only ever sent to GMs.
- Old clients: the new events fail their reducer's `assertNever`. As with every event addition, web and server deploy together.

## Alternatives considered

- **Store a snapshot in `CheckpointCreated`.** Restores without replay, but every room load would carry full board copies, and the copy could drift from the log.
- **Emit per-entity compensating events (delete, create, move …) instead of one swap.** Each would need its own visibility handling and undo grouping; a single table swap is one event with one rule.
- **Let `reduce` compute the restored table.** Impossible: `reduce` sees only the current state, not history.

## Amendment: terrain and tactical movement

Checkpoint tables retain all base terrain and active temporary effects. Restore and undo advance the current edit revision and board epoch; neither fence is rolled back with checkpoint content. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
