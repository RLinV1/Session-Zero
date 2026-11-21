## Why

A player who joins mid-session sees only the board as it is now. They cannot tell how the party got there: who moved where, which monsters fell, what was rolled. FR-PL-07 (Jira KAN-51, stretch M3) asks for a replay of the action log from a chosen checkpoint so a late joiner can catch up. The pieces exist now: an append-only log (FR-REC-03), deterministic replay (`replayTo`, ADR 0019) and per-viewer filters (FR-GM-23), so replay can be built without new events or state.

## What Changes

- A new **Replay** control in the room's top bar, for players and the GM. It opens a replay bar under the board.
- The viewer picks a **replay point**: the start of the room, the start of each encounter (initiative start), and each checkpoint the GM saved. Players see GM checkpoints only as "Checkpoint 1", "Checkpoint 2" … with their time, never the GM's name for them or their id. The GM sees the names.
- From that point the viewer can step forward and back one change at a time, play and pause, or jump with a slider. Each step shows a one-line description ("Bob moved Fighter") where one is safe to show.
- While replaying, the board shows the replayed table read-only, the same way "View as player" does. Nothing is sent to the room. Leaving replay returns to the live board, which kept updating meanwhile.
- The server builds the replay for the requesting participant: every step is filtered exactly as live sync would filter it for them. Hidden tokens, GM-only rolls and areas, fog-covered content, undo history and checkpoint names never reach a player.
- New REST endpoints (read-only): list replay points, and fetch the replay from one point. No new command, event or change to `RoomState`. No change to existing schemas.
- A replay is capped at 2,000 steps from the chosen point; past that the bar says so and suggests a later point.

## Capabilities

### New Capabilities
- `encounter-replay`: replay points, per-viewer filtered replay of the room's history from a point, local step/play controls, and the guarantee that replay never changes the live room.

### Modified Capabilities

## Impact

- `packages/shared`: new `replay.ts` (zod response schemas, `replayPoints`, `replayFrom`), exported from `index.ts`. Unit tests in `packages/shared/test/replay.test.ts` (FR-PL-07).
- `apps/server/src/http/routes.ts`: `GET /api/rooms/:roomId/replay` and `GET /api/rooms/:roomId/replay/:pointId`, for any active participant. Integration test `apps/server/test/replay.test.ts` with a GM and two players.
- `apps/web`: `net/api.ts` fetchers, `ui/ReplayBar.tsx`, `pages/RoomPage.tsx` wiring (shown state, read-only board and panels, top-bar button), CSS.
- New ADR `docs/adr/0025-encounter-replay.md` recording the disclosure policy (players may replay their own filtered view of past events; checkpoints appear unnamed).
- No database migration. Cost: one log fold per replay request, the same as a checkpoint restore.
