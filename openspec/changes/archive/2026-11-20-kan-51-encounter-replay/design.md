## Context

See proposal.md for motivation. What exists today:

- The room log is append-only and replays deterministically: `replayTo(roomId, events, seq)` folds it with `reduceCommitted`, the same fold a room load uses (ADR 0019).
- `filterEventForViewer(committed, before, viewer)` answers `event` (possibly rewritten), `redacted` or `resync` for each event; `filterStateForViewer(state, viewer)` produces a player-safe snapshot. Live sync uses exactly these, so a replay built from them reveals nothing live sync would not.
- `activityHistory` (FR-REC-01) already walks the log with `filterEventForViewer` and `formatActivity` to build sentences, but is GM-only by design: "historical visibility needs a separate disclosure policy". This change is that policy for replay.
- The GM's "View as player" (gm-view-as-player) shows a different state on the same `Board` with `readOnly` and a `previewConnection` that refuses every command and drops ephemeral messages.
- Checkpoints are GM-only: players never receive their ids or names (checkpoints spec).

## Goals / Non-Goals

**Goals:**
- A replay that is provably no more revealing than having watched the live room from the start as that participant.
- No new commands, events or state; nothing persisted by replaying.
- Reuse the read-only board path rather than a second board.

**Non-Goals:**
- Replaying ephemeral traffic (pings, rulers, drag previews, aim). They were never persisted (invariant 4).
- Replaying chat or dice-roll animations; the replay shows rolls in the dice log as state, not as thrown dice.
- Server-side playback or shared "watch together" replays.
- Paging past 2,000 steps; a later point covers it.

## Decisions

### 1. Server builds frames with the live-sync filters

`replayFrom(roomId, events, viewer, point, limit)` in `packages/shared/src/replay.ts`, where `point` is a `ReplayPoint` from the viewer's own list:

1. Fold the log to `point.seq`; `start = filterStateForViewer(state, viewer)`.
2. For each later event: `f = filterEventForViewer(committed, state, viewer)`; `next = reduceCommitted(state, committed)`.
   - `event` → frame `{ kind: "event", committed: f.committed, sentence }`.
   - `resync` → frame `{ kind: "table", seq, at, table: tableOf(filterStateForViewer(next, viewer)), sentence }`.
   - `redacted` → no frame.
3. Stop after `limit` frames and set `truncated: true`.

The client folds frames onto `start`: `event` frames with `reduceReceived` (as live sync does), `table` frames by replacing the table part of the state.

*Why not send a filtered snapshot per step?* Initiative advances resync every turn; a full snapshot (chat, rolls, participants) per step would make a long replay megabytes. A resync can only change table content for the purposes of display, and every other part of state changes only through events that already pass as `event`, so sending `TableState` (`scene, tokens, templates, fog, initiative`) is enough and bounded by the token/template/fog caps.

*Why not let the client fold raw events?* The client would hold hidden data. Filtering stays on the server (invariant 3).

### 2. Sentences only from what the viewer may see

For `event` frames: `formatActivity(f.committed.event, actorName, filterStateForViewer(before, viewer))`, the same call `activityHistory` makes. For `table` frames a neutral sentence by event type that names only the actor and the kind of change ("GM started initiative", "GM advanced the turn", "GM changed the fog", "GM rolled dice", "GM changed what is on the board", "GM restored the board to a checkpoint", "GM set up an encounter", otherwise "The board changed"), never the event's own fields. Actor names come from the filtered participant list (public, ADR 0006).

### 3. Replay points derived from the log, not from `state.checkpoints`

`replayPoints(events, viewer)` scans the log:

- `{ id: "start", seq: <seq of RoomCreated>, label: "Start of the room" }`.
- For each `InitiativeStarted`: `{ id: "e<seq>", seq: seq - 1, label: "Encounter N starts" }` (the point is just before the start, so the start itself is the first step).
- For each `CheckpointCreated` (the n-th): `{ id: "c<n>", seq: checkpoint.seq, label }` where the label is the name for the GM and "Checkpoint N" for players.

Point ids are `start`, `e<seq>` and `c<n>`, never checkpoint ids, so a player response carries no checkpoint id. The fetch endpoint accepts only an id that is in the viewer's own point list, which keeps replays to meaningful starting places and bounds the work to known seqs. Scanning the log rather than `state.checkpoints` also keeps points for checkpoints that fell off the 50-entry cap.

Disclosure: a player learns that the GM saved a checkpoint and when. They already learn that *some* event happened at that seq (it is `redacted`, not hidden), so this adds only the kind of event. Recorded in ADR 0025.

### 4. REST, not socket

`GET /api/rooms/:roomId/replay` → `{ points }`; `GET /api/rooms/:roomId/replay/:pointId` → `{ point, start, frames, truncated }`. Both use the existing bearer `authenticate` (active participant of this room), `Cache-Control: no-store`, and `.parse` the response through the zod schemas as the history route does. A fetch is a one-off read with no ordering relationship to the live stream, which is what REST is for here; the socket stays the live channel.

### 5. Client: replay replaces the shown state, like "View as player"

`RoomPage` gains `replay` state: `{ point, start, frames, index, playing }`. When set, `shownState` is the folded state at `index`, `readOnly` is true and `shownConnection` is a `previewConnection`, so every existing read-only path (board, panels, chat) applies unchanged. States are folded once when the replay loads into an array (structural sharing keeps this small) so stepping back is O(1). Play advances every 800 ms. A step swaps the shown state with no animation, so `prefers-reduced-motion` needs no special case: stepping instantly would make Play jump straight to the end. Replay and "View as player" are mutually exclusive; the Replay button is hidden during a preview and vice versa.

`ReplayBar` (bottom of the board, like `PreviewBanner`): point `<select>`, back / play-pause / forward buttons with text labels, a range slider, "Step i of n", the step's sentence, a truncation note when set, and "Back to the live table". Keyboard: Left/Right step, Space toggles play, Esc exits — only while focus is not in a field.

## Risks / Trade-offs

- [A replay request folds the whole log] → Same cost as a checkpoint restore (ADR 0019 measured hundreds to low thousands of events). A per-participant cooldown is not needed for this scale; log a warning when a build exceeds 500 ms, matching the restore rule.
- [The viewer's filter uses their *current* participant record] → Ownership in the past is taken from the token's `ownerIds` at each step, which is historical; only the viewer's role is current. A player promoted to nothing else is unaffected; there is no role change command today.
- [A `table` frame drops the `resync` event's non-table effects] → The resyncing event types (`TokenHiddenSet`, fog, initiative, `CheckpointRestored`, attack rolls naming hidden tokens) change table content; a public attack roll that resyncs is the exception, so for `DiceRolled` the frame also carries the filtered `rolls` list. Covered by a unit test that the folded client state equals `filterStateForViewer` of the server state at every step, for tokens, templates, fog, initiative and rolls.
- [Old clients] → Additive endpoints; no change to the socket protocol.

## Migration Plan

Additive. Deploy server and web together as usual. Rollback is removing the endpoints and the button; nothing is persisted.
