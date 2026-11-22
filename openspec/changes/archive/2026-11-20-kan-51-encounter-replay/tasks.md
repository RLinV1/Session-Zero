## 1. Contract (packages/shared)

- [x] 1.1 Add `src/replay.ts` with zod schemas `ReplayPoint`, `ReplayPointsResponse`, `ReplayFrame` (`event` | `table`, the latter with filtered `table` and `rolls`), `ReplayResponse`, and `MAX_REPLAY_FRAMES = 2000`; export from `index.ts`; verify `npm run typecheck` passes
- [x] 1.2 Implement `replayPoints(events, viewer)` (start, encounter starts, checkpoints; names for the GM, "Checkpoint N" for players, ids `start`/`e<seq>`/`c<n>`); verify unit tests in `test/replay.test.ts` (FR-PL-07) cover both roles and that a player response contains no checkpoint id or name
- [x] 1.3 Implement `replayFrom(roomId, events, viewer, point, limit)` using `filterEventForViewer` / `filterStateForViewer` / `formatActivity`, neutral sentences for `table` frames; verify tests: hidden token never appears in a player's replay, reveal appears at the reveal step, GM-only roll has no player frame, GM sees everything, no `commandId` / undo / checkpoints in player output, truncation at the limit
- [x] 1.4 Add `applyReplayFrame(state, frame)` (client fold) and verify a property-style test: for a scripted session with hidden tokens, fog, initiative and a checkpoint restore, the folded player state equals `filterStateForViewer` of the true state at every step (tokens, templates, fog, initiative, rolls)

## 2. Server

- [x] 2.1 Add `GET /api/rooms/:roomId/replay` and `GET /api/rooms/:roomId/replay/:pointId` to `http/routes.ts` using `authenticate`, `no-store`, zod `.parse` on the response, 404 for an unknown point id, warning log over 500 ms; verify `npm run typecheck`
- [x] 2.2 Integration test `apps/server/test/replay.test.ts` (FR-PL-07) with a GM and two players: outsider/other-room credential refused; player point list hides checkpoint name and id; player replay never contains a hidden token's id or a GM-only roll; GM replay does; fetching a replay changes no live state or seq

## 3. Web

- [x] 3.1 Add `fetchReplayPoints` / `fetchReplay` to `net/api.ts` with zod parsing; verify typecheck
- [x] 3.2 Add `ui/ReplayBar.tsx` (point select, back / play-pause / forward, slider, step counter and sentence, truncation note, exit; keyboard Left/Right/Space/Esc outside fields; steps are not animated, so no reduced-motion variant is needed) and a component test in `apps/web/test` for stepping, play-to-end stop and exit
- [x] 3.3 Wire replay into `pages/RoomPage.tsx`: top-bar Replay button (hidden during "View as player", and vice versa), `shownState` from the folded frames, `readOnly` board and panels via `previewConnection`; verify typecheck and lint
- [x] 3.4 CSS for the replay bar at desktop and phone width (no horizontal scroll, controls reachable)

## 4. Docs and verification

- [x] 4.1 Write `docs/adr/0025-encounter-replay.md` (disclosure policy, frame format, REST choice); verify it links this change and FR-PL-07
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 4.3 Verify in the browser with Playwright: GM and a player in one room; GM adds a hidden token, saves a checkpoint, moves tokens, starts initiative; the player opens Replay, sees "Checkpoint 1" not its name, steps through without the hidden token appearing, drags during replay with no live effect, exits to the live board; take screenshots
