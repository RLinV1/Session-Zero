# ADR 0025: Encounter replay

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-51-encounter-replay` · **Ticket:** KAN-51 (FR-PL-07)

## Context

FR-PL-07 asks for a replay of the action log from a chosen checkpoint, so a late-arriving player can catch up. The activity log (FR-REC-01) already walks the log with the visibility filters, but it is GM-only by design: `activityHistory` says historical visibility "needs a separate disclosure policy". This ADR is that policy for replay. Checkpoints are GM-only (ADR 0019): players never receive their ids or names.

## Decision

### What a participant may replay

Any active participant may replay the room's history **as themselves**: every step passes through `filterEventForViewer` and `filterStateForViewer` with that participant as the viewer, exactly as live sync would have delivered it. A replay therefore shows nothing the participant would not have seen had they watched from the start. Steps the viewer could not see (`redacted`) are left out entirely, not shown as gaps.

### Replay points

`replayPoints(events, viewer)` derives points from the log: the room's start (`start`), the moment before each `InitiativeStarted` (`e<seq>`), and each `CheckpointCreated` (`c<n>`). Point ids never contain a checkpoint id. The GM sees checkpoint names; players see "Checkpoint 1", "Checkpoint 2" …. A player thereby learns that the GM saved a checkpoint and when. They already learn that *an* event happened at that seq (it is redacted, not hidden), so this discloses only the kind of event, which carries no table content.

### Frames

The server folds the log to the point and returns the filtered start state, then one frame per visible change:

- `event`: the filtered committed event (no `commandId` for players), folded on the client with `reduceReceived`, as live sync does.
- `table`: for a change live sync answers with a resync, the filtered `TableState` and dice log after it. A resync only ever changes table content and rolls; participants and chat change only through events that pass as-is. Sending the table, not a full snapshot, keeps a turn-by-turn replay small.

Each frame carries a sentence: `formatActivity` on the filtered event and filtered prior state for `event` frames, and a neutral sentence that names only the (public) actor and the kind of change for `table` frames.

### Transport and limits

Two read-only REST endpoints, authenticated with the room's bearer credential like the history route: `GET /api/rooms/:roomId/replay` (points) and `GET /api/rooms/:roomId/replay/:pointId` (frames). Only ids in the viewer's own point list are accepted. A replay carries at most 2,000 frames and says when it was cut short. Building one folds the whole log, the same cost as a checkpoint restore; a build over 500 ms is logged.

### Client

The replayed state replaces the shown state the way "View as player" does: board, panels and chat read-only through a refusing connection that also drops ephemeral messages. The live room keeps updating underneath.

## Consequences

- No new command, event or state; nothing is persisted by replaying (invariants 1 and 4 untouched).
- Any future hidden data is protected in replay automatically once it is handled in the two filters (invariant 3).
- A test (`packages/shared/test/replay.test.ts`) checks that the client's fold equals `filterStateForViewer` of the true state at every step, so a filter change that breaks replay is caught.

## Alternatives considered

- **Send raw events and filter on the client.** The client would hold hidden data.
- **Send a filtered snapshot per step.** Simple, but initiative advances resync every turn; a long replay would be megabytes.
- **Reuse `state.checkpoints` for points.** Would expose checkpoint ids and lose checkpoints past the 50-entry cap.
- **Socket messages instead of REST.** A replay is a one-off read with no ordering relationship to the live stream.

## Amendment: terrain and tactical movement

Filtered table frames now carry effective terrain projection, sight polygons (including explicit clearing) and the board epoch. Canonical layers, private effect names, previous values and GM edit revisions never reach player frames. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
