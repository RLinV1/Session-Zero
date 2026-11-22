# Proposal

## Why

Jira KAN-54 (follow-up from KAN-16 / PR #9): on iPhone Safari, rotating the phone leaves the board with its old pan and zoom. The map is letterboxed with dead space on one side and the player has to press Fit after every rotation. The expected behaviour is that a viewer who has not deliberately moved the camera gets a refit, while a viewer who has keeps their camera (independent viewport, FR-TAC-01).

Reading the code shows most of the machinery already exists, so the ticket's "no ResizeObserver" premise is out of date:

- `BoardView` already observes its host with a `ResizeObserver`, waits until the host holds one size for a frame (`settleResize`), resizes the Pixi renderer, and the renderer `resize` handler calls `fitToScreen()` while `autoFit` is true and re-centres (`recenterOnResize`) when it is not.
- `autoFit` is cleared too eagerly. In `onPointerMove`, any `globalpointermove` while a `pan` is armed sets `autoFit = false`, even when the pointer never moved. A `pan` is armed on every press on empty map in select mode, in placement and in attack pick mode. A tap on a phone (which can report a pointer move with jitter or zero delta) therefore counts as a manual pan, and the board then stops refitting on rotation. The wheel handler also clears `autoFit` on any wheel event, including ones that do not change the camera.
- The refit decision is embedded in Pixi event handlers, so it has no unit test.

This change makes "manual pan/zoom" a precise, tested definition, verifies the rotation and resize paths in a real browser at desktop and mobile sizes, and closes any remaining gap the reproduction finds.

## What Changes

- A viewer's camera is treated as manual only after a real camera change: a pan that moves past a small movement threshold, a wheel or pinch that changes the scale, or a focus-on-token jump. A press or tap that does not move the map no longer disables auto-fit.
- When the canvas host is resized (including device rotation) and the viewer has not manually moved the camera, the board refits. When they have, the camera is re-centred as today and is not refit.
- The Fit button keeps resuming auto-fit.
- Resize bursts remain coalesced to one renderer resize per settled frame, so the desktop layout does not flash or jump.
- The refit and manual-camera decisions move into a small pure helper under `apps/web/src/board/` so they are unit-tested with vitest.
- This is a client-only camera change. There is no `Command`, `DomainEvent`, schema, server, visibility filter or persistence change, and the camera is not persisted or sent to other participants (ephemeral or otherwise). No ADR is needed because nothing in `packages/shared` changes.

## Capabilities

### New Capabilities

- `board-viewport-refit`: When the board refits on canvas resize, what counts as a manual pan or zoom, and the Fit button's role in resuming auto-fit.

### Modified Capabilities

None. `client-render-performance` covers on-demand rendering and bounded resolution; this change keeps the on-demand model (a resize still schedules one frame) but adds no requirement to it.

## Impact

- `apps/web/src/board/boardView.ts`: pan, wheel and pinch handlers and the resize path use the shared decision helper; observer disposal is re-checked.
- `apps/web/src/board/viewFit.ts` (new, pure) and `apps/web/test/viewFit.test.ts` (new).
- `apps/web/src/board/Board.tsx` and the Fit button: unchanged in behaviour; the Fit button still calls `resetView()`.
- No changes to `packages/shared`, `apps/server`, the wire protocol, or stored data.
- Related requirements: FR-TAC-01 (independent pan and zoom). Follow-up from KAN-16 / PR #9.
